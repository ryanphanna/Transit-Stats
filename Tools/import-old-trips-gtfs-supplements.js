/**
 * Import exact local-GTFS matches from the Old Trips audit into the normalized
 * stop library. Raw trip documents are never touched.
 *
 * Usage:
 *   node Tools/import-old-trips-gtfs-supplements.js
 *   node Tools/import-old-trips-gtfs-supplements.js --apply
 */
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const KEY_PATH = '/Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json';
const APPLY = process.argv.includes('--apply');

initializeApp({ credential: cert(require(KEY_PATH)) });
const db = getFirestore();

async function run() {
    const { OLD_TRIPS_GTFS_STOP_SUPPLEMENTS } = await import('../js/old-trips-gtfs-supplements.js');
    const snapshot = await db.collection('stops').get();
    const existing = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const writes = [];

    for (const [agency, stops] of Object.entries(OLD_TRIPS_GTFS_STOP_SUPPLEMENTS)) {
        for (const stop of stops) {
            const found = existing.find(candidate => {
                const agencies = candidate.agencies || (candidate.agency ? [candidate.agency] : []);
                if (!agencies.includes(agency)) return false;
                if (stop.code && candidate.code) return String(candidate.code) === String(stop.code);
                return String(candidate.name || '').toLowerCase() === stop.name.toLowerCase();
            });
            const aliases = [...new Set(stop.aliases || [])].filter(alias => alias !== stop.name);
            const data = {
                name: stop.name,
                code: stop.code || '',
                agency,
                agencies: [agency],
                aliases,
                lat: stop.lat,
                lng: stop.lng,
                source: 'gtfs',
                gtfsVerified: true,
                updatedAt: FieldValue.serverTimestamp(),
            };
            writes.push({ agency, stop, found, data });
        }
    }

    const creates = writes.filter(write => !write.found);
    const updates = writes.filter(write => write.found);
    console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} ${creates.length} creates and ${updates.length} updates.`);
    for (const write of writes) {
        console.log(`${write.found ? 'UPDATE' : 'CREATE'} ${write.agency} · ${write.stop.name}`);
    }
    if (!APPLY) return;

    for (let i = 0; i < writes.length; i += 400) {
        const batch = db.batch();
        for (const write of writes.slice(i, i + 400)) {
            const ref = write.found ? db.collection('stops').doc(write.found.id) : db.collection('stops').doc();
            batch.set(ref, {
                ...write.data,
                ...(write.found ? {} : { createdAt: FieldValue.serverTimestamp() }),
            }, { merge: true });
        }
        await batch.commit();
        console.log(`Committed ${Math.min(i + 400, writes.length)} / ${writes.length}`);
    }
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
