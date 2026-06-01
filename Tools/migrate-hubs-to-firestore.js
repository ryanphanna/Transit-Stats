/**
 * migrate-hubs-to-firestore.js
 *
 * Takes the hardcoded CONNECTION_GROUPS from transfer-connections.js
 * and writes them into the Firestore 'stops' collection as 'hubId' and 'verified: true'.
 *
 * Usage:
 *   node Tools/migrate-hubs-to-firestore.js [--dry-run]
 */

const admin = require('firebase-admin');
const { CONNECTION_GROUPS, normalizeStopName } = require('../functions/lib/transfer-connections');

const KEY_PATH = '/Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json';
const DRY_RUN = process.argv.includes('--dry-run');

admin.initializeApp({ credential: admin.credential.cert(require(KEY_PATH)) });
const db = admin.firestore();

async function migrate() {
  console.log('--- Hub Migration Engine ---');
  if (DRY_RUN) console.log('[DRY RUN MODE]');

  // 1. Fetch all stops
  console.log('Fetching stops from Firestore...');
  const stopsSnap = await db.collection('stops').get();
  const allStops = stopsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  console.log(`Loaded ${allStops.length} stops.`);

  const updates = []; // { stopId, hubId, name }

  // 2. Iterate through groups and find matching stops
  for (const [hubId, stopNames] of Object.entries(CONNECTION_GROUPS)) {
    const normalizedGroupStops = new Set(stopNames.map(name => normalizeStopName(name)));
    
    for (const stop of allStops) {
      const normName = normalizeStopName(stop.name);
      
      // Match by Name or Alias
      const isMatch = normalizedGroupStops.has(normName) || 
                      (stop.aliases && stop.aliases.some(a => normalizedGroupStops.has(normalizeStopName(a))));

      if (isMatch) {
        updates.push({ 
          id: stop.id, 
          hubId: hubId, 
          name: stop.name,
          currentHub: stop.hubId
        });
      }
    }
  }

  console.log(`\nIdentified ${updates.length} stops to link to hubs.`);

  if (updates.length === 0) {
    console.log('No matches found.');
    return;
  }

  const batch = db.batch();
  for (const update of updates) {
    if (update.currentHub === update.hubId) {
        console.log(`  [SKIP] ${update.name} (${update.id}) already linked to ${update.hubId}`);
        continue;
    }
    
    console.log(`  [LINK] ${update.name} (${update.id}) -> hub: ${update.hubId}`);
    if (!DRY_RUN) {
      const ref = db.collection('stops').doc(update.id);
      batch.update(ref, {
        hubId: update.hubId,
        verified: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }

  if (!DRY_RUN) {
    await batch.commit();
    console.log('\nMigration complete. Firestore updated.');
  } else {
    console.log('\nDry run complete. No changes made.');
  }
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
