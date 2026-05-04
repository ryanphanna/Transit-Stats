/**
 * SMS Webhook Handler for Transit Stats (2nd Generation)
 */

const { onRequest } = require('firebase-functions/v2/https');
const express = require('express');
const { defineSecret } = require('firebase-functions/params');

// Modules
const admin = require('firebase-admin');
const logger = require('./lib/logger');
const {
  validateTwilioSignature,
  twimlResponse,
} = require('./lib/twilio');
const { dispatch } = require('./lib/dispatcher');

// Secrets (Modern defineSecret pattern)
const geminiApiKey = defineSecret('GEMINI_API_KEY');
const twilioAuthToken = defineSecret('TWILIO_AUTH_TOKEN');
const twilioAccountSid = defineSecret('TWILIO_ACCOUNT_SID');
const twilioPhoneNumber = defineSecret('TWILIO_PHONE_NUMBER');

const app = express();
app.use(express.urlencoded({ extended: true }));

/**
 * Simplified SMS Webhook Entry Point
 */
async function handleSmsRequest(req, res) {
  try {
    const phoneNumber = req.body.From;
    const body = (req.body.Body || '').trim();
    const messageSid = req.body.MessageSid;
    const numMedia = parseInt(req.body.NumMedia || '0', 10);
    const mediaUrl = numMedia > 0 ? (req.body.MediaUrl0 || null) : null;

    if (!phoneNumber || (!body && !mediaUrl)) {
      res.status(400).send('Missing phone number or message body');
      return;
    }

    // Delegate all logic to the dispatcher
    await dispatch(phoneNumber, body, messageSid, { numMedia, mediaUrl });

    // Twilio expects a valid TwiML response
    res.type('text/xml').send(twimlResponse(''));
  } catch (error) {
    logger.error('CRITICAL SMS DISPATCH ERROR', {
      error: error.message,
      stack: error.stack,
      request: req.body,
    });
    res.status(500).send('Internal Error');
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
