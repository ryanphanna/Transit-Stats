/**
 * list-needs-review.js
 *
 * Lists recent trips marked needs_review for one user.
 *
 * Usage:
 *   node Tools/list-needs-review.js <userId> [--agency=TTC] [--limit=20]
 *
 * Requires the Firebase Admin SDK service account key at:
 *   /Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json
 */

const admin = require('firebase-admin');

const KEY_PATH = '/Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json';

function parseArgs(argv) {
  const args = { userId: null, agency: null, limit: 20 };
  for (const arg of argv.slice(2)) {
    if (!arg.startsWith('--') && !args.userId) {
      args.userId = arg;
      continue;
    }
    if (arg.startsWith('--agency=')) args.agency = arg.slice('--agency='.length);
    if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length)) || 20;
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
    console.error('Usage: node Tools/list-needs-review.js <userId> [--agency=TTC] [--limit=20]');
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.cert(require(KEY_PATH)),
  });
  const db = admin.firestore();

  const snap = await db.collection('trips').where('userId', '==', args.userId).get();
  const rows = snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((t) => t.needs_review && (!args.agency || t.agency === args.agency))
    .sort((a, b) => tsOf(b) - tsOf(a));

  console.log(`needs_review trips: ${rows.length}`);
  console.log(`Filters: userId=${args.userId}, agency=${args.agency || '*'}, limit=${args.limit}`);

  for (const t of rows.slice(0, args.limit)) {
    console.log(`\n${t.id}`);
    console.log(`  ${iso(tsOf(t))}`);
    console.log(`  ${t.agency || '?'} ${t.route || '?'} ${t.direction || '?'}`);
    console.log(`  ${t.startStopName || '(no start)'} -> ${t.endStopName || '(no end)'}`);
    console.log(`  manually_verified=${!!t.manually_verified} stop_matched=${t.stop_matched != null ? !!t.stop_matched : !!t.verified} discarded=${!!t.discarded} incomplete=${!!t.incomplete}`);
  }
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
