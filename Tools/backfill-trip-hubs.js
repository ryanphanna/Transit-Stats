/**
 * backfill-trip-hubs.js
 *
 * Scans all trips and assigns startHubId / endHubId based on the current stops library.
 *
 * Usage:
 *   node Tools/backfill-trip-hubs.js [--dry-run]
 */

const admin = require('firebase-admin');
const { normalizeStopName } = require('../functions/lib/transfer-connections');

const KEY_PATH = '/Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json';
const DRY_RUN = process.argv.includes('--dry-run');

admin.initializeApp({ credential: admin.credential.cert(require(KEY_PATH)) });
const db = admin.firestore();

async function backfill() {
  console.log('--- Trip Hub Backfill Engine ---');
  if (DRY_RUN) console.log('[DRY RUN MODE]');

  // 1. Load all stops with hubIds
  console.log('Loading stops library...');
  const stopsSnap = await db.collection('stops').get();
  const stops = stopsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  console.log(`Loaded ${stops.length} stops.`);

  // Create lookup maps
  const codeMap = new Map(); // "code|agency" -> hubId
  const nameMap = new Map(); // "normalizedName|agency" -> hubId

  for (const stop of stops) {
    if (!stop.hubId) continue;
    const agencies = stop.agencies || [stop.agency];
    for (const agency of agencies) {
      if (stop.code) codeMap.set(`${stop.code}|${agency}`, stop.hubId);
      nameMap.set(`${normalizeStopName(stop.name)}|${agency}`, stop.hubId);
      if (stop.aliases) {
        for (const alias of stop.aliases) {
          nameMap.set(`${normalizeStopName(alias)}|${agency}`, stop.hubId);
        }
      }
    }
  }

  // 2. Fetch all trips
  console.log('Fetching trips...');
  const tripsSnap = await db.collection('trips').get();
  const trips = tripsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  console.log(`Processing ${trips.length} trips.`);

  let updatedCount = 0;
  let batch = db.batch();
  let batchSize = 0;

  for (const trip of trips) {
    let startHubId = trip.startHubId;
    let endHubId = trip.endHubId;
    const agency = trip.agency;

    // Resolve startHubId if missing
    if (!startHubId && agency) {
      if (trip.startStopCode) startHubId = codeMap.get(`${trip.startStopCode}|${agency}`);
      if (!startHubId && trip.startStopName) startHubId = nameMap.get(`${normalizeStopName(trip.startStopName)}|${agency}`);
    }

    // Resolve endHubId if missing
    if (!endHubId && agency) {
      if (trip.endStopCode) endHubId = codeMap.get(`${trip.endStopCode}|${agency}`);
      if (!endHubId && trip.endStopName) endHubId = nameMap.get(`${normalizeStopName(trip.endStopName)}|${agency}`);
    }

    if (startHubId !== trip.startHubId || endHubId !== trip.endHubId) {
      updatedCount++;
      if (!DRY_RUN) {
        const ref = db.collection('trips').doc(trip.id);
        batch.update(ref, {
          startHubId: startHubId || null,
          endHubId: endHubId || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        batchSize++;
        
        if (batchSize >= 400) {
          await batch.commit();
          console.log(`Committed batch of ${batchSize} updates.`);
          batch = db.batch();
          batchSize = 0;
        }
      }
    }
  }

  if (!DRY_RUN && batchSize > 0) {
    await batch.commit();
  }

  console.log(`\nBackfill complete. Updated ${updatedCount} trips.`);
}

backfill().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
