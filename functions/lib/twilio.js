/**
 * Twilio helper functions for SMS sending and validation
 */
const functions = require('firebase-functions');
const twilio = require('twilio');
const { defineSecret } = require('firebase-functions/params');
const { escapeXml } = require('./utils');

const twilioAuthToken = defineSecret('TWILIO_AUTH_TOKEN');

/**
 * Get Twilio client. Returns null if credentials are not configured.
 * @returns {twilio.Twilio|null}
 */
function getTwilioClient() {
  try {
    // Check both Secret Manager and legacy functions:config
    const accountSid = functions.config().twilio?.account_sid; // Legacy often uses config for SID
    const authToken = twilioAuthToken.value() || functions.config().twilio?.auth_token;

    if (!accountSid || !authToken) {
      console.error('Twilio credentials not configured correctly. SID or Token missing.', { hasSid: !!accountSid, hasToken: !!authToken });
      return null;
    }

    return twilio(accountSid, authToken);
  } catch (error) {
    console.error('Error initializing Twilio client:', error);
    return null;
  }
}

/**
 * Get the Twilio phone number to send from
 * @returns {string|null}
 */
function getTwilioPhoneNumber() {
  return functions.config().twilio?.phone_number || null;
}

/**
 * Send an SMS reply via Twilio
 * @param {string} to - Recipient phone number
 * @param {string} message - Message body
 * @returns {Promise<boolean>} success status
 */
async function sendSmsReply(to, message) {
  const client = getTwilioClient();
  const from = getTwilioPhoneNumber();

  if (!client || !from) {
    console.error('Cannot send SMS - Twilio not configured');
    return false;
  }

  try {
    await client.messages.create({
      body: message,
      from: from,
      to: to,
    });
    console.log('SMS sent successfully');
    return true;
  } catch (error) {
    console.error('Error sending SMS:', error);
    return false;
  }
}

/**
 * Generate TwiML response (fallback if Twilio API fails)
 * @param {string} message - Message body
 * @returns {string} TwiML XML
 */
function twimlResponse(message) {
  if (!message) {
    return '<?xml version="1.0" encoding="UTF-8"?><Response/>';
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(message)}</Message>
</Response>`;
}

/**
 * Middleware/Helper to validate that POST requests genuinely originate from Twilio.
 * @param {object} req - Express request
 * @returns {boolean} true if valid
 */
function validateTwilioSignature(req) {
  // Allow bypass in Firebase emulator for local development
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    console.warn('⚠️  Twilio signature validation skipped (emulator mode)');
    return true;
  }

  const authToken = twilioAuthToken.value() || functions.config().twilio?.auth_token;
  if (!authToken) {
    console.error('Twilio auth token secret/config not available');
    return false;
  }

  const twilioSignature = req.headers['x-twilio-signature'];
  if (!twilioSignature) {
    console.warn('Missing X-Twilio-Signature header');
    return false;
  }

  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const url = `${protocol}://${host}${req.originalUrl}`;

  const isValid = twilio.validateRequest(authToken, twilioSignature, url, req.body);

  if (!isValid) {
    console.warn('Invalid Twilio webhook signature - possible forgery attempt');
    return false;
  }

  return true;
}

module.exports = {
  getTwilioClient,
  getTwilioPhoneNumber,
  sendSmsReply,
  twimlResponse,
  validateTwilioSignature,
};
