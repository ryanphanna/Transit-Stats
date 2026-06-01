/**
 * enrich-stops-from-trips.js
 *
 * Scans trips for GPS coordinates and backfills the normalized stops library.
 * This creates a feedback loop where app usage automatically geocodes the database.
 *
 * Usage:
 *   node Tools/enrich-stops-from-trips.js [--dry-run]
 */

const admin = require('firebase-admin');

const KEY_PATH = '/Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json';
const DRY_RUN = process.argv.includes('--dry-run');

admin.initializeApp({ credential: admin.credential.cert(require(KEY_PATH)) });
const db = admin.firestore();

async function enrich() {
  console.log('--- Stop Enrichment Engine ---');
  if (DRY_RUN) console.log('[DRY RUN MODE]');

  // 1. Load all stops for matching
  console.log('Loading stops library...');
  const stopsSnap = await db.collection('stops').get();
  const stops = stopsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  console.log(`Loaded ${stops.count} stops.`);

  // 2. Fetch trips with GPS coordinates
  console.log('Searching for trips with GPS data...');
  
  // We'll check both new iOS fields and legacy fields
  const tripsSnap = await db.collection('trips').get();
  const trips = tripsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(t => (t.startLatitude && t.startLongitude) || (t.boardingLocation && t.boardingLocation.lat));

  console.log(`Found ${trips.length} trips with GPS data.`);

  const updates = new Map(); // stopId -> { lat, lon, sourceTripId }

  for (const trip of trips) {
    const lat = trip.startLatitude || (trip.boardingLocation && trip.boardingLocation.lat);
    const lon = trip.startLongitude || (trip.boardingLocation && trip.boardingLocation.lng);
    const accuracy = trip.startAccuracy || 0;
    
    // Skip poor accuracy if available
    if (accuracy > 65) continue;

    const stopName = trip.startStopName;
    const stopCode = trip.startStopCode;
    const agency = trip.agency;

    // Find matching stop in library
    const match = stops.find(s => {
      // Priority 1: Match by Code
      if (stopCode && s.code === stopCode && s.agencies && s.agencies.includes(agency)) return true;
      
      // Priority 2: Match by Name + Agency
      if (stopName && s.name.toLowerCase() === stopName.toLowerCase() && s.agencies && s.agencies.includes(agency)) return true;
      
      // Priority 3: Match by Alias
      if (stopName && s.aliases && s.aliases.some(a => a.toLowerCase() === stopName.toLowerCase()) && s.agencies && s.agencies.includes(agency)) return true;

      return false;
    });

    if (match) {
      // Only update if the stop doesn't have coordinates yet
      if (!match.latitude || match.latitude === 0) {
        if (!updates.has(match.id)) {
          updates.set(match.id, { 
            latitude: lat, 
            longitude: lon, 
            name: match.name,
            sourceTripId: trip.id 
          });
        }
      }
    } else {
        // Option: Create candidate stop?
        // console.log(`No match for stop: ${stopName} (${agency})`);
    }
  }

  console.log(`\nIdentified ${updates.size} stops to enrich.`);

  if (updates.size === 0) {
    console.log('No updates needed.');
    return;
  }

  const batch = db.batch();
  for (const [stopId, data] of updates) {
    console.log(`  [ENRICH] ${data.name} -> (${data.latitude}, ${data.longitude}) | Source: trip ${data.sourceTripId}`);
    if (!DRY_RUN) {
      const ref = db.collection('stops').document(stopId);
      batch.update(ref, {
        latitude: data.latitude,
        longitude: data.longitude,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'automated_enrichment'
      });
    }
  }

  if (!DRY_RUN) {
    await batch.commit();
    console.log('\nEnrichment complete. Database updated.');
  } else {
    console.log('\nDry run complete. No changes made.');
  }
}

enrich().catch(err => {
  console.error('Enrichment failed:', err);
  process.exit(1);
});
