/**
 * SMS Command Dispatcher
 * Breaks down the complex SMS handling logic into manageable flows.
 */

const logger = require('./logger');
const {
  isRateLimited,
  checkIdempotency,
  getPendingState,
  getUserByPhone,
  getUserProfile,
  shouldRespondToUnknown,
  db,
  admin,
} = require('./db');
const { sendSmsReply } = require('./twilio');
const { parseWithGemini, constructStopInput } = require('./gemini');
const { parseMultiLineTripFormat, parseEndTripFormat } = require('./parsing');
const { isValidRoute, normalizeDirection } = require('./utils');
const handlers = require('./handlers');

/**
 * Main dispatch logic for an SMS message
 */
async function dispatch(phoneNumber, body, messageSid) {
  // 1. Basic Validation
  if (!phoneNumber || !body) {
    throw new Error('Missing phone number or message body');
  }

  const upperBody = body.toUpperCase();
  logger.info('Dispatching SMS', { From: phoneNumber, Body: body });

  // 2. Pre-auth Checks
  if (await isRateLimited(phoneNumber)) {
    logger.info('Rate limited', { From: phoneNumber });
    return ''; // Return empty TwiML
  }

  if (messageSid && await checkIdempotency(messageSid)) {
    logger.info('Duplicate Message', { MessageSid: messageSid });
    return '';
  }

  // 3. Contextual/Pending State Logic
  const pendingState = await getPendingState(phoneNumber);
  if (pendingState) {
    const handled = await handlePendingState(phoneNumber, body, upperBody, pendingState);
    if (handled) return '';
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
  const tripHandled = await handleTripFlow(phoneNumber, user, body);
  if (tripHandled) return '';

  // 8. AI Intent Recognition (Gemini)
  const aiHandled = await handleAIIntent(phoneNumber, user, body);
  if (aiHandled) return '';

  // 9. Final Fallback
  await handleFallback(phoneNumber, user, body);
  return '';
}

/**
 * Handles states like verification codes or start-trip confirmations
 */
async function handlePendingState(phoneNumber, body, upperBody, state) {
  if (state.type === 'awaiting_verification' && /^\d{4,6}$/.test(body)) {
    await handlers.handleVerificationCode(phoneNumber, body);
    return true;
  }

  if (state.type === 'confirm_start' && upperBody === 'START') {
    const user = await getUserByPhone(phoneNumber);
    if (user) await handlers.handleConfirmStart(phoneNumber, user, state);
    return true;
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
    'INCOMPLETE': handlers.handleIncomplete,
    'DISCARD': handlers.handleDiscard,
    'LINK': handlers.handleJourneyLink,
  };

  // Strict whitelist to avoid unvalidated dynamic method invocation
  if (['STATUS', 'STATS', 'INCOMPLETE', 'DISCARD', 'LINK'].includes(upperBody)) {
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
    await handlers.handleEndTrip(phoneNumber, user, stopInput, endTripData?.route, endTripData?.notes);
    return true;
  }

  // Start Trip check (Multi-line)
  const userProfile = await getUserProfile(user.userId);
  const defaultAgency = userProfile?.defaultAgency || 'TTC';
  const multiLineTrip = parseMultiLineTripFormat(body, defaultAgency);

  if (multiLineTrip) {
    await handlers.handleTripLog(
      phoneNumber,
      user,
      multiLineTrip.stop,
      multiLineTrip.route,
      multiLineTrip.direction,
      multiLineTrip.agency,
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
    if (body.trim().split(/\s+/).length >= 4) {
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
      await handlers.handleTripLog(
        phoneNumber,
        user,
        startStop,
        geminiResult.route,
        normalizeDirection(geminiResult.direction),
        defaultAgency,
        { parsed_by: 'ai' },
      );
      return true;
    }
    break;
  }
  case 'END_TRIP': {
    const endStop = constructStopInput(geminiResult);
    if (endStop) {
      await handlers.handleEndTrip(phoneNumber, user, endStop, null, geminiResult.notes);
    }
    return true;
  }
  case 'DISCARD_TRIP':
    await handlers.handleDiscard(phoneNumber, user);
    return true;
  case 'INCOMPLETE_TRIP':
    await handlers.handleIncomplete(phoneNumber, user);
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

module.exports = {
  dispatch,
};
