/**
 * SMS Command Dispatcher
 * Breaks down the complex SMS handling logic into manageable flows.
 */

const logger = require('./logger');
const {
  isRateLimited,
  checkIdempotency,
  checkContentDuplicate,
  getFirestore,
  getPendingState,
  getUserByPhone,
  getUserProfile,
  shouldRespondToUnknown,
  clearPendingState,
  setPendingState,
  db,
  admin,
} = require('./db');
const { sendSmsReply, getTwilioPhoneNumber } = require('./twilio');
const { parseWithGemini, constructStopInput } = require('./gemini');
const { parseMultiLineTripFormat, parseSingleLineTripFormat, parseEndTripFormat } = require('./parsing');
const { isValidRoute, normalizeDirection, getRouteDisplay, getStopDisplay, normalizeAgency } = require('./utils');
const handlers = require('./handlers');

/**
 * Main dispatch logic for an SMS message
 */
async function dispatch(phoneNumber, body, messageSid, media = {}) {
  const receivedAt = Date.now();
  const { numMedia = 0, mediaUrl = null } = media;
  const isMms = numMedia > 0 && !!mediaUrl;

  // 1. Basic Validation
  if (!phoneNumber || (!body && !isMms)) {
    throw new Error('Missing phone number or message body');
  }

  // Drop messages sent from our own number — self-loop guard
  if (phoneNumber === getTwilioPhoneNumber()) {
    logger.info('Self-loop detected — dropping', { From: phoneNumber });
    return '';
  }

  // 1.5. Spam Filter: Drop texts containing URLs (text messages only)
  if (body && !isMms) {
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/i;
    if (urlRegex.test(body)) {
      logger.info('Spam URL dropped', { From: phoneNumber, Body: body });
      return '';
    }
  }

  const upperBody = body ? body.toUpperCase() : '';
  logger.info('Dispatching SMS', { From: phoneNumber, Body: body, isMms });

  // 2. Pre-auth Checks
  if (await isRateLimited(phoneNumber)) {
    logger.info('Rate limited', { From: phoneNumber });
    return '';
  }

  if (messageSid && await checkIdempotency(messageSid)) {
    logger.info('Duplicate Message', { MessageSid: messageSid });
    return '';
  }

  // Content dedup and outbound loop checks don't apply to MMS
  if (!isMms) {
    // END/STOP commands bypass content dedup — if an end attempt fails, the user
    // must be able to retry immediately without waiting 60 seconds.
    const isEndCommand = /^(END|STOP)(\s|$)/i.test(body);
    if (!isEndCommand && await checkContentDuplicate(phoneNumber, body)) {
      logger.info('Duplicate content within window', { From: phoneNumber });
      return '';
    }

    if (await checkOutboundLoop(body)) {
      logger.info('Outbound loop detected — dropping', { From: phoneNumber });
      return '';
    }
  }

  // 3. Contextual/Pending State Logic
  const pendingState = await getPendingState(phoneNumber);
  if (pendingState) {
    const handled = await handlePendingState(phoneNumber, body, upperBody, pendingState);
    if (handled) return '';
  }

  // 3.5. MMS: authenticate then hand off to photo-based trip start
  if (isMms) {
    const user = await getUserByPhone(phoneNumber);
    if (!user) {
      if (await shouldRespondToUnknown(phoneNumber)) {
        await sendSmsReply(phoneNumber, 'Text REGISTER [email] to get started');
      }
      return '';
    }
    await handlers.handleMmsTrip(phoneNumber, user, mediaUrl, receivedAt);
    return '';
  }

  // 4. Public Commands (No Auth Required)
  const publicHandled = await handlePublicCommands(phoneNumber, upperBody, body);
  if (publicHandled) return '';

  // 5. User Authentication
  const user = await getUserByPhone(phoneNumber);
  if (!user) {
    if (await shouldRespondToUnknown(phoneNumber)) {
      await sendSmsReply(phoneNumber, 'Text REGISTER [email] to get started');
    }
    return '';
  }

  // 6. Private/Member Commands
  const privateHandled = await handlePrivateCommands(phoneNumber, user, upperBody, body);
  if (privateHandled) return '';

  // 7. Core Trip Logic (Parsing & Heuristics)
  // Strip optional "START " prefix so "Start 2 Spadina West" works the same as "2 Spadina West"
  const startPrefixMatch = body.match(/^START\s+(.+)$/i);
  const tripBody = startPrefixMatch ? startPrefixMatch[1] : body;

  const tripHandled = await handleTripFlow(phoneNumber, user, tripBody);
  if (tripHandled) return '';

  // 8. AI Intent Recognition (Gemini)
  const aiHandled = await handleAIIntent(phoneNumber, user, tripBody);
  if (aiHandled) return '';

  // 9. Final Fallback
  await handleFallback(phoneNumber, user, body);
  return '';
}

/**
 * Handles states like verification codes or start-trip confirmations
 */
async function handleConfirmAgencyState(phoneNumber, body, upperBody, state) {
  if (/^[12]$/.test(body.trim())) {
    const user = await getUserByPhone(phoneNumber);
    if (user) {
      const chosenAgency = state.agencyOptions[parseInt(body.trim(), 10) - 1];
      await clearPendingState(phoneNumber);
      await handlers.handleTripLog(
        phoneNumber, user, state.stopInput, state.route, state.direction,
        chosenAgency, { ...state.options, agencyExplicit: true }
      );
    }
    return true;
  }

  if (upperBody === 'DISCARD') {
    await clearPendingState(phoneNumber);
    await sendSmsReply(phoneNumber, 'Trip cancelled.');
    return true;
  }

  // Anything else (STATUS, STATS, new trip, etc.) falls through to normal dispatch.
  // The pending state stays until resolved or it expires.
  return false;
}

async function handleConfirmStopState(phoneNumber, body, upperBody, state) {
  const num = parseInt(body.trim(), 10);
  if (!isNaN(num) && num >= 1 && num <= state.stopCandidates.length) {
    const user = await getUserByPhone(phoneNumber);
    if (user) {
      const chosen = state.stopCandidates[num - 1];
      await clearPendingState(phoneNumber);
      if (state.tripId) {
        // Trip already started — update the stop fields now that we know which stop
        const boardingLocation = (chosen.lat != null && chosen.lng != null)
          ? { lat: chosen.lat, lng: chosen.lng }
          : null;
        await db.collection('trips').doc(state.tripId).update({
          startStopCode: chosen.stopCode,
          startStopName: chosen.stopName,
          startStop: chosen.stopName,
          verified: true,
          boardingLocation,
        });
        // Run V4/V5 predictions now that the stop is known — fire-and-forget
        handlers.fillPredictions(
          user, state.tripId, chosen.stopName, state.route, state.direction, state.agency
        ).catch(() => {});
        await sendSmsReply(
          phoneNumber,
          `Stop set to ${chosen.stopName}.\n\nEND [stop] to finish. FORGOT if you forgot to end.`
        );
      } else {
        // No trip started yet (active-trip conflict path) — pass stop code so lookupStop resolves unambiguously
        await handlers.handleTripLog(
          phoneNumber, user, chosen.stopCode, state.route, state.direction,
          state.agency, { ...state.options, agencyExplicit: true }
        );
      }
    }
    return true;
  }

  if (upperBody === 'DISCARD') {
    await clearPendingState(phoneNumber);
    if (state.tripId) {
      await db.collection('trips').doc(state.tripId).delete();
    }
    await sendSmsReply(phoneNumber, 'Trip cancelled.');
    return true;
  }

  return false;
}

async function handleMmsStopNeededState(phoneNumber, body, upperBody, state) {
  if (upperBody === 'DISCARD') {
    await clearPendingState(phoneNumber);
    await sendSmsReply(phoneNumber, 'Trip cancelled.');
    return true;
  }
  const user = await getUserByPhone(phoneNumber);
  if (user && body.trim()) {
    await clearPendingState(phoneNumber);
    const stopReply = body.trim();
    const mmsOptions = {
      parsed_by: 'mms',
      startTime: state.receivedAt,
      source: 'mms',
      timing_reliability: 'approximate',
    };
    if (state.routeCandidates.length === 1) {
      const chosen = state.routeCandidates[0];
      await handlers.handleTripLog(
        phoneNumber, user, stopReply, chosen.route, null, chosen.agency, mmsOptions
      );
    } else {
      const list = state.routeCandidates.map((r, i) => `${i + 1}. Route ${r.route}`).join('\n');
      await setPendingState(phoneNumber, {
        type: 'confirm_mms_route',
        routeCandidates: state.routeCandidates,
        stopInput: stopReply,
        defaultAgency: state.defaultAgency,
        receivedAt: state.receivedAt,
      });
      await sendSmsReply(phoneNumber, `Which route?\n${list}\nor DISCARD to cancel`);
    }
  }
  return true;
}

async function handleConfirmMmsRouteState(phoneNumber, body, upperBody, state) {
  const num = parseInt(body.trim(), 10);
  if (!isNaN(num) && num >= 1 && num <= state.routeCandidates.length) {
    const user = await getUserByPhone(phoneNumber);
    if (user) {
      const chosen = state.routeCandidates[num - 1];
      await clearPendingState(phoneNumber);
      await handlers.handleTripLog(
        phoneNumber, user, state.stopInput, chosen.route, null,
        chosen.agency || state.defaultAgency,
        {
          parsed_by: 'mms',
          startTime: state.receivedAt,
          source: 'mms',
          timing_reliability: 'approximate',
        }
      );
    }
    return true;
  }

  if (upperBody === 'DISCARD') {
    await clearPendingState(phoneNumber);
    await sendSmsReply(phoneNumber, 'Trip cancelled.');
    return true;
  }

  return false;
}

async function handleConfirmStartState(phoneNumber, upperBody, state) {
  if (upperBody === 'START') {
    const user = await getUserByPhone(phoneNumber);
    if (user) await handlers.handleConfirmStart(phoneNumber, user, state);
    return true;
  }

  if (upperBody === 'DISCARD') {
    // Cancel the new trip attempt — old trip stays active
    const activeRouteDisplay = getRouteDisplay(state.activeTrip.route, state.activeTrip.direction);
    const activeStopDisplay = getStopDisplay(
      state.activeTrip.startStopCode, state.activeTrip.startStopName, state.activeTrip.startStop
    );
    await clearPendingState(phoneNumber);
    await sendSmsReply(
      phoneNumber,
      `New trip cancelled. ${activeRouteDisplay} from ${activeStopDisplay} still active.\n\n` +
      'END [stop] to finish. FORGOT if you forgot to end.'
    );
    return true;
  }

  if (upperBody === 'FORGOT') {
    // Mark old trip incomplete and cancel the new trip attempt
    await db.collection('trips').doc(state.activeTrip.id).update({
      incomplete: true,
      endTime: state.activeTrip.startTime,
      exitLocation: null,
      duration: null,
    });
    const activeRouteDisplay = getRouteDisplay(state.activeTrip.route, state.activeTrip.direction);
    const activeStopDisplay = getStopDisplay(
      state.activeTrip.startStopCode, state.activeTrip.startStopName, state.activeTrip.startStop
    );
    await clearPendingState(phoneNumber);
    await sendSmsReply(
      phoneNumber,
      `${activeRouteDisplay} from ${activeStopDisplay} saved as incomplete. New trip cancelled.`
    );
    return true;
  }

  return false;
}

async function handlePendingState(phoneNumber, body, upperBody, state) {
  if (state.type === 'awaiting_verification' && /^\d{4,6}$/.test(body)) {
    await handlers.handleVerificationCode(phoneNumber, body);
    return true;
  }

  const stateHandlers = {
    confirm_agency: () => handleConfirmAgencyState(phoneNumber, body, upperBody, state),
    confirm_stop: () => handleConfirmStopState(phoneNumber, body, upperBody, state),
    mms_stop_needed: () => handleMmsStopNeededState(phoneNumber, body, upperBody, state),
    confirm_mms_route: () => handleConfirmMmsRouteState(phoneNumber, body, upperBody, state),
    confirm_start: () => handleConfirmStartState(phoneNumber, upperBody, state),
  };

  if (stateHandlers[state.type]) {
    return stateHandlers[state.type]();
  }

  return false;
}

/**
 * Commands accessible to everyone (HELP, REGISTER)
 */
async function handlePublicCommands(phoneNumber, upperBody, rawBody) {
  if (['INFO', 'COMMANDS', '?', 'HELP', 'COMMAND'].includes(upperBody)) {
    await handlers.handleHelp(phoneNumber);
    return true;
  }

  if (upperBody.startsWith('REGISTER ')) {
    await handlers.handleRegister(phoneNumber, rawBody.substring(9).trim());
    return true;
  }

  return false;
}

/**
 * Commands for registered users (STATUS, STATS, etc.)
 */
async function handlePrivateCommands(phoneNumber, user, upperBody, rawBody) {
  if (upperBody === 'ASK') {
    await handlers.handleQuery(phoneNumber, user, '');
    return true;
  }

  if (upperBody.startsWith('ASK ')) {
    await handlers.handleQuery(phoneNumber, user, rawBody.substring(4).trim());
    return true;
  }

  const commands = {
    'STATUS': handlers.handleStatus,
    'STATS': handlers.handleStatsCommand,
    'FORGOT': handlers.handleIncomplete,
    'DISCARD': handlers.handleDiscard,
    'UNLINK': handlers.handleUnlink,
  };

  // Strict whitelist to avoid unvalidated dynamic method invocation
  if (['STATUS', 'STATS', 'FORGOT', 'DISCARD', 'UNLINK'].includes(upperBody)) {
    await commands[upperBody](phoneNumber, user);
    return true;
  }

  return false;
}

/**
 * Handles explicit stop/start formats
 */
async function handleTripFlow(phoneNumber, user, body) {
  // End Trip check
  const endTripData = parseEndTripFormat(body);
  const singleLineEndMatch = body.match(/^(END|STOP)\s+(\S.*)$/i);

  if (endTripData || singleLineEndMatch) {
    const stopInput = singleLineEndMatch ? singleLineEndMatch[2] : endTripData?.stop;
    try {
      await handlers.handleEndTrip(phoneNumber, user, stopInput, endTripData?.route, endTripData?.notes);
    } catch (err) {
      logger.error('handleEndTrip failed', { error: err.message, stack: err.stack });
      await sendSmsReply(phoneNumber, 'Could not end your trip. Please try again.');
    }
    return true;
  }

  // Start Trip check (Multi-line or single-line with direction)
  const userProfile = await getUserProfile(user.userId);
  const defaultAgency = userProfile?.defaultAgency || 'TTC';
  const multiLineTrip = parseMultiLineTripFormat(body, defaultAgency);
  const singleLineTrip = !multiLineTrip ? parseSingleLineTripFormat(body, defaultAgency) : null;
  const tripData = multiLineTrip || singleLineTrip;

  if (tripData) {
    await handlers.handleTripLog(
      phoneNumber,
      user,
      tripData.stop,
      tripData.route,
      tripData.direction,
      tripData.agency,
      { agencyExplicit: tripData.agencyExplicit },
    );
    return true;
  }

  return false;
}

/**
 * AI fallback for unstructured messages
 */
async function handleAIIntent(phoneNumber, user, body) {
  const geminiResult = await parseWithGemini(body);

  // If Gemini missed a query (returned OTHER/null), fall back to a word-count
  // heuristic. By this point in the dispatch chain all trip command formats
  // have already been ruled out, so a multi-word sentence is almost certainly
  // a natural-language question that Gemini mis-classified.
  if (!geminiResult || geminiResult.intent === 'OTHER') {
    if (body.trim().split(/\s+/).length >= 2) {
      await handlers.handleQuery(phoneNumber, user, body.trim());
      return true;
    }
    return false;
  }

  const userProfile = await getUserProfile(user.userId);
  const defaultAgency = userProfile?.defaultAgency || 'TTC';

  switch (geminiResult.intent) {
  case 'START_TRIP': {
    const startStop = constructStopInput(geminiResult);
    if (geminiResult.route && startStop && isValidRoute(geminiResult.route)) {
      const CANONICAL_DIRECTIONS = new Set([
        'Northbound', 'Southbound', 'Eastbound', 'Westbound',
        'Clockwise', 'Counterclockwise', 'Inbound', 'Outbound',
      ]);
      const normalizedDir = normalizeDirection(geminiResult.direction);
      const safeDir = CANONICAL_DIRECTIONS.has(normalizedDir) ? normalizedDir : null;
      const aiAgency = geminiResult.agency ? normalizeAgency(geminiResult.agency) : null;
      await handlers.handleTripLog(
        phoneNumber,
        user,
        startStop,
        geminiResult.route,
        safeDir,
        aiAgency || defaultAgency,
        { parsed_by: 'ai', agencyExplicit: !!aiAgency },
      );
      return true;
    }
    break;
  }
  case 'END_TRIP': {
    const endStop = constructStopInput(geminiResult);
    await handlers.handleEndTrip(phoneNumber, user, endStop || null, null, geminiResult.notes);
    return true;
  }
  case 'DISCARD_TRIP':
    await handlers.handleDiscard(phoneNumber, user);
    return true;
  case 'INCOMPLETE_TRIP':
    await handlers.handleIncomplete(phoneNumber, user); // internal Gemini intent, maps to FORGOT
    return true;
  case 'QUERY':
    await handlers.handleQuery(phoneNumber, user, geminiResult.question || body);
    return true;
  }

  return false;
}

/**
 * Final safety net for unrecognized input
 */
async function handleFallback(phoneNumber, user, body) {
  await db.collection('trips').add({
    userId: user.userId,
    raw_text: body,
    needs_review: true,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    source: 'sms_fallback',
  });

  await sendSmsReply(phoneNumber, `Could not understand. Try:\n[Route]\n[Stop]`);
}

/**
 * Check if an incoming message body matches a recently sent outbound message.
 * Catches loops where the app's own reply comes back as an incoming SMS.
 * @param {string} body
 * @returns {boolean} true if this looks like a looped outbound message
 */
async function checkOutboundLoop(body) {
  if (!body) return false;
  try {
    const crypto = require('crypto');
    const db = getFirestore();
    const key = crypto.createHash('sha256').update('outbound|' + body).digest('hex');
    const doc = await db.collection('processedMessages').doc('outbound_' + key).get();
    if (!doc.exists) return false;
    const processedAt = doc.data().processedAt?.toDate?.();
    return processedAt && (Date.now() - processedAt.getTime()) < 120000;
  } catch (e) {
    logger.error('checkOutboundLoop error', { error: e.message });
    return false;
  }
}

module.exports = {
  dispatch,
};
