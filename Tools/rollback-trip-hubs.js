/**
 * rollback-trip-hubs.js
 * Removes denormalized hubId fields from trip records.
 */
const admin = require('firebase-admin');
const KEY_PATH = '/Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json';

admin.initializeApp({ credential: admin.credential.cert(require(KEY_PATH)) });
const db = admin.firestore();

async function rollback() {
  console.log('--- Trip Hub Rollback Engine ---');
  const tripsSnap = await db.collection('trips').get();
  let batch = db.batch();
  let count = 0;

  for (const doc of tripsSnap.docs) {
    const data = doc.data();
    if (data.startHubId !== undefined || data.endHubId !== undefined) {
      batch.update(doc.ref, {
        startHubId: admin.firestore.FieldValue.delete(),
        endHubId: admin.firestore.FieldValue.delete()
      });
      count++;
      if (count % 400 === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }
  }
  
  if (count % 400 !== 0) {
    await batch.commit();
  }
  
  console.log(`Rollback complete. Cleaned ${count} trips.`);
}

rollback().catch(console.error);
