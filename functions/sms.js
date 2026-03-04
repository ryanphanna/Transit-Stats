/**
 * SMS Webhook Handler for Transit Stats
 *
 * Receives POST webhooks from Twilio and handles transit trip tracking via SMS.
 */

const functions = require('firebase-functions');
const express = require('express');
const { defineSecret } = require('firebase-functions/params');

// Modules
const logger = require('./lib/logger');
const { validateConfiguration } = require('./lib/config');
const {
  admin,
  db,
  isRateLimited,
  checkIdempotency,
  getPendingState,
  getUserByPhone,
  getUserProfile,
  getActiveTrip,
  clearPendingState,
  shouldRespondToUnknown,
} = require('./lib/db');
const {
  validateTwilioSignature,
  twimlResponse,
  sendSmsReply,
} = require('./lib/twilio');
const {
  parseWithGemini,
  constructStopInput,
} = require('./lib/gemini');
const {
  parseMultiLineTripFormat,
  parseEndTripFormat,
  parseAgencyOverride,
  isHeuristicLogValid,
} = require('./lib/parsing');
const {
  toTitleCase,
  isValidRoute,
  normalizeDirection,
} = require('./lib/utils');
const handlers = require('./lib/handlers');

// Secrets
const geminiApiKey = defineSecret('GEMINI_API_KEY');
const twilioAuthToken = defineSecret('TWILIO_AUTH_TOKEN');

const app = express();
app.use(express.urlencoded({ extended: true }));

/**
 * Main Webhook Coordinator
 */
async function handleSmsRequest(req, res) {
  try {
    const phoneNumber = req.body.From;
    const body = (req.body.Body || '').trim();

    logger.info('SMS received', { From: phoneNumber, Body: body });

    if (!phoneNumber || !body) {
      res.status(400).send('Missing phone number or message body');
      return;
    }

    // 1. Rate Limiting
    if (await isRateLimited(phoneNumber)) {
      logger.info('Rate limited, ignoring message', { From: phoneNumber });
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    // 2. Idempotency
    if (await checkIdempotency(req.body.MessageSid)) {
      logger.info('Duplicate MessageSid, ignoring.', { MessageSid: req.body.MessageSid });
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    const upperBody = body.toUpperCase();
    const pendingState = await getPendingState(phoneNumber);

    // 3. Handle Context-Aware Responses (Verification/Confirmation)
    if (pendingState?.type === 'awaiting_verification' && /^\d{4,6}$/.test(body)) {
      await handlers.handleVerificationCode(phoneNumber, body);
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    if (pendingState?.type === 'confirm_start' && upperBody === 'START') {
      const user = await getUserByPhone(phoneNumber);
      if (user) await handlers.handleConfirmStart(phoneNumber, user, pendingState);
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    // 4. Handle Escape Hatch: DISCARD
    if (upperBody === 'DISCARD' && (pendingState || true)) {
      // Also handle case where there's no pending state but user wants to discard active trip
      if (pendingState) await clearPendingState(phoneNumber);

      const user = await getUserByPhone(phoneNumber);
      if (user) {
        const activeTrip = await getActiveTrip(user.userId);
        if (activeTrip) {
          await handlers.handleDiscard(phoneNumber, user);
          res.type('text/xml').send(twimlResponse(''));
          return;
        }
      }

      if (upperBody === 'DISCARD') {
        await sendSmsReply(phoneNumber, 'No active trip to discard.');
        res.type('text/xml').send(twimlResponse(''));
        return;
      }
    }

    // 5. Handle Global Commands
    if (['INFO', 'COMMANDS', '?', 'HELP'].includes(upperBody)) {
      await handlers.handleHelp(phoneNumber);
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    if (upperBody.startsWith('REGISTER ')) {
      await handlers.handleRegister(phoneNumber, body.substring(9).trim());
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    // 6. User Verification
    const user = await getUserByPhone(phoneNumber);
    if (!user) {
      if (await shouldRespondToUnknown(phoneNumber)) {
        await sendSmsReply(phoneNumber, 'Text REGISTER [email] to get started');
      }
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    // 7. Register User Commands
    if (upperBody === 'STATUS') {
      await handlers.handleStatus(phoneNumber, user);
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    if (upperBody === 'STATS') {
      await handlers.handleStatsCommand(phoneNumber, user);
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    if (upperBody === 'INCOMPLETE') {
      await handlers.handleIncomplete(phoneNumber, user);
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    // 8. END TRIP Handling
    const endTripData = parseEndTripFormat(body);
    const singleLineEndMatch = body.match(/^(END|STOP)\s+(.+)$/i);

    if (endTripData || singleLineEndMatch) {
      const stopInput = singleLineEndMatch ? singleLineEndMatch[2] : endTripData?.stop;
      if (!stopInput) {
        const activeTrip = await getActiveTrip(user.userId);
        await sendSmsReply(phoneNumber, activeTrip ? 'Please send:\nEND\n[exit stop]' : 'No active trip to end.');
      } else {
        await handlers.handleEndTrip(phoneNumber, user, stopInput, endTripData?.route, endTripData?.notes);
      }
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    // 9. START TRIP (Heuristic) Handling
    const userProfile = await getUserProfile(user.userId);
    const defaultAgency = userProfile?.defaultAgency || 'TTC';

    // Multi-line start
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
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    // Single-line heuristic ([stop] [route])
    const { agency: agencyOverride, remainingMessage } = parseAgencyOverride(body);
    const agency = agencyOverride || defaultAgency;
    const tripMatch = remainingMessage.match(/^(.+?)\s+(\S+)$/);

    if (tripMatch) {
      const stopInput = tripMatch[1].trim();
      const routeInput = tripMatch[2].trim();
      if (isHeuristicLogValid(stopInput, routeInput) && isValidRoute(routeInput)) {
        await handlers.handleTripLog(
          phoneNumber,
          user,
          stopInput,
          toTitleCase(routeInput),
          null,
          agency,
        );
        res.type('text/xml').send(twimlResponse(''));
        return;
      }
    }

    // 10. AI Fallback (Gemini)
    const geminiResult = await parseWithGemini(body);
    if (geminiResult && geminiResult.intent !== 'OTHER') {
      logger.info('Gemini matched intent', { intent: geminiResult.intent, From: phoneNumber });

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
              {
                sentiment: geminiResult.sentiment,
                tags: geminiResult.tags,
                parsed_by: 'ai',
              },
            );
            res.type('text/xml').send(twimlResponse(''));
            return;
          }
          break;
        }
        case 'END_TRIP': {
          const endStop = constructStopInput(geminiResult);
          if (endStop) {
            await handlers.handleEndTrip(phoneNumber, user, endStop, null, geminiResult.notes);
          } else {
            const activeTrip = await getActiveTrip(user.userId);
            const msg = activeTrip ?
              'To end the trip, please name the stop.' :
              'No active trip to end.';
            await sendSmsReply(phoneNumber, msg);
          }
          res.type('text/xml').send(twimlResponse(''));
          return;
        }
        case 'DISCARD_TRIP':
          await handlers.handleDiscard(phoneNumber, user);
          res.type('text/xml').send(twimlResponse(''));
          return;
        case 'INCOMPLETE_TRIP':
          await handlers.handleIncomplete(phoneNumber, user);
          res.type('text/xml').send(twimlResponse(''));
          return;
        case 'QUERY':
          await handlers.handleQuery(phoneNumber, user, geminiResult.question || body);
          res.type('text/xml').send(twimlResponse(''));
          return;
      }
    }

    // 11. Error Case: Save for review
    await db.collection('trips').add({
      userId: user.userId,
      route: 'Unknown',
      startStopName: 'Unknown',
      raw_text: body,
      needs_review: true,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      source: 'sms_error',
    });

    await sendSmsReply(phoneNumber, `❌ Could not understand. Saved for review.\n\nTry:\n[Route]\n[Stop]`);
    res.type('text/xml').send(twimlResponse(''));
  } catch (error) {
    logger.error('Error handling SMS', error);
    res.status(500).send('Internal server error');
  }
}

// Routes
app.post('/', (req, res, next) => {
  if (validateTwilioSignature(req)) return next();
  res.status(403).send('Forbidden');
}, handleSmsRequest);

app.get('/', (req, res) => res.json({ status: 'ok', service: 'TransitStats SMS' }));

// Cold start validation
validateConfiguration();

// Export
exports.sms = functions
  .runWith({ secrets: [geminiApiKey, twilioAuthToken] })
  .https.onRequest(app);
