const twilio = require('twilio');
const { defineSecret } = require('firebase-functions/params');
const { escapeXml } = require('./utils');

// Test mode: captured replies accumulate here instead of being sent via Twilio.
const _testReplies = [];
function getCapturedReplies() { return [..._testReplies]; }
function clearCapturedReplies() { _testReplies.length = 0; }

const twilioAuthToken = defineSecret('TWILIO_AUTH_TOKEN');
const twilioAccountSid = defineSecret('TWILIO_ACCOUNT_SID');
const twilioPhoneNumber = defineSecret('TWILIO_PHONE_NUMBER');

/**
 * Get Twilio client. Returns null if credentials are not configured.
 * @returns {twilio.Twilio|null}
 */
function getTwilioClient() {
  try {
    const accountSid = twilioAccountSid.value();
    const authToken = twilioAuthToken.value();

    if (!accountSid || !authToken) {
      console.error('Twilio credentials missing.',
        { hasSid: !!accountSid, hasToken: !!authToken });
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
  return twilioPhoneNumber.value();
}

function getMessagingServiceSid() {
  return null;
}

/**
 * Send an SMS reply via Twilio
 * @param {string} to - Recipient phone number
 * @param {string} message - Message body
 * @returns {Promise<boolean>} success status
 */
async function sendSmsReply(to, message) {
  if (process.env.TS_TEST_MODE) {
    _testReplies.push({ to, message });
    return true;
  }

  const client = getTwilioClient();
  const messagingServiceSid = getMessagingServiceSid();
  const from = getTwilioPhoneNumber();

  if (!client || (!messagingServiceSid && !from)) {
    console.error('Cannot send message - Twilio not configured');
    return false;
  }

  // Prefer Messaging Service SID: enables automatic RCS upgrade with SMS fallback.
  // Fall back to direct phone number for accounts without a Messaging Service.
  const msgParams = messagingServiceSid
    ? { body: message, messagingServiceSid, to }
    : { body: message, from, to };

  try {
    await client.messages.create(msgParams);
    console.log(`Message sent via ${messagingServiceSid ? 'Messaging Service (RCS/SMS)' : 'direct SMS'}`);
    await logOutboundMessage(message);
    return true;
  } catch (error) {
    console.error('Error sending message:', error);
    return false;
  }
}

/**
 * Log outbound message body hash so the dispatcher can detect loops.
 * @param {string} body
 */
async function logOutboundMessage(body) {
  try {
    const crypto = require('crypto');
    const { getFirestore, getAdmin } = require('./db');
    const db = getFirestore();
    const admin = getAdmin();
    const key = crypto.createHash('sha256').update('outbound|' + body).digest('hex');
    await db.collection('processedMessages').doc('outbound_' + key).set({
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 120000)),
    });
  } catch (e) {
    console.error('Failed to log outbound message:', e);
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

  const authToken = twilioAuthToken.value();

  console.info('Auth check:', {
    hasSecret: !!authToken,
    secretPrefix: authToken ? authToken.substring(0, 4) : 'none'
  });

  if (!authToken) {
    console.error('Twilio auth token not available');
    return false;
  }

  const twilioSignature = req.headers['x-twilio-signature'];
  if (!twilioSignature) {
    console.warn('Missing X-Twilio-Signature header');
    return false;
  }

  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;

  // Reconstruct the full URL. If a specific webhook URL is needed, it should be defined as a param.
  const url = `${protocol}://${host}${req.originalUrl}`;

  console.info('Twilio validation inputs:', {
    url,
    originalUrl: req.originalUrl,
    host,
    xForwardedHost: req.headers['x-forwarded-host'],
    twilioSignature,
    bodyKeys: Object.keys(req.body || {}),
  });

  // Try the primary URL
  let isValid = twilio.validateRequest(authToken, twilioSignature, url, req.body);

  // Fallback to strict /sms URL if originalUrl fails (Firebase function rewriting)
  if (!isValid) {
    const fallbackUrl = `${protocol}://${host}/sms`;
    console.info('Retrying with fallback URL:', fallbackUrl);
    if (twilio.validateRequest(authToken, twilioSignature, fallbackUrl, req.body)) {
      console.info('Validation SUCCESS with fallback URL');
      isValid = true;
    }
  }

  if (!isValid) {
    console.warn('Invalid Twilio webhook signature - final failure', {
      url,
      originalUrl: req.originalUrl,
      bodyKeys: Object.keys(req.body || {})
    });
    return false;
  }

  return true;
}

module.exports = {
  getTwilioClient,
  getTwilioPhoneNumber,
  getMessagingServiceSid,
  sendSmsReply,
  twimlResponse,
  validateTwilioSignature,
  getCapturedReplies,
  clearCapturedReplies,
};
