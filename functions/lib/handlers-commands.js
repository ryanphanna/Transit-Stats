/**
 * Simple SMS command handlers.
 */
const admin = require('firebase-admin');
const {
  sendSmsReply,
} = require('./twilio');
const {
  getActiveTrip,
  setPendingState,
  clearPendingState,
  storeVerificationCode,
  getVerificationData,
  isEmailAllowed,
  getUserByPhone,
  getUserProfile,
  db,
} = require('./db');
const {
  getStopDisplay,
  getRouteDisplay,
  generateVerificationCode,
} = require('./utils');
const {
  lookupAgencyTimezone,
} = require('./gemini');

/**
 * Handle HELP command
 */
async function handleHelp(phoneNumber) {
  const user = await getUserByPhone(phoneNumber);
  const profile = user ? await getUserProfile(user.userId) : null;
  const isPremium = !!profile?.isPremium;

  const commands = [
    'STATUS - view active trip',
    'STATS - your last 30 days',
    'FORGOT - forgot to end a trip',
    'DISCARD - didn\'t board, delete the trip',
    'UNLINK - separate a linked journey',
  ];
  if (isPremium) commands.push('ASK [question] - AI stats');

  await sendSmsReply(phoneNumber,
    `TransitStats

To start a trip, send:

ROUTE STOP DIRECTION
or on separate lines:
ROUTE
STOP
DIRECTION (optional)
AGENCY (optional)

To end a trip, send:
END
STOP
NOTES (optional)

Commands:
${commands.join('\n')}`,
  );
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
  const statusTimezone = activeTrip.agency
    ? await lookupAgencyTimezone(activeTrip.agency)
    : 'America/Toronto';
  const timeStr = startTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: statusTimezone || 'America/Toronto',
  });

  const startStopDisplay = getStopDisplay(
    activeTrip.startStopCode,
    activeTrip.startStopName,
    activeTrip.startStop,
  );

  const routeDisplay = getRouteDisplay(activeTrip.route, activeTrip.direction);

  const message = `Active trip:
${routeDisplay} from ${startStopDisplay}
Started ${timeStr} (${elapsedMin} min ago)

END [stop] to finish. FORGOT if you forgot to end. INFO for help.`;

  await sendSmsReply(phoneNumber, message);
}

/**
 * Handle DISCARD command - permanently deletes active trip
 */
async function handleDiscard(phoneNumber, user) {
  const activeTrip = await getActiveTrip(user.userId);

  if (!activeTrip) {
    await sendSmsReply(phoneNumber, 'No active trip.');
    return;
  }

  const routeDisplay = getRouteDisplay(activeTrip.route, activeTrip.direction);

  // If this active trip was linked into a journey, clean up the partner's journeyId
  if (activeTrip.journeyId) {
    const partnerSnap = await db.collection('trips')
      .where('userId', '==', user.userId)
      .where('journeyId', '==', activeTrip.journeyId)
      .get();
    const batch = db.batch();
    partnerSnap.docs.forEach(doc => {
      if (doc.id !== activeTrip.id) {
        batch.update(doc.ref, { journeyId: admin.firestore.FieldValue.delete() });
      }
    });
    batch.delete(db.collection('trips').doc(activeTrip.id));
    await batch.commit();
  } else {
    await db.collection('trips').doc(activeTrip.id).delete();
  }
  await clearPendingState(phoneNumber);

  await sendSmsReply(phoneNumber, `Deleted ${routeDisplay}.`);
}

/**
 * Handle UNLINK command - removes journey link from the most recently ended trip
 */
async function handleUnlink(phoneNumber, user) {
  // Find the most recently completed trip with a journeyId
  const snap = await db.collection('trips')
    .where('userId', '==', user.userId)
    .where('endTime', '!=', null)
    .orderBy('endTime', 'desc')
    .limit(10)
    .get();

  const linked = snap.docs.find(d => d.data().journeyId);
  if (!linked) {
    await sendSmsReply(phoneNumber, 'No linked trip to unlink.');
    return;
  }

  const trip = linked.data();
  const journeyId = trip.journeyId;
  const routeDisplay = getRouteDisplay(trip.route, trip.direction);

  // Remove journeyId from all trips sharing this journey
  const journeySnap = await db.collection('trips')
    .where('userId', '==', user.userId)
    .where('journeyId', '==', journeyId)
    .get();

  const batch = db.batch();
  journeySnap.docs.forEach(doc => {
    batch.update(doc.ref, { journeyId: admin.firestore.FieldValue.delete() });
  });
  await batch.commit();

  await sendSmsReply(phoneNumber, `Unlinked ${routeDisplay} journey.`);
}

/**
 * Handle FORGOT command - marks end as unknown
 */
async function handleIncomplete(phoneNumber, user) {
  const activeTrip = await getActiveTrip(user.userId);

  if (!activeTrip) {
    await sendSmsReply(phoneNumber, 'No active trip.');
    return;
  }

  const routeDisplay = getRouteDisplay(activeTrip.route, activeTrip.direction);

  await db.collection('trips').doc(activeTrip.id).update({
    incomplete: true,
    endTime: activeTrip.startTime,
    exitLocation: null,
    duration: null,
  });

  await sendSmsReply(phoneNumber, `${routeDisplay} saved as incomplete.`);
}

/**
 * Handle REGISTER command
 */
async function handleRegister(phoneNumber, email) {
  const emailRegex = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
  if (!emailRegex.test(email)) {
    await sendSmsReply(phoneNumber, 'Invalid email format. Text REGISTER [email].');
    return;
  }

  const allowed = await isEmailAllowed(email);
  if (!allowed) {
    await sendSmsReply(phoneNumber, 'Invite-only. Visit web app for access info.');
    return;
  }

  const existingUser = await getUserByPhone(phoneNumber);
  if (existingUser) {
    await sendSmsReply(phoneNumber, `Phone already linked to ${existingUser.email}.`);
    return;
  }

  const profilesSnapshot = await db.collection('profiles')
    .where('email', '==', email.toLowerCase())
    .limit(1).get();

  if (profilesSnapshot.empty) {
    await sendSmsReply(phoneNumber, `No TransitStats account for ${email}. Create one in web app.`);
    return;
  }

  const code = generateVerificationCode();
  await storeVerificationCode(phoneNumber, email.toLowerCase(), code);

  try {
    await db.collection('mail').add({
      to: email.toLowerCase(),
      message: {
        subject: 'TransitStats SMS Verification Code',
        text: `Your code is: ${code}\n\nReply to SMS with this code.`,
        html: `<p>Your code is: <strong>${code}</strong></p>`,
      },
    });
  } catch (error) {
    console.error('Error queuing verification email:', error);
  }

  await sendSmsReply(phoneNumber, `Code sent to ${email}. Reply with the 6-digit code.`);

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
    await sendSmsReply(phoneNumber, 'No pending registration.');
    return;
  }

  if (verificationData.attempts >= 3) {
    await db.collection('smsVerification').doc(phoneNumber).delete();
    await clearPendingState(phoneNumber);
    await sendSmsReply(phoneNumber, 'Too many attempts. Text REGISTER [email].');
    return;
  }

  if (code !== verificationData.code) {
    await db.collection('smsVerification').doc(phoneNumber).update({
      attempts: admin.firestore.FieldValue.increment(1),
    });
    await sendSmsReply(phoneNumber, 'Invalid code.');
    return;
  }

  const profilesSnapshot = await db.collection('profiles')
    .where('email', '==', verificationData.email)
    .limit(1).get();

  if (profilesSnapshot.empty) {
    await sendSmsReply(phoneNumber, 'Account not found.');
    return;
  }

  const userId = profilesSnapshot.docs[0].id;

  await db.collection('phoneNumbers').doc(phoneNumber).set({
    userId,
    email: verificationData.email,
    registeredAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db.collection('smsVerification').doc(phoneNumber).delete();
  await clearPendingState(phoneNumber);

  await sendSmsReply(phoneNumber, `Phone linked! Text "[stop] [route]" to log trips.`);
}

module.exports = {
  handleHelp,
  handleStatus,
  handleDiscard,
  handleUnlink,
  handleIncomplete,
  handleRegister,
  handleVerificationCode,
};
