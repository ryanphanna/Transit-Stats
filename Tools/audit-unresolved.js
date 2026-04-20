/**
 * audit-unresolved.js
 *
 * Lists all unresolved stop names from completed trips — names that don't
 * match any stop in the library. Groups by normalized form to show variants.
 *
 * Usage:
 *   node Tools/audit-unresolved.js
 *
 * Requires the Firebase Admin SDK service account key at:
 *   /Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json
 */

const admin = require('firebase-admin');

const KEY_PATH = '/Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json';

admin.initializeApp({
  credential: admin.credential.cert(require(KEY_PATH)),
});

const db = admin.firestore();

function canonicalize(stopsLib, stopName, agency) {
  if (!stopName) return null;
  const lower = stopName.toString().toLowerCase().trim();
  for (const stop of stopsLib) {
    if (agency && stop.agency && stop.agency !== agency) continue;
    if (stop.name?.toLowerCase() === lower) return stop.name;
    if ((stop.aliases || []).some(a => a.toLowerCase() === lower)) return stop.name;
  }
  return null;
}

async function run() {
  const [stopsSnap, tripsSnap] = await Promise.all([
    db.collection('stops').get(),
    db.collection('trips').where('endTime', '!=', null).get(),
  ]);

  const stopsLib = stopsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Collect all raw stop name occurrences that don't resolve
  // Map: normalizedKey -> { rawName, agency, count, routes Set }
  const unresolved = new Map();

  for (const doc of tripsSnap.docs) {
    const t = doc.data();
    if (t.incomplete) continue;

    for (const [field, stop] of [['startStopName', t.startStopName], ['endStopName', t.endStopName]]) {
      if (!stop) continue;
      const resolved = canonicalize(stopsLib, stop, t.agency);
      if (!resolved) {
        const key = stop.toLowerCase().trim();
        if (!unresolved.has(key)) {
          unresolved.set(key, { rawName: stop, agency: t.agency || '?', count: 0, trips: [] });
        }
        const entry = unresolved.get(key);
        entry.count++;
        entry.trips.push({ route: t.route || '?', direction: t.direction || '?', role: field === 'startStopName' ? 'board' : 'exit' });
      }
    }
  }

  if (!unresolved.size) {
    console.log('All stops resolved — nothing to normalize.');
    return;
  }

  // Group variants by similarity: strip punctuation/spaces, lowercase
  function normalize(name) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  const groups = new Map();
  for (const [, entry] of unresolved) {
    const key = normalize(entry.rawName);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }

  // Sort groups by total trip count desc
  const sorted = Array.from(groups.values())
    .map(entries => ({
      entries,
      total: entries.reduce((s, e) => s + e.count, 0),
    }))
    .sort((a, b) => b.total - a.total);

  console.log(`\n${unresolved.size} unresolved stop names across ${sorted.length} groups:\n`);

  for (const { entries, total } of sorted) {
    const allTrips = entries.flatMap(e => e.trips);
    const tripSummary = allTrips.map(t => `${t.route} ${t.direction} (${t.role})`).join(', ');
    if (entries.length === 1) {
      console.log(`  [${total}×] "${entries[0].rawName}" (${entries[0].agency})`);
    } else {
      console.log(`  [${total}×] ${entries.length} variants (${entries[0].agency})`);
      for (const e of entries) {
        console.log(`         "${e.rawName}" (${e.count}×)`);
      }
    }
    console.log(`         ${tripSummary}`);
    console.log();
  }

  console.log(`Total unresolved occurrences: ${[...unresolved.values()].reduce((s, e) => s + e.count, 0)}`);
  process.exit(0);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
