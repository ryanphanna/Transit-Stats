/**
 * SMS Webhook Handler for Transit Stats (2nd Generation)
 */

const { onRequest } = require('firebase-functions/v2/https');
const express = require('express');
const { defineSecret } = require('firebase-functions/params');

// Modules
const logger = require('./lib/logger');
const {
  admin,
  db,
  isRateLimited,
  checkIdempotency,
  getPendingState,
  getUserByPhone,
  getUserProfile,
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
} = require('./lib/parsing');
const {
  isValidRoute,
  normalizeDirection,
} = require('./lib/utils');
const handlers = require('./lib/handlers');

// Secrets (Modern defineSecret pattern)
const geminiApiKey = defineSecret('GEMINI_API_KEY');
const twilioAuthToken = defineSecret('TWILIO_AUTH_TOKEN');
const twilioAccountSid = defineSecret('TWILIO_ACCOUNT_SID');
const twilioPhoneNumber = defineSecret('TWILIO_PHONE_NUMBER');

const app = express();
app.use(express.urlencoded({ extended: true }));

/**
 * Main Webhook Handler
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
      logger.info('Rate limited', { From: phoneNumber });
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    // 2. Idempotency
    if (await checkIdempotency(req.body.MessageSid)) {
      logger.info('Duplicate Message', { MessageSid: req.body.MessageSid });
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

    // 4. Handle Global Commands
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

    // 5. User Verification
    const user = await getUserByPhone(phoneNumber);
    if (!user) {
      if (await shouldRespondToUnknown(phoneNumber)) {
        await sendSmsReply(phoneNumber, 'Text REGISTER [email] to get started');
      }
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    // 6. Register User Commands
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

    if (upperBody === 'DISCARD') {
      await handlers.handleDiscard(phoneNumber, user);
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    // 7. END TRIP Handling
    const endTripData = parseEndTripFormat(body);
    const singleLineEndMatch = body.match(/^(END|STOP)\s+(.+)$/i);

    if (endTripData || singleLineEndMatch) {
      const stopInput = singleLineEndMatch ? singleLineEndMatch[2] : endTripData?.stop;
      await handlers.handleEndTrip(phoneNumber, user, stopInput, endTripData?.route, endTripData?.notes);
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    // 8. START TRIP (Heuristic) Handling
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

    // 9. AI Fallback (Gemini)
    const geminiResult = await parseWithGemini(body);
    if (geminiResult && geminiResult.intent !== 'OTHER') {
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
          res.type('text/xml').send(twimlResponse(''));
          return;
        }
        break;
      }
      case 'END_TRIP': {
        const endStop = constructStopInput(geminiResult);
        if (endStop) {
          await handlers.handleEndTrip(phoneNumber, user, endStop, null, geminiResult.notes);
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

    // 10. Fallback: Save for review
    await db.collection('trips').add({
      userId: user.userId,
      raw_text: body,
      needs_review: true,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      source: 'sms_fallback',
    });

    await sendSmsReply(phoneNumber, `❌ Could not understand. Try:\n[Route]\n[Stop]`);
    res.type('text/xml').send(twimlResponse(''));
  } catch (error) {
    logger.error('CRITICAL ERROR', error);
    res.status(500).send('Internal error');
  }
}

// Routes with Signature Validation
app.post('/', (req, res, next) => {
  if (validateTwilioSignature(req)) return next();
  res.status(403).send('Forbidden');
}, handleSmsRequest);

// Export 2nd Gen Function
exports.sms = onRequest({
  secrets: [geminiApiKey, twilioAuthToken, twilioAccountSid, twilioPhoneNumber],
  concurrency: 50, // Optimize costs by handling more requests on one instance
  maxInstances: 10,
}, app);
