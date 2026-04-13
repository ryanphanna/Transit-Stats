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
  getRoutesAtStop,
  db,
  isGeminiRateLimited,
  createTrip,
  getRecentCompletedTrips,
  getStopsLibrary,
  getConversationHistory,
  saveConversationTurn,
} = require('./db');
const { PredictionEngine } = require('./predict.js');
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
} = require('./gemini');
const { parseStopInput } = require('./parsing');

/**
 * Handle HELP command
 */
async function handleHelp(phoneNumber) {
  await sendSmsReply(phoneNumber,
    `TransitStats

To start a trip, send:

ROUTE
STOP
DIRECTION (optional)
AGENCY (optional)

To end a trip, send:
END
STOP
NOTES (optional)

Commands:
STATUS - view active trip
STATS - your last 30 days
FORGOT - forgot to end a trip
DISCARD - didn't board, delete the trip
REGISTER [email] - link account
ASK [question] - AI stats (premium)`,
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
  const timeStr = startTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
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

  const stopData = await lookupStop(parsedStop.stopCode, parsedStop.stopName, agency);
  const verified = stopData !== null;
  const boardingLocation = stopData ? { lat: stopData.lat, lng: stopData.lng } : null;

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
  let endStopPrediction = null;
  let endStopPredictions = null;
  const startStopName = stopData ? stopData.stopName : parsedStop.stopName;
  const startStopCode = stopData ? stopData.stopCode : parsedStop.stopCode;
  let isAdmin = false;
  try {
    const [history, stopsLibrary, routesAtStop, profile] = await Promise.all([
      getRecentCompletedTrips(user.userId, 100),
      getStopsLibrary(),
      getRoutesAtStop(startStopCode, agency),
      getUserProfile(user.userId),
    ]);
    PredictionEngine.stopsLibrary = stopsLibrary;
    isAdmin = !!profile?.isAdmin;
    const now = new Date();
    prediction = PredictionEngine.guess(history, {
      stopName: startStopName,
      time: now,
      routesAtStop: routesAtStop || undefined,
    });
    endStopPrediction = PredictionEngine.guessEndStop(history, {
      route,
      startStopName,
      direction,
      time: now,
    });
    if (isAdmin) {
      const top = PredictionEngine.guessTopEndStops(history, { route, startStopName, direction, time: now }, 3);
      if (top.length > 0) endStopPredictions = top;
    }
  } catch (err) {
    console.error('Error generating prediction at trip start:', err);
  }

  await createTrip({
    userId: user.userId,
    route,
    direction: direction || null,
    startStopCode: stopData ? stopData.stopCode : parsedStop.stopCode,
    startStopName,
    verified,
    boardingLocation,
    agency,
    sentiment: options.sentiment || null,
    tags: options.tags || [],
    parsed_by: options.parsed_by || 'manual',
    prediction: prediction || null,
    endStopPrediction: endStopPrediction || null,
    endStopPredictions: endStopPredictions || null,
    needs_review: !isValidRoute(route) || null,
  });

  const routeDisplay = getRouteDisplay(route, direction);
  const finalStopDisplay = getStopDisplay(
    stopData ? stopData.stopCode : parsedStop.stopCode,
    stopData ? stopData.stopName : parsedStop.stopName,
  );

  let replyBody = `Started ${routeDisplay} from ${finalStopDisplay}.`;
  if (isAdmin && endStopPredictions && endStopPredictions.length > 0) {
    const predLines = endStopPredictions.map((p, i) => `${i + 1}. ${p.stop} (${p.confidence}%)`).join('\n');
    const shortcutNums = endStopPredictions.map((_, i) => i + 1).join('/');
    replyBody += `\n\nPredicted end:\n${predLines}\n\nEND [stop] or END ${shortcutNums} to finish. FORGOT if forgot to end. INFO for help.`;
  } else {
    replyBody += `\n\nEND [stop] to finish. FORGOT if you forgot to end. INFO for help.`;
  }
  await sendSmsReply(phoneNumber, replyBody);
}

/**
 * Handle confirmation of start after active trip
 */
async function handleConfirmStart(phoneNumber, user, state) {
  const activeTrip = state.activeTrip;
  const newTrip = state.newTrip;

  const oldTripRouteDisplay = getRouteDisplay(activeTrip.route, activeTrip.direction);

  let confirmPrediction = null;
  let confirmEndStopPrediction = null;
  let confirmEndStopPredictions = null;
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
    const now = new Date();
    confirmPrediction = PredictionEngine.guess(history, {
      stopName: newTrip.stopName,
      time: now,
      routesAtStop: routesAtStop || undefined,
    });
    confirmEndStopPrediction = PredictionEngine.guessEndStop(history, {
      route: newTrip.route,
      startStopName: newTrip.stopName,
      direction: newTrip.direction,
      time: now,
    });
    if (confirmIsAdmin) {
      const top = PredictionEngine.guessTopEndStops(history, {
        route: newTrip.route,
        startStopName: newTrip.stopName,
        direction: newTrip.direction,
        time: now,
      }, 3);
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
    endStopPrediction: confirmEndStopPrediction || null,
    endStopPredictions: confirmEndStopPredictions || null,
  });
  await clearPendingState(phoneNumber);

  const newStopDisplay = getStopDisplay(newTrip.stopCode, newTrip.stopName);
  const newRouteDisplay = getRouteDisplay(newTrip.route, normalizeDirection(newTrip.direction));

  let confirmReplyBody = `${oldTripRouteDisplay} marked as incomplete.\n\nStarted ${newRouteDisplay} from ${newStopDisplay}.`;
  if (confirmIsAdmin && confirmEndStopPredictions && confirmEndStopPredictions.length > 0) {
    const predLines = confirmEndStopPredictions.map((p, i) => `${i + 1}. ${p.stop} (${p.confidence}%)`).join('\n');
    const shortcutNums = confirmEndStopPredictions.map((_, i) => i + 1).join('/');
    confirmReplyBody += `\n\nPredicted end:\n${predLines}\n\nEND [stop] or END ${shortcutNums} to finish. FORGOT if forgot to end. INFO for help.`;
  } else {
    confirmReplyBody += `\n\nEND [stop] to finish. FORGOT if you forgot to end. INFO for help.`;
  }
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

  // Resolve numbered shortcut (admin only): END 1/2/3 → predicted stop name
  if (/^[123]$/.test((endStopInput || '').trim())) {
    const endProfile = await getUserProfile(user.userId);
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

  const agency = activeTrip.agency || 'TTC';
  const endStopData = await lookupStop(parsedEndStop.stopCode, parsedEndStop.stopName, agency);
  const exitLocation = endStopData ? { lat: endStopData.lat, lng: endStopData.lng } : null;

  const endStopDisplay = getStopDisplay(
    endStopData ? endStopData.stopCode : parsedEndStop.stopCode,
    endStopData ? endStopData.stopName : parsedEndStop.stopName,
  );

  await db.collection('trips').doc(activeTrip.id).update({
    endStopCode: endStopData ? endStopData.stopCode : parsedEndStop.stopCode,
    endStopName: endStopData ? endStopData.stopName : parsedEndStop.stopName,
    endTime: endTime,
    exitLocation: exitLocation,
    duration: duration,
    notes: notes || null,
    verified: activeTrip.verified && (endStopData !== null),
  });

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
  } catch (predictionErr) {
    console.error('Error grading prediction:', predictionErr);
  }

  // Auto-link journey: if the previous completed trip ended at this trip's boarding stop within 60 min, link silently
  let journeyNote = '';
  try {
    const recentTrips = await getRecentCompletedTrips(user.userId, 5);
    const thisStartTime = activeTrip.startTime.toDate ? activeTrip.startTime.toDate() : new Date(activeTrip.startTime);
    const thisStartStop = activeTrip.startStopName || activeTrip.startStop;

    const prevTrip = recentTrips.find(t => {
      if (t.id === activeTrip.id) return false;
      if (!t.endTime || !t.endStopName) return false;
      const prevEnd = t.endTime.toDate ? t.endTime.toDate() : new Date(t.endTime);
      const gapMinutes = (thisStartTime - prevEnd) / 60000;
      return gapMinutes >= 0 && gapMinutes <= 60 && PredictionEngine._stopMatch(t.endStopName, thisStartStop);
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
        `(${gapStr < 1 ? '<1' : gapStr} min transfer).`;
    }
  } catch (journeyErr) {
    console.error('Error auto-linking journey:', journeyErr);
  }

  await sendSmsReply(phoneNumber, `Ended ${routeDisplay} at ${endStopDisplay} (${duration} min trip)${journeyNote}`);
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

  const stats = aggregateTripStats(trips);
  if (await isGeminiRateLimited(phoneNumber, !!profile?.isPremium, !!profile?.isAdmin)) {
    await sendSmsReply(phoneNumber, 'AI limit reached. Try again later.');
    return;
  }
  const answer = await answerQueryWithGemini(user.userId, question, trips, stats, conversationHistory);
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
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  // Previous month same period
  const prevMonthFirst = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthSameDay = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

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
  const thisMonth = allTrips.filter((t) => toDate(t) >= firstOfMonth);
  const lastMonthToDate = allTrips.filter((t) => {
    const d = toDate(t);
    return d >= prevMonthFirst && d < prevMonthSameDay;
  });

  if (allTrips.length === 0) {
    await sendSmsReply(phoneNumber, 'No trips logged in the last 60 days.');
    return;
  }

  const profile = await getUserProfile(user.userId);
  const isPremium = !!profile?.isPremium;

  const getTrend = (current, previous) => {
    if (!isPremium || previous === 0) return '';
    const pct = Math.round(((current - previous) / previous) * 100);
    const arrow = pct >= 0 ? '↑' : '↓';
    return ` (${arrow}${Math.abs(pct)}%)`;
  };

  const totalMin30 = last30.reduce((sum, t) => sum + (t.duration || 0), 0);
  const uniqueRoutes30 = new Set(last30.map((t) => t.route).filter(Boolean)).size;

  const lines = [
    `7d: ${thisWeek.length} trips${getTrend(thisWeek.length, lastWeek.length)}`,
    `30d: ${last30.length} trips${getTrend(last30.length, prev30.length)}, ${uniqueRoutes30} routes, ${(totalMin30 / 60).toFixed(1)}h`,
    `Month: ${thisMonth.length} trips${getTrend(thisMonth.length, lastMonthToDate.length)} MTD`,
  ];

  await sendSmsReply(phoneNumber, lines.join('\n'));
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

module.exports = {
  handleHelp,
  handleStatus,
  handleDiscard,
  handleIncomplete,
  handleRegister,
  handleVerificationCode,
  handleTripLog,
  handleConfirmStart,
  handleEndTrip,
  handleQuery,
  handleStatsCommand,
  handleJourneyLink,
};
