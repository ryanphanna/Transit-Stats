/**
 * Trip lifecycle handlers.
 */
const admin = require('firebase-admin');
const { randomUUID } = require('crypto');
const {
  sendSmsReply,
} = require('./twilio');
const {
  getActiveTrip,
  setPendingState,
  clearPendingState,
  getUserProfile,
  isEmailAdmin,
  lookupStop,
  findMatchingStops,
  getRoutesAtStop,
  db,
  createTrip,
  getRecentCompletedTrips,
  getStopsLibrary,
} = require('./db');
const { PredictionEngine } = require('./predict.js');
const { TransferEngine } = require('./transfer.js');
const { NetworkEngine } = require('./network.js');
const { HabitEngine } = require('./habit');
const { PredictionEngineV4 } = require('./predict_v4.js');
const { PredictionEngineV5 } = require('./predict_v5.js');
const logger = require('./logger');
const {
  getStopDisplay,
  getRouteDisplay,
  normalizeDirection,
  normalizeRoute,
  isValidRoute,
  determineReliability,
} = require('./utils');
const {
  lookupAgencyTimezone,
} = require('./gemini');
const { parseStopInput } = require('./parsing');
const {
  correctPredictionByGtfs,
  agencySuffix,
  isStopMatched,
  resolveTripAgency,
  maybeHandleStopDisambiguation,
  getPredictionPrompt,
  getAchievementNote,
} = require('./handlers-utils');

/**
 * Determine if an active trip is likely stale (forgotten).
 * Uses NetworkEngine data to compare elapsed time vs typical travel duration.
 */
async function determineStaleness(db, userId, activeTrip) {
  const elapsedMin = Math.round((Date.now() - activeTrip.startTime.toDate().getTime()) / 60000);

  // If > 6 hours, it's definitely stale (hard cutoff)
  if (elapsedMin > 360) return { stale: true, reason: 'hard_cutoff', elapsedMin };

  // Try route-aware staleness
  try {
    const graph = await NetworkEngine.load(db, userId, activeTrip.agency, activeTrip.route);
    const median = NetworkEngine.getMedianDuration(graph, activeTrip.startStopName, new Date().getHours());

    if (median) {
      // If elapsed time is > 2x the median duration AND at least 45 minutes
      // (guards against very short trips being flagged too early)
      if (elapsedMin > Math.max(median * 2, 45)) {
        return { stale: true, reason: 'route_aware', elapsedMin, median };
      }
    }
  } catch (err) {
    console.error('Staleness check failed', err.message);
  }

  return { stale: false, elapsedMin };
}

async function detectProvisionalTransfer(userId, nextTrip, agency, boardingStop) {
  try {
    const history = await getRecentCompletedTrips(userId, 100);
    const networkConnections = (agency && boardingStop)
      ? await NetworkEngine.getConnectionsAtStop(db, agency, boardingStop)
      : null;

    let best = null;
    for (const trip of history) {
      if (!trip.endTime || !trip.endStopName) continue;
      const confidence = TransferEngine.score(trip, nextTrip, history, networkConnections);
      if (confidence < TransferEngine.CONFIDENCE_THRESHOLD) continue;
      if (!best || confidence > best.confidence) best = { trip, confidence };
    }

    if (!best) return null;
    return {
      prevTripId: best.trip.id,
      confidence: best.confidence,
      prevRoute: best.trip.route || null,
    };
  } catch (err) {
    console.error('Error detecting provisional transfer:', err);
    return null;
  }
}

/**
 * Handle trip logging
 */
async function handleTripLog(phoneNumber, user, stopInput, route, direction, agency, options = {}) {
  route = normalizeRoute(route);
  const activeTrip = await getActiveTrip(user.userId);
  const parsedStop = parseStopInput(stopInput);
  const stopDisplay = getStopDisplay(parsedStop.stopCode, parsedStop.stopName);

  const { resolvedAgency, handled } = await resolveTripAgency(
    phoneNumber,
    user.userId,
    parsedStop,
    route,
    direction,
    agency,
    options,
    stopInput,
    stopDisplay
  );
  if (handled) return;

  // Ambiguous stop check: if the user gave a name (not a code), see if it matches
  // multiple stops in the resolved agency. If no active trip conflict, start the
  // trip immediately so boarding time is captured, then resolve the stop async.
  const disambiguationHandled = await maybeHandleStopDisambiguation({
    phoneNumber,
    user,
    activeTrip,
    parsedStop,
    route,
    direction,
    resolvedAgency,
    options,
  });
  if (disambiguationHandled) return;

  const stopData = await lookupStop(parsedStop.stopCode, parsedStop.stopName, resolvedAgency, route, direction);
  const stopMatched = stopData !== null;

  // Background: teach this stop which routes serve it, and promote gtfs→verified on first real trip
  if (stopData?.id && route) {
    const stopUpdate = { routes: require('firebase-admin').firestore.FieldValue.arrayUnion(route) };
    if (stopData.source === 'gtfs') stopUpdate.source = 'verified';
    db.collection('stops').doc(stopData.id).update({
      ...stopUpdate,
    }).catch(() => {});
  }

  if (activeTrip) {
    const activeTripRouteDisplay = getRouteDisplay(activeTrip.route, activeTrip.direction);
    const newTripRouteDisplay = getRouteDisplay(route, direction);
    const { stale, elapsedMin } = await determineStaleness(db, user.userId, activeTrip);

    await setPendingState(phoneNumber, {
      type: 'confirm_start',
      activeTrip: {
        id: activeTrip.id,
        route: activeTrip.route,
        direction: activeTrip.direction || null,
        startStopCode: activeTrip.startStopCode || null,
        startStopName: activeTrip.startStopName || null,
        startStop: activeTrip.startStop || null,
        startTime: activeTrip.startTime,
        agency: activeTrip.agency || null,
      },
      newTrip: {
        stopCode: stopData ? stopData.stopCode : parsedStop.stopCode,
        stopName: stopData ? stopData.stopName : parsedStop.stopName,
        route,
        direction,
        agency,
        stopMatched,
        sentiment: options.sentiment || null,
        tags: options.tags || [],
        parsed_by: options.parsed_by || 'manual',
      },
    });

    const activeTripStopDisplay = getStopDisplay(activeTrip.startStopCode, activeTrip.startStopName, activeTrip.startStop);
    const timePhrase = `${elapsedMin} min ago`;
    const promptPrefix = stale
      ? `${activeTripRouteDisplay} from ${activeTripStopDisplay} looks like it ended (started ${timePhrase}).`
      : `${activeTripRouteDisplay} from ${activeTripStopDisplay} was not ended (started ${timePhrase}).`;

    const message = `${promptPrefix}

START to begin ${newTripRouteDisplay} from ${stopDisplay}, and save ${activeTripRouteDisplay} from ${activeTripStopDisplay} as incomplete.

FORGOT to save as incomplete. DISCARD to cancel new trip.`;

    await sendSmsReply(phoneNumber, message);
    return;
  }

  // No active trip - generate predictions before creating trip
  let prediction = null;
  let predictionV4 = null;
  let predictionV5 = null;
  let habitPrediction = null;
  let endStopPrediction = null;
  let endStopPredictions = null;
  let endStopPredictionV4 = null;
  let endStopPredictionV5 = null;
  let endStopConstraintSource = 'none';
  let provisionalTransfer = null;
  const startStopName = stopData ? stopData.stopName : parsedStop.stopName;
  const startStopCode = stopData ? stopData.stopCode : parsedStop.stopCode;
  let isAdmin = false;
  let defaultAgency = 'TTC';
  try {
    const [history, stopsLibrary, routesAtStop, profile, networkGraph, habits, adminStatus] = await Promise.all([
      getRecentCompletedTrips(user.userId, 100),
      getStopsLibrary(),
      getRoutesAtStop(startStopCode, resolvedAgency),
      getUserProfile(user.userId),
      NetworkEngine.load(db, user.userId, resolvedAgency, route),
      HabitEngine.load(db, user.userId),
      isEmailAdmin(user.email),
    ]);
    PredictionEngine.stopsLibrary = stopsLibrary;
    PredictionEngine.networkGraph = networkGraph || null;
    isAdmin = adminStatus;
    defaultAgency = profile?.defaultAgency || 'TTC';
    const now = new Date();
    const habitMatch = HabitEngine.match(habits, startStopName, now, { route, direction });
    habitPrediction = habitMatch ? {
      stop: habitMatch.stop,
      route: habitMatch.route,
      direction: habitMatch.direction,
      endStop: habitMatch.endStop || null,
      confidence: habitMatch.confidence,
      count: habitMatch.count,
      version: 'habit_v1',
    } : null;
    const habitFired = habitPrediction !== null;
    const lastTrip = history.length > 0 ? history[0] : null;
    const lastEndStopName = lastTrip?.endStopName || null;
    const lastRoute = lastTrip?.route || null;
    const minutesSinceLastTrip = lastTrip?.startTime?.toDate
      ? Math.max(0, Math.round((now.getTime() - lastTrip.startTime.toDate().getTime()) / 60000))
      : null;
    const routeContext = { stopName: startStopName, time: now, lastEndStopName, stopsLibrary };
    const endStopContext = {
      route,
      startStopName,
      direction,
      time: now,
      lastEndStopName,
      lastRoute,
      minutesSinceLastTrip,
      agency: resolvedAgency,
      stopsLibrary,
      networkGraph: networkGraph || null,
    };
    const endStopConstraint = PredictionEngine.getEndStopConstraint(endStopContext);
    endStopConstraintSource = endStopConstraint.source;
    logger.info('Trip-start end-stop constraint', {
      route,
      startStopName,
      direction,
      constraintSource: endStopConstraint.source,
      legalStopCount: endStopConstraint.legalStops ? endStopConstraint.legalStops.size : null,
    });
    provisionalTransfer = await detectProvisionalTransfer(user.userId, {
      route,
      startStopName,
      startStop: startStopName,
      startTime: now,
    }, resolvedAgency, startStopName);
    if (provisionalTransfer) {
      logger.info('Trip-start provisional transfer detected', {
        route,
        startStopName,
        prevTripId: provisionalTransfer.prevTripId,
        prevRoute: provisionalTransfer.prevRoute,
        confidence: provisionalTransfer.confidence,
      });
    }

    // When a habit fires with sufficient confidence, skip the full ML stack —
    // the habit is a memorized pattern and is more reliable than inference on routine trips.
    if (!habitFired) {
      prediction = PredictionEngine.guess(history, {
        stopName: startStopName,
        time: now,
        routesAtStop: routesAtStop || undefined,
        lastEndStopName,
      });
      // V4/V5 only run when the trip is on the user's default agency —
      // the models are trained on one agency's data and produce garbage elsewhere.
      if (resolvedAgency === defaultAgency) {
        const [rawTopV4, rawTopV5, topEndV4, topEndV5] = await Promise.all([
          Promise.resolve(PredictionEngineV4.guessTopRoutes(routeContext, 5)),
          PredictionEngineV5.guessTopRoutes(routeContext, 5),
          PredictionEngineV4.guessTopEndStops(endStopContext, 1),
          PredictionEngineV5.guessTopEndStops(endStopContext, 1),
        ]);
        // Correct: pick best prediction that GTFS confirms serves this stop; floor at 25%
        predictionV4 = correctPredictionByGtfs(rawTopV4, routesAtStop);
        predictionV5 = correctPredictionByGtfs(rawTopV5, routesAtStop);
        if (topEndV4.length > 0) endStopPredictionV4 = topEndV4[0];
        if (topEndV5.length > 0) endStopPredictionV5 = topEndV5[0];
      }
      endStopPrediction = PredictionEngine.guessEndStop(history, endStopContext);
      if (isAdmin) {
        const top = PredictionEngine.guessTopEndStops(history, endStopContext, 3);
        if (top.length > 0) endStopPredictions = top;
      }
    }
  } catch (err) {
    console.error('Error generating prediction at trip start:', err);
  }

  try {
    await createTrip({
      userId: user.userId,
      route,
      direction: direction || null,
      startStopCode: stopData ? stopData.stopCode : parsedStop.stopCode,
      startStopName,
      stop_matched: stopMatched,
      agency: resolvedAgency,
      sentiment: options.sentiment || null,
      tags: options.tags || [],
      parsed_by: options.parsed_by || 'manual',
      startTime: options.startTime || null,
      source: options.source || null,
      timing_reliability: options.timing_reliability || null,
      prediction: prediction || null,
      predictionV4: predictionV4 || null,
      predictionV5: predictionV5 || null,
      habitPrediction: habitPrediction || null,
      endStopPrediction: endStopPrediction || null,
      endStopPredictions: endStopPredictions || null,
      endStopPredictionV4: endStopPredictionV4 || null,
      endStopPredictionV5: endStopPredictionV5 || null,
      endStopConstraintSource,
      provisionalTransfer: !!provisionalTransfer,
      provisionalPrevTripId: provisionalTransfer?.prevTripId || null,
      provisionalJourneyConfidence: provisionalTransfer?.confidence || null,
      needs_review: !isValidRoute(route) || null,
    });
  } catch (err) {
    console.error('createTrip failed', err.message, err.stack);
    await sendSmsReply(phoneNumber, 'Could not start your trip. Please try again.');
    return;
  }

  const routeDisplay = getRouteDisplay(route, direction);
  const finalStopDisplay = getStopDisplay(
    stopData ? stopData.stopCode : parsedStop.stopCode,
    stopData ? stopData.stopName : parsedStop.stopName,
  );

  // Warm agency timezone cache in background — never blocks trip confirmation
  if (resolvedAgency) lookupAgencyTimezone(resolvedAgency).catch(() => {});

  let replyBody = `Started ${routeDisplay} from ${finalStopDisplay}${agencySuffix(resolvedAgency, defaultAgency)}.`;
  if (habitPrediction?.endStop) {
    replyBody += `\n\nUsual trip to ${habitPrediction.endStop}.`;
  } else {
    replyBody += getPredictionPrompt(isAdmin ? endStopPredictions : null);
  }

  // Add achievement note if applicable
  const achievementNote = await getAchievementNote(user.userId);
  replyBody += achievementNote;

  await sendSmsReply(phoneNumber, replyBody).catch(err => {
    console.error('sendSmsReply failed after createTrip — trip created but user not notified', err.message);
  });
}

/**
 * Handle confirmation of start after active trip
 */
async function handleConfirmStart(phoneNumber, user, state) {
  const activeTrip = state.activeTrip;
  const newTrip = state.newTrip;

  const oldTripRouteDisplay = getRouteDisplay(activeTrip.route, activeTrip.direction);

  let confirmDefaultAgency = 'TTC';
  let confirmPrediction = null;
  let confirmPredictionV4 = null;
  let confirmPredictionV5 = null;
  let confirmEndStopPrediction = null;
  let confirmEndStopPredictions = null;
  let confirmEndStopPredictionV4 = null;
  let confirmEndStopPredictionV5 = null;
  let confirmEndStopConstraintSource = 'none';
  let confirmIsAdmin = false;
  let confirmProvisionalTransfer = null;
  try {
    const [history, stopsLibrary, routesAtStop, confirmProfile, confirmNetworkGraph, confirmAdminStatus] = await Promise.all([
      getRecentCompletedTrips(user.userId, 100),
      getStopsLibrary(),
      getRoutesAtStop(newTrip.stopCode, newTrip.agency),
      getUserProfile(user.userId),
      NetworkEngine.load(db, user.userId, newTrip.agency, newTrip.route),
      isEmailAdmin(user.email),
    ]);
    PredictionEngine.stopsLibrary = stopsLibrary;
    confirmIsAdmin = confirmAdminStatus;
    confirmDefaultAgency = confirmProfile?.defaultAgency || 'TTC';
    const now = new Date();
    const lastTrip = history.length > 0 ? history[0] : null;
    const lastEndStopName = lastTrip?.endStopName || null;
    const confirmRouteContext = { stopName: newTrip.stopName, time: now, lastEndStopName, stopsLibrary };
    const confirmEndStopContext = { route: newTrip.route, startStopName: newTrip.stopName, direction: newTrip.direction, time: now, lastEndStopName, stopsLibrary, networkGraph: confirmNetworkGraph || null };
    const confirmEndStopConstraint = PredictionEngine.getEndStopConstraint(confirmEndStopContext);
    confirmEndStopConstraintSource = confirmEndStopConstraint.source;
    logger.info('Confirm-start end-stop constraint', {
      route: newTrip.route,
      startStopName: newTrip.stopName,
      direction: newTrip.direction,
      constraintSource: confirmEndStopConstraint.source,
      legalStopCount: confirmEndStopConstraint.legalStops ? confirmEndStopConstraint.legalStops.size : null,
    });
    confirmProvisionalTransfer = await detectProvisionalTransfer(user.userId, {
      route: newTrip.route,
      startStopName: newTrip.stopName,
      startStop: newTrip.stopName,
      startTime: now,
    }, newTrip.agency, newTrip.stopName);
    if (confirmProvisionalTransfer) {
      logger.info('Confirm-start provisional transfer detected', {
        route: newTrip.route,
        startStopName: newTrip.stopName,
        prevTripId: confirmProvisionalTransfer.prevTripId,
        prevRoute: confirmProvisionalTransfer.prevRoute,
        confidence: confirmProvisionalTransfer.confidence,
      });
    }
    confirmPrediction = PredictionEngine.guess(history, {
      stopName: newTrip.stopName,
      time: now,
      routesAtStop: routesAtStop || undefined,
      lastEndStopName,
    });
    if (newTrip.agency === confirmDefaultAgency) {
      const [confirmRawV4, confirmRawV5, confirmTopV4, confirmTopV5] = await Promise.all([
        Promise.resolve(PredictionEngineV4.guessTopRoutes(confirmRouteContext, 5)),
        PredictionEngineV5.guessTopRoutes(confirmRouteContext, 5),
        PredictionEngineV4.guessTopEndStops(confirmEndStopContext, 1),
        PredictionEngineV5.guessTopEndStops(confirmEndStopContext, 1),
      ]);
      confirmPredictionV4 = correctPredictionByGtfs(confirmRawV4, routesAtStop);
      confirmPredictionV5 = correctPredictionByGtfs(confirmRawV5, routesAtStop);
      if (confirmTopV4.length > 0) confirmEndStopPredictionV4 = confirmTopV4[0];
      if (confirmTopV5.length > 0) confirmEndStopPredictionV5 = confirmTopV5[0];
    }
    confirmEndStopPrediction = PredictionEngine.guessEndStop(history, confirmEndStopContext);
    if (confirmIsAdmin) {
      const top = PredictionEngine.guessTopEndStops(history, confirmEndStopContext, 3);
      if (top.length > 0) confirmEndStopPredictions = top;
    }
  } catch (err) {
    console.error('Error generating prediction at confirm start:', err);
  }

  await db.collection('trips').doc(activeTrip.id).update({
    incomplete: true,
    endTime: activeTrip.startTime,
    exitLocation: null,
    duration: null,
  });

  await createTrip({
    userId: user.userId,
    route: newTrip.route,
    direction: newTrip.direction || null,
    startStopCode: newTrip.stopCode,
    startStopName: newTrip.stopName,
    stop_matched: newTrip.stopMatched || false,
    agency: newTrip.agency,
    timing_reliability: determineReliability(state.expiresAt),
    sentiment: newTrip.sentiment || null,
    tags: newTrip.tags || [],
    parsed_by: newTrip.parsed_by || 'manual',
    prediction: confirmPrediction || null,
    predictionV4: confirmPredictionV4 || null,
    predictionV5: confirmPredictionV5 || null,
    endStopPrediction: confirmEndStopPrediction || null,
    endStopPredictions: confirmEndStopPredictions || null,
    endStopPredictionV4: confirmEndStopPredictionV4 || null,
    endStopPredictionV5: confirmEndStopPredictionV5 || null,
    endStopConstraintSource: confirmEndStopConstraintSource,
    provisionalTransfer: !!confirmProvisionalTransfer,
    provisionalPrevTripId: confirmProvisionalTransfer?.prevTripId || null,
    provisionalJourneyConfidence: confirmProvisionalTransfer?.confidence || null,
  });
  await clearPendingState(phoneNumber);

  const newStopDisplay = getStopDisplay(newTrip.stopCode, newTrip.stopName);
  const newRouteDisplay = getRouteDisplay(newTrip.route, normalizeDirection(newTrip.direction));

  let confirmReplyBody = `${oldTripRouteDisplay} marked as incomplete.\n\nStarted ${newRouteDisplay} from ${newStopDisplay}${agencySuffix(newTrip.agency, confirmDefaultAgency)}.`;
  confirmReplyBody += getPredictionPrompt(confirmIsAdmin ? confirmEndStopPredictions : null);

  // Add achievement note if applicable
  const achievementNote = await getAchievementNote(user.userId);
  confirmReplyBody += achievementNote;

  await sendSmsReply(phoneNumber, confirmReplyBody);
}

/**
 * Handle ending a trip
 */
async function handleEndTrip(phoneNumber, user, endStopInput, routeVerification = null, notes = null) {
  const activeTrip = await getActiveTrip(user.userId);

  if (!activeTrip) {
    await sendSmsReply(phoneNumber, 'No active trip to end.');
    return;
  }

  if (routeVerification) {
    const activeRoute = activeTrip.route.toString().toLowerCase();
    const verifyRoute = routeVerification.toString().toLowerCase();
    if (activeRoute !== verifyRoute) {
      await sendSmsReply(
        phoneNumber,
        `Route mismatch. Active trip is ${getRouteDisplay(activeTrip.route, activeTrip.direction)}, ` +
        `not Route ${routeVerification}.`,
      );
      return;
    }
  }

  const [endProfile, endIsAdmin] = await Promise.all([
    getUserProfile(user.userId),
    isEmailAdmin(user.email),
  ]);
  const endDefaultAgency = endProfile?.defaultAgency || 'TTC';

  // Resolve numbered shortcut (admin only): END 1/2/3 → predicted stop name
  if (/^[123]$/.test((endStopInput || '').trim())) {
    if (endIsAdmin && activeTrip.endStopPredictions?.length) {
      const idx = parseInt(endStopInput.trim(), 10) - 1;
      const predicted = activeTrip.endStopPredictions[idx];
      if (predicted) endStopInput = predicted.stop;
    }
  }

  const parsedEndStop = parseStopInput(endStopInput);
  const endTime = admin.firestore.Timestamp.now();
  const startTime = activeTrip.startTime.toDate();
  const duration = Math.round((endTime.toDate().getTime() - startTime.getTime()) / 60000);

  const agency = activeTrip.agency || null;
  const tripRoute = activeTrip.route || null;
  const tripDirection = activeTrip.direction || null;

  // Apply the same route+direction candidate filtering used at boarding — the
  // active trip already has both, so we can almost always auto-select with no prompt.
  let endStopData = null;
  if (!parsedEndStop.stopCode && parsedEndStop.stopName) {
    let endCandidates = await findMatchingStops(parsedEndStop.stopName, agency, tripRoute, null);
    if (endCandidates.length > 1 && tripRoute) {
      const routeFiltered = endCandidates.filter(c =>
        !c.routes || c.routes.length === 0 ||
        c.routes.some(r => normalizeRoute(r) === normalizeRoute(tripRoute))
      );
      if (routeFiltered.length >= 1) endCandidates = routeFiltered;
    }
    if (endCandidates.length > 1 && tripDirection) {
      const dirFiltered = endCandidates.filter(c =>
        !c.direction || c.direction.toLowerCase() === tripDirection.toLowerCase()
      );
      if (dirFiltered.length >= 1) endCandidates = dirFiltered;
    }
    if (endCandidates.length === 1) {
      const c = endCandidates[0];
      endStopData = await lookupStop(c.stopCode, null, agency, tripRoute, null);
    }
  }
  if (!endStopData) {
    endStopData = await lookupStop(parsedEndStop.stopCode, parsedEndStop.stopName, agency, tripRoute, null);
  }

  const endStopDisplay = getStopDisplay(
    endStopData ? endStopData.stopCode : parsedEndStop.stopCode,
    endStopData ? endStopData.stopName : parsedEndStop.stopName,
  );

  const endStopNameFinal = endStopData ? endStopData.stopName : parsedEndStop.stopName;

  await db.collection('trips').doc(activeTrip.id).update({
    endStopCode: endStopData ? endStopData.stopCode : parsedEndStop.stopCode,
    endStopName: endStopNameFinal,
    endTime: endTime,
    duration: duration,
    notes: notes || null,
    stop_matched: isStopMatched(activeTrip) && (endStopData !== null),
  });

  // Promote gtfs→verified on the end stop if this trip confirmed it
  if (endStopData?.id && endStopData.source === 'gtfs') {
    db.collection('stops').doc(endStopData.id).update({ source: 'verified' }).catch(() => {});
  }

  let transferHistory = null;
  let prevTrip = null;
  let provisionalPrevTrip = null;
  try {
    transferHistory = await getRecentCompletedTrips(user.userId, 100);
    const boardingStop = activeTrip.startStopName || activeTrip.startStop || null;
    const networkConnections = (agency && boardingStop)
      ? await NetworkEngine.getConnectionsAtStop(db, agency, boardingStop)
      : null;

    if (activeTrip.provisionalPrevTripId) {
      provisionalPrevTrip = transferHistory.find(t => t.id === activeTrip.provisionalPrevTripId) || null;
      if (provisionalPrevTrip && provisionalPrevTrip.endTime && provisionalPrevTrip.endStopName) {
        const provisionalConfidence = TransferEngine.score(provisionalPrevTrip, activeTrip, transferHistory, networkConnections);
        if (provisionalConfidence >= TransferEngine.CONFIDENCE_THRESHOLD) {
          prevTrip = provisionalPrevTrip;
        }
      }
    }

    if (!prevTrip) {
      prevTrip = transferHistory.find(t => {
        if (t.id === activeTrip.id) return false;
        if (!t.endTime || !t.endStopName) return false;
        const confidence = TransferEngine.score(t, activeTrip, transferHistory, networkConnections);
        return confidence >= TransferEngine.CONFIDENCE_THRESHOLD;
      }) || null;
    }
  } catch (transferErr) {
    console.error('Error preparing transfer context:', transferErr);
  }

  // Teach the network graph — only if both stops are canonical. Raw names are
  // skipped entirely; they'll be picked up by the top-up script once normalized.
  if (activeTrip.startStopName && activeTrip.direction && endStopData) {
    const startStopCanonical = await lookupStop(activeTrip.startStopCode, activeTrip.startStopName, activeTrip.agency);
    if (startStopCanonical) {
      NetworkEngine.observe(db, user.userId, {
        route: activeTrip.route,
        agency: activeTrip.agency,
        direction: activeTrip.direction,
        startStop: startStopCanonical,
        endStop: endStopData,
        duration,
      }, prevTrip?.route || null).catch(err => console.error('NetworkEngine.observe failed (non-fatal):', err.message));
    }
  }

  const routeDisplay = getRouteDisplay(activeTrip.route, activeTrip.direction);

  // Grade the prediction that was committed at trip start
  try {
    const stored = activeTrip.prediction;
    if (stored) {
      const actualRoute = activeTrip.route.toString();
      const predRoute = stored.route.toString();
      const routeMatch = predRoute === actualRoute;
      const dirMatch = !stored.direction || !activeTrip.direction ||
        PredictionEngine._normalizeDirection(stored.direction) ===
        PredictionEngine._normalizeDirection(activeTrip.direction);
      const isHit = routeMatch && dirMatch;
      const baseRoute = r => /^\d/.test(r) ? r.replace(/[a-zA-Z]+(\s.*)?$/, '').trim() : r;
      const isPartialHit = !isHit && dirMatch &&
        baseRoute(predRoute) === baseRoute(actualRoute) &&
        baseRoute(predRoute) !== '';
      const predictedLabel = stored.route + (stored.direction ? ' ' + stored.direction : '') +
        ' from ' + stored.stop;
      const actualLabel = activeTrip.route + (activeTrip.direction ? ' ' + activeTrip.direction : '') +
        ' from ' + (activeTrip.startStopName || '?');
      // Grade end stop prediction
      const actualEndStop = endStopData ? endStopData.stopName : parsedEndStop.stopName;
      const storedEndStop = activeTrip.endStopPrediction;
      const endStopHit = storedEndStop
        ? PredictionEngine._stopMatch(storedEndStop.stop, actualEndStop)
        : null;

      await db.collection('predictionStats').add({
        userId: user.userId,
        agency: activeTrip.agency || null,
        isHit: !!isHit,
        isPartialHit: !isHit && !!isPartialHit,
        predicted: predictedLabel,
        actual: actualLabel,
        confidence: stored.confidence,
        version: stored.version,
        route: activeTrip.route,
        endStopPredicted: storedEndStop ? storedEndStop.stop : null,
        endStopActual: actualEndStop,
        endStopHit: endStopHit,
        endStopConfidence: storedEndStop ? storedEndStop.confidence : null,
        source: 'sms',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Duration-informed end stop prediction (run at end time with elapsed duration)
      let durationEndStopHit = null;
      try {
        const [endHistory, endStopsLib] = await Promise.all([
          getRecentCompletedTrips(user.userId, 100),
          getStopsLibrary(),
        ]);
        PredictionEngine.stopsLibrary = endStopsLib;
        const durationPrediction = PredictionEngine.guessEndStop(
          endHistory.filter(t => t.id !== activeTrip.id),
          {
            route: activeTrip.route,
            startStopName: activeTrip.startStopName,
            direction: activeTrip.direction,
            time: activeTrip.startTime.toDate(),
            duration,
          }
        );
        if (durationPrediction) {
          durationEndStopHit = PredictionEngine._stopMatch(durationPrediction.stop, actualEndStop);
          console.log(`Duration end stop: ${durationEndStopHit ? 'HIT' : 'MISS'} | ` +
            `predicted ${durationPrediction.stop} (conf ${durationPrediction.confidence}%) | ` +
            `actual ${actualEndStop}`);
        }
      } catch (dErr) {
        console.error('Error running duration end stop prediction:', dErr);
      }

      // Update running accuracy summary
      const inc = admin.firestore.FieldValue.increment;
      const accuracyUpdate = {
        total: inc(1),
        hits: inc(isHit ? 1 : 0),
        partialHits: inc(isPartialHit ? 1 : 0),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (endStopHit !== null) {
        accuracyUpdate.endStopTotal = inc(1);
        accuracyUpdate.endStopHits = inc(endStopHit ? 1 : 0);
      }
      if (durationEndStopHit !== null) {
        accuracyUpdate.durationEndStopTotal = inc(1);
        accuracyUpdate.durationEndStopHits = inc(durationEndStopHit ? 1 : 0);
      }
      await db.collection('predictionAccuracy').doc(user.userId).set(accuracyUpdate, { merge: true });

      console.log(`Prediction graded for ${user.userId}: ${isHit ? 'HIT' : (isPartialHit ? 'PARTIAL' : 'MISS')} | ` +
        `${predictedLabel} → ${actualLabel}`);
    }

    // Normalize a route label the same way the ML training pipeline does,
    // so grading compares apples to apples (e.g. "510A" → "510" for TTC).
    const normalizeRouteForGrading = (route, agency) => {
      const r = route.toString().trim();
      if (agency === 'TTC') {
        const m = r.match(/^(\d+)/);
        return m ? m[1] : r;
      }
      const compact = r.match(/^(\d+)([a-zA-Z]+)$/);
      if (compact) return `${compact[1]}${compact[2].toUpperCase()}`;
      if (/^[a-zA-Z]$/.test(r)) return r.toUpperCase();
      return r;
    };

    // Grade V4 Prediction silently in the background
    const storedV4 = activeTrip.predictionV4;
    if (storedV4) {
      const actualRoute = normalizeRouteForGrading(activeTrip.route.toString(), activeTrip.agency);
      const predRouteV4 = normalizeRouteForGrading(storedV4.route.toString(), activeTrip.agency);
      const routeMatchV4 = predRouteV4 === actualRoute;
      const isHitV4 = routeMatchV4; // V4 doesn't have direction

      const baseRoute = r => /^\\d/.test(r) ? r.replace(/[a-zA-Z]+(\\s.*)?$/, '').trim() : r;
      const isPartialHitV4 = !isHitV4 &&
        baseRoute(predRouteV4) === baseRoute(actualRoute) &&
        baseRoute(predRouteV4) !== '';

      const predictedLabelV4 = storedV4.route + ' from ' + (activeTrip.startStopName || '?');
      const actualLabelV4 = activeTrip.route + (activeTrip.direction ? ' ' + activeTrip.direction : '') +
        ' from ' + (activeTrip.startStopName || '?');

      await db.collection('predictionStats').add({
        userId: user.userId,
        agency: activeTrip.agency || null,
        isHit: !!isHitV4,
        isPartialHit: !isHitV4 && !!isPartialHitV4,
        predicted: predictedLabelV4,
        actual: actualLabelV4,
        confidence: storedV4.confidence,
        version: storedV4.version,
        route: activeTrip.route,
        endStopPredicted: null,
        endStopActual: null,
        endStopHit: null,
        endStopConfidence: null,
        source: 'sms',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
      await db.collection('predictionAccuracy').doc(user.userId).set({
        v4Total: admin.firestore.FieldValue.increment(1),
        v4Hits: admin.firestore.FieldValue.increment(isHitV4 ? 1 : 0),
        v4PartialHits: admin.firestore.FieldValue.increment(isPartialHitV4 ? 1 : 0),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      console.log(`Prediction V4 graded for ${user.userId}: ${isHitV4 ? 'HIT' : (isPartialHitV4 ? 'PARTIAL' : 'MISS')} | ` +
        `${predictedLabelV4} → ${actualLabelV4}`);
    }

    // Grade V5 Prediction silently in the background
    const storedV5 = activeTrip.predictionV5;
    if (storedV5) {
      const actualRoute = normalizeRouteForGrading(activeTrip.route.toString(), activeTrip.agency);
      const predRouteV5 = normalizeRouteForGrading(storedV5.route.toString(), activeTrip.agency);
      const isHitV5 = predRouteV5 === actualRoute;

      const isPartialHitV5 = false; // normalization makes partial hits redundant

      const predictedLabelV5 = storedV5.route + ' from ' + (activeTrip.startStopName || '?');
      const actualLabelV5 = activeTrip.route + (activeTrip.direction ? ' ' + activeTrip.direction : '') +
        ' from ' + (activeTrip.startStopName || '?');

      await db.collection('predictionStats').add({
        userId: user.userId,
        agency: activeTrip.agency || null,
        isHit: !!isHitV5,
        isPartialHit: !isHitV5 && !!isPartialHitV5,
        predicted: predictedLabelV5,
        actual: actualLabelV5,
        confidence: storedV5.confidence,
        version: storedV5.version,
        route: activeTrip.route,
        endStopPredicted: null,
        endStopActual: null,
        endStopHit: null,
        endStopConfidence: null,
        source: 'sms',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
      await db.collection('predictionAccuracy').doc(user.userId).set({
        v5Total: admin.firestore.FieldValue.increment(1),
        v5Hits: admin.firestore.FieldValue.increment(isHitV5 ? 1 : 0),
        v5PartialHits: admin.firestore.FieldValue.increment(isPartialHitV5 ? 1 : 0),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      console.log(`Prediction V5 graded for ${user.userId}: ${isHitV5 ? 'HIT' : (isPartialHitV5 ? 'PARTIAL' : 'MISS')} | ` +
        `${predictedLabelV5} → ${actualLabelV5}`);
    }

    // Grade V4 end stop prediction
    const actualEndStopForGrading = endStopData ? endStopData.stopName : parsedEndStop.stopName;
    const storedEndStopV4 = activeTrip.endStopPredictionV4;
    if (storedEndStopV4) {
      const endStopHitV4 = PredictionEngine._stopMatch(storedEndStopV4.stop, actualEndStopForGrading);
      await db.collection('predictionStats').add({
        userId: user.userId,
        agency: activeTrip.agency || null,
        isHit: null,
        isPartialHit: null,
        predicted: null,
        actual: null,
        confidence: null,
        version: storedEndStopV4.version,
        route: activeTrip.route,
        endStopPredicted: storedEndStopV4.stop,
        endStopActual: actualEndStopForGrading,
        endStopHit: endStopHitV4,
        endStopConfidence: storedEndStopV4.confidence,
        source: 'sms',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
      await db.collection('predictionAccuracy').doc(user.userId).set({
        v4EndStopTotal: admin.firestore.FieldValue.increment(1),
        v4EndStopHits: admin.firestore.FieldValue.increment(endStopHitV4 ? 1 : 0),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      console.log(`End stop V4 graded for ${user.userId}: ${endStopHitV4 ? 'HIT' : 'MISS'} | predicted ${storedEndStopV4.stop} → actual ${actualEndStopForGrading}`);
    }

    // Grade V5 end stop prediction
    const storedEndStopV5 = activeTrip.endStopPredictionV5;
    if (storedEndStopV5) {
      const endStopHitV5 = PredictionEngine._stopMatch(storedEndStopV5.stop, actualEndStopForGrading);
      await db.collection('predictionStats').add({
        userId: user.userId,
        agency: activeTrip.agency || null,
        isHit: null,
        isPartialHit: null,
        predicted: null,
        actual: null,
        confidence: null,
        version: storedEndStopV5.version,
        route: activeTrip.route,
        endStopPredicted: storedEndStopV5.stop,
        endStopActual: actualEndStopForGrading,
        endStopHit: endStopHitV5,
        endStopConfidence: storedEndStopV5.confidence,
        source: 'sms',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
      await db.collection('predictionAccuracy').doc(user.userId).set({
        v5EndStopTotal: admin.firestore.FieldValue.increment(1),
        v5EndStopHits: admin.firestore.FieldValue.increment(endStopHitV5 ? 1 : 0),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      console.log(`End stop V5 graded for ${user.userId}: ${endStopHitV5 ? 'HIT' : 'MISS'} | predicted ${storedEndStopV5.stop} → actual ${actualEndStopForGrading}`);
    }

    // Grade habit end stop prediction
    const storedHabit = activeTrip.habitPrediction;
    if (storedHabit?.endStop) {
      const habitEndStopHit = PredictionEngine._stopMatch(storedHabit.endStop, actualEndStopForGrading);
      await db.collection('predictionStats').add({
        userId: user.userId,
        agency: activeTrip.agency || null,
        isHit: null,
        isPartialHit: null,
        predicted: null,
        actual: null,
        confidence: storedHabit.confidence,
        version: storedHabit.version,
        route: activeTrip.route,
        endStopPredicted: storedHabit.endStop,
        endStopActual: actualEndStopForGrading,
        endStopHit: habitEndStopHit,
        endStopConfidence: storedHabit.confidence,
        source: 'sms',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
      await db.collection('predictionAccuracy').doc(user.userId).set({
        habitEndStopTotal: admin.firestore.FieldValue.increment(1),
        habitEndStopHits: admin.firestore.FieldValue.increment(habitEndStopHit ? 1 : 0),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      console.log(`Habit end stop graded for ${user.userId}: ${habitEndStopHit ? 'HIT' : 'MISS'} | predicted ${storedHabit.endStop} → actual ${actualEndStopForGrading}`);
    }
  } catch (predictionErr) {
    console.error('Error grading prediction:', predictionErr);
  }

  // Auto-link journey: use TransferEngine to decide if the previous trip is a transfer
  let journeyNote = '';
  try {
    if (prevTrip) {
      const journeyId = prevTrip.journeyId || activeTrip.journeyId || randomUUID();
      const batch = db.batch();
      batch.update(db.collection('trips').doc(prevTrip.id), { journeyId });
      batch.update(db.collection('trips').doc(activeTrip.id), { journeyId });
      await batch.commit();
      const prevEnd = prevTrip.endTime.toDate ? prevTrip.endTime.toDate() : new Date(prevTrip.endTime);
      const gapStr = Math.round((startTime - prevEnd) / 60000);
      journeyNote = `\n\nLinked to your ${getRouteDisplay(prevTrip.route)} trip ` +
        `(${gapStr < 1 ? '<1' : gapStr} min transfer). UNLINK to separate.`;
    }
  } catch (journeyErr) {
    console.error('Error auto-linking journey:', journeyErr);
  }

  // Background: rebuild habit model from latest trip history (non-blocking)
  getRecentCompletedTrips(user.userId, 200)
    .then(allTrips => HabitEngine.rebuild(db, user.userId, allTrips))
    .catch(err => console.error('HabitEngine.rebuild failed (non-fatal):', err.message));

  // Anomaly detection: flag trips that took significantly longer than the hour-specific median.
  // Uses the specific start→end edge duration so routes with diverse destinations don't cross-contaminate.
  let anomalyNote = '';
  try {
    const startHour = startTime.getHours();
    const graph = await NetworkEngine.load(db, user.userId, agency, tripRoute);
    const typicalMinutes = graph
      ? (NetworkEngine.getEdgeMedianDuration(graph, activeTrip.startStopName, endStopNameFinal, startHour)
         ?? NetworkEngine.getMedianDuration(graph, activeTrip.startStopName, startHour))
      : null;
    if (typicalMinutes && typicalMinutes >= 5 && duration >= typicalMinutes * 2) {
      anomalyNote = `\n\nThis trip took longer than usual (${duration} min vs. typical ${typicalMinutes} min).`;
    }
  } catch (err) {
    // non-fatal
  }

  // Next-leg suggestion: surface the most likely next route if this stop is a known transfer point.
  // Skip when a journey was already auto-linked — the user is already in a multi-leg trip.
  let nextLegNote = '';
  if (!journeyNote && endStopNameFinal && agency) {
    try {
      const [connections, connLabels] = await Promise.all([
        NetworkEngine.getConnectionsAtStop(db, agency, endStopNameFinal),
        NetworkEngine.getConnectionLabels(db, agency, endStopNameFinal),
      ]);
      const fromKey = NetworkEngine._key(activeTrip.route.toString());
      const prefix = `${fromKey}_to_`;
      let bestConnKey = null;
      let bestCount = 0;
      for (const [k, count] of Object.entries(connections)) {
        if (k.startsWith(prefix) && count > bestCount) {
          bestCount = count;
          bestConnKey = k;
        }
      }
      if (bestConnKey && bestCount >= 2) {
        const toLabel = connLabels[bestConnKey] || bestConnKey.slice(prefix.length);
        nextLegNote = `\n\nUsually take the ${toLabel} from here.`;
      }
    } catch (err) {
      // non-fatal
    }
  }

  await sendSmsReply(phoneNumber, `Ended ${routeDisplay} at ${endStopDisplay}${agencySuffix(agency, endDefaultAgency)} (${duration} min trip)${journeyNote}${anomalyNote}${nextLegNote}`);
}

module.exports = {
  determineStaleness,
  handleTripLog,
  handleConfirmStart,
  handleEndTrip,
};
