/**
 * Trip and SMS state management
 */
const { admin, db } = require('./core');
const { getUserProfile } = require('./users');

async function getActiveTrip(userId) {
  const now = new Date();
  const sixHoursAgo = admin.firestore.Timestamp.fromDate(new Date(now.getTime() - 6 * 60 * 60 * 1000));

  const snapshot = await db.collection('trips')
    .where('userId', '==', userId)
    .where('endTime', '==', null)
    .where('startTime', '>=', sixHoursAgo)
    .orderBy('startTime', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function createTrip(tripData) {
  const profile = await getUserProfile(tripData.userId);
  const docRef = await db.collection('trips').add({
    ...tripData,
    startTime: admin.firestore.FieldValue.serverTimestamp(),
    endTime: null,
    source: tripData.source || 'sms',
    timing_reliability: tripData.timing_reliability || 'actual',
    endStopCode: null,
    endStopName: null,
    exitLocation: null,
    isPublic: profile?.isPublic || false,
  });
  return docRef.id;
}

async function getRecentCompletedTrips(userId, limit = 50) {
  const snapshot = await db.collection('trips')
    .where('userId', '==', userId)
    .where('endTime', '!=', null)
    .orderBy('endTime', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(t => !t.incomplete);
}

async function getPendingState(phoneNumber) {
  const stateDoc = await db.collection('smsState').doc(phoneNumber).get();
  if (!stateDoc.exists) return null;
  const data = stateDoc.data();
  if (data.expiresAt && data.expiresAt.toDate() < new Date()) {
    await db.collection('smsState').doc(phoneNumber).delete();
    return null;
  }
  return data;
}

async function setPendingState(phoneNumber, state) {
  const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 5 * 60 * 1000));
  await db.collection('smsState').doc(phoneNumber).set({ ...state, expiresAt });
}

async function clearPendingState(phoneNumber) {
  await db.collection('smsState').doc(phoneNumber).delete();
}

async function getLastTripAgency(userId) {
  const snap = await db.collection('trips')
    .where('userId', '==', userId)
    .orderBy('startTime', 'desc')
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].data().agency || null;
}

module.exports = {
  getActiveTrip,
  createTrip,
  getRecentCompletedTrips,
  getPendingState,
  setPendingState,
  clearPendingState,
  getLastTripAgency,
};
