/**
 * topup-network-graph.js
 *
 * Run after normalizing new stops in the library. Finds all trips that used
 * the raw name variants of the newly-normalized stop and observes them into
 * the network graph using the canonical name.
 *
 * Usage:
 *   node Tools/topup-network-graph.js "York University"
 *   node Tools/topup-network-graph.js "Bay Station" "Spadina Station"
 *
 * Requires the Firebase Admin SDK service account key at:
 *   /Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json
 */

const admin = require('firebase-admin');
const { NetworkEngine } = require('../functions/lib/network');

const KEY_PATH = '/Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json';

const targetStops = process.argv.slice(2);
if (!targetStops.length) {
  console.error('Usage: node Tools/topup-network-graph.js "Stop Name" [...]');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(KEY_PATH)),
});

const db = admin.firestore();

async function run() {
  // Load stops library
  const stopsSnap = await db.collection('stops').get();
  const stopsLib = stopsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // For each target stop, find its canonical name and all raw aliases
  const targets = [];
  for (const name of targetStops) {
    const lower = name.toLowerCase().trim();
    const stop = stopsLib.find(s =>
      s.name?.toLowerCase() === lower ||
      (s.aliases || []).some(a => a.toLowerCase() === lower)
    );
    if (!stop) {
      console.warn(`Warning: "${name}" not found in stops library — skipping`);
      continue;
    }
    const rawNames = [stop.name, ...(stop.aliases || [])];
    targets.push({ canonical: stop.name, agency: stop.agency, rawNames });
    console.log(`"${stop.name}" — ${rawNames.length} name variants to match`);
  }

  if (!targets.length) {
    console.log('No valid stops to process.');
    process.exit(0);
  }

  // Build a set of all raw name variants (lowercase) for fast matching
  const allRawNames = new Set(
    targets.flatMap(t => t.rawNames.map(n => n.toLowerCase().trim()))
  );

  // Load trips — filter to those touching any of the raw names
  console.log('\nLoading trips...');
  const snap = await db.collection('trips')
    .where('endTime', '!=', null)
    .get();

  const trips = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(t =>
      t.userId && t.route && t.agency && t.direction &&
      t.startStopName && t.endStopName &&
      t.duration > 0 && t.duration <= 180 && !t.incomplete &&
      (allRawNames.has(t.startStopName?.toLowerCase().trim()) ||
       allRawNames.has(t.endStopName?.toLowerCase().trim()))
    );

  console.log(`Found ${trips.length} trips touching these stops.\n`);

  function canonicalize(rawName, agency) {
    const lower = rawName?.toLowerCase().trim();
    for (const stop of stopsLib) {
      if (stop.agency && agency && stop.agency !== agency) continue;
      if (stop.name?.toLowerCase() === lower) return stop.name;
      if ((stop.aliases || []).some(a => a.toLowerCase() === lower)) return stop.name;
    }
    return null;
  }

  let processed = 0;
  let skipped = 0;

  for (const trip of trips) {
    const startCanonical = canonicalize(trip.startStopName, trip.agency);
    const endCanonical = canonicalize(trip.endStopName, trip.agency);

    // Both stops must resolve — don't write partial edges
    if (!startCanonical || !endCanonical) { skipped++; continue; }

    try {
      await NetworkEngine.observe(db, trip.userId, {
        route: trip.route,
        agency: trip.agency,
        direction: trip.direction,
        startStopName: startCanonical,
        endStopName: endCanonical,
        duration: trip.duration,
      });
      processed++;
    } catch (err) {
      console.warn(`  Skipped trip ${trip.id}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`Done. ${processed} trips processed, ${skipped} skipped.`);
  process.exit(0);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
