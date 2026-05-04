/**
 * SMS Command Handlers for transit tracking
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
  storeVerificationCode,
  getVerificationData,
  isEmailAllowed,
  getUserByPhone,
  getUserProfile,
  lookupStop,
  findMatchingStops,
  getRoutesAtStop,
  db,
  isGeminiRateLimited,
  createTrip,
  getRecentCompletedTrips,
  getStopsLibrary,
  getConversationHistory,
  saveConversationTurn,
  getLastTripAgency,
  getTripCount,
} = require('./db');
const { PredictionEngine } = require('./predict.js');
const { TransferEngine } = require('./transfer.js');
const { NetworkEngine } = require('./network.js');
const { PredictionEngineV4 } = require('./predict_v4.js');
const { PredictionEngineV5 } = require('./predict_v5.js');
const {
  getStopDisplay,
  getRouteDisplay,
  normalizeDirection,
  normalizeRoute,
  isValidRoute,
  generateVerificationCode,
  determineReliability,
} = require('./utils');
const {
  aggregateTripStats,
  answerQueryWithGemini,
  lookupAgencyTimezone,
  parseStopSignImage,
} = require('./gemini');
const { parseStopInput } = require('./parsing');
const { AGENCY_CITY } = require('./constants');

/**
 * Returns " via [Agency]" if the trip agency differs from the user's default, otherwise "".
 * @param {string} tripAgency
 * @param {string} defaultAgency
 * @returns {string}
 */
function agencySuffix(tripAgency, defaultAgency) {
  if (!tripAgency || tripAgency === defaultAgency) return '';
  return ` via ${tripAgency}`;
}

// Returns the city label for an agency to use in disambiguation prompts.
// Falls back to the agency name if both options share the same city (e.g. LA Metro vs LADOT).
function getDisambiguationLabel(agency, otherAgency) {
  const city = AGENCY_CITY[agency];
  const otherCity = AGENCY_CITY[otherAgency];
  if (!city || city === otherCity) return agency;
  return city;
}

/**
 * Checks for transit milestones and returns a celebratory note if reached.
 * @param {string} userId
 * @returns {Promise<string>}
 */
async function getAchievementNote(userId) {
  try {
    const count = await getTripCount(userId);
    const milestones = {
      1: '🎉 Your 1st trip! Welcome aboard.',
      10: '🔟 Your 10th trip! Double digits.',
      25: '🏅 Your 25th trip! Quarter century.',
      50: '🥈 Your 50th trip! Silver milestone.',
      100: '🥇 Your 100th trip! Centurion status.',
      250: '👑 Your 250th trip! Elite rider.',
      500: '🏟️ Your 500th trip! Transit legend.',
      1000: '🌌 Your 1,000th trip! Mythical status.',
    };
    return milestones[count] ? `\n\n${milestones[count]}` : '';
  } catch (err) {
    console.error('getAchievementNote failed', err);
    return '';
  }
}

/**
 * Handle HELP command
 */
async function handleHelp(phoneNumber) {
  const user = await getUserByPhone(phoneNumber);
  const profile = user ? await getUserProfile(user.userId) : null;
  const isPremium = !!profile?.isPremium;

  const commands = [
    'STATUS - view active trip',
    'STATS - your last 30 days',
    'FORGOT - forgot to end a trip',
    'DISCARD - didn\'t board, delete the trip',
    'UNLINK - separate a linked journey',
  ];
  if (isPremium) commands.push('ASK [question] - AI stats');

  await sendSmsReply(phoneNumber,
    `TransitStats

To start a trip, send:

ROUTE STOP DIRECTION
or on separate lines:
ROUTE
STOP
DIRECTION (optional)
AGENCY (optional)

To end a trip, send:
END
STOP
NOTES (optional)

Commands:
${commands.join('\n')}`,
  );
}

/**
 * Handle STATUS command
 */
async function handleStatus(phoneNumber, user) {
  const activeTrip = await getActiveTrip(user.userId);

  if (!activeTrip) {
    await sendSmsReply(phoneNumber, 'No active trip.');
    return;
  }

  const startTime = activeTrip.startTime.toDate();
  const elapsedMs = Date.now() - startTime.getTime();
  const elapsedMin = Math.round(elapsedMs / 60000);
  const statusTimezone = activeTrip.agency
    ? await lookupAgencyTimezone(activeTrip.agency)
    : 'America/Toronto';
  const timeStr = startTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: statusTimezone || 'America/Toronto',
  });

  const startStopDisplay = getStopDisplay(
    activeTrip.startStopCode,
    activeTrip.startStopName,
    activeTrip.startStop,
  );

  const routeDisplay = getRouteDisplay(activeTrip.route, activeTrip.direction);

  const message = `Active trip:
${routeDisplay} from ${startStopDisplay}
Started ${timeStr} (${elapsedMin} min ago)

END [stop] to finish. FORGOT if you forgot to end. INFO for help.`;

  await sendSmsReply(phoneNumber, message);
}

/**
 * Handle DISCARD command - permanently deletes active trip
 */
async function handleDiscard(phoneNumber, user) {
  const activeTrip = await getActiveTrip(user.userId);

  if (!activeTrip) {
    await sendSmsReply(phoneNumber, 'No active trip.');
    return;
  }

  const routeDisplay = getRouteDisplay(activeTrip.route, activeTrip.direction);

  // If this active trip was linked into a journey, clean up the partner's journeyId
  if (activeTrip.journeyId) {
    const partnerSnap = await db.collection('trips')
      .where('userId', '==', user.userId)
      .where('journeyId', '==', activeTrip.journeyId)
      .get();
    const batch = db.batch();
    partnerSnap.docs.forEach(doc => {
      if (doc.id !== activeTrip.id) {
        batch.update(doc.ref, { journeyId: admin.firestore.FieldValue.delete() });
      }
    });
    batch.delete(db.collection('trips').doc(activeTrip.id));
    await batch.commit();
  } else {
    await db.collection('trips').doc(activeTrip.id).delete();
  }
  await clearPendingState(phoneNumber);

  await sendSmsReply(phoneNumber, `Deleted ${routeDisplay}.`);
}

/**
 * Handle UNLINK command - removes journey link from the most recently ended trip
 */
async function handleUnlink(phoneNumber, user) {
  // Find the most recently completed trip with a journeyId
  const snap = await db.collection('trips')
    .where('userId', '==', user.userId)
    .where('endTime', '!=', null)
    .orderBy('endTime', 'desc')
    .limit(10)
    .get();

  const linked = snap.docs.find(d => d.data().journeyId);
  if (!linked) {
    await sendSmsReply(phoneNumber, 'No linked trip to unlink.');
    return;
  }

  const trip = linked.data();
  const journeyId = trip.journeyId;
  const routeDisplay = getRouteDisplay(trip.route, trip.direction);

  // Remove journeyId from all trips sharing this journey
  const journeySnap = await db.collection('trips')
    .where('userId', '==', user.userId)
    .where('journeyId', '==', journeyId)
    .get();

  const batch = db.batch();
  journeySnap.docs.forEach(doc => {
    batch.update(doc.ref, { journeyId: admin.firestore.FieldValue.delete() });
  });
  await batch.commit();

  await sendSmsReply(phoneNumber, `Unlinked ${routeDisplay} journey.`);
}

/**
 * Handle FORGOT command - marks end as unknown
 */
async function handleIncomplete(phoneNumber, user) {
  const activeTrip = await getActiveTrip(user.userId);

  if (!activeTrip) {
    await sendSmsReply(phoneNumber, 'No active trip.');
    return;
  }

  const routeDisplay = getRouteDisplay(activeTrip.route, activeTrip.direction);

  await db.collection('trips').doc(activeTrip.id).update({
    incomplete: true,
    endTime: activeTrip.startTime,
    exitLocation: null,
    duration: null,
  });

  await sendSmsReply(phoneNumber, `${routeDisplay} saved as incomplete.`);
}

/**
 * Handle REGISTER command
 */
async function handleRegister(phoneNumber, email) {
  const emailRegex = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
  if (!emailRegex.test(email)) {
    await sendSmsReply(phoneNumber, 'Invalid email format. Text REGISTER [email].');
    return;
  }

  const allowed = await isEmailAllowed(email);
  if (!allowed) {
    await sendSmsReply(phoneNumber, 'Invite-only. Visit web app for access info.');
    return;
  }

  const existingUser = await getUserByPhone(phoneNumber);
  if (existingUser) {
    await sendSmsReply(phoneNumber, `Phone already linked to ${existingUser.email}.`);
    return;
  }

  const profilesSnapshot = await db.collection('profiles')
    .where('email', '==', email.toLowerCase())
    .limit(1).get();

  if (profilesSnapshot.empty) {
    await sendSmsReply(phoneNumber, `No TransitStats account for ${email}. Create one in web app.`);
    return;
  }

  const code = generateVerificationCode();
  await storeVerificationCode(phoneNumber, email.toLowerCase(), code);

  try {
    await db.collection('mail').add({
      to: email.toLowerCase(),
      message: {
        subject: 'TransitStats SMS Verification Code',
        text: `Your code is: ${code}\n\nReply to SMS with this code.`,
        html: `<p>Your code is: <strong>${code}</strong></p>`,
      },
    });
  } catch (error) {
    console.error('Error queuing verification email:', error);
  }

  await sendSmsReply(phoneNumber, `Code sent to ${email}. Reply with the 6-digit code.`);

  await setPendingState(phoneNumber, {
    type: 'awaiting_verification',
    email: email.toLowerCase(),
  });
}

/**
 * Handle verification code input
 */
async function handleVerificationCode(phoneNumber, code) {
  const verificationData = await getVerificationData(phoneNumber);

  if (!verificationData) {
    await sendSmsReply(phoneNumber, 'No pending registration.');
    return;
  }

  if (verificationData.attempts >= 3) {
    await db.collection('smsVerification').doc(phoneNumber).delete();
    await clearPendingState(phoneNumber);
    await sendSmsReply(phoneNumber, 'Too many attempts. Text REGISTER [email].');
    return;
  }

  if (code !== verificationData.code) {
    await db.collection('smsVerification').doc(phoneNumber).update({
      attempts: admin.firestore.FieldValue.increment(1),
    });
    await sendSmsReply(phoneNumber, 'Invalid code.');
    return;
  }

  const profilesSnapshot = await db.collection('profiles')
    .where('email', '==', verificationData.email)
    .limit(1).get();

  if (profilesSnapshot.empty) {
    await sendSmsReply(phoneNumber, 'Account not found.');
    return;
  }

  const userId = profilesSnapshot.docs[0].id;

  await db.collection('phoneNumbers').doc(phoneNumber).set({
    userId,
    email: verificationData.email,
    registeredAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db.collection('smsVerification').doc(phoneNumber).delete();
  await clearPendingState(phoneNumber);

  await sendSmsReply(phoneNumber, `Phone linked! Text "[stop] [route]" to log trips.`);
}

/**
 * Handle trip logging
 */
async function handleTripLog(phoneNumber, user, stopInput, route, direction, agency, options = {}) {
  route = normalizeRoute(route);
  const activeTrip = await getActiveTrip(user.userId);
  const parsedStop = parseStopInput(stopInput);
  const stopDisplay = getStopDisplay(parsedStop.stopCode, parsedStop.stopName);

  // If agency was not explicitly specified, check the last trip's agency.
  // This lets the system infer "you're still in LA" without the user having to
  // repeat the agency on every message.
  let resolvedAgency = agency;
  if (!options.agencyExplicit) {
    const lastAgency = await getLastTripAgency(user.userId);
    if (lastAgency && lastAgency !== agency) {
      // Try stop lookup under both agencies
      const [stopInDefault, stopInLast] = await Promise.all([
        lookupStop(parsedStop.stopCode, parsedStop.stopName, agency),
        lookupStop(parsedStop.stopCode, parsedStop.stopName, lastAgency),
      ]);

      if (stopInDefault && stopInLast) {
        // Found in both — genuinely ambiguous. Ask.
        const userProfile = await getUserProfile(user.userId);
        const defaultAgency = userProfile?.defaultAgency || agency;
        await setPendingState(phoneNumber, {
          type: 'confirm_agency',
          route,
          direction,
          stopInput,
          options,
          agencyOptions: [lastAgency, defaultAgency],
        });
        await sendSmsReply(
          phoneNumber,
          `Which ${stopDisplay}?
1. ${getDisambiguationLabel(lastAgency, defaultAgency)}
2. ${getDisambiguationLabel(defaultAgency, lastAgency)}`
        );
        return;
      } else if (stopInLast) {
        // Found in last trip's agency only — use it.
        resolvedAgency = lastAgency;
      } else if (stopInDefault) {
        // Found in default agency but not last trip's — ambiguous (could be home,
        // or the other agency's stop library is just incomplete). Ask.
        const userProfile = await getUserProfile(user.userId);
        const defaultAgency = userProfile?.defaultAgency || agency;
        await setPendingState(phoneNumber, {
          type: 'confirm_agency',
          route,
          direction,
          stopInput,
          options,
          agencyOptions: [lastAgency, defaultAgency],
        });
        await sendSmsReply(
          phoneNumber,
          `Which ${stopDisplay}?
1. ${getDisambiguationLabel(lastAgency, defaultAgency)}
2. ${getDisambiguationLabel(defaultAgency, lastAgency)}`
        );
        return;
      } else {
        // Neither has it — infer last trip's agency (unverified).
        resolvedAgency = lastAgency;
      }
    }
  }

  // Ambiguous stop check: if the user gave a name (not a code), see if it matches
  // multiple stops in the resolved agency. If no active trip conflict, start the
  // trip immediately so boarding time is captured, then resolve the stop async.
  if (!parsedStop.stopCode && parsedStop.stopName) {
    let candidates = await findMatchingStops(parsedStop.stopName, resolvedAgency);
    if (candidates.length > 1 && route) {
      // Filter by route if stops have route data — auto-select if only one remains
      const routeFiltered = candidates.filter(c =>
        !c.routes || c.routes.length === 0 ||
        c.routes.some(r => normalizeRoute(r) === normalizeRoute(route))
      );
      if (routeFiltered.length === 1) candidates = routeFiltered;
      else if (routeFiltered.length > 1) candidates = routeFiltered;
      // If routeFiltered is 0, keep all candidates (no route data to filter on)
    }
    if (candidates.length > 1) {
      const list = candidates.map((c, i) => `${i + 1}. ${c.stopName}`).join('\n');

      if (!activeTrip) {
        let tripId;
        try {
          tripId = await createTrip({
            userId: user.userId,
            route,
            direction: direction || null,
            startStopCode: null,
            startStopName: parsedStop.stopName || null,
            startStop: null,
            verified: false,
            boardingLocation: null,
            agency: resolvedAgency,
            sentiment: options.sentiment || null,
            tags: options.tags || [],
            parsed_by: options.parsed_by || 'manual',
            prediction: null,
            predictionV4: null,
            predictionV5: null,
            endStopPrediction: null,
            endStopPredictions: null,
            endStopPredictionV4: null,
            endStopPredictionV5: null,
            needs_review: !isValidRoute(route) || null,
          });
        } catch (err) {
          console.error('createTrip failed during stop disambiguation', err.message);
          await sendSmsReply(phoneNumber, 'Could not start your trip. Please try again.');
          return;
        }
        await setPendingState(phoneNumber, {
          type: 'confirm_stop',
          tripId,
          route,
          direction,
          agency: resolvedAgency,
          options,
          stopCandidates: candidates,
        });
        const routeDisplay = getRouteDisplay(route, direction);
        await sendSmsReply(phoneNumber, `${routeDisplay} started. Multiple stops match "${parsedStop.stopName}":\n${list}\nReply with a number to set your stop, or DISCARD to cancel.`);
      } else {
        // Active trip conflict — leave trip creation until after disambiguation
        await setPendingState(phoneNumber, {
          type: 'confirm_stop',
          route,
          direction,
          agency: resolvedAgency,
          options,
          stopCandidates: candidates,
        });
        await sendSmsReply(phoneNumber, `Multiple stops match "${parsedStop.stopName}":\n${list}\nReply with a number or DISCARD to cancel.`);
      }
      return;
    }
  }

  const stopData = await lookupStop(parsedStop.stopCode, parsedStop.stopName, resolvedAgency);
  const verified = stopData !== null;
  const boardingLocation = (stopData?.lat != null && stopData?.lng != null)
    ? { lat: stopData.lat, lng: stopData.lng }
    : null;

  // Background: teach this stop which routes serve it
  if (stopData?.id && route) {
    db.collection('stops').doc(stopData.id).update({
      routes: require('firebase-admin').firestore.FieldValue.arrayUnion(route),
    }).catch(() => {});
  }

  if (activeTrip) {
    const activeTripRouteDisplay = getRouteDisplay(activeTrip.route);
    const newTripRouteDisplay = getRouteDisplay(route);

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
        verified,
        boardingLocation,
        sentiment: options.sentiment || null,
        tags: options.tags || [],
        parsed_by: options.parsed_by || 'manual',
      },
    });

    const activeTripElapsedMin = Math.round((Date.now() - activeTrip.startTime.toDate().getTime()) / 60000);
    const activeTripStopDisplay = getStopDisplay(activeTrip.startStopCode, activeTrip.startStopName, activeTrip.startStop);
    const message = `${activeTripRouteDisplay} from ${activeTripStopDisplay} was not ended (started ${activeTripElapsedMin} min ago).

START to begin ${newTripRouteDisplay} from ${stopDisplay}, and save ${activeTripRouteDisplay} from ${activeTripStopDisplay} as incomplete.

FORGOT to save as incomplete. DISCARD to cancel new trip.`;

    await sendSmsReply(phoneNumber, message);
    return;
  }

  // No active trip - generate predictions before creating trip
  let prediction = null;
  let predictionV4 = null;
  let predictionV5 = null;
  let endStopPrediction = null;
  let endStopPredictions = null;
  let endStopPredictionV4 = null;
  let endStopPredictionV5 = null;
  const startStopName = stopData ? stopData.stopName : parsedStop.stopName;
  const startStopCode = stopData ? stopData.stopCode : parsedStop.stopCode;
  let isAdmin = false;
  let defaultAgency = 'TTC';
  try {
    const [history, stopsLibrary, routesAtStop, profile, networkGraph] = await Promise.all([
      getRecentCompletedTrips(user.userId, 100),
      getStopsLibrary(),
      getRoutesAtStop(startStopCode, resolvedAgency),
      getUserProfile(user.userId),
      NetworkEngine.load(db, user.userId, resolvedAgency, route),
    ]);
    PredictionEngine.stopsLibrary = stopsLibrary;
    PredictionEngine.networkGraph = networkGraph || null;
    isAdmin = !!profile?.isAdmin;
    defaultAgency = profile?.defaultAgency || 'TTC';
    const now = new Date();
    const endStopContext = { route, startStopName, direction, time: now };
    prediction = PredictionEngine.guess(history, {
      stopName: startStopName,
      time: now,
      routesAtStop: routesAtStop || undefined,
    });
    // V4/V5 only run when the trip is on the user's default agency —
    // the models are trained on one agency's data and produce garbage elsewhere.
    if (resolvedAgency === defaultAgency) {
      predictionV4 = PredictionEngineV4.guess({
        stopName: startStopName,
        time: now,
      });
      predictionV5 = await PredictionEngineV5.guess({
        stopName: startStopName,
        time: now,
      });
      const [topV4, topV5] = await Promise.all([
        PredictionEngineV4.guessTopEndStops(endStopContext, 1),
        PredictionEngineV5.guessTopEndStops(endStopContext, 1),
      ]);
      if (topV4.length > 0) endStopPredictionV4 = topV4[0];
      if (topV5.length > 0) endStopPredictionV5 = topV5[0];
    }
    endStopPrediction = PredictionEngine.guessEndStop(history, endStopContext);
    if (isAdmin) {
      const top = PredictionEngine.guessTopEndStops(history, endStopContext, 3);
      if (top.length > 0) endStopPredictions = top;
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
      verified,
      boardingLocation,
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
      endStopPrediction: endStopPrediction || null,
      endStopPredictions: endStopPredictions || null,
      endStopPredictionV4: endStopPredictionV4 || null,
      endStopPredictionV5: endStopPredictionV5 || null,
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
  if (isAdmin && endStopPredictions && endStopPredictions.length > 0) {
    const predLines = endStopPredictions.map((p, i) => `${i + 1}. ${p.stop} (${p.confidence}%)`).join('\n');
    const shortcutNums = endStopPredictions.map((_, i) => i + 1).join('/');
    replyBody += `\n\nPredicted end:\n${predLines}\n\nEND [stop] or END ${shortcutNums} to finish. FORGOT if forgot to end. INFO for help.`;
  } else {
    replyBody += `\n\nEND [stop] to finish. FORGOT if you forgot to end. INFO for help.`;
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
  let confirmIsAdmin = false;
  try {
    const [history, stopsLibrary, routesAtStop, confirmProfile] = await Promise.all([
      getRecentCompletedTrips(user.userId, 100),
      getStopsLibrary(),
      getRoutesAtStop(newTrip.stopCode, newTrip.agency),
      getUserProfile(user.userId),
    ]);
    PredictionEngine.stopsLibrary = stopsLibrary;
    confirmIsAdmin = !!confirmProfile?.isAdmin;
    confirmDefaultAgency = confirmProfile?.defaultAgency || 'TTC';
    const now = new Date();
    const confirmEndStopContext = { route: newTrip.route, startStopName: newTrip.stopName, direction: newTrip.direction, time: now };
    confirmPrediction = PredictionEngine.guess(history, {
      stopName: newTrip.stopName,
      time: now,
      routesAtStop: routesAtStop || undefined,
    });
    confirmPredictionV4 = PredictionEngineV4.guess({
      stopName: newTrip.stopName,
      time: now,
    });
    confirmPredictionV5 = await PredictionEngineV5.guess({
      stopName: newTrip.stopName,
      time: now,
    });
    confirmEndStopPrediction = PredictionEngine.guessEndStop(history, confirmEndStopContext);
    const [confirmTopV4, confirmTopV5] = await Promise.all([
      PredictionEngineV4.guessTopEndStops(confirmEndStopContext, 1),
      PredictionEngineV5.guessTopEndStops(confirmEndStopContext, 1),
    ]);
    if (confirmTopV4.length > 0) confirmEndStopPredictionV4 = confirmTopV4[0];
    if (confirmTopV5.length > 0) confirmEndStopPredictionV5 = confirmTopV5[0];
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
    verified: newTrip.verified || false,
    boardingLocation: newTrip.boardingLocation || null,
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
  });
  await clearPendingState(phoneNumber);

  const newStopDisplay = getStopDisplay(newTrip.stopCode, newTrip.stopName);
  const newRouteDisplay = getRouteDisplay(newTrip.route, normalizeDirection(newTrip.direction));

  let confirmReplyBody = `${oldTripRouteDisplay} marked as incomplete.\n\nStarted ${newRouteDisplay} from ${newStopDisplay}${agencySuffix(newTrip.agency, confirmDefaultAgency)}.`;
  if (confirmIsAdmin && confirmEndStopPredictions && confirmEndStopPredictions.length > 0) {
    const predLines = confirmEndStopPredictions.map((p, i) => `${i + 1}. ${p.stop} (${p.confidence}%)`).join('\n');
    const shortcutNums = confirmEndStopPredictions.map((_, i) => i + 1).join('/');
    confirmReplyBody += `\n\nPredicted end:\n${predLines}\n\nEND [stop] or END ${shortcutNums} to finish. FORGOT if forgot to end. INFO for help.`;
  } else {
    confirmReplyBody += `\n\nEND [stop] to finish. FORGOT if forgot to end. INFO for help.`;
  }

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

  const endProfile = await getUserProfile(user.userId);
  const endDefaultAgency = endProfile?.defaultAgency || 'TTC';

  // Resolve numbered shortcut (admin only): END 1/2/3 → predicted stop name
  if (/^[123]$/.test((endStopInput || '').trim())) {
    if (endProfile?.isAdmin && activeTrip.endStopPredictions?.length) {
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
  const endStopData = await lookupStop(parsedEndStop.stopCode, parsedEndStop.stopName, agency);
  const exitLocation = (endStopData?.lat != null && endStopData?.lng != null)
    ? { lat: endStopData.lat, lng: endStopData.lng }
    : null;

  const endStopDisplay = getStopDisplay(
    endStopData ? endStopData.stopCode : parsedEndStop.stopCode,
    endStopData ? endStopData.stopName : parsedEndStop.stopName,
  );

  const endStopNameFinal = endStopData ? endStopData.stopName : parsedEndStop.stopName;

  await db.collection('trips').doc(activeTrip.id).update({
    endStopCode: endStopData ? endStopData.stopCode : parsedEndStop.stopCode,
    endStopName: endStopNameFinal,
    endTime: endTime,
    exitLocation: exitLocation,
    duration: duration,
    notes: notes || null,
    verified: activeTrip.verified && (endStopData !== null),
  });

  // Teach the network graph — only if both stops are canonical. Raw names are
  // skipped entirely; they'll be picked up by the top-up script once normalized.
  if (activeTrip.startStopName && activeTrip.direction && endStopData) {
    const startStopCanonical = await lookupStop(activeTrip.startStopCode, activeTrip.startStopName, activeTrip.agency);
    if (startStopCanonical) {
      NetworkEngine.observe(db, user.userId, {
        route: activeTrip.route,
        agency: activeTrip.agency,
        direction: activeTrip.direction,
        startStopName: startStopCanonical.stopName,
        endStopName: endStopData.stopName,
        duration,
      }).catch(err => console.error('NetworkEngine.observe failed (non-fatal):', err.message));
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

    // Grade V4 Prediction silently in the background
    const storedV4 = activeTrip.predictionV4;
    if (storedV4) {
      const actualRoute = activeTrip.route.toString();
      const predRouteV4 = storedV4.route.toString();
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
      const actualRoute = activeTrip.route.toString();
      const predRouteV5 = storedV5.route.toString();
      const isHitV5 = predRouteV5 === actualRoute;

      const baseRoute = r => /^\d/.test(r) ? r.replace(/[a-zA-Z]+(\s.*)?$/, '').trim() : r;
      const isPartialHitV5 = !isHitV5 &&
        baseRoute(predRouteV5) === baseRoute(actualRoute) &&
        baseRoute(predRouteV5) !== '';

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
  } catch (predictionErr) {
    console.error('Error grading prediction:', predictionErr);
  }

  // Auto-link journey: use TransferEngine to decide if the previous trip is a transfer
  let journeyNote = '';
  try {
    const transferHistory = await getRecentCompletedTrips(user.userId, 100);

    const prevTrip = transferHistory.find(t => {
      if (t.id === activeTrip.id) return false;
      if (!t.endTime || !t.endStopName) return false;
      const confidence = TransferEngine.score(t, activeTrip, transferHistory);
      return confidence >= TransferEngine.CONFIDENCE_THRESHOLD;
    });

    if (prevTrip) {
      const journeyId = prevTrip.journeyId || activeTrip.journeyId || randomUUID();
      const batch = db.batch();
      batch.update(db.collection('trips').doc(prevTrip.id), { journeyId });
      batch.update(db.collection('trips').doc(activeTrip.id), { journeyId });
      await batch.commit();
      const prevEnd = prevTrip.endTime.toDate ? prevTrip.endTime.toDate() : new Date(prevTrip.endTime);
      const gapStr = Math.round((thisStartTime - prevEnd) / 60000);
      journeyNote = `\n\nLinked to your ${getRouteDisplay(prevTrip.route)} trip ` +
        `(${gapStr < 1 ? '<1' : gapStr} min transfer). UNLINK to separate.`;
    }
  } catch (journeyErr) {
    console.error('Error auto-linking journey:', journeyErr);
  }

  await sendSmsReply(phoneNumber, `Ended ${routeDisplay} at ${endStopDisplay}${agencySuffix(agency, endDefaultAgency)} (${duration} min trip)${journeyNote}`);
}

/**
 * Handle natural-language query (premium feature)
 */
async function handleQuery(phoneNumber, user, question) {
  const profile = await getUserProfile(user.userId);
  if (!profile?.isPremium) {
    await sendSmsReply(phoneNumber,
      'AI Stats is a premium feature. Text STATS for your 30-day summary.',
    );
    return;
  }

  if (!question) {
    await sendSmsReply(phoneNumber, 'Ask me anything about your trips, ' +
      'e.g. "ASK how many trips have I taken on Fridays?"');
    return;
  }

  const [snapshot, conversationHistory] = await Promise.all([
    db.collection('trips')
      .where('userId', '==', user.userId)
      .where('endTime', '!=', null)
      .orderBy('endTime', 'desc')
      .limit(200).get(),
    getConversationHistory(user.userId),
  ]);

  const trips = snapshot.docs.map((d) => d.data());

  if (trips.length === 0) {
    await sendSmsReply(phoneNumber, 'You don\'t have any completed trips yet!');
    return;
  }

  const recentAgency = trips[0]?.agency || null;
  const timezone = await lookupAgencyTimezone(recentAgency);
  const stats = aggregateTripStats(trips, timezone);
  if (await isGeminiRateLimited(phoneNumber, !!profile?.isPremium, !!profile?.isAdmin)) {
    await sendSmsReply(phoneNumber, 'AI limit reached. Try again later.');
    return;
  }
  const answer = await answerQueryWithGemini(user.userId, question, trips, stats, conversationHistory, timezone);
  await sendSmsReply(phoneNumber, answer);

  // Fire-and-forget — never block or fail the reply
  saveConversationTurn(user.userId, question, answer)
    .catch((err) => console.error('saveConversationTurn failed:', err));
  db.collection('queryLogs').add({
    userId: user.userId,
    question,
    answer,
    tripWindowSize: trips.length,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    source: 'sms',
  }).catch((err) => console.error('queryLogs write failed:', err));
}

/**
 * Handle STATS command
 */
async function handleStatsCommand(phoneNumber, user) {
  const now = new Date();
  
  // Windows
  const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const fourteenDaysAgo = new Date(now); fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date(now); sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const snapshot = await db.collection('trips')
    .where('userId', '==', user.userId)
    .where('startTime', '>=', admin.firestore.Timestamp.fromDate(sixtyDaysAgo))
    .get();

  const toDate = (t) => t.startTime?.toDate ? t.startTime.toDate() : new Date(t.startTime);
  const allTrips = snapshot.docs.map((d) => d.data()).filter((t) => t.endStopName != null || t.endStopCode != null);

  // Filter buckets
  const thisWeek = allTrips.filter((t) => toDate(t) >= sevenDaysAgo);
  const lastWeek = allTrips.filter((t) => {
    const d = toDate(t);
    return d >= fourteenDaysAgo && d < sevenDaysAgo;
  });
  const last30 = allTrips.filter((t) => toDate(t) >= thirtyDaysAgo);
  const prev30 = allTrips.filter((t) => {
    const d = toDate(t);
    return d >= sixtyDaysAgo && d < thirtyDaysAgo;
  });

  if (allTrips.length === 0) {
    await sendSmsReply(phoneNumber, 'No trips logged in the last 60 days.');
    return;
  }

  const profile = await getUserProfile(user.userId);
  const isPremium = !!profile?.isPremium;

  const getTrend = (current, previous, label) => {
    if (!isPremium || previous === 0) return '';
    const pct = Math.round(((current - previous) / previous) * 100);
    const arrow = pct >= 0 ? '↑' : '↓';
    return ` (${arrow}${Math.abs(pct)}% vs ${label})`;
  };

  const totalMin30 = last30.reduce((sum, t) => sum + (t.duration || 0), 0);
  const uniqueRoutes30 = new Set(last30.map((t) => t.route).filter(Boolean)).size;

  // Top route in the last 30 days
  const routeCounts30 = {};
  for (const t of last30) {
    if (t.route) routeCounts30[t.route] = (routeCounts30[t.route] || 0) + 1;
  }
  const topRoute = Object.entries(routeCounts30).sort((a, b) => b[1] - a[1])[0];

const totalHours = totalMin30 / 60;
  const timeStr = totalHours >= 1 ? `${totalHours.toFixed(1)}h` : `${Math.round(totalMin30)}min`;

  const weekLine = `Past 7 days: ${thisWeek.length} trip${thisWeek.length !== 1 ? 's' : ''}${getTrend(thisWeek.length, lastWeek.length, 'prior week')}`;
  const topLine = topRoute ? `Top route: ${topRoute[0]} (${topRoute[1]}×)` : '';
  const thirtyLine = `Last 30 days: ${last30.length} trips across ${uniqueRoutes30} route${uniqueRoutes30 !== 1 ? 's' : ''}, ${timeStr} riding${getTrend(last30.length, prev30.length, 'prior 30')}`;

  const parts = [weekLine, thirtyLine];
  if (topLine) parts.push(topLine);
  await sendSmsReply(phoneNumber, parts.join('\n\n'));
}

/**
 * Handle LINK command — join the most recent pair of consecutive trips as a journey.
 *
 * Case A (active trip exists): links the last completed trip → current active trip.
 * Case B (no active trip): links the last two completed trips.
 *
 * A journeyId (UUID) is shared across all legs. If either trip already belongs to a
 * journey, that ID is reused so the journey can grow leg by leg.
 * Only trips within a 60-minute gap are eligible.
 */
async function handleJourneyLink(phoneNumber, user) {
  const [activeTrip, history] = await Promise.all([
    getActiveTrip(user.userId),
    getRecentCompletedTrips(user.userId, 2),
  ]);

  let earlierTrip, laterTrip;

  if (activeTrip && history.length >= 1) {
    // Case A: last completed trip → active trip
    earlierTrip = history[0];
    laterTrip = activeTrip;
  } else if (!activeTrip && history.length >= 2) {
    // Case B: second-to-last completed → last completed
    earlierTrip = history[1]; // older (lower endTime)
    laterTrip = history[0];   // newer
  } else {
    await sendSmsReply(phoneNumber, 'Not enough trips to link. Complete at least one trip first.');
    return;
  }

  // Validate temporal gap
  const earlierEnd = earlierTrip.endTime?.toDate
    ? earlierTrip.endTime.toDate() : new Date(earlierTrip.endTime);
  const laterStart = laterTrip.startTime?.toDate
    ? laterTrip.startTime.toDate() : new Date(laterTrip.startTime);
  const gapMinutes = (laterStart - earlierEnd) / 60000;

  if (gapMinutes < 0) {
    await sendSmsReply(phoneNumber, 'Trips overlap in time — cannot link.');
    return;
  }
  if (gapMinutes > 60) {
    await sendSmsReply(
      phoneNumber,
      `Gap between trips is ${Math.round(gapMinutes)} min. Only trips within 60 min can be linked as a journey.`,
    );
    return;
  }

  // Reuse an existing journeyId if one leg already belongs to a journey
  const journeyId = earlierTrip.journeyId || laterTrip.journeyId || randomUUID();

  // Guard: already linked together
  if (earlierTrip.journeyId && laterTrip.journeyId && earlierTrip.journeyId === laterTrip.journeyId) {
    await sendSmsReply(phoneNumber, 'These trips are already linked as a journey.');
    return;
  }

  const batch = db.batch();
  batch.update(db.collection('trips').doc(earlierTrip.id), { journeyId });
  batch.update(db.collection('trips').doc(laterTrip.id), { journeyId });
  await batch.commit();

  const gapStr = gapMinutes < 1 ? '<1' : Math.round(gapMinutes);
  await sendSmsReply(
    phoneNumber,
    `${getRouteDisplay(earlierTrip.route)} → ${getRouteDisplay(laterTrip.route)} ` +
    `linked as a journey (${gapStr} min transfer).`,
  );
}

/**
 * Run V4/V5 predictions for a trip that was created during stop disambiguation
 * (predictions are null at create time because the stop wasn't known yet).
 * Fire-and-forget — errors are logged but never surface to the user.
 */
async function fillPredictions(user, tripId, stopName, route, direction, agency) {
  try {
    const profile = await getUserProfile(user.userId);
    const defaultAgency = profile?.defaultAgency || null;
    if (!defaultAgency || agency !== defaultAgency) return;

    const now = new Date();
    const endStopContext = { route, startStopName: stopName, direction, time: now };

    const [predictionV4, predictionV5, topV4, topV5] = await Promise.all([
      Promise.resolve(PredictionEngineV4.guess({ stopName, time: now })),
      PredictionEngineV5.guess({ stopName, time: now }),
      PredictionEngineV4.guessTopEndStops(endStopContext, 1),
      PredictionEngineV5.guessTopEndStops(endStopContext, 1),
    ]);

    const update = {};
    if (predictionV4) update.predictionV4 = predictionV4;
    if (predictionV5) update.predictionV5 = predictionV5;
    if (topV4.length > 0) update.endStopPredictionV4 = topV4[0];
    if (topV5.length > 0) update.endStopPredictionV5 = topV5[0];

    if (Object.keys(update).length > 0) {
      await db.collection('trips').doc(tripId).update(update);
    }
  } catch (err) {
    console.error('fillPredictions failed', err.message);
  }
}

/**
 * Handle an incoming MMS photo message — parse the stop sign and start a trip.
 * receivedAt is captured at the top of dispatch() so startTime reflects when
 * the photo was sent, not when AI processing finishes.
 */
async function handleMmsTrip(phoneNumber, user, mediaUrl, receivedAt) {
  // Fetch the image from Twilio (requires Basic Auth with account credentials)
  let imageBase64, mimeType;
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const response = await fetch(mediaUrl, {
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    mimeType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = await response.arrayBuffer();
    imageBase64 = Buffer.from(buffer).toString('base64');
  } catch (err) {
    console.error('MMS image fetch failed', err.message);
    await sendSmsReply(phoneNumber, 'Could not load your photo. Try again or log by text:\n[Route]\n[Stop]');
    return;
  }

  // Parse the stop sign with Gemini Vision
  let parsed;
  try {
    parsed = await parseStopSignImage(imageBase64, mimeType);
  } catch (err) {
    console.error('MMS vision parsing failed', err.message);
    await sendSmsReply(phoneNumber, 'Could not read the stop sign. Try a clearer shot or log by text.');
    return;
  }

  if (!parsed || !parsed.routes || parsed.routes.length === 0) {
    await sendSmsReply(phoneNumber, 'No transit stop found in that photo. Try a closer shot of the sign.');
    return;
  }

  const stopInput = parsed.stopCode || parsed.stopName;
  if (!stopInput) {
    await sendSmsReply(phoneNumber, 'Found routes but could not read the stop. Log by text:\n[Route]\n[Stop]');
    return;
  }

  const userProfile = await getUserProfile(user.userId);
  const defaultAgency = userProfile?.defaultAgency || 'TTC';

  const tripOptions = { parsed_by: 'mms', startTime: receivedAt, source: 'mms', timing_reliability: 'approximate' };

  if (parsed.routes.length === 1) {
    const { route, agency } = parsed.routes[0];
    const { normalizeAgency } = require('./utils');
    await handleTripLog(
      phoneNumber, user, stopInput, route, null,
      agency ? normalizeAgency(agency) : defaultAgency,
      tripOptions,
    );
    return;
  }

  // Multiple routes at this stop — ask user to pick
  const { normalizeAgency } = require('./utils');
  const candidates = parsed.routes.map(r => ({
    route: r.route,
    agency: r.agency ? normalizeAgency(r.agency) : defaultAgency,
  }));
  const list = candidates.map((r, i) => `${i + 1}. Route ${r.route}`).join('\n');
  const stopLabel = parsed.stopName || stopInput;

  await setPendingState(phoneNumber, {
    type: 'confirm_mms_route',
    stopInput,
    routeCandidates: candidates,
    defaultAgency,
    receivedAt,
  });
  await sendSmsReply(phoneNumber, `Multiple routes at ${stopLabel}:\n${list}\n\nWhich route? Reply with a number, or DISCARD to cancel.`);
}

module.exports = {
  handleHelp,
  handleStatus,
  handleDiscard,
  handleUnlink,
  handleIncomplete,
  handleRegister,
  handleVerificationCode,
  handleTripLog,
  handleConfirmStart,
  handleEndTrip,
  handleQuery,
  handleStatsCommand,
  handleJourneyLink,
  handleMmsTrip,
  fillPredictions,
};
