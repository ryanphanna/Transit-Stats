/**
 * SMS Webhook Handler for Transit Stats
 *
 * Receives POST webhooks from Twilio and handles transit trip tracking via SMS.
 *
 * START TRIP (multi-line):
 * Line 1: Route (required)
 * Line 2: Stop (required)
 * Line 3: Direction (optional)
 * Line 4: Agency (optional)
 *
 * END TRIP (multi-line):
 * Line 1: END
 * Line 2: Stop (required)
 * Line 3+: Notes (optional)
 *
 * Commands (anytime):
 * - END + stop + notes: End active trip properly (saves with exit stop)
 * - DISCARD: Delete active trip without saving
 * - STATUS: Show active trip info
 * - INFO or ?: Show help
 *
 * Prompt-only commands:
 * - START: Confirm starting new trip (only appears in prompts)
 *
 * Stop identification:
 * - If stop is all digits (e.g., "6036"), saved as stopCode
 * - If stop contains letters (e.g., "Spadina & Nassau"), saved as stopName
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
 * Check if a phone number is rate limited
 * @param {string} phoneNumber - Phone number
 * @returns {boolean} true if rate limited (should ignore message)
 */
async function isRateLimited(phoneNumber) {
  const rateLimitRef = db.collection('rateLimits').doc(phoneNumber);
  const doc = await rateLimitRef.get();
  const now = new Date();

  if (!doc.exists) {
    // First message - create rate limit record
    await rateLimitRef.set({
      count: 1,
      resetAt: admin.firestore.Timestamp.fromDate(
        new Date(now.getTime() + 60 * 60 * 1000) // 1 hour from now
      ),
    });
    return false;
  }

  const data = doc.data();
  const resetAt = data.resetAt.toDate();

  if (now >= resetAt) {
    // Reset period expired - reset counter
    await rateLimitRef.set({
      count: 1,
      resetAt: admin.firestore.Timestamp.fromDate(
        new Date(now.getTime() + 60 * 60 * 1000)
      ),
    });
    return false;
  }

  if (data.count >= 500) {
    // Rate limit exceeded
    console.log('Rate limit exceeded');
    return true;
  }

  // Increment counter
  await rateLimitRef.update({
    count: admin.firestore.FieldValue.increment(1),
  });
  return false;
}

/**
 * Check if email is in the allowedUsers whitelist
 * @param {string} email - Email address to check
 * @returns {boolean} true if email is allowed
 */
async function isEmailAllowed(email) {
  const allowedDoc = await db
    .collection('allowedUsers')
    .doc(email.toLowerCase())
    .get();
  return allowedDoc.exists;
}

/**
 * Track unknown number messages and check if should respond
 * @param {string} phoneNumber - Phone number
 * @returns {boolean} true if this is the first message in the hour (should respond)
 */
async function shouldRespondToUnknown(phoneNumber) {
  const unknownRef = db.collection('unknownNumbers').doc(phoneNumber);
  const doc = await unknownRef.get();
  const now = new Date();

  if (!doc.exists) {
    // First ever message from this number
    await unknownRef.set({
      firstMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      messageCount: 1,
      resetAt: admin.firestore.Timestamp.fromDate(
        new Date(now.getTime() + 60 * 60 * 1000) // 1 hour from now
      ),
    });
    return true; // Respond to first message
  }

  const data = doc.data();
  const resetAt = data.resetAt.toDate();

  if (now >= resetAt) {
    // Reset period expired - treat as first message again
    await unknownRef.set({
      firstMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      messageCount: 1,
      resetAt: admin.firestore.Timestamp.fromDate(
        new Date(now.getTime() + 60 * 60 * 1000)
      ),
    });
    return true;
  }

  // Not first message in this hour - increment and ignore
  await unknownRef.update({
    messageCount: admin.firestore.FieldValue.increment(1),
  });
  console.log('Ignoring repeat message from unknown number');
  return false;
}

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
 * Get user's profile (including defaultAgency)
 * @param {string} userId - User ID
 * @returns {object|null} Profile data or null
 */
async function getUserProfile(userId) {
  const profileDoc = await db.collection('profiles').doc(userId).get();
  if (!profileDoc.exists) {
    return null;
  }
  return profileDoc.data();
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

/**
 * Parse stop input to determine if it's a stop code (all digits) or stop name (contains letters)
 * @param {string} input - The stop input string
 * @returns {object} Object with stopCode and stopName fields (only one will be set)
 */
function parseStopInput(input) {
  const trimmed = input.trim();
  // Check if the input is all digits (stop code)
  if (/^\d+$/.test(trimmed)) {
    return { stopCode: trimmed, stopName: null };
  }
  // Contains letters - it's a stop name
  return { stopCode: null, stopName: toTitleCase(trimmed) };
}

/**
 * Get display string for a stop (handles both code and name fields)
 * @param {string|null} stopCode - Stop code (numeric)
 * @param {string|null} stopName - Stop name (text)
 * @param {string|null} legacyStop - Legacy startStop/endStop field for backward compatibility
 * @returns {string} Display string for the stop
 */
function getStopDisplay(stopCode, stopName, legacyStop = null) {
  if (stopCode) return stopCode;
  if (stopName) return stopName;
  if (legacyStop) return legacyStop;
  return 'Unknown';
}

/**
 * Look up a stop in the stops database
 * Returns stop data with lat/lng if found, null otherwise
 * @param {string|null} stopCode - Stop code (numeric)
 * @param {string|null} stopName - Stop name (text)
 * @param {string} agency - Transit agency
 * @returns {object|null} Stop data or null
 */
async function lookupStop(stopCode, stopName, agency) {
  try {
    let snapshot;

    if (stopCode) {
      // Look up by stop code and agency
      snapshot = await db.collection('stops')
        .where('agency', '==', agency)
        .where('code', '==', stopCode) // Corrected from stopCode to code
        .limit(1)
        .get();
    } else if (stopName) {
      // Look up by stop name and agency (case-sensitive exact match)
      snapshot = await db.collection('stops')
        .where('agency', '==', agency)
        .where('name', '==', stopName) // Corrected from stopName to name
        .limit(1)
        .get();

      // If no exact match (or code lookup failed)
      if (snapshot.empty) {
        // 1. Try case-insensitive name match
        const allStops = await db.collection('stops')
          .where('agency', '==', agency)
          .get();

        const lowerName = stopName.toLowerCase();
        for (const doc of allStops.docs) {
          const data = doc.data();
          // Check 'name' field
          if (data.name && data.name.toLowerCase() === lowerName) {
            return { id: doc.id, ...data, stopCode: data.code, stopName: data.name }; // Map back to internal format
          }
        }

        // 2. Try ALIAS match (exact)
        const aliasSnapshot = await db.collection('stops')
          .where('agency', '==', agency)
          .where('aliases', 'array-contains', stopName)
          .limit(1)
          .get();

        if (!aliasSnapshot.empty) {
          const doc = aliasSnapshot.docs[0];
          const data = doc.data();
          return { id: doc.id, ...data, stopCode: data.code, stopName: data.name };
        }

        // 3. Try ALIAS match (case-insensitive loop)
        // Since we already fetched allStops above, we can reuse it
        for (const doc of allStops.docs) {
          const data = doc.data();
          if (data.aliases && Array.isArray(data.aliases)) {
            if (data.aliases.some(a => a.toLowerCase() === lowerName)) {
              return { id: doc.id, ...data, stopCode: data.code, stopName: data.name };
            }
          }
        }

        return null; // Finally give up
      }
    } else {
      return null;
    }

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();
    return { id: doc.id, ...data, stopCode: data.code, stopName: data.name };
  } catch (error) {
    console.error('Error looking up stop:', error);
    return null;
  }
}

/**
 * Normalize direction input to standard full-word format
 * @param {string} input - Raw direction input (e.g. "SB", "North", "CW")
 * @returns {string} Normalized direction (e.g. "Southbound", "Northbound", "Clockwise") or original input
 */
function normalizeDirection(input) {
  if (!input) return null;

  const upper = input.trim().toUpperCase();

  // North/Northbound
  if (['N', 'NB', 'NORTH', 'NORTHBOUND'].includes(upper)) return 'Northbound';

  // South/Southbound
  if (['S', 'SB', 'SOUTH', 'SOUTHBOUND'].includes(upper)) return 'Southbound';

  // East/Eastbound
  if (['E', 'EB', 'EAST', 'EASTBOUND'].includes(upper)) return 'Eastbound';

  // West/Westbound
  if (['W', 'WB', 'WEST', 'WESTBOUND'].includes(upper)) return 'Westbound';

  // Clockwise
  if (['CW', 'CLOCKWISE'].includes(upper)) return 'Clockwise';

  // Counterclockwise
  if (['CCW', 'COUNTERCLOCKWISE', 'ANTICLOCKWISE', 'ANTI-CLOCKWISE'].includes(upper)) return 'Counterclockwise';

  // Inbound
  if (['IB', 'IN', 'INBOUND'].includes(upper)) return 'Inbound';

  // Outbound
  if (['OB', 'OUT', 'OUTBOUND'].includes(upper)) return 'Outbound';

  // Return original if no match (e.g. specific destination name)
  return input.trim();
}

/**
 * Convert string to Title Case
 * Also normalizes " and " to " & " for intersections
 * @param {string} str - Input string
 * @returns {string} Title Cased String
 */
function toTitleCase(str) {
  if (!str) return str;

  // Replace " and " with " & " (case insensitive)
  const withAmpersand = str.replace(/\s+and\s+/gi, ' & ');

  return withAmpersand.toLowerCase().split(' ').map(word => {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');
}

/**
 * Parse multi-line trip format
 * Line 1: Route (required)
 * Line 2: Stop (required)
 * Line 3: Direction (optional)
 * Line 4: Agency (optional)
 * @param {string} body - Message body
 * @param {string} defaultAgency - User's default agency
 * @returns {object|null} Parsed trip data or null if invalid
 */
function parseMultiLineTripFormat(body, defaultAgency) {
  const lines = body.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  // Need at least route and stop (lines 1 and 2)
  if (lines.length < 2) {
    return null;
  }

  // If first line is a command, don't parse as trip
  const firstLineUpper = lines[0].toUpperCase();
  if (['END', 'STATUS', 'DISCARD', 'INFO', '?', 'START', 'HELP'].includes(firstLineUpper)) {
    return null;
  }

  const route = toTitleCase(lines[0]);
  const stop = toTitleCase(lines[1]);
  // Normalize direction if present
  const direction = lines.length > 2 ? normalizeDirection(lines[2]) : null;

  // Check if line 4 is an agency
  let agency = defaultAgency;
  if (lines.length > 3) {
    // Check if it's a known agency
    const potentialAgency = lines[3];
    const lowerAgency = potentialAgency.toLowerCase();
    const knownAgency = KNOWN_AGENCIES.find(a => a.toLowerCase() === lowerAgency);
    if (knownAgency) {
      agency = knownAgency;
    }
  }

  return {
    route,
    stop,
    direction,
    agency,
  };
}

/**
 * Parse multi-line END trip format
 * Line 1: END
 * Line 2: Route (optional, for verification)
 * Line 3: Stop (required)
 * @param {string} body - Message body
 * @returns {object|null} Parsed end trip data or null if not an END command
 */
function parseEndTripFormat(body) {
  const lines = body.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  // First line must be "END" or "STOP"
  if (lines.length === 0 || !['END', 'STOP'].includes(lines[0].toUpperCase())) {
    return null;
  }

  // Just "END" - no stop provided
  if (lines.length < 2) {
    return { isEnd: true, stop: null, route: null, notes: null };
  }

  // Format:
  // Line 1: END/STOP
  // Line 2: Stop Name
  // Line 3+: Notes
  const stop = lines[1];
  const notes = lines.length > 2 ? lines.slice(2).join('\n') : null;

  return {
    isEnd: true,
    stop,
    route: null, // Deprecated route verification in favor of simple stop + notes
    notes
  };
}

// =============================================================================
// AGENCY HANDLING
// =============================================================================

/**
 * Known transit agencies for override parsing
 * Case-insensitive matching
 */
const KNOWN_AGENCIES = [
  'TTC',
  'OC Transpo',
  'GO Transit',
  'GO',
  'MiWay',
  'YRT',
  'Brampton Transit',
  'Durham Transit',
  'HSR',
  'GRT',
  'STM',
  'TransLink',
];

/**
 * Parse agency override from end of message
 * Checks if the message ends with a known agency name
 * @param {string} message - The full message
 * @returns {object} { agency: string|null, remainingMessage: string }
 */
function parseAgencyOverride(message) {
  const trimmed = message.trim();
  const lowerMessage = trimmed.toLowerCase();

  // Check each known agency (case-insensitive)
  for (const agency of KNOWN_AGENCIES) {
    const lowerAgency = agency.toLowerCase();
    if (lowerMessage.endsWith(' ' + lowerAgency)) {
      // Remove agency from end of message
      const remainingMessage = trimmed.slice(0, -(agency.length + 1)).trim();
      // Return the canonical agency name (properly cased)
      return { agency, remainingMessage };
    }
  }

  return { agency: null, remainingMessage: trimmed };
}

// =============================================================================
// COMMAND HANDLERS
// =============================================================================

/**
 * Handle HELP command
 */
async function handleHelp(phoneNumber) {
  const message = `TransitStats

To start a trip, send:

ROUTE
STOP
DIRECTION (optional)
AGENCY (optional)

To end a trip, send:
END
STOP
NOTES (optional)

STATUS to view active trip. INFO to view this information.
REGISTER [email] - Link account`;

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
  const elapsedMs = Date.now() - startTime.getTime();
  const elapsedMin = Math.round(elapsedMs / 60000);
  const timeStr = startTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  // Get display for start stop (handles both old and new schema)
  const startStopDisplay = getStopDisplay(
    activeTrip.startStopCode,
    activeTrip.startStopName,
    activeTrip.startStop
  );

  // Format route with direction if available
  const routeDisplay = activeTrip.direction
    ? `Route ${activeTrip.route} ${activeTrip.direction}`
    : `Route ${activeTrip.route}`;

  const message = `Active trip:
${routeDisplay} from Stop ${startStopDisplay}
Started ${timeStr} (${elapsedMin} min ago)

END + STOP to finish. DISCARD to delete. INFO for help.`;

  await sendSmsReply(phoneNumber, message);
}

/**
 * Handle DISCARD command - deletes active trip without saving
 */
async function handleDiscard(phoneNumber, user) {
  const activeTrip = await getActiveTrip(user.userId);

  if (!activeTrip) {
    await sendSmsReply(phoneNumber, 'No active trip to discard.');
    return;
  }

  // Format route with direction if available
  const routeDisplay = activeTrip.direction
    ? `Route ${activeTrip.route} ${activeTrip.direction}`
    : `Route ${activeTrip.route}`;

  await db.collection('trips').doc(activeTrip.id).delete();
  await clearPendingState(phoneNumber);

  await sendSmsReply(
    phoneNumber,
    `✅ Discarded ${routeDisplay}.`
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

  // Check if email is in the allowedUsers whitelist
  const allowed = await isEmailAllowed(email);
  if (!allowed) {
    await sendSmsReply(
      phoneNumber,
      'This app is invite-only. Visit the web app for access information.'
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
  // Verification code generated (not logged for security)

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
    console.log('Verification email queued');
  } catch (error) {
    console.error('Error queuing verification email:', error);
  }

  await sendSmsReply(
    phoneNumber,
    `Verification code sent to ${email}. Reply with the 4-digit code.\n\nReply DISCARD to undo`
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
 * Handle trip logging with multi-line format
 * @param {string} phoneNumber - Phone number
 * @param {object} user - User object with userId
 * @param {string} stopInput - Stop code or name
 * @param {string} route - Route number/name
 * @param {string|null} direction - Direction (optional)
 * @param {string} agency - Transit agency
 */
async function handleTripLog(phoneNumber, user, stopInput, route, direction, agency) {
  const activeTrip = await getActiveTrip(user.userId);
  const parsedStop = parseStopInput(stopInput);
  const stopDisplay = getStopDisplay(parsedStop.stopCode, parsedStop.stopName);

  // Look up stop in database for verification
  const stopData = await lookupStop(parsedStop.stopCode, parsedStop.stopName, agency);
  const verified = stopData !== null;
  const boardingLocation = stopData ? { lat: stopData.lat, lng: stopData.lng } : null;

  if (activeTrip) {
    // Get display for active trip's start stop (handles both old and new schema)
    const activeTripStartStop = getStopDisplay(
      activeTrip.startStopCode,
      activeTrip.startStopName,
      activeTrip.startStop
    );

    // Format route display for active trip
    const activeTripRouteDisplay = activeTrip.direction
      ? `Route ${activeTrip.route} ${activeTrip.direction}`
      : `Route ${activeTrip.route}`;

    // Format route display for new trip
    const newTripRouteDisplay = direction
      ? `Route ${route} ${direction}`
      : `Route ${route}`;

    // User has an active trip - prompt to start new (marks old as incomplete)
    await setPendingState(phoneNumber, {
      type: 'confirm_start',
      activeTrip: {
        id: activeTrip.id,
        route: activeTrip.route,
        direction: activeTrip.direction || null,
        startStopCode: activeTrip.startStopCode || null,
        startStopName: activeTrip.startStopName || null,
        startStop: activeTrip.startStop || null, // Legacy field
        startTime: activeTrip.startTime,
        agency: activeTrip.agency || null,
      },
      newTrip: {
        // Use resolved data if available
        stopCode: stopData ? stopData.stopCode : parsedStop.stopCode,
        stopName: stopData ? stopData.stopName : parsedStop.stopName,
        route,
        direction,
        agency,
        verified,
        boardingLocation,
      },
    });

    const message = `${activeTripRouteDisplay} from ${activeTripStartStop} was not ended. ⚠️

START to save incomplete trip and begin ${newTripRouteDisplay} from ${stopDisplay}. DISCARD to delete. INFO for help.`;

    await sendSmsReply(phoneNumber, message);
    return;
  }

  // No active trip - create new one
  const tripData = {
    userId: user.userId,
    route: route,
    direction: direction || null,
    // Use resolved stop data if available, otherwise fall back to parsed input
    startStopCode: stopData ? stopData.stopCode : parsedStop.stopCode,
    startStopName: stopData ? stopData.stopName : parsedStop.stopName,
    endStopCode: null,
    endStopName: null,
    startTime: admin.firestore.FieldValue.serverTimestamp(),
    endTime: null,
    source: 'sms',
    verified: verified,
    boardingLocation: boardingLocation,
    exitLocation: null,
    agency: agency,
  };

  await db.collection('trips').add(tripData);

  // Format route display
  const routeDisplay = direction ? `Route ${route} ${direction}` : `Route ${route}`;

  // Use the canonical display name
  const finalStopDisplay = getStopDisplay(
    stopData ? stopData.stopCode : parsedStop.stopCode,
    stopData ? stopData.stopName : parsedStop.stopName
  );

  await sendSmsReply(
    phoneNumber,
    `✅ Started ${routeDisplay} from Stop ${finalStopDisplay}.

END + STOP to finish. DISCARD to delete. INFO for help.`
  );
}

/**
 * Handle START confirmation response (when user confirms starting new trip)
 */
async function handleConfirmStart(phoneNumber, user, state) {
  const activeTrip = state.activeTrip;
  const newTrip = state.newTrip;

  // Format old trip display
  const oldTripRouteDisplay = activeTrip.direction
    ? `Route ${activeTrip.route} ${activeTrip.direction}`
    : `Route ${activeTrip.route}`;

  // Mark active trip as incomplete (no endTime, no exitLocation, no duration)
  await db.collection('trips').doc(activeTrip.id).update({
    incomplete: true,
    endTime: activeTrip.startTime,
    exitLocation: null,
    duration: null,
  });

  // Create new trip with direction field
  const tripData = {
    userId: user.userId,
    route: newTrip.route,
    direction: newTrip.direction || null,
    startStopCode: newTrip.stopCode,
    startStopName: newTrip.stopName,
    endStopCode: null,
    endStopName: null,
    startTime: admin.firestore.FieldValue.serverTimestamp(),
    endTime: null,
    source: 'sms',
    verified: newTrip.verified || false,
    boardingLocation: newTrip.boardingLocation || null,
    exitLocation: null,
    agency: newTrip.agency,
  };

  await db.collection('trips').add(tripData);
  await clearPendingState(phoneNumber);

  // Format displays
  const newStopDisplay = getStopDisplay(newTrip.stopCode, newTrip.stopName);
  const normalizedDirection = normalizeDirection(newTrip.direction);
  const newRouteDisplay = normalizedDirection
    ? `Route ${newTrip.route} ${normalizedDirection}`
    : `Route ${newTrip.route}`;

  await sendSmsReply(
    phoneNumber,
    `✅ ${oldTripRouteDisplay} marked incomplete.
✅ Started ${newRouteDisplay} from Stop ${newStopDisplay}.

END + STOP to finish. DISCARD to delete. INFO for help.`
  );
}

/**
 * Handle ending a trip
 * @param {string} phoneNumber - Phone number
 * @param {object} user - User object with userId
 * @param {string} endStopInput - Stop code or name
 * @param {string|null} routeVerification - Optional route to verify against active trip
 */
async function handleEndTrip(phoneNumber, user, endStopInput, routeVerification = null, notes = null) {
  const activeTrip = await getActiveTrip(user.userId);

  if (!activeTrip) {
    await sendSmsReply(phoneNumber, 'No active trip to end.');
    return;
  }

  // If route verification provided, check it matches active trip
  if (routeVerification) {
    const activeRoute = activeTrip.route.toString().toLowerCase();
    const verifyRoute = routeVerification.toString().toLowerCase();
    if (activeRoute !== verifyRoute) {
      const routeDisplay = activeTrip.direction
        ? `Route ${activeTrip.route} ${activeTrip.direction}`
        : `Route ${activeTrip.route}`;
      await sendSmsReply(
        phoneNumber,
        `❌ Route mismatch. Active trip is ${routeDisplay}, not Route ${routeVerification}.`
      );
      return;
    }
  }

  const parsedEndStop = parseStopInput(endStopInput);
  const endTime = admin.firestore.Timestamp.now();
  const startTime = activeTrip.startTime.toDate();
  const duration = Math.round((endTime.toDate().getTime() - startTime.getTime()) / 60000);

  // Look up end stop for verification
  const agency = activeTrip.agency || 'TTC';
  const endStopData = await lookupStop(parsedEndStop.stopCode, parsedEndStop.stopName, agency);
  const exitLocation = endStopData ? { lat: endStopData.lat, lng: endStopData.lng } : null;

  // Get display strings for start and end stops
  const endStopDisplay = getStopDisplay(
    endStopData ? endStopData.stopCode : parsedEndStop.stopCode,
    endStopData ? endStopData.stopName : parsedEndStop.stopName
  );

  await db.collection('trips').doc(activeTrip.id).update({
    endStopCode: endStopData ? endStopData.stopCode : parsedEndStop.stopCode,
    endStopName: endStopData ? endStopData.stopName : parsedEndStop.stopName,
    endTime: endTime,
    exitLocation: exitLocation,
    duration: duration,
    notes: notes || null
  });

  // Format route display
  const routeDisplay = activeTrip.direction
    ? `Route ${activeTrip.route} ${activeTrip.direction}`
    : `Route ${activeTrip.route}`;

  await sendSmsReply(
    phoneNumber,
    `✅ Ended ${routeDisplay} at Stop ${endStopDisplay} (${duration} min trip)`
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

    console.log('SMS received');

    if (!phoneNumber || !body) {
      res.status(400).send('Missing phone number or message body');
      return;
    }

    // Check rate limiting first - silently ignore if exceeded
    const rateLimited = await isRateLimited(phoneNumber);
    if (rateLimited) {
      console.log('Rate limited, ignoring message');
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    // Parse uppercase body for command matching
    const upperBody = body.toUpperCase();

    // Check for pending state first
    const pendingState = await getPendingState(phoneNumber);

    // Handle verification code (4-digit number when awaiting verification)
    if (pendingState?.type === 'awaiting_verification' && /^\d{4}$/.test(body)) {
      await handleVerificationCode(phoneNumber, body);
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    // Handle START command (only valid during confirm_start prompt)
    if (pendingState?.type === 'confirm_start' && upperBody === 'START') {
      const user = await getUserByPhone(phoneNumber);
      if (user) {
        await handleConfirmStart(phoneNumber, user, pendingState);
      }
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    // Handle DISCARD at any time as escape hatch (discard pending state AND delete active trip)
    if (upperBody === 'DISCARD' && pendingState) {
      // Clear the pending state AND delete any active trip
      await clearPendingState(phoneNumber);

      // Get the user and delete their active trip
      const user = await getUserByPhone(phoneNumber);
      if (user) {
        const activeTrip = await getActiveTrip(user.userId);
        if (activeTrip) {
          await db.collection('trips').doc(activeTrip.id).delete();

          // Format route with direction if available
          const routeDisplay = activeTrip.direction
            ? `Route ${activeTrip.route} ${activeTrip.direction}`
            : `Route ${activeTrip.route}`;

          await sendSmsReply(phoneNumber, `✅ Discarded ${routeDisplay}.`);
          res.type('text/xml').send(twimlResponse(''));
          return;
        }
      }

      // No active trip found, just acknowledge the discard
      await sendSmsReply(phoneNumber, 'No active trip to discard.');
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    // =========================================================================
    // PARSE COMMANDS FIRST (before any other handling)
    // =========================================================================

    // INFO/? command - show SMS help
    if (upperBody === 'INFO' || upperBody === 'COMMANDS' || upperBody === '?') {
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

STATUS to view active trip. INFO to view this information.`
      );
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    // HELP command
    if (upperBody === 'HELP') {
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
      // Unknown number - only respond to first message in the hour
      const shouldRespond = await shouldRespondToUnknown(phoneNumber);
      if (shouldRespond) {
        await sendSmsReply(
          phoneNumber,
          'Text REGISTER [email] to get started'
        );
      }
      // Otherwise silently ignore to prevent spam costs
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    // STATUS command
    if (upperBody === 'STATUS') {
      await handleStatus(phoneNumber, user);
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    // DISCARD command (no pending state)
    if (upperBody === 'DISCARD') {
      await handleDiscard(phoneNumber, user);
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    // =========================================================================
    // END TRIP - Multi-line format: END / Stop / Route (optional)
    // =========================================================================
    const endTripData = parseEndTripFormat(body);
    if (endTripData) {
      if (!endTripData.stop) {
        // Just "END" without stop - prompt for stop
        const activeTrip = await getActiveTrip(user.userId);
        if (activeTrip) {
          await sendSmsReply(
            phoneNumber,
            'Please send:\nEND\n[exit stop]\n[notes - optional]'
          );
        } else {
          await sendSmsReply(phoneNumber, 'No active trip to end.');
        }
      } else {
        // END with stop (and optional route verification)
        await handleEndTrip(phoneNumber, user, endTripData.stop, endTripData.route, endTripData.notes);
      }
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    // =========================================================================
    // START TRIP - Multi-line format: Route / Stop / Direction / Agency
    // =========================================================================

    // Get user's profile for defaultAgency
    const userProfile = await getUserProfile(user.userId);
    const defaultAgency = userProfile?.defaultAgency || 'TTC';

    // Try parsing as multi-line trip format
    const multiLineTrip = parseMultiLineTripFormat(body, defaultAgency);

    if (multiLineTrip) {
      // Valid multi-line format
      await handleTripLog(
        phoneNumber,
        user,
        multiLineTrip.stop,
        multiLineTrip.route,
        multiLineTrip.direction,
        multiLineTrip.agency
      );
      res.type('text/xml').send(twimlResponse(''));
      return;
    }

    // Parse agency override from message (e.g., "6036 65 OC Transpo")
    const { agency: agencyOverride, remainingMessage } = parseAgencyOverride(body);
    const agency = agencyOverride || defaultAgency;

    // Trip logging: "[stopCode] [route]" pattern (backward compatibility)
    // Match patterns like "York Mills 97", "123 504", "Union Station Line 1"
    const tripMatch = remainingMessage.match(/^(.+?)\s+(\S+)$/);

    if (tripMatch) {
      const stopCode = tripMatch[1].trim();
      const route = tripMatch[2].trim();

      // Basic validation
      if (stopCode.length > 0 && route.length > 0) {
        // If stop input is actually a name (not digits), Title Case it
        // Note: parseStopInput will handle the logic, but we need to check the raw string here if it's name-like
        // Actually, handleTripLog calls parseStopInput inside, so we just need to title case the route here
        // But wait, the stopCode variable here is the raw first part.
        // Let's rely on handleTripLog's internal parsing for the stop, but we should make sure we pass clean inputs?
        // No, handleTripLog calls parseStopInput(stopInput).
        // And parseStopInput calls toTitleCase if it's a name.
        // So we just need to ensure the ROUTE is title cased.

        await handleTripLog(phoneNumber, user, stopCode, toTitleCase(route), null, agency);
        res.type('text/xml').send(twimlResponse(''));
        return;
      }
    }

    // Unrecognized input
    await sendSmsReply(
      phoneNumber,
      `❌ Invalid format.

START TRIP:
Route
Stop
Direction (optional)

END TRIP:
END
Route
Stop

Text INFO for help`
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
