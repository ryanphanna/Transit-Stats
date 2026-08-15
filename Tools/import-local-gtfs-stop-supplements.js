/**
 * Import the verified local-GTFS stop supplements into the normalized stop
 * library. Raw trip documents are never touched.
 *
 * Usage:
 *   node Tools/import-local-gtfs-stop-supplements.js          # dry run
 *   node Tools/import-local-gtfs-stop-supplements.js --apply
 */
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const KEY_PATH = '/Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json';
const APPLY = process.argv.includes('--apply');

initializeApp({ credential: cert(require(KEY_PATH)) });
const db = getFirestore();

async function run() {
  const { LOCAL_GTFS_STOP_SUPPLEMENTS } = await import('../js/local-gtfs-stop-supplements.js');
  const snapshot = await db.collection('stops').get();
  const existing = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  let created = 0;
  let updated = 0;

  if (!APPLY) console.log('DRY RUN — no Firestore writes');

  for (const [agency, stops] of Object.entries(LOCAL_GTFS_STOP_SUPPLEMENTS)) {
    for (const stop of stops) {
      const found = existing.find((candidate) => {
        const agencies = candidate.agencies || [candidate.agency];
        if (!agencies.includes(agency)) return false;
        if (stop.code) return String(candidate.code || '') === String(stop.code);
        return String(candidate.name || '').toLowerCase() === stop.name.toLowerCase();
      });

      const aliases = [...new Set(stop.aliases || [])].filter((alias) => alias !== stop.name);
      const data = {
        name: stop.name,
        code: stop.code || '',
        agency,
        agencies: [agency],
        aliases,
        ...(stop.sourceAgency ? { sourceAgency: stop.sourceAgency } : {}),
        lat: stop.lat,
        lng: stop.lng,
        source: 'gtfs',
        gtfsVerified: true,
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (found) {
        console.log(`UPDATE ${agency} · ${stop.name}${aliases.length ? ` (+${aliases.length} alias)` : ''}`);
        if (APPLY) await db.collection('stops').doc(found.id).set(data, { merge: true });
        updated++;
      } else {
        console.log(`CREATE ${agency} · ${stop.name}${aliases.length ? ` (+${aliases.length} alias)` : ''}`);
        if (APPLY) {
          await db.collection('stops').add({
            ...data,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
        created++;
      }
    }
  }

  console.log(`\n${APPLY ? 'Applied' : 'Proposed'} ${created} creates and ${updated} updates.`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
