/**
 * SMS Webhook Handler for Transit Stats
 *
 * Receives POST webhooks from Twilio and handles transit trip tracking via SMS.
 * Commands: REGISTER, HELP, STATUS, CANCEL, and trip logging "[stopCode] [route]"
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');

// Initialize Firebase Admin SDK (only once)
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const app = express();

// Parse URL-encoded bodies (Twilio sends form data)
app.use(express.urlencoded({ extended: true }));

// =============================================================================
// TWILIO CONFIGURATION
// =============================================================================

/**
 * Get Twilio client. Returns null if credentials are not configured.
 */
function getTwilioClient() {
  try {
    const accountSid = functions.config().twilio?.account_sid;
    const authToken = functions.config().twilio?.auth_token;

    if (!accountSid || !authToken) {
      console.error('Twilio credentials not configured. Set them with:');
      console.error('firebase functions:config:set twilio.account_sid="XXX" twilio.auth_token="XXX" twilio.phone_number="+1XXXXXXXXXX"');
      return null;
    }

    const twilio = require('twilio');
    return twilio(accountSid, authToken);
  } catch (error) {
    console.error('Error initializing Twilio client:', error);
    return null;
  }
}

/**
 * Get the Twilio phone number to send from
 */
function getTwilioPhoneNumber() {
  return functions.config().twilio?.phone_number || null;
}

// =============================================================================
// SMS RESPONSE HELPER
// =============================================================================

/**
 * Send an SMS reply via Twilio
 * @param {string} to - Recipient phone number
 * @param {string} message - Message body
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
    console.log(`SMS sent to ${to}: ${message.substring(0, 50)}...`);
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
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(message)}</Message>
</Response>`;
}

/**
 * Escape XML special characters
 */
function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// =============================================================================
// FIRESTORE HELPERS
// =============================================================================

/**
 * Get user info by phone number
 * @param {string} phoneNumber - Phone number (e.g., "+16471234567")
 * @returns {object|null} User data or null if not registered
 */
async function getUserByPhone(phoneNumber) {
  const phoneDoc = await db.collection('phoneNumbers').doc(phoneNumber).get();
  if (!phoneDoc.exists) {
    return null;
  }
  return phoneDoc.data();
}

/**
 * Get active trip for a user (trip with no endTime)
 * @param {string} userId - User ID
 * @returns {object|null} Active trip data with ID or null
 */
async function getActiveTrip(userId) {
  const tripsRef = db.collection('trips');
  const snapshot = await tripsRef
    .where('userId', '==', userId)
    .where('endTime', '==', null)
    .orderBy('startTime', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

/**
 * Get pending state for a phone number (for disambiguation)
 * @param {string} phoneNumber - Phone number
 * @returns {object|null} Pending state or null
 */
async function getPendingState(phoneNumber) {
  const stateDoc = await db.collection('smsState').doc(phoneNumber).get();
  if (!stateDoc.exists) {
    return null;
  }
  const data = stateDoc.data();

  // Check if state is expired (5 minutes)
  if (data.expiresAt && data.expiresAt.toDate() < new Date()) {
    await db.collection('smsState').doc(phoneNumber).delete();
    return null;
  }

  return data;
}

/**
 * Set pending state for a phone number
 * @param {string} phoneNumber - Phone number
 * @param {object} state - State object
 */
async function setPendingState(phoneNumber, state) {
  const expiresAt = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
  );
  await db.collection('smsState').doc(phoneNumber).set({
    ...state,
    expiresAt,
  });
}

/**
 * Clear pending state for a phone number
 * @param {string} phoneNumber - Phone number
 */
async function clearPendingState(phoneNumber) {
  await db.collection('smsState').doc(phoneNumber).delete();
}

/**
 * Store registration verification code
 * @param {string} phoneNumber - Phone number
 * @param {string} email - Email address
 * @param {string} code - 4-digit verification code
 */
async function storeVerificationCode(phoneNumber, email, code) {
  const expiresAt = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
  );
  await db.collection('smsVerification').doc(phoneNumber).set({
    email,
    code,
    expiresAt,
    attempts: 0,
  });
}

/**
 * Get verification data for a phone number
 * @param {string} phoneNumber - Phone number
 * @returns {object|null} Verification data or null
 */
async function getVerificationData(phoneNumber) {
  const doc = await db.collection('smsVerification').doc(phoneNumber).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data();

  // Check if expired
  if (data.expiresAt && data.expiresAt.toDate() < new Date()) {
    await db.collection('smsVerification').doc(phoneNumber).delete();
    return null;
  }

  return data;
}

/**
 * Generate a random 4-digit code
 */
function generateVerificationCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// =============================================================================
// COMMAND HANDLERS
// =============================================================================

/**
 * Handle HELP command
 */
async function handleHelp(phoneNumber) {
  const message = `TransitStats SMS Commands:

[stop] [route] - Log a trip
STATUS - View active trip
CANCEL - Cancel active trip
REGISTER [email] - Link account
HELP - Show this message

Examples:
"York Mills 97" - Start trip
"1" - End active trip
"2" - Start new trip`;

  await sendSmsReply(phoneNumber, message);
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
  const duration = Math.round((Date.now() - startTime.getTime()) / 60000);
  const timeStr = startTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const message = `Active trip:
Route ${activeTrip.route} from ${activeTrip.startStop}
Started ${timeStr} (${duration} min ago)

Reply with [stop] to end, or CANCEL to delete.`;

  await sendSmsReply(phoneNumber, message);
}

/**
 * Handle CANCEL command
 */
async function handleCancel(phoneNumber, user) {
  const activeTrip = await getActiveTrip(user.userId);

  if (!activeTrip) {
    await sendSmsReply(phoneNumber, 'No active trip to cancel.');
    return;
  }

  await db.collection('trips').doc(activeTrip.id).delete();
  await clearPendingState(phoneNumber);

  await sendSmsReply(
    phoneNumber,
    `Cancelled. Route ${activeTrip.route} from ${activeTrip.startStop} deleted.`
  );
}

/**
 * Handle REGISTER command
 */
async function handleRegister(phoneNumber, email) {
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    await sendSmsReply(
      phoneNumber,
      'Invalid email format. Text REGISTER [email] with a valid email address.'
    );
    return;
  }

  // Check if phone is already registered
  const existingUser = await getUserByPhone(phoneNumber);
  if (existingUser) {
    await sendSmsReply(
      phoneNumber,
      `This phone is already linked to ${existingUser.email}. Contact support to change.`
    );
    return;
  }

  // Check if user exists with this email
  const profilesSnapshot = await db
    .collection('profiles')
    .where('email', '==', email.toLowerCase())
    .limit(1)
    .get();

  if (profilesSnapshot.empty) {
    await sendSmsReply(
      phoneNumber,
      `No TransitStats account found for ${email}. Create an account at the web app first.`
    );
    return;
  }

  // Generate verification code
  const code = generateVerificationCode();
  await storeVerificationCode(phoneNumber, email.toLowerCase(), code);

  // Send email with verification code
  // Note: In production, you'd use Firebase Extensions or a service like SendGrid
  // For now, we'll store the code and instruct user to check email
  console.log(`Verification code for ${email}: ${code}`);

  // Try to send email via Firebase (if configured)
  try {
    await db.collection('mail').add({
      to: email.toLowerCase(),
      message: {
        subject: 'TransitStats SMS Verification Code',
        text: `Your verification code is: ${code}\n\nEnter this code by replying to the SMS to link your phone number.`,
        html: `<h2>TransitStats SMS Verification</h2><p>Your verification code is: <strong>${code}</strong></p><p>Reply to the SMS with this code to link your phone number.</p>`,
      },
    });
    console.log(`Verification email queued for ${email}`);
  } catch (error) {
    console.error('Error queuing verification email:', error);
  }

  await sendSmsReply(
    phoneNumber,
    `Verification code sent to ${email}. Reply with the 4-digit code.`
  );

  // Set state to wait for code
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
    await sendSmsReply(
      phoneNumber,
      'No pending registration. Text REGISTER [email] to start.'
    );
    return;
  }

  // Check attempts
  if (verificationData.attempts >= 3) {
    await db.collection('smsVerification').doc(phoneNumber).delete();
    await clearPendingState(phoneNumber);
    await sendSmsReply(
      phoneNumber,
      'Too many attempts. Text REGISTER [email] to try again.'
    );
    return;
  }

  // Verify code
  if (code !== verificationData.code) {
    await db.collection('smsVerification').doc(phoneNumber).update({
      attempts: admin.firestore.FieldValue.increment(1),
    });
    await sendSmsReply(phoneNumber, 'Invalid code. Please try again.');
    return;
  }

  // Code is correct - link phone to user
  const email = verificationData.email;
  const profilesSnapshot = await db
    .collection('profiles')
    .where('email', '==', email)
    .limit(1)
    .get();

  if (profilesSnapshot.empty) {
    await sendSmsReply(phoneNumber, 'Account not found. Please try again.');
    return;
  }

  const userId = profilesSnapshot.docs[0].id;

  // Create phone number mapping
  await db.collection('phoneNumbers').doc(phoneNumber).set({
    userId,
    email,
    registeredAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Clean up
  await db.collection('smsVerification').doc(phoneNumber).delete();
  await clearPendingState(phoneNumber);

  await sendSmsReply(
    phoneNumber,
    `Phone linked to ${email}! Text "[stop] [route]" to log trips.`
  );
}

/**
 * Handle trip logging (e.g., "York Mills 97" or "123 504")
 */
async function handleTripLog(phoneNumber, user, stopCode, route) {
  const activeTrip = await getActiveTrip(user.userId);

  if (activeTrip) {
    // User has an active trip - ask to disambiguate
    await setPendingState(phoneNumber, {
      type: 'disambiguate',
      activeTrip: {
        id: activeTrip.id,
        route: activeTrip.route,
        startStop: activeTrip.startStop,
        startTime: activeTrip.startTime,
      },
      newTrip: {
        stopCode,
        route,
      },
    });

    const message = `Active trip: Route ${activeTrip.route} from ${activeTrip.startStop}

Reply:
1 - End trip at ${stopCode}
2 - Keep active, start new trip`;

    await sendSmsReply(phoneNumber, message);
    return;
  }

  // No active trip - create new one
  const tripData = {
    userId: user.userId,
    route: route,
    startStop: stopCode,
    endStop: null,
    startTime: admin.firestore.FieldValue.serverTimestamp(),
    endTime: null,
    source: 'sms',
    verified: false,
    boardingLocation: null,
    exitLocation: null,
  };

  await db.collection('trips').add(tripData);
  await sendSmsReply(phoneNumber, `Route ${route} @ ${stopCode}`);
}

/**
 * Handle disambiguation response (1 or 2)
 */
async function handleDisambiguation(phoneNumber, user, choice, state) {
  if (choice === '1') {
    // End active trip with new stop as endStop
    const activeTrip = state.activeTrip;
    const endTime = admin.firestore.Timestamp.now();
    const startTime = activeTrip.startTime.toDate
      ? activeTrip.startTime.toDate()
      : new Date(activeTrip.startTime._seconds * 1000);

    const duration = Math.round((endTime.toDate().getTime() - startTime.getTime()) / 60000);

    await db.collection('trips').doc(activeTrip.id).update({
      endStop: state.newTrip.stopCode,
      endTime: endTime,
    });

    await clearPendingState(phoneNumber);
    await sendSmsReply(
      phoneNumber,
      `Trip saved: ${activeTrip.startStop} -> ${state.newTrip.stopCode}, ${duration} min on Route ${activeTrip.route}`
    );
  } else if (choice === '2') {
    // Save active trip as incomplete, start new one
    const activeTrip = state.activeTrip;
    const newTrip = state.newTrip;

    // Update active trip with endTime but no endStop
    await db.collection('trips').doc(activeTrip.id).update({
      endTime: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Create new trip
    const tripData = {
      userId: user.userId,
      route: newTrip.route,
      startStop: newTrip.stopCode,
      endStop: null,
      startTime: admin.firestore.FieldValue.serverTimestamp(),
      endTime: null,
      source: 'sms',
      verified: false,
      boardingLocation: null,
      exitLocation: null,
    };

    await db.collection('trips').add(tripData);
    await clearPendingState(phoneNumber);

    await sendSmsReply(
      phoneNumber,
      `Previous trip saved (boarding only). Route ${newTrip.route} @ ${newTrip.stopCode}`
    );
  } else {
    await sendSmsReply(phoneNumber, 'Reply 1 to end trip, 2 to start new.');
  }
}

/**
 * Handle ending a trip with just a stop name (when user has active trip)
 */
async function handleEndTrip(phoneNumber, user, endStop) {
  const activeTrip = await getActiveTrip(user.userId);

  if (!activeTrip) {
    await sendSmsReply(phoneNumber, 'No active trip to end.');
    return;
  }

  const endTime = admin.firestore.Timestamp.now();
  const startTime = activeTrip.startTime.toDate();
  const duration = Math.round((endTime.toDate().getTime() - startTime.getTime()) / 60000);

  await db.collection('trips').doc(activeTrip.id).update({
    endStop: endStop,
    endTime: endTime,
  });

  await sendSmsReply(
    phoneNumber,
    `Trip saved: ${activeTrip.startStop} -> ${endStop}, ${duration} min on Route ${activeTrip.route}`
  );
}

// =============================================================================
// MAIN REQUEST HANDLER
// =============================================================================

/**
 * Parse incoming SMS body and route to appropriate handler
 */
async function handleSmsRequest(req, res) {
  try {
    const phoneNumber = req.body.From;
    const body = (req.body.Body || '').trim();

    console.log(`SMS from ${phoneNumber}: ${body}`);

    if (!phoneNumber || !body) {
      res.status(400).send('Missing phone number or message body');
      return;
    }

    // Check for pending state first
    const pendingState = await getPendingState(phoneNumber);

    // Handle verification code (4-digit number when awaiting verification)
    if (pendingState?.type === 'awaiting_verification' && /^\d{4}$/.test(body)) {
      await handleVerificationCode(phoneNumber, body);
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    // Handle disambiguation (1 or 2)
    if (pendingState?.type === 'disambiguate' && /^[12]$/.test(body)) {
      const user = await getUserByPhone(phoneNumber);
      if (user) {
        await handleDisambiguation(phoneNumber, user, body, pendingState);
      }
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    // Parse command
    const upperBody = body.toUpperCase();

    // HELP command
    if (upperBody === 'HELP' || upperBody === '?') {
      await handleHelp(phoneNumber);
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    // REGISTER command
    if (upperBody.startsWith('REGISTER ')) {
      const email = body.substring(9).trim();
      await handleRegister(phoneNumber, email);
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    // Check if user is registered for remaining commands
    const user = await getUserByPhone(phoneNumber);

    if (!user) {
      await sendSmsReply(
        phoneNumber,
        'Phone not linked. Text REGISTER [email] to link your TransitStats account.'
      );
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    // STATUS command
    if (upperBody === 'STATUS') {
      await handleStatus(phoneNumber, user);
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    // CANCEL command
    if (upperBody === 'CANCEL') {
      await handleCancel(phoneNumber, user);
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    // END command with stop
    if (upperBody.startsWith('END ')) {
      const endStop = body.substring(4).trim();
      await handleEndTrip(phoneNumber, user, endStop);
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    // Trip logging: "[stopCode] [route]" pattern
    // Match patterns like "York Mills 97", "123 504", "Union Station Line 1"
    const tripMatch = body.match(/^(.+?)\s+(\S+)$/);

    if (tripMatch) {
      const stopCode = tripMatch[1].trim();
      const route = tripMatch[2].trim();

      // Basic validation
      if (stopCode.length > 0 && route.length > 0) {
        await handleTripLog(phoneNumber, user, stopCode, route);
        res.type('text/xml').send(twimlResponse(''));
        return;
      }
    }

    // Single word - could be ending a trip with just a stop name
    if (!body.includes(' ') && body.length > 0) {
      const activeTrip = await getActiveTrip(user.userId);
      if (activeTrip) {
        await handleEndTrip(phoneNumber, user, body);
        res.type('text/xml').send(twimlResponse(''));
        return;
      }
    }

    // Unrecognized input
    await sendSmsReply(
      phoneNumber,
      'Format: [stop] [route]. Text HELP for commands.'
    );
    res.type('text/xml').send(twimlResponse(''));
  } catch (error) {
    console.error('Error handling SMS:', error);
    res.status(500).send('Internal server error');
  }
}

// =============================================================================
// EXPRESS ROUTES
// =============================================================================

// POST /sms - Twilio webhook endpoint
app.post('/', handleSmsRequest);

// GET /sms - Health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'TransitStats SMS',
    endpoint: 'POST /sms for Twilio webhooks',
  });
});

// =============================================================================
// EXPORT CLOUD FUNCTION
// =============================================================================

exports.sms = functions.https.onRequest(app);
