/**
 * API Webhook Handler for Transit Stats (Twilio-free iOS app companion logging)
 */

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { dispatch } = require('./lib/dispatcher');
const { apiContextStorage, sendSmsReply } = require('./lib/twilio');
const logger = require('./lib/logger');

// Initialize Admin SDK if not already done
if (admin.apps.length === 0) {
  admin.initializeApp({
    serviceAccountId: 'firebase-adminsdk-fbsvc@transitstats-21ba4.iam.gserviceaccount.com',
  });
}

const db = admin.firestore();

/** Local short trace ID generator */
function generateTraceIdLocal() {
  try {
    const { randomUUID } = require('crypto');
    return randomUUID().replace(/-/g, '').slice(0, 8);
  } catch {
    return Date.now().toString(36).slice(-8);
  }
}

/**
 * Normalize manually typed phone numbers to E.164 format.
 * Automatically prefixes 10-digit North American numbers with '+1'.
 */
function normalizePhoneNumber(phone) {
  let cleaned = (phone || '').trim().replace(/[^\d]/g, '');
  if (cleaned.length === 10) {
    return '+1' + cleaned;
  }
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return '+' + cleaned;
  }
  // Fallback: prefix with + if not already present
  return ((phone || '').startsWith('+') ? '' : '+') + cleaned;
}

/**
 * Handle passwordless login OTP request
 */
async function handleRequestOtp(req, res, traceId) {
  const phoneNumber = normalizePhoneNumber(req.body.phoneNumber);

  if (phoneNumber.length < 8) {
    res.status(400).json({ error: 'Invalid phone number format.' });
    return;
  }

  try {
    const phoneDoc = await db.collection('phoneNumbers').doc(phoneNumber).get();
    if (!phoneDoc.exists) {
      logger.warn('OTP Request denied: Phone number not registered', { phoneNumber, traceId }, traceId);
      res.status(400).json({ error: 'This phone number is not registered. Please register your number via SMS first.' });
      return;
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000));
    
    await db.collection('phoneLoginVerification').doc(phoneNumber).set({
      code,
      expiresAt,
      attempts: 0,
    });

    const message = `Your TransitStats login verification code is: ${code}`;
    const smsSent = await sendSmsReply(phoneNumber, message);
    if (!smsSent) {
      logger.error('OTP Request failed: Twilio send failed', { phoneNumber, traceId }, traceId);
      res.status(500).json({ error: 'Failed to send SMS verification code. Please try again.' });
      return;
    }

    logger.info('OTP code sent successfully', { phoneNumber, traceId }, traceId);
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Error in request_otp handler', { error: error.message, phoneNumber, traceId }, traceId);
    res.status(500).json({ error: 'Internal Server Error', traceId });
  }
}

/**
 * Handle passwordless login OTP verification and custom token generation
 */
async function handleVerifyOtp(req, res, traceId) {
  const phoneNumber = normalizePhoneNumber(req.body.phoneNumber);
  const code = (req.body.code || '').trim();

  if (!code) {
    res.status(400).json({ error: 'Missing verification code.' });
    return;
  }

  try {
    const verifyDoc = await db.collection('phoneLoginVerification').doc(phoneNumber).get();
    if (!verifyDoc.exists) {
      res.status(400).json({ error: 'No pending verification found. Please request a new code.' });
      return;
    }

    const verifyData = verifyDoc.data();

    if (verifyData.expiresAt.toDate() < new Date()) {
      await db.collection('phoneLoginVerification').doc(phoneNumber).delete();
      res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
      return;
    }

    if (verifyData.attempts >= 3) {
      await db.collection('phoneLoginVerification').doc(phoneNumber).delete();
      res.status(400).json({ error: 'Too many failed verification attempts. Please request a new code.' });
      return;
    }

    if (verifyData.code !== code) {
      await db.collection('phoneLoginVerification').doc(phoneNumber).update({
        attempts: FieldValue.increment(1),
      });
      res.status(400).json({ error: 'Invalid verification code.' });
      return;
    }

    await db.collection('phoneLoginVerification').doc(phoneNumber).delete();

    const phoneDoc = await db.collection('phoneNumbers').doc(phoneNumber).get();
    if (!phoneDoc.exists) {
      res.status(400).json({ error: 'Registration record not found for this phone number.' });
      return;
    }

    const userId = phoneDoc.data().userId;
    const customToken = await admin.auth().createCustomToken(userId);

    logger.info('OTP verification successful. Minted custom token.', { phoneNumber, userId, traceId }, traceId);
    res.status(200).json({ success: true, token: customToken });
  } catch (error) {
    logger.error('Error in verify_otp handler', { error: error.message, phoneNumber, traceId }, traceId);
    res.status(500).json({ error: 'Internal Server Error', traceId });
  }
}

/**
 * HTTP handler for API requests
 */
async function handleApiRequest(req, res) {
  const traceId = generateTraceIdLocal();

  // CORS support
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Access-Control-Max-Age', '3600');
    res.status(204).send('');
    return;
  }

  try {
    // Check for auth bypass actions
    const action = req.body?.action;
    if (action === 'request_otp') {
      await handleRequestOtp(req, res, traceId);
      return;
    } else if (action === 'verify_otp') {
      await handleVerifyOtp(req, res, traceId);
      return;
    }

    // 1. Authenticate Request
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('API authentication failed: Missing or invalid token format', { traceId }, traceId);
      res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header' });
      return;
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (authErr) {
      logger.warn('API authentication failed: Invalid ID token', { error: authErr.message, traceId }, traceId);
      res.status(401).json({ error: 'Unauthorized: Invalid token' });
      return;
    }

    const uid = decodedToken.uid;
    const email = decodedToken.email || '';
    
    // 2. Validate Whitelist (allowedUsers)
    const allowedDoc = await db.collection('allowedUsers').doc(email.toLowerCase()).get();
    if (!allowedDoc.exists) {
      logger.warn('API access denied: User not whitelisted', { email, traceId }, traceId);
      res.status(403).json({ error: 'Access denied: User is not whitelisted' });
      return;
    }

    // 3. Find registered phone number for this user
    const phoneQuery = await db.collection('phoneNumbers')
      .where('userId', '==', uid)
      .limit(1)
      .get();

    if (phoneQuery.empty) {
      logger.warn('API request failed: No registered phone number', { uid, email, traceId }, traceId);
      res.status(400).json({ error: 'Failed: No registered phone number found for this account. Please register your phone number first.' });
      return;
    }

    const phoneNumber = phoneQuery.docs[0].id;
    const command = (req.body.command || '').trim();

    if (!command) {
      res.status(400).json({ error: 'Missing command' });
      return;
    }

    logger.info('API Command received', { uid, email, phoneNumber, command, traceId }, traceId);

    // 4. Run dispatch inside AsyncLocalStorage context to capture replies
    const apiContext = {
      isApiRequest: true,
      replies: []
    };

    await apiContextStorage.run(apiContext, async () => {
      // Mock Twilio messageSid with a random/API prefix to avoid duplicate checks colliding with real SMS
      const mockMessageSid = `api_${generateTraceIdLocal()}_${Date.now()}`;
      await dispatch(phoneNumber, command, mockMessageSid, { numMedia: 0 }, traceId);
    });

    // 5. Respond with captured SMS messages
    res.status(200).json({
      success: true,
      replies: apiContext.replies,
      traceId
    });

  } catch (err) {
    logger.error('CRITICAL API DISPATCH ERROR', {
      error: err.message,
      stack: err.stack,
      request: req.body,
      traceId,
    }, traceId);
    res.status(500).json({ error: 'Internal Server Error', traceId });
  }
}

// Export the Cloud Function with proper secrets configuration
const { defineSecret } = require('firebase-functions/params');
const geminiApiKey = defineSecret('GEMINI_API_KEY');
const twilioAuthToken = defineSecret('TWILIO_AUTH_TOKEN');
const twilioAccountSid = defineSecret('TWILIO_ACCOUNT_SID');
const twilioPhoneNumber = defineSecret('TWILIO_PHONE_NUMBER');

exports.api = onRequest({
  secrets: [geminiApiKey, twilioAuthToken, twilioAccountSid, twilioPhoneNumber],
  concurrency: 80,
  maxInstances: 10,
}, handleApiRequest);
