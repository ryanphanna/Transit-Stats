/**
 * Utility functions for SMS processing
 */
const crypto = require('crypto');
const { BAD_ROUTE_SUFFIXES } = require('./constants');

/**
 * Convert string to Title Case
 * Also normalizes " and " to " & " for intersections
 * @param {string} str - Input string
 * @returns {string} Title Cased String
 */
function toTitleCase(str) {
  if (!str) return str;

  // Replace " and " with " & " (case insensitive)
  // Normalize spaces around slashes so "Spadina / Nassau" and "Spadina/Nassau" both become "Spadina/Nassau"
  const normalized = str.replace(/\s+and\s+/gi, ' & ').replace(/\s*\/\s*/g, '/');

  return normalized
    .toLowerCase()
    .split(/\s+/)
    .map((word) => {
      // Capitalize across slash-separated parts (e.g. "spadina/king" → "Spadina/King")
      return word.split('/').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('/');
    })
    .join(' ');
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

  // If it's a number, it's valid
  if (/^\d+$/.test(cleanRoute)) return true;

  // If it's in the bad list, it's invalid
  if (BAD_ROUTE_SUFFIXES.includes(cleanRoute)) return false;

  return true;
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
  return route.trim().replace(/([a-zA-Z]+)$/, (m) => m.toUpperCase());
}

/**
 * Get display string for a route, uppercasing any trailing letters (e.g. "510a" → "510A")
 * @param {string} route - Route identifier
 * @param {string|null} direction - Optional direction string
 * @returns {string} Display string for the route
 */
function getRouteDisplay(route, direction = null) {
  const r = normalizeRoute(route ? route.toString() : route);
  return direction ? `Route ${r} ${direction}` : `Route ${r}`;
}

module.exports = {
  toTitleCase,
  escapeXml,
  normalizeDirection,
  normalizeRoute,
  generateVerificationCode,
  isValidRoute,
  getStopDisplay,
  getRouteDisplay,
  determineReliability,
};
