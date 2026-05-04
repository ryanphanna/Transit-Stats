/**
 * retro-verify.js
 *
 * Retroactive verification pass: scans all completed, unverified trips and
 * flips `verified: true` when both the start and end stop names now resolve
 * against the stops library. Safe to re-run — only touches unverified trips.
 *
 * Usage:
 *   node Tools/retro-verify.js [--dry-run]
 *
 * Requires the Firebase Admin SDK service account key at:
 *   /Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json
 */

const admin = require('firebase-admin');

const KEY_PATH = '/Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json';
const DRY_RUN = process.argv.includes('--dry-run');

admin.initializeApp({
  credential: admin.credential.cert(require(KEY_PATH)),
});

const db = admin.firestore();

/**
 * Check whether a stop name or code resolves against the library for the
 * given agency. Checks the `agencies` array (new schema) and falls back to
 * the legacy `agency` field so old stop documents still match.
 */
function resolves(stopsLib, stopCode, stopName, agency) {
  if (!stopCode && !stopName) return false;
  const lowerName = stopName?.toString().toLowerCase().trim();
  const codeStr = stopCode?.toString().trim();

  for (const stop of stopsLib) {
    // Agency membership: check agencies array first, then legacy agency field
    const inAgency =
      (Array.isArray(stop.agencies) && stop.agencies.includes(agency)) ||
      stop.agency === agency;
    if (!inAgency) continue;

    if (codeStr && stop.code === codeStr) return true;
    if (lowerName) {
      if (stop.name?.toLowerCase().trim() === lowerName) return true;
      if (stop.aliases?.some(a => a.toLowerCase().trim() === lowerName)) return true;
    }
  }
  return false;
}

async function run() {
  if (DRY_RUN) console.log('[DRY RUN] No writes will be made.\n');

  const [stopsSnap, tripsSnap] = await Promise.all([
    db.collection('stops').get(),
    db.collection('trips').where('endTime', '!=', null).get(),
  ]);

  const stopsLib = stopsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const unverifiedDocs = tripsSnap.docs.filter(d => d.data().verified === false);
  console.log(`Stops in library: ${stopsLib.length}`);
  console.log(`Unverified completed trips: ${unverifiedDocs.length}\n`);

  const toVerify = [];
  const skipped = [];

  for (const doc of unverifiedDocs) {
    const t = doc.data();
    if (t.incomplete) continue;
    if (!t.agency) continue;

    const startOk = resolves(stopsLib, t.startStopCode, t.startStopName, t.agency);
    // End stop is optional on some trips — if absent, only require start
    const endOk = !t.endStopName
      ? true
      : resolves(stopsLib, t.endStopCode, t.endStopName, t.agency);

    if (startOk && endOk) {
      toVerify.push({ id: doc.id, agency: t.agency, route: t.route, start: t.startStopName, end: t.endStopName });
    } else {
      skipped.push({
        id: doc.id,
        agency: t.agency,
        route: t.route,
        start: t.startStopName,
        end: t.endStopName,
        startOk,
        endOk,
      });
    }
  }

  console.log(`Will verify: ${toVerify.length}`);
  console.log(`Still unresolved: ${skipped.length}\n`);

  if (!DRY_RUN && toVerify.length > 0) {
    // Firestore batches are capped at 500 ops
    const BATCH_SIZE = 499;
    for (let i = 0; i < toVerify.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = toVerify.slice(i, i + BATCH_SIZE);
      for (const { id } of chunk) {
        batch.update(db.collection('trips').doc(id), { verified: true });
      }
      await batch.commit();
      console.log(`  Committed batch ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} trips)`);
    }
    console.log(`\nDone — ${toVerify.length} trips verified.`);
  } else if (DRY_RUN) {
    console.log('Sample of trips that would be verified:');
    for (const t of toVerify.slice(0, 15)) {
      console.log(`  [${t.agency}] ${t.route} — "${t.start}" → "${t.end || '(no end stop)'}"`);
    }
    if (toVerify.length > 15) console.log(`  ... and ${toVerify.length - 15} more`);
  }

  if (skipped.length > 0) {
    console.log('\nRemaining unresolved (still unverified):');
    // Group by agency
    const byAgency = {};
    for (const t of skipped) {
      const a = t.agency || '?';
      if (!byAgency[a]) byAgency[a] = [];
      byAgency[a].push(t);
    }
    for (const [agency, trips] of Object.entries(byAgency).sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  ${agency}: ${trips.length} trips`);
      const uniqStops = new Set();
      for (const t of trips) {
        if (!t.startOk && t.start) uniqStops.add(`"${t.start}" (start)`);
        if (!t.endOk && t.end) uniqStops.add(`"${t.end}" (end)`);
      }
      for (const s of [...uniqStops].slice(0, 5)) console.log(`    ${s}`);
      if (uniqStops.size > 5) console.log(`    ... and ${uniqStops.size - 5} more unique stop names`);
    }
  }

  process.exit(0);
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
