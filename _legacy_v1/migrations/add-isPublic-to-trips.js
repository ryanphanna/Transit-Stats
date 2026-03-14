/**
 * Migration Script: Add isPublic to Trips
 *
 * Denormalizes isPublic from each user's profile onto their trip documents,
 * so Firestore security rules don't need to fetch the profile on every trip read.
 *
 * USAGE:
 * 1. node add-isPublic-to-trips.js          (dry run — shows what would change)
 * 2. DRY_RUN=false node add-isPublic-to-trips.js   (applies changes)
 *
 * SAFETY:
 * - Dry-run by default
 * - Idempotent: safe to run multiple times
 * - Batches writes in groups of 500 (Firestore limit)
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

const DRY_RUN = process.env.DRY_RUN !== 'false';

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function run() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);

  // Load all profiles to build a userId -> isPublic map
  console.log('Loading profiles...');
  const profilesSnap = await db.collection('profiles').get();
  const isPublicByUser = {};
  profilesSnap.docs.forEach(doc => {
    isPublicByUser[doc.id] = doc.data().isPublic || false;
  });
  console.log(`Loaded ${profilesSnap.size} profiles.`);

  // Load all trips that are missing isPublic (or have it wrong)
  console.log('Loading trips...');
  const tripsSnap = await db.collection('trips').get();
  console.log(`Loaded ${tripsSnap.size} trips.`);

  const toUpdate = tripsSnap.docs.filter(doc => {
    const data = doc.data();
    const expected = isPublicByUser[data.userId] || false;
    return data.isPublic !== expected;
  });

  console.log(`Trips needing update: ${toUpdate.length}`);

  if (toUpdate.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  // Batch writes in groups of 500
  const BATCH_SIZE = 500;
  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const chunk = toUpdate.slice(i, i + BATCH_SIZE);
    if (!DRY_RUN) {
      const batch = db.batch();
      chunk.forEach(doc => {
        const expected = isPublicByUser[doc.data().userId] || false;
        batch.update(doc.ref, { isPublic: expected });
      });
      await batch.commit();
    }
    console.log(`  ${DRY_RUN ? '[DRY] Would update' : 'Updated'} trips ${i + 1}–${Math.min(i + BATCH_SIZE, toUpdate.length)}`);
  }

  console.log('Done.');
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
