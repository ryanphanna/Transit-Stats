/**
 * Stop lookup and GTFS route mapping
 */
const { db } = require('./core');

async function lookupStop(stopCode, stopName, agency) {
  try {
    let snapshot;

    if (stopCode) {
      snapshot = await db.collection('stops')
        .where('agency', '==', agency)
        .where('code', '==', stopCode)
        .limit(1)
        .get();
    } else if (stopName) {
      snapshot = await db.collection('stops')
        .where('agency', '==', agency)
        .where('name', '==', stopName)
        .limit(1)
        .get();

      if (snapshot.empty) {
        const allStops = await db.collection('stops').where('agency', '==', agency).get();
        const lowerName = stopName.toLowerCase();

        // Case-insensitive name match
        for (const doc of allStops.docs) {
          const data = doc.data();
          if (data.name && data.name.toLowerCase() === lowerName) {
            return { id: doc.id, ...data, stopCode: data.code, stopName: data.name };
          }
        }

        // Alias exact match
        const aliasSnapshot = await db.collection('stops')
          .where('agency', '==', agency)
          .where('aliases', 'array-contains', stopName)
          .limit(1)
          .get();

        if (!aliasSnapshot.empty) {
          const doc = aliasSnapshot.docs[0];
          const data = doc.data();
          return { id: doc.id, ...data, stopCode: data.code, stopName: data.name };
        }

        // Alias case-insensitive match
        for (const doc of allStops.docs) {
          const data = doc.data();
          if (data.aliases?.some(a => a.toLowerCase() === lowerName)) {
            return { id: doc.id, ...data, stopCode: data.code, stopName: data.name };
          }
        }

        return null;
      }
    } else {
      return null;
    }

    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    const data = doc.data();
    return { id: doc.id, ...data, stopCode: data.code, stopName: data.name };
  } catch (error) {
    console.error('Error looking up stop:', error);
    return null;
  }
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

  const allStops = await db.collection('stops').where('agency', '==', agency).get();
  const seen = new Set();
  const matches = [];

  for (const doc of allStops.docs) {
    const data = doc.data();
    const nameMatch = data.name && data.name.toLowerCase() === lowerName;
    const aliasMatch = data.aliases?.some(a => a.toLowerCase() === lowerName);
    if (nameMatch || aliasMatch) {
      if (!seen.has(doc.id)) {
        seen.add(doc.id);
        matches.push({ id: doc.id, stopCode: data.code, stopName: data.name });
      }
    }
    if (matches.length >= 5) break;
  }

  return matches;
}

module.exports = { lookupStop, findMatchingStops, getRoutesAtStop, getStopsLibrary };
