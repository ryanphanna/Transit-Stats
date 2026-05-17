/**
 * Diagnostic tool to identify naming drift in the network graph.
 * Scans the networkGraph collection and flags edges where the stop names
 * do not match the canonical names in the stops library.
 */
const admin = require('firebase-admin');
const { NetworkEngine } = require('../functions/lib/network');
const { lookupStop } = require('../functions/lib/db/stops');

// Initialize Firebase (assumes GOOGLE_APPLICATION_CREDENTIALS is set)
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

async function diagnose() {
  console.log('--- Network Naming Drift Diagnosis ---');
  
  const snapshot = await db.collection('networkGraph').get();
  console.log(`Scanning ${snapshot.size} graph documents...\n`);

  let totalEdges = 0;
  let driftedEdges = 0;
  const driftReport = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const { agency, route, edges = {} } = data;

    for (const [key, edge] of Object.entries(edges)) {
      totalEdges++;
      
      const { fromStop, toStop } = edge;
      
      // Attempt to resolve current names to canonical versions
      const fromCanonical = await lookupStop(null, fromStop, agency);
      const toCanonical = await lookupStop(null, toStop, agency);

      let driftFound = false;
      const issues = [];

      if (fromCanonical && fromCanonical.stopName !== fromStop) {
        driftFound = true;
        issues.push(`From: "${fromStop}" -> Canonical: "${fromCanonical.stopName}"`);
      }

      if (toCanonical && toCanonical.stopName !== toStop) {
        driftFound = true;
        issues.push(`To: "${toStop}" -> Canonical: "${toCanonical.stopName}"`);
      }

      if (driftFound) {
        driftedEdges++;
        driftReport.push({
          docId: doc.id,
          agency,
          route,
          edgeKey: key,
          issues
        });
      }
    }
  }

  console.log(`\nScan Complete.`);
  console.log(`Total Edges: ${totalEdges}`);
  console.log(`Drifted Edges: ${driftedEdges} (${totalEdges > 0 ? ((driftedEdges/totalEdges)*100).toFixed(1) : 0}%)\n`);

  if (driftReport.length > 0) {
    console.log('--- Drift Report ---');
    driftReport.forEach(r => {
      console.log(`[${r.agency} ${r.route}] Edge: ${r.edgeKey}`);
      r.issues.forEach(issue => console.log(`  - ${issue}`));
    });
  } else {
    console.log('No naming drift detected in verified edges.');
  }
}

diagnose().catch(err => {
  console.error('Diagnosis failed:', err);
  process.exit(1);
});
