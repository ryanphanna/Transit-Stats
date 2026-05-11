/**
 * inspect-network-graph.js
 *
 * Dumps the NetworkEngine graph for a given agency + route.
 * Shows all edges, trip counts, and median durations.
 *
 * Usage:
 *   node Tools/inspect-network-graph.js TTC 510
 *   node Tools/inspect-network-graph.js TTC 1
 */

const admin = require('firebase-admin');
const { NetworkEngine } = require('../functions/lib/network');

const KEY_PATH = '/Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json';
admin.initializeApp({ credential: admin.credential.cert(require(KEY_PATH)) });
const db = admin.firestore();

async function run() {
  const agency = process.argv[2] || 'TTC';
  const route  = process.argv[3] || '510';

  const graph = await NetworkEngine.loadGlobal(db, agency, route);
  if (!graph) {
    console.log(`No global graph found for ${agency} ${route}`);
    process.exit(0);
  }

  const edges = Object.values(graph.edges || {});
  if (!edges.length) {
    console.log(`Graph exists but has no edges for ${agency} ${route}`);
    process.exit(0);
  }

  // Group by direction
  const byDir = {};
  for (const e of edges) {
    const d = e.direction || 'unknown';
    if (!byDir[d]) byDir[d] = [];
    byDir[d].push(e);
  }

  console.log(`\n=== NetworkEngine: ${agency} route ${route} (global graph) ===`);
  console.log(`Total edges: ${edges.length}\n`);

  for (const [dir, dirEdges] of Object.entries(byDir)) {
    dirEdges.sort((a, b) => b.tripCount - a.tripCount);
    console.log(`--- ${dir.toUpperCase()} (${dirEdges.length} edges) ---`);
    for (const e of dirEdges) {
      const trusted = e.tripCount >= NetworkEngine.MIN_TRIPS ? '✓' : '✗';
      const duration = e.medianMinutes ? `${e.medianMinutes}min` : '—';
      console.log(`  ${trusted} [${e.tripCount}x, ${duration}]  ${e.fromStop} → ${e.toStop}`);
    }
    console.log();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
