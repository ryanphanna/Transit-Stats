/**
 * inspect-trip-context.js
 *
 * Shows one trip plus nearby trips for the same user, ordered by start time.
 *
 * Usage:
 *   node Tools/inspect-trip-context.js <tripId> [--window=3]
 *
 * Requires the Firebase Admin SDK service account key at:
 *   /Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json
 */

const admin = require('firebase-admin');

const KEY_PATH = '/Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json';

function parseArgs(argv) {
  const args = { tripId: null, window: 3 };
  for (const arg of argv.slice(2)) {
    if (!arg.startsWith('--') && !args.tripId) {
      args.tripId = arg;
      continue;
    }
    if (arg.startsWith('--window=')) args.window = Number(arg.slice('--window='.length)) || 3;
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
  if (!args.tripId) {
    console.error('Usage: node Tools/inspect-trip-context.js <tripId> [--window=3]');
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.cert(require(KEY_PATH)),
  });
  const db = admin.firestore();

  const doc = await db.collection('trips').doc(args.tripId).get();
  if (!doc.exists) {
    console.error(`Trip not found: ${args.tripId}`);
    process.exit(1);
  }

  const trip = { id: doc.id, ...doc.data() };
  const userId = trip.userId;
  const snap = await db.collection('trips').where('userId', '==', userId).get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => tsOf(a) - tsOf(b));
  const idx = rows.findIndex((t) => t.id === args.tripId);
  const start = Math.max(0, idx - args.window);
  const end = Math.min(rows.length, idx + args.window + 1);

  for (const t of rows.slice(start, end)) {
    const marker = t.id === args.tripId ? '>>' : '  ';
    console.log(`${marker} ${t.id}`);
    console.log(`   ${iso(tsOf(t))}`);
    console.log(`   ${t.agency || '?'} ${t.route || '?'} ${t.direction || '?'}`);
    console.log(`   ${t.startStopName || '(no start)'} -> ${t.endStopName || '(no end)'}`);
    console.log(`   manually_verified=${!!t.manually_verified} needs_review=${!!t.needs_review} discarded=${!!t.discarded}`);
  }
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
