/**
 * User lookup, profiles, auth whitelist, and verification
 */
const { admin, db } = require('./core');

async function getUserByPhone(phoneNumber) {
  const phoneDoc = await db.collection('phoneNumbers').doc(phoneNumber).get();
  if (!phoneDoc.exists) return null;
  return phoneDoc.data();
}

async function getUserProfile(userId) {
  const profileDoc = await db.collection('profiles').doc(userId).get();
  if (!profileDoc.exists) return null;
  return profileDoc.data();
}

async function isEmailAllowed(email) {
  const allowedDoc = await db.collection('allowedUsers').doc(email.toLowerCase()).get();
  return allowedDoc.exists;
}

async function storeVerificationCode(phoneNumber, email, code) {
  const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 15 * 60 * 1000));
  await db.collection('smsVerification').doc(phoneNumber).set({ email, code, expiresAt, attempts: 0 });
}

async function getVerificationData(phoneNumber) {
  const doc = await db.collection('smsVerification').doc(phoneNumber).get();
  if (!doc.exists) return null;
  const data = doc.data();
  if (data.expiresAt && data.expiresAt.toDate() < new Date()) {
    await db.collection('smsVerification').doc(phoneNumber).delete();
    return null;
  }
  return data;
}

module.exports = {
  getUserByPhone,
  getUserProfile,
  isEmailAllowed,
  storeVerificationCode,
  getVerificationData,
};
