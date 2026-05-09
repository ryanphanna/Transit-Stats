/**
 * TransitStats — ML Feature Preparation
 * Centralizes the canonicalization logic used by both training (Python) and inference (Node).
 */

/**
 * Standardize a stop name using the stops library.
 * This MUST match the behavior used in ml/train_endstop.py for feature alignment.
 */
function canonicalizeStop(name, stopsLibrary = []) {
  if (!name) return 'unknown';
  
  // Basic cleanup first (mirrors V3)
  const lower = name.trim().toLowerCase()
    .replace(/\s*[/&@]\s*/g, '/')
    .replace(/\s+at\s+/g, '/');

  if (stopsLibrary && stopsLibrary.length > 0) {
    const match = stopsLibrary.find(s => {
      const candidates = [s.name, ...(s.aliases || [])];
      return candidates.some(c => c.trim().toLowerCase()
        .replace(/\s*[/&@]\s*/g, '/')
        .replace(/\s+at\s+/g, '/') === lower);
    });
    if (match) {
      // Use the canonical name, ensuring it's title-cased consistently
      return match.name.toLowerCase()
        .replace(/\s*[/&@]\s*/g, '/')
        .replace(/\s+at\s+/g, '/');
    }
  }
  return lower;
}

/**
 * Build a consistent feature vector key for a stop.
 */
function getStopFeature(name, stopsLibrary = []) {
  const canon = canonicalizeStop(name, stopsLibrary);
  return `stop_${canon.replace(/[^a-z0-9]/g, '_')}`;
}

function normalizeRouteForMl(route, agency = null) {
  if (route == null) return route;
  const routeStr = route.toString().trim();
  if (!routeStr) return routeStr;
  const agencyStr = agency ? agency.toString().trim() : '';

  if (agencyStr === 'TTC') {
    const match = routeStr.match(/^(\d+)/);
    return match ? match[1] : routeStr;
  }

  const compact = routeStr.match(/^(\d+)([a-zA-Z]+)$/);
  if (compact) return `${compact[1]}${compact[2].toUpperCase()}`;
  if (/^[A-Za-z]$/.test(routeStr)) return routeStr.toUpperCase();
  return routeStr;
}

function getGapFeatures(minutesSinceLastTrip) {
  if (minutesSinceLastTrip === null || minutesSinceLastTrip === undefined || minutesSinceLastTrip === '') {
    return { gapLog: 0, gapMissing: 1 };
  }
  const n = Number(minutesSinceLastTrip);
  if (!Number.isFinite(n) || n < 0) {
    return { gapLog: 0, gapMissing: 1 };
  }
  const capped = Math.min(Math.max(n, 0), 720);
  return {
    gapLog: Math.log1p(capped) / Math.log1p(720),
    gapMissing: 0,
  };
}

module.exports = { canonicalizeStop, getStopFeature, normalizeRouteForMl, getGapFeatures };
