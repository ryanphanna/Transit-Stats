/**
 * backfill-network-graph.js
 *
 * One-time script: reads all completed trips from Firestore and populates the
 * networkGraph collection so NetworkEngine has data before the next trip.
 * Only trips where both stops resolve to canonical names are included.
 * Unresolved trips are skipped — run topup-network-graph.js after normalizing new stops.
 *
 * Usage:
 *   node Tools/backfill-network-graph.js
 *
 * Requires the Firebase Admin SDK service account key at:
 *   /Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json
 */

const admin = require('firebase-admin');
const { NetworkEngine } = require('../functions/lib/network');

const KEY_PATH = '/Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json';

admin.initializeApp({
  credential: admin.credential.cert(require(KEY_PATH)),
});

const db = admin.firestore();

// Returns canonical stop name, or null if not found in library
function canonicalize(stopsLib, stopCode, stopName, agency) {
  if (!stopName) return null;
  const lower = stopName.toString().toLowerCase().trim();
  for (const stop of stopsLib) {
    if (stop.agency && agency && stop.agency !== agency) continue;
    if (stop.name?.toLowerCase() === lower) return stop.name;
    if (stop.code && stop.code === stopCode) return stop.name;
    if ((stop.aliases || []).some(a => a.toLowerCase() === lower)) return stop.name;
  }
  return null;
}

async function run() {
  console.log('Loading all completed trips...');
  const snapshot = await db.collection('trips').where('endTime', '!=', null).get();
  const trips = snapshot.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(t =>
      t.userId && t.route && t.agency && t.direction &&
      t.startStopName && t.endStopName &&
      t.duration > 0 && t.duration <= 180 && !t.incomplete
    );
  console.log(`Found ${trips.length} eligible trips.`);

  console.log('Loading stops library...');
  const stopsSnap = await db.collection('stops').get();
  const stopsLib = stopsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`${stopsLib.length} stops loaded.\n`);

  let processed = 0;
  let skipped = 0;

  for (const trip of trips) {
    try {
      const startCanonical = canonicalize(stopsLib, trip.startStopCode, trip.startStopName, trip.agency);
      const endCanonical = canonicalize(stopsLib, trip.endStopCode, trip.endStopName, trip.agency);

      if (!startCanonical || !endCanonical) { skipped++; continue; }

      await NetworkEngine.observe(db, trip.userId, {
        route: trip.route,
        agency: trip.agency,
        direction: trip.direction,
        startStopName: startCanonical,
        endStopName: endCanonical,
        duration: trip.duration,
      });
      processed++;
      if (processed % 50 === 0) console.log(`  ${processed}/${trips.length}...`);
    } catch (err) {
      console.warn(`  Skipped trip ${trip.id}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`\nDone. ${processed} trips processed, ${skipped} skipped (unresolved stops).`);
  process.exit(0);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
