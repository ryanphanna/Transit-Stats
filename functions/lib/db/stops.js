/**
 * Stop lookup and GTFS route mapping
 */
const admin = require('firebase-admin');
const { db } = require('./core');
const { AGENCY_CITY } = require('../constants');
const { getConnectionGroup, areConnectedStops, normalizeStopName } = require('../transfer-connections');
let _topology = null;
try { _topology = require('../topology.json'); } catch (_) { /* optional */ }

async function lookupStop(stopCode, stopName, agency, route = null, direction = null) {
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

    if (stopName) {
      const agencySnap = await db.collection('stops')
        .where('agencies', 'array-contains', agency)
        .get();
      const candidates = _findStopCandidates(stopName, agencySnap.docs);

      if (candidates.length > 0) {
        const resolved = await _resolveCandidates(candidates, agency, route, direction, stopName);
        if (resolved) return resolved;
        return null;
      }
    }

    // Cross-agency fallback: stop exists in library under a different agency.
    // If found, auto-expand the stop's agencies array so future lookups hit directly.
    const term = stopCode || stopName;
    if (term) {
      const found = await _findAndExpandStop(term, agency);
      if (found) return found;
    }

    // Trusted topology fallback: for routes covered by topology.json, treat a
    // route-specific stop/alias match as verified enough for trip trust even if
    // the normalized stop library is missing the station.
    if (stopName && route) {
      const topologyMatch = _lookupStopInTopology(stopName, agency, route);
      if (topologyMatch) return topologyMatch;
    }

    return null;
  } catch (error) {
    console.error('Error looking up stop:', error);
    return null;
  }
}

function _lookupStopInTopology(stopName, agency, route) {
  const line = _topologyLine(route, agency);
  if (!line || !stopName) return null;

  const lower = stopName.trim().toLowerCase();
  for (const canon of line.stops || []) {
    if (canon.toLowerCase() === lower) {
      return _topologyStop(canon, agency, route, line);
    }
    const aliases = (line.aliases && line.aliases[canon]) || [];
    if (aliases.some(a => a.toLowerCase() === lower)) {
      return _topologyStop(canon, agency, route, line);
    }
  }
  return null;
}

function _topologyLine(route, agency) {
  if (!_topology || !route || !agency) return null;
  const routeStr = route.toString().trim();
  const lines = _topology.lines || {};

  const exact = lines[routeStr];
  if (exact && exact.network === agency) return exact;

  const lower = routeStr.toLowerCase();
  for (const line of Object.values(lines)) {
    if (line.network !== agency) continue;
    const aliases = line.route_aliases || [];
    if (aliases.some(a => a.toLowerCase() === lower)) return line;
  }
  return null;
}

function _topologyStop(canon, agency, route, line) {
  return {
    id: null,
    agency,
    code: '',
    stopCode: '',
    name: canon,
    stopName: canon,
    aliases: (line.aliases && line.aliases[canon]) || [],
    routes: [route.toString()],
    source: 'topology',
    topologyMatched: true,
  };
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

  const snap = await db.collection('stops')
    .where('agencies', 'array-contains', agency)
    .get();

  return _findStopCandidates(stopName, snap.docs).slice(0, 5);
}

function _findStopCandidates(stopName, docs) {
  const lowerName = stopName.toLowerCase();
  const inputGroup = getConnectionGroup(stopName);
  const normalizedInput = normalizeStopName(stopName);
  const exactMatches = [];
  const connectedMatches = [];
  const seen = new Set();

  for (const doc of docs) {
    const data = doc.data();
    const candidate = {
      id: doc.id,
      ...data,
      stopCode: data.code,
      stopName: data.name,
      routes: data.routes || [],
      direction: data.direction || null,
    };
    const names = [data.name, ...(data.aliases || [])].filter(Boolean);
    const exact = names.some(name => name.toLowerCase() === lowerName);
    if (exact) {
      if (!seen.has(doc.id)) {
        seen.add(doc.id);
        exactMatches.push(candidate);
      }
      continue;
    }
    if (!inputGroup) continue;
    const connected = names.some(name =>
      getConnectionGroup(name) === inputGroup ||
      areConnectedStops(name, stopName) ||
      normalizeStopName(name) === normalizedInput
    );
    if (connected && !seen.has(doc.id)) {
      seen.add(doc.id);
      connectedMatches.push(candidate);
    }
  }

  return [...exactMatches, ...connectedMatches];
}

async function _resolveCandidates(candidates, agency, route, direction, rawStopName) {
  if (!route || candidates.length === 1) return candidates[0];

  let narrowed = await _filterCandidatesByRoute(candidates, agency, route);
  if (narrowed.length === 0) {
    if (candidates.length === 1) return candidates[0];
    console.warn(`lookupStop: ${candidates.length} stops named "${rawStopName}" but none confirmed for route ${route} via stopRoutes`);
    return null;
  }

  if (narrowed.length === 1) return narrowed[0];

  if (direction) {
    const dirFiltered = narrowed.filter(c => _directionMatches(c.direction, direction));
    if (dirFiltered.length === 1) return dirFiltered[0];
    if (dirFiltered.length > 1) narrowed = dirFiltered;
  }

  // Keep ambiguity explicit unless route+direction leave only one valid stop.
  return narrowed.length === 1 ? narrowed[0] : null;
}

async function _filterCandidatesByRoute(candidates, agency, route) {
  const normRoute = _normalizeRouteKey(route);
  const confirmed = [];
  const fallback = [];

  for (const candidate of candidates) {
    const localRoutes = Array.isArray(candidate.routes) ? candidate.routes : [];
    if (localRoutes.some(r => _normalizeRouteKey(r) === normRoute)) {
      confirmed.push(candidate);
      continue;
    }
    if (candidate.stopCode) {
      const docId = `${agency}_${candidate.stopCode}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      try {
        const srDoc = await db.collection('stopRoutes').doc(docId).get();
        if (srDoc.exists) {
          const routes = srDoc.data().routes || [];
          if (routes.some(r => _normalizeRouteKey(r) === normRoute)) {
            confirmed.push(candidate);
            continue;
          }
        }
      } catch (_) { /* non-fatal */ }
    }
    if (localRoutes.length === 0) fallback.push(candidate);
  }

  return confirmed.length > 0 ? confirmed : fallback;
}

function _normalizeRouteKey(route) {
  return route?.toString().replace(/\s+/g, '').toLowerCase() || '';
}

function _directionMatches(candidateDirection, requestedDirection) {
  if (!candidateDirection || !requestedDirection) return false;
  const normalize = value => value.toString().trim().toLowerCase().replace(/bound$/, '');
  return normalize(candidateDirection) === normalize(requestedDirection);
}

module.exports = {
  lookupStop,
  findMatchingStops,
  getRoutesAtStop,
  getStopsLibrary,
  _lookupStopInTopology,
  _findStopCandidates,
};
