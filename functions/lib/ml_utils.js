/**
 * TransitStats — ML Feature Preparation
 * Centralizes the canonicalization logic used by both training (Python) and inference (Node).
 */

const { toTitleCase } = require('./utils');

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

module.exports = { canonicalizeStop, getStopFeature };
