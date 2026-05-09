/**
 * clear-route-review-flags.js
 *
 * Clears needs_review on trips whose route now passes the current isValidRoute()
 * validator. Intended for backfilling false positives after validator changes.
 *
 * Usage:
 *   node Tools/clear-route-review-flags.js <userId> [--agency=TTC] [--apply]
 *
 * Requires the Firebase Admin SDK service account key at:
 *   /Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json
 */

const admin = require('firebase-admin');
const {isValidRoute} = require('../functions/lib/utils');

const KEY_PATH = '/Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json';
const APPLY = process.argv.includes('--apply');

function parseArgs(argv) {
  const args = { userId: null, agency: null };
  for (const arg of argv.slice(2)) {
    if (!arg.startsWith('--') && !args.userId) {
      args.userId = arg;
      continue;
    }
    if (arg.startsWith('--agency=')) args.agency = arg.slice('--agency='.length);
  }
  return args;
}

function tsOf(trip) {
  return trip.startTime?.toDate?.()?.getTime?.() || trip.endTime?.toDate?.()?.getTime?.() || 0;
}

function iso(ts) {
  return ts ? new Date(ts).toISOString() : 'n/a';
}

async function run() {
  const args = parseArgs(process.argv);
  if (!args.userId) {
    console.error('Usage: node Tools/clear-route-review-flags.js <userId> [--agency=TTC] [--apply]');
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.cert(require(KEY_PATH)),
  });
  const db = admin.firestore();

  const snap = await db.collection('trips').where('userId', '==', args.userId).get();
  const rows = snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((t) => t.needs_review && (!args.agency || t.agency === args.agency) && isValidRoute(t.route))
    .sort((a, b) => tsOf(b) - tsOf(a));

  console.log(`Trips eligible to clear needs_review: ${rows.length}`);
  console.log(`Filters: userId=${args.userId}, agency=${args.agency || '*'}, apply=${APPLY}`);

  for (const t of rows.slice(0, 40)) {
    console.log(`  ${t.id} | ${iso(tsOf(t))} | ${t.agency || '?'} ${t.route || '?'} ${t.direction || '?'} | ${t.startStopName || '(no start)'} -> ${t.endStopName || '(no end)'}`);
  }
  if (rows.length > 40) console.log(`  ... and ${rows.length - 40} more`);

  if (!APPLY || !rows.length) return;

  const BATCH_SIZE = 499;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = rows.slice(i, i + BATCH_SIZE);
    for (const trip of chunk) {
      batch.update(db.collection('trips').doc(trip.id), {
        needs_review: admin.firestore.FieldValue.delete(),
      });
    }
    await batch.commit();
    console.log(`Committed batch ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} trips)`);
  }
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
