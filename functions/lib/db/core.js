const { initializeApp, getApps, getApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');

let adminApp;
if (!getApps().length) {
  adminApp = initializeApp({
    serviceAccountId: 'firebase-adminsdk-fbsvc@transitstats-21ba4.iam.gserviceaccount.com',
  });
} else {
  adminApp = getApp();
}

const db = getFirestore();

module.exports = { admin: adminApp, db, FieldValue, Timestamp };
