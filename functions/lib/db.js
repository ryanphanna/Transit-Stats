/**
 * Firestore database helper functions for SMS tracking
 */
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

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
        new Date(now.getTime() + 60 * 60 * 1000), // 1 hour from now
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
        new Date(now.getTime() + 60 * 60 * 1000),
      ),
    });
    return false;
  }

  if (data.count >= 60) {
    // Rate limit exceeded (60 messages per hour)
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
 * Check if a phone number is Gemini rate limited
 * @param {string} phoneNumber - Phone number
 * @returns {boolean} true if Gemini rate limited (10 calls per hour)
 */
async function isGeminiRateLimited(phoneNumber) {
  const rateLimitRef = db.collection('geminiRateLimits').doc(phoneNumber);
  const doc = await rateLimitRef.get();
  const now = new Date();

  if (!doc.exists) {
    await rateLimitRef.set({
      count: 1,
      resetAt: admin.firestore.Timestamp.fromDate(
        new Date(now.getTime() + 60 * 60 * 1000), // 1 hour from now
      ),
    });
    return false;
  }

  const data = doc.data();
  const resetAt = data.resetAt.toDate();

  if (now >= resetAt) {
    await rateLimitRef.set({
      count: 1,
      resetAt: admin.firestore.Timestamp.fromDate(
        new Date(now.getTime() + 60 * 60 * 1000),
      ),
    });
    return false;
  }

  if (data.count >= 10) {
    console.log('Gemini rate limit exceeded for', phoneNumber);
    return true;
  }

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
        new Date(now.getTime() + 60 * 60 * 1000), // 1 hour from now
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
        new Date(now.getTime() + 60 * 60 * 1000),
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
  const now = new Date();
  const twelveHoursAgo = admin.firestore.Timestamp.fromDate(
    new Date(now.getTime() - 12 * 60 * 60 * 1000),
  );

  const tripsRef = db.collection('trips');
  const snapshot = await tripsRef
    .where('userId', '==', userId)
    .where('endTime', '==', null)
    .where('startTime', '>=', twelveHoursAgo)
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
    new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
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
    new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
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
        .where('code', '==', stopCode)
        .limit(1)
        .get();
    } else if (stopName) {
      // Look up by stop name and agency (case-sensitive exact match)
      snapshot = await db.collection('stops')
        .where('agency', '==', agency)
        .where('name', '==', stopName)
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
            return { id: doc.id, ...data, stopCode: data.code, stopName: data.name };
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
        for (const doc of allStops.docs) {
          const data = doc.data();
          if (data.aliases && Array.isArray(data.aliases)) {
            if (data.aliases.some((a) => a.toLowerCase() === lowerName)) {
              return { id: doc.id, ...data, stopCode: data.code, stopName: data.name };
            }
          }
        }

        return null;
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
 * Check idempotency: Ignore if we've already processed this MessageSid
 * @param {string} messageSid - Twilio MessageSid
 * @returns {boolean} true if already processed
 */
async function checkIdempotency(messageSid) {
  if (!messageSid) return false;

  const msgRef = db.collection('processedMessages').doc(messageSid);

  try {
    // create() is atomic — fails with ALREADY_EXISTS if another request beat us here
    await msgRef.create({
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 3600000)),
    });
    return false; // first time seeing this message
  } catch (e) {
    if (e.code === 6) { // ALREADY_EXISTS
      return true; // duplicate — skip processing
    }
    throw e;
  }
}

/**
 * Create a new trip in the database
 * @param {object} tripData - The trip details to save
 * @returns {Promise<string>} Created trip ID
 */
async function createTrip(tripData) {
  const docRef = await db.collection('trips').add({
    ...tripData,
    startTime: admin.firestore.FieldValue.serverTimestamp(),
    endTime: null,
    source: tripData.source || 'sms',
    timing_reliability: tripData.timing_reliability || 'actual',
    endStopCode: null,
    endStopName: null,
    exitLocation: null,
  });
  return docRef.id;
}

/**
 * Get recent completed trips for a user
 * @param {string} userId - User ID
 * @param {number} limit - Max number of trips
 * @returns {Promise<Array>} Array of trip data
 */
async function getRecentCompletedTrips(userId, limit = 50) {
  const snapshot = await db.collection('trips')
    .where('userId', '==', userId)
    .where('endTime', '!=', null)
    .orderBy('endTime', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

module.exports = {
  admin,
  db,
  isRateLimited,
  isGeminiRateLimited,
  isEmailAllowed,
  shouldRespondToUnknown,
  getUserByPhone,
  getUserProfile,
  getActiveTrip,
  getPendingState,
  setPendingState,
  clearPendingState,
  storeVerificationCode,
  getVerificationData,
  lookupStop,
  checkIdempotency,
  createTrip,
  getRecentCompletedTrips,
};
