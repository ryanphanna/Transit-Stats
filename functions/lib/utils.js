/**
 * Utility functions for SMS processing
 */
const crypto = require('crypto');
const { BAD_ROUTE_SUFFIXES, AGENCY_CANONICAL } = require('./constants');

/**
 * Convert string to Title Case
 * Also normalizes " and " to " & " for intersections
 * @param {string} str - Input string
 * @returns {string} Title Cased String
 */
function toTitleCase(str) {
  if (!str) return str;

  // Replace " and " with " & " (case insensitive)
  // Normalize slashes to a single char first to ensure clean splitting
  const normalized = str.replace(/ (and) /gi, ' & ').replace(/ *\/ */g, '/');

  const titleCased = normalized
    .toLowerCase()
    .split(/\s+/)
    .map((word) => {
      // Capitalize across slash-separated parts (e.g. "spadina/king" → "Spadina/King")
      // Use regex to skip leading non-letter chars (e.g. "(laird" → "(Laird")
      return word.split('/').map((part) => part.replace(/^([^a-zA-Z]*)([a-zA-Z])/, (_, pre, letter) => /\d$/.test(pre) ? pre + letter : pre + letter.toUpperCase())).join('/');
    })
    .join(' ');

  // Restore spaces around slashes for the final "canonical" display/storage format
  return titleCased.replace(/\//g, ' / ');
}

/**
 * Escape XML special characters
 * @param {string} text - Message body
 */
function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Normalize direction input to standard full-word format
 * @param {string} input - Raw direction input (e.g. "SB", "North", "CW")
 * @returns {string} Normalized direction (e.g. "Southbound", "Northbound", "Clockwise") or original input
 */
function normalizeDirection(input) {
  if (!input) return null;

  const upper = input.trim().toUpperCase();

  // North/Northbound
  if (['N', 'NB', 'N/B', 'NORTH', 'NORTHBOUND', 'NORTHWARD'].includes(upper)) return 'Northbound';

  // South/Southbound
  if (['S', 'SB', 'S/B', 'SOUTH', 'SOUTHBOUND', 'SOUTHWARD'].includes(upper)) return 'Southbound';

  // East/Eastbound
  if (['E', 'EB', 'E/B', 'EAST', 'EASTBOUND', 'EASTWARD'].includes(upper)) return 'Eastbound';

  // West/Westbound
  if (['W', 'WB', 'W/B', 'WEST', 'WESTBOUND', 'WESTWARD'].includes(upper)) return 'Westbound';

  // Clockwise
  if (['CW', 'CLOCKWISE'].includes(upper)) return 'Clockwise';

  // Counterclockwise
  if (['CCW', 'COUNTERCLOCKWISE', 'ANTICLOCKWISE', 'ANTI-CLOCKWISE'].includes(upper)) return 'Counterclockwise';

  // Inbound
  if (['IB', 'IN', 'INBOUND'].includes(upper)) return 'Inbound';

  // Outbound
  if (['OB', 'OUT', 'OUTBOUND'].includes(upper)) return 'Outbound';

  // Up Valley / Down Valley (ski resort and valley transit systems)
  if (['UV', 'UP', 'UPVALLEY', 'UP VALLEY', 'UP-VALLEY'].includes(upper)) return 'Up Valley';
  if (['DV', 'DOWN', 'DOWNVALLEY', 'DOWN VALLEY', 'DOWN-VALLEY'].includes(upper)) return 'Down Valley';

  // Return original if no match (e.g. specific destination name)
  return input.trim();
}

/**
 * Generate a cryptographically secure random 6-digit code
 * @returns {string} 6-digit verification code
 */
function generateVerificationCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Check if a route string is valid
 * @param {string} route - Route string to check
 * @returns {boolean} true if valid
 */
function isValidRoute(route) {
  if (!route) return false;

  // Clean up
  const cleanRoute = route.trim().toUpperCase();

  // Valid formats: "505", "510A", "510B", "GO1", "Line 1", "Line 2"
  if (/^[A-Z]{0,2}\d+[A-Z]?$/.test(cleanRoute)) return true;
  if (/^LINE\s*\d+$/.test(cleanRoute)) return true;

  return false;
}

/**
 * Get display string for a stop (handles both code and name fields)
 * @param {string|null} stopCode - Stop code (numeric)
 * @param {string|null} stopName - Stop name (text)
 * @param {string|null} legacyStop - Legacy startStop/endStop field for backward compatibility
 * @returns {string} Display string for the stop
 */
function getStopDisplay(stopCode, stopName, legacyStop = null) {
  if (stopCode) return stopCode;
  if (stopName) return toTitleCase(stopName);
  if (legacyStop) return toTitleCase(legacyStop);
  return 'Unknown';
}

/**
 * Determine timing reliability based on prompt delay
 * @param {admin.firestore.Timestamp} stateExpiresAt - When the prompt expires (created + 5 mins)
 * @returns {string} Reliability classification
 */
function determineReliability(stateExpiresAt) {
  if (!stateExpiresAt) return 'actual';

  // prompt was created 5 mins before expiration
  const createdAtMs = stateExpiresAt.toDate().getTime() - (5 * 60 * 1000);
  const nowMs = Date.now();
  const delayMinutes = (nowMs - createdAtMs) / 1000 / 60;

  return delayMinutes > 2 ? 'delayed_start' : 'actual';
}

/**
 * Normalize a route identifier — uppercases trailing letter suffixes (e.g. "510a" → "510A")
 * @param {string} route - Raw route string
 * @returns {string} Normalized route
 */
function normalizeRoute(route) {
  if (!route) return route;
  const s = route.toString().trim();

  // Guard against extreme input length to provide baseline DoS protection
  if (s.length > 100) return s;

  // Only uppercase trailing letter suffixes on numeric routes (e.g. "510a" → "510A").
  // Named routes like "Lakeshore West" or "Lakeshore East" must not be uppercased.
  if (!/^\d/.test(s)) return s;

  // Find the index where trailing letters start (e.g., "510a" -> index 3)
  // We scan backwards to find the boundary in O(N) without backtracking risk.
  let i = s.length;
  while (i > 0 && /[a-zA-Z]/.test(s[i - 1])) {
    i--;
  }

  if (i === s.length) return s; // No trailing letters

  const base = s.slice(0, i);
  const suffix = s.slice(i);
  return base + suffix.toUpperCase();
}

/**
 * Get display string for a route, uppercasing any trailing letters (e.g. "510a" → "510A")
 * @param {string} route - Route identifier
 * @param {string|null} direction - Optional direction string
 * @returns {string} Display string for the route
 */
function getRouteDisplay(route, direction = null) {
  const r = normalizeRoute(route ? route.toString() : route);
  return direction ? `${r} ${direction}` : `${r}`;
}

/**
 * Normalize an agency name to its canonical stored form.
 * e.g. "Toronto Transit Commission", "toronto transit commission", "TTC" → "TTC"
 * @param {string} agency
 * @returns {string} Canonical agency name
 */
function normalizeAgency(agency) {
  if (!agency) return agency;
  return AGENCY_CANONICAL[agency.trim().toLowerCase()] || agency.trim();
}

module.exports = {
  toTitleCase,
  escapeXml,
  normalizeDirection,
  normalizeRoute,
  normalizeAgency,
  generateVerificationCode,
  isValidRoute,
  getStopDisplay,
  getRouteDisplay,
  determineReliability,
};
