/**
 * audit-prediction-shadow.js
 *
 * Summarizes prediction shadow accuracy from Firestore `predictionStats`.
 *
 * Usage:
 *   node Tools/audit-prediction-shadow.js <userId> [--agency=TTC] [--source=sms] [--since=2026-05-01]
 *
 * Notes:
 * - Reads the full predictionStats collection and filters in memory to avoid
 *   depending on ad hoc composite indexes during analysis.
 * - Reports both broad hit rates and "paired" hit rates where V3, V4, and V5
 *   all logged an end-stop prediction for the same trip outcome window.
 *
 * Requires the Firebase Admin SDK service account key at:
 *   /Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json
 */

const admin = require('firebase-admin');

const KEY_PATH = '/Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json';

function parseArgs(argv) {
  const args = {userId: null, agency: null, source: 'sms', since: null};
  for (const arg of argv.slice(2)) {
    if (!arg.startsWith('--') && !args.userId) {
      args.userId = arg;
      continue;
    }
    if (arg.startsWith('--agency=')) args.agency = arg.slice('--agency='.length);
    if (arg.startsWith('--source=')) args.source = arg.slice('--source='.length);
    if (arg.startsWith('--since=')) args.since = arg.slice('--since='.length);
  }
  return args;
}

function familyFromVersion(version) {
  const v = String(version || '');
  if (v.startsWith('3') || v === 'v3-endstop') return 'V3';
  if (v.startsWith('4') || v === 'v4-endstop') return 'V4';
  if (v.startsWith('5') || v === 'v5-endstop') return 'V5';
  return null;
}

function emptyBucket() {
  return {hits: 0, total: 0};
}

function pct(bucket) {
  return bucket.total ? `${((bucket.hits / bucket.total) * 100).toFixed(1)}%` : 'n/a';
}

function summarize(rows) {
  const out = {V3: emptyBucket(), V4: emptyBucket(), V5: emptyBucket()};
  for (const row of rows) {
    out[row.family].total++;
    if (row.hit) out[row.family].hits++;
  }
  return out;
}

function groupPaired(rows) {
  const groups = [];
  let current = [];
  for (const row of rows) {
    if (!current.length || Math.abs(row.ts - current[current.length - 1].ts) <= 5000) {
      current.push(row);
    } else {
      groups.push(current);
      current = [row];
    }
  }
  if (current.length) groups.push(current);

  const paired = [];
  for (const group of groups) {
    const byFamily = {};
    for (const row of group) {
      if (!byFamily[row.family]) byFamily[row.family] = row;
    }
    if (byFamily.V3 && byFamily.V4 && byFamily.V5) paired.push(byFamily);
  }
  return paired;
}

function printSummary(title, summary) {
  console.log(`\n${title}`);
  for (const family of ['V3', 'V4', 'V5']) {
    const bucket = summary[family];
    console.log(`  ${family}: ${bucket.hits}/${bucket.total} (${pct(bucket)})`);
  }
}

async function run() {
  const args = parseArgs(process.argv);
  if (!args.userId) {
    console.error('Usage: node Tools/audit-prediction-shadow.js <userId> [--agency=TTC] [--source=sms] [--since=2026-05-01]');
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.cert(require(KEY_PATH)),
  });
  const db = admin.firestore();

  const sinceMs = args.since ? new Date(args.since).getTime() : null;
  const snap = await db.collection('predictionStats').get();

  const rows = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.userId !== args.userId) continue;
    if (args.source && d.source !== args.source) continue;
    if (args.agency && d.agency !== args.agency) continue;
    if (typeof d.endStopHit !== 'boolean') continue;
    const family = familyFromVersion(d.version);
    if (!family) continue;
    const ts = d.timestamp?.toDate?.()?.getTime?.() || 0;
    if (sinceMs && ts < sinceMs) continue;
    rows.push({
      family,
      version: String(d.version || ''),
      route: d.route || null,
      predicted: d.endStopPredicted || null,
      actual: d.endStopActual || null,
      confidence: d.endStopConfidence ?? null,
      hit: !!d.endStopHit,
      ts,
    });
  }

  rows.sort((a, b) => b.ts - a.ts);

  console.log(`Rows considered: ${rows.length}`);
  console.log(`Filters: userId=${args.userId}, agency=${args.agency || '*'}, source=${args.source || '*'}, since=${args.since || '*'}`);

  printSummary('Overall end-stop hit rate', summarize(rows));
  printSummary('Recent 30 end-stop hit rate', summarize(rows.slice(0, 30)));

  const paired = groupPaired([...rows].sort((a, b) => a.ts - b.ts));
  const pairedRows = paired.flatMap((group) => Object.values(group));
  console.log(`\nPaired trip windows (V3+V4+V5 all present): ${paired.length}`);
  printSummary('Paired end-stop hit rate', summarize(pairedRows));

  const missCounts = new Map();
  for (const row of rows.filter((r) => !r.hit)) {
    const key = `${row.route} | ${row.predicted} -> ${row.actual}`;
    missCounts.set(key, (missCounts.get(key) || 0) + 1);
  }
  const topMisses = [...missCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  console.log('\nTop miss pairs:');
  if (!topMisses.length) {
    console.log('  none');
  } else {
    for (const [key, count] of topMisses) {
      console.log(`  ${count}x  ${key}`);
    }
  }

  console.log('\nRecent rows:');
  for (const row of rows.slice(0, 12)) {
    const iso = row.ts ? new Date(row.ts).toISOString() : 'n/a';
    console.log(`  ${iso} | ${row.family} ${row.version} | ${row.route} | ${row.predicted} -> ${row.actual} | ${row.hit ? 'HIT' : 'MISS'} | ${row.confidence ?? '?'}%`);
  }
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
