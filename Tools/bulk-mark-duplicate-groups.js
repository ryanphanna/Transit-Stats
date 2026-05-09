/**
 * bulk-mark-duplicate-groups.js
 *
 * Marks matching trip signatures as manually verified for one user.
 * Intended for cases where a route/direction/start/end pattern already has
 * manually verified twins and a human has approved the duplicate group.
 *
 * Usage:
 *   node Tools/bulk-mark-duplicate-groups.js <userId> [--agency=TTC] [--apply]
 *
 * Edit the GROUPS constant below before running.
 *
 * Requires the Firebase Admin SDK service account key at:
 *   /Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json
 */

const admin = require('firebase-admin');

const KEY_PATH = '/Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json';
const APPLY = process.argv.includes('--apply');

const GROUPS = [
  {
    agency: 'TTC',
    route: '510B',
    direction: 'Southbound',
    startStopName: 'Spadina Station',
    endStopName: 'Spadina Ave at Nassau St South Side',
  },
  {
    agency: 'TTC',
    route: '510a',
    direction: 'Southbound',
    startStopName: 'Spadina Station',
    endStopName: 'Spadina Ave at Nassau St South Side',
  },
  {
    agency: 'TTC',
    route: '510',
    direction: 'Northbound',
    startStopName: 'Spadina Ave at Nassau St',
    endStopName: 'Spadina Station',
  },
  {
    agency: 'TTC',
    route: '510',
    direction: 'Southbound',
    startStopName: 'Spadina Station',
    endStopName: 'Spadina Ave at Nassau St South Side',
  },
  {
    agency: 'TTC',
    route: '510',
    direction: 'Northbound',
    startStopName: 'Union Station',
    endStopName: 'Spadina Ave at Nassau St',
  },
  {
    agency: 'TTC',
    route: '1',
    direction: 'Northbound',
    startStopName: "Queen's Park Station",
    endStopName: 'York University',
  },
  {
    agency: 'TTC',
    route: '1',
    direction: 'Southbound',
    startStopName: 'York University',
    endStopName: 'Spadina Station',
  },
  {
    agency: 'TTC',
    route: '2',
    direction: 'Westbound',
    startStopName: 'Bay Station',
    endStopName: 'Spadina Station',
  },
  {
    agency: 'TTC',
    route: '1',
    direction: 'Southbound',
    startStopName: 'Lawrence West Station',
    endStopName: 'Spadina Station',
  },
  {
    agency: 'TTC',
    route: '1',
    direction: 'Northbound',
    startStopName: "Queen's Park Station",
    endStopName: 'St George',
  },
  {
    agency: 'TTC',
    route: '2',
    direction: 'Eastbound',
    startStopName: 'St George Station',
    endStopName: 'Donlands',
  },
  {
    agency: 'TTC',
    route: '510',
    direction: 'Northbound',
    startStopName: 'Spadina/richmond',
    endStopName: 'Spadina Ave at Nassau St',
  },
];

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

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function sameSignature(trip, group) {
  return (
    normalizeText(trip.agency) === normalizeText(group.agency) &&
    normalizeText(trip.route) === normalizeText(group.route) &&
    normalizeText(trip.direction) === normalizeText(group.direction) &&
    normalizeText(trip.startStopName) === normalizeText(group.startStopName) &&
    normalizeText(trip.endStopName) === normalizeText(group.endStopName)
  );
}

async function run() {
  const args = parseArgs(process.argv);
  if (!args.userId) {
    console.error('Usage: node Tools/bulk-mark-duplicate-groups.js <userId> [--agency=TTC] [--apply]');
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.cert(require(KEY_PATH)),
  });
  const db = admin.firestore();

  const groups = GROUPS.filter((g) => !args.agency || g.agency === args.agency);
  const snap = await db.collection('trips').where('userId', '==', args.userId).get();

  const trips = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const toMark = [];

  for (const trip of trips) {
    if (trip.manually_verified || trip.discarded || !trip.endTime) continue;
    if (trip.incomplete || trip.needs_review) continue;
    if (groups.some((g) => sameSignature(trip, g))) {
      toMark.push(trip);
    }
  }

  console.log(`Matching unverified trips: ${toMark.length}`);
  for (const trip of toMark.slice(0, 40)) {
    console.log(`  ${trip.id} | ${trip.agency} ${trip.route} ${trip.direction} | ${trip.startStopName} -> ${trip.endStopName}`);
  }
  if (toMark.length > 40) {
    console.log(`  ... and ${toMark.length - 40} more`);
  }

  if (!APPLY || !toMark.length) return;

  const BATCH_SIZE = 499;
  for (let i = 0; i < toMark.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = toMark.slice(i, i + BATCH_SIZE);
    for (const trip of chunk) {
      batch.update(db.collection('trips').doc(trip.id), {
        manually_verified: true,
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
