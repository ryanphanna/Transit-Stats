/**
 * Firebase Admin SDK initialization — shared by all db modules
 */
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    serviceAccountId: 'firebase-adminsdk-fbsvc@transitstats-21ba4.iam.gserviceaccount.com',
  });
}

const db = admin.firestore();

module.exports = { admin, db };
