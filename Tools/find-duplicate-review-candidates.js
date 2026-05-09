/**
 * find-duplicate-review-candidates.js
 *
 * Finds completed trips that are not manually verified yet, but share the same
 * agency/route/direction/start/end signature as one or more manually verified
 * trips for the same user.
 *
 * Usage:
 *   node Tools/find-duplicate-review-candidates.js <userId> [--agency=TTC] [--limit=25]
 *
 * Requires the Firebase Admin SDK service account key at:
 *   /Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json
 */

const admin = require('firebase-admin');

const KEY_PATH = '/Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json';

function parseArgs(argv) {
  const args = { userId: null, agency: null, limit: 25 };
  for (const arg of argv.slice(2)) {
    if (!arg.startsWith('--') && !args.userId) {
      args.userId = arg;
      continue;
    }
    if (arg.startsWith('--agency=')) args.agency = arg.slice('--agency='.length);
    if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length)) || 25;
  }
  return args;
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function tripTs(trip) {
  return trip.startTime?.toDate?.()?.getTime?.() || trip.endTime?.toDate?.()?.getTime?.() || 0;
}

function isoLocal(trip) {
  const ts = tripTs(trip);
  if (!ts) return 'n/a';
  return new Date(ts).toISOString();
}

function signature(t) {
  return [
    normalizeText(t.agency),
    normalizeText(t.route),
    normalizeText(t.direction),
    normalizeText(t.startStopName),
    normalizeText(t.endStopName),
  ].join(' | ');
}

function isCandidate(t) {
  if (t.discarded || t.incomplete) return false;
  if (!t.endTime) return false;
  if (!t.route || !t.startStopName || !t.endStopName) return false;
  return true;
}

async function run() {
  const args = parseArgs(process.argv);
  if (!args.userId) {
    console.error('Usage: node Tools/find-duplicate-review-candidates.js <userId> [--agency=TTC] [--limit=25]');
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.cert(require(KEY_PATH)),
  });
  const db = admin.firestore();

  const snap = await db.collection('trips').where('userId', '==', args.userId).get();

  const trips = snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((t) => (!args.agency || t.agency === args.agency) && isCandidate(t));

  const verifiedBySig = new Map();
  const unverifiedBySig = new Map();

  for (const t of trips) {
    const sig = signature(t);
    if (t.manually_verified) {
      if (!verifiedBySig.has(sig)) verifiedBySig.set(sig, []);
      verifiedBySig.get(sig).push(t);
    } else {
      if (!unverifiedBySig.has(sig)) unverifiedBySig.set(sig, []);
      unverifiedBySig.get(sig).push(t);
    }
  }

  const groups = [];
  for (const [sig, unverifiedTrips] of unverifiedBySig.entries()) {
    const verifiedTrips = verifiedBySig.get(sig);
    if (!verifiedTrips?.length) continue;
    verifiedTrips.sort((a, b) => tripTs(b) - tripTs(a));
    unverifiedTrips.sort((a, b) => tripTs(b) - tripTs(a));
    groups.push({
      sig,
      sample: unverifiedTrips[0],
      verifiedTrips,
      unverifiedTrips,
      latestTs: Math.max(tripTs(unverifiedTrips[0]), tripTs(verifiedTrips[0])),
    });
  }

  groups.sort((a, b) => {
    if (b.unverifiedTrips.length !== a.unverifiedTrips.length) {
      return b.unverifiedTrips.length - a.unverifiedTrips.length;
    }
    return b.latestTs - a.latestTs;
  });

  console.log(`Duplicate review candidate groups: ${groups.length}`);
  console.log(`Filters: userId=${args.userId}, agency=${args.agency || '*'}, limit=${args.limit}`);

  if (!groups.length) {
    console.log('\nNo unverified duplicates of manually verified trips found.');
    return;
  }

  for (const group of groups.slice(0, args.limit)) {
    const t = group.sample;
    console.log(`\n[${group.unverifiedTrips.length} unverified, ${group.verifiedTrips.length} verified] ${t.agency} ${t.route} ${t.direction}`);
    console.log(`  ${t.startStopName} -> ${t.endStopName}`);
    console.log(`  Latest verified: ${group.verifiedTrips[0].id} @ ${isoLocal(group.verifiedTrips[0])}`);
    for (const candidate of group.unverifiedTrips.slice(0, 8)) {
      const flags = [];
      if (candidate.needs_review) flags.push('needs_review');
      if (candidate.stop_matched === false || candidate.verified === false) flags.push('unmatched');
      console.log(`  Candidate: ${candidate.id} @ ${isoLocal(candidate)}${flags.length ? ` [${flags.join(', ')}]` : ''}`);
    }
    if (group.unverifiedTrips.length > 8) {
      console.log(`  ... and ${group.unverifiedTrips.length - 8} more`);
    }
  }
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
