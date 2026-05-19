/**
 * audit-transfer-pair-candidates.js
 *
 * Reads a user's completed trips, extracts real linked transfers, and surfaces
 * repeated short-gap stop-pair candidates that are not already encoded in the
 * canonical transfer connection map.
 *
 * Usage:
 *   node Tools/audit-transfer-pair-candidates.js <userId> [--agency=TTC] [--since=2026-05-01] [--limit=25]
 *
 * Requires the Firebase Admin SDK service account key at:
 *   /Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json
 */

const admin = require('firebase-admin');
const { TransferEngine } = require('../functions/lib/transfer');

const KEY_PATH = '/Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json';

function parseArgs(argv) {
  const args = { userId: null, agency: null, since: null, limit: 25, minCount: 3, maxMedianGap: 12 };
  for (const arg of argv.slice(2)) {
    if (!arg.startsWith('--') && !args.userId) {
      args.userId = arg;
      continue;
    }
    if (arg.startsWith('--agency=')) args.agency = arg.slice('--agency='.length);
    if (arg.startsWith('--since=')) args.since = arg.slice('--since='.length);
    if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length)) || 25;
    if (arg.startsWith('--min-count=')) args.minCount = Number(arg.slice('--min-count='.length)) || 3;
    if (arg.startsWith('--max-median-gap=')) args.maxMedianGap = Number(arg.slice('--max-median-gap='.length)) || 12;
  }
  return args;
}

function tripTs(trip) {
  return trip.startTime?.toDate?.()?.getTime?.() || trip.endTime?.toDate?.()?.getTime?.() || 0;
}

function iso(ts) {
  return ts ? new Date(ts).toISOString() : 'n/a';
}

function isCandidateTrip(trip) {
  if (!trip?.journeyId) return false;
  if (trip.discarded || trip.incomplete) return false;
  if (!trip.startTime || !trip.endTime) return false;
  if (!trip.startStopName || !trip.endStopName) return false;
  return true;
}

async function run() {
  const args = parseArgs(process.argv);
  if (!args.userId) {
    console.error('Usage: node Tools/audit-transfer-pair-candidates.js <userId> [--agency=TTC] [--since=2026-05-01] [--limit=25]');
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.cert(require(KEY_PATH)),
  });
  const db = admin.firestore();

  const sinceMs = args.since ? new Date(args.since).getTime() : null;
  const snap = await db.collection('trips').where('userId', '==', args.userId).get();

  const trips = snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((trip) => (!args.agency || trip.agency === args.agency) && isCandidateTrip(trip))
    .filter((trip) => !sinceMs || tripTs(trip) >= sinceMs);

  const suggestions = TransferEngine.suggestConnectedPairs(trips, {
    minCount: args.minCount,
    maxMedianGap: args.maxMedianGap,
  });

  console.log(`Trips considered: ${trips.length}`);
  console.log(
    `Filters: userId=${args.userId}, agency=${args.agency || '*'}, since=${args.since || '*'}, ` +
    `limit=${args.limit}, minCount=${args.minCount}, maxMedianGap=${args.maxMedianGap}`
  );

  if (!suggestions.length) {
    console.log('\nNo candidate connected stop pairs found.');
    return;
  }

  console.log(`\nCandidate connected stop pairs: ${suggestions.length}`);
  for (const row of suggestions.slice(0, args.limit)) {
    console.log(`\n[${row.count}x, median ${row.medianGap} min, range ${row.minGap}-${row.maxGap} min]`);
    console.log(`  ${row.stopA}`);
    console.log(`  ${row.stopB}`);
    for (const pair of row.topRoutePairs.slice(0, 5)) {
      console.log(`  ${pair.count}x  ${pair.routePair}`);
    }
  }

  const transfers = TransferEngine.extractTransfers(trips);
  if (transfers.length) {
    const earliest = Math.min(...trips.map(tripTs).filter(Boolean));
    const latest = Math.max(...trips.map(tripTs).filter(Boolean));
    console.log(`\nTransfer rows analyzed: ${transfers.length}`);
    console.log(`Time span: ${iso(earliest)} -> ${iso(latest)}`);
  }
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
