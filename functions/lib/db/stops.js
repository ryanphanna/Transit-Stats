/**
 * Stop lookup and GTFS route mapping
 */
const admin = require('firebase-admin');
const { db } = require('./core');
const { AGENCY_CITY } = require('../constants');

async function lookupStop(stopCode, stopName, agency) {
  try {
    if (!stopCode && !stopName) return null;

    // Code lookup — uses composite index (agencies array-contains + code ==)
    if (stopCode) {
      const snap = await db.collection('stops')
        .where('agencies', 'array-contains', agency)
        .where('code', '==', stopCode)
        .limit(1)
        .get();
      if (!snap.empty) {
        const doc = snap.docs[0];
        const data = doc.data();
        return { id: doc.id, ...data, stopCode: data.code, stopName: data.name };
      }
    }

    // Name lookup — fetch all stops for this agency, scan name + aliases in memory.
    // Shared stops (e.g. Montgomery Station) appear here for every agency in their
    // agencies array, so no cross-agency fallback needed.
    if (stopName) {
      const lowerName = stopName.toLowerCase();
      const agencySnap = await db.collection('stops')
        .where('agencies', 'array-contains', agency)
        .get();

      for (const doc of agencySnap.docs) {
        const data = doc.data();
        if (data.name?.toLowerCase() === lowerName) {
          return { id: doc.id, ...data, stopCode: data.code, stopName: data.name };
        }
      }
      for (const doc of agencySnap.docs) {
        const data = doc.data();
        if (data.aliases?.some(a => a.toLowerCase() === lowerName)) {
          return { id: doc.id, ...data, stopCode: data.code, stopName: data.name };
        }
      }
    }

    // Cross-agency fallback: stop exists in library under a different agency.
    // If found, auto-expand the stop's agencies array so future lookups hit directly.
    const term = stopCode || stopName;
    if (term) {
      const found = await _findAndExpandStop(term, agency);
      if (found) return found;
    }

    return null;
  } catch (error) {
    console.error('Error looking up stop:', error);
    return null;
  }
}

// Search all stops by name, alias, or code. Scoped to the same city as the
// requesting agency to prevent wrong-city matches (e.g. Toronto Union Station
// matching a Muni trip). When a match is found, auto-expands the agencies array.
async function _findAndExpandStop(term, agency) {
  const lowerTerm = term.toLowerCase();
  const tripCity = AGENCY_CITY[agency] || null;

  // Build the set of agencies in the same city. If the trip agency isn't in
  // AGENCY_CITY (unknown city), skip the fallback entirely — safer than guessing.
  if (!tripCity) return null;

  const cityAgencies = new Set(
    Object.entries(AGENCY_CITY)
      .filter(([, city]) => city === tripCity)
      .map(([a]) => a)
  );

  const allStops = await db.collection('stops').get();

  for (const doc of allStops.docs) {
    const data = doc.data();

    // Skip stops whose home agency is in a different city
    if (data.agency && !cityAgencies.has(data.agency)) continue;

    const match =
      data.name?.toLowerCase() === lowerTerm ||
      data.code === term ||
      data.aliases?.some(a => a.toLowerCase() === lowerTerm);

    if (match) {
      if (!data.agencies?.includes(agency)) {
        doc.ref.update({
          agencies: admin.firestore.FieldValue.arrayUnion(agency),
          updatedAt: new Date(),
        }).catch(err => console.error('agencies auto-expand failed:', err.message));
      }
      return { id: doc.id, ...data, stopCode: data.code, stopName: data.name };
    }
  }
  return null;
}

async function getRoutesAtStop(stopCode, agency) {
  if (!stopCode || !agency) return null;
  try {
    const docId = `${agency}_${stopCode}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    const doc = await db.collection('stopRoutes').doc(docId).get();
    if (!doc.exists) return null;
    return doc.data().routes || null;
  } catch (err) {
    console.error('Error fetching stopRoutes:', err);
    return null;
  }
}

async function getStopsLibrary() {
  const snapshot = await db.collection('stops').get();
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return { name: data.name, aliases: data.aliases || [] };
  });
}

/**
 * Find all stops within an agency matching a name or alias (case-insensitive).
 * Returns up to 5 candidates. Used for stop disambiguation before trip start.
 */
async function findMatchingStops(stopName, agency) {
  if (!stopName || !agency) return [];
  const lowerName = stopName.toLowerCase();

  const snap = await db.collection('stops')
    .where('agencies', 'array-contains', agency)
    .get();

  const seen = new Set();
  const matches = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const nameMatch = data.name?.toLowerCase() === lowerName;
    const aliasMatch = data.aliases?.some(a => a.toLowerCase() === lowerName);
    if ((nameMatch || aliasMatch) && !seen.has(doc.id)) {
      seen.add(doc.id);
      matches.push({ id: doc.id, stopCode: data.code, stopName: data.name });
    }
    if (matches.length >= 5) break;
  }

  return matches;
}

module.exports = { lookupStop, findMatchingStops, getRoutesAtStop, getStopsLibrary };
