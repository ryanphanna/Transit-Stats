/**
 * rollback-trip-hubs.js
 * Removes denormalized hubId fields from trip records.
 */
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const KEY_PATH = '/Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json';

initializeApp({ credential: cert(require(KEY_PATH)) });
const db = getFirestore();

async function rollback() {
  console.log('--- Trip Hub Rollback Engine ---');
  const tripsSnap = await db.collection('trips').get();
  let batch = db.batch();
  let count = 0;

  for (const doc of tripsSnap.docs) {
    const data = doc.data();
    if (data.startHubId !== undefined || data.endHubId !== undefined) {
      batch.update(doc.ref, {
        startHubId: FieldValue.delete(),
        endHubId: FieldValue.delete()
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
