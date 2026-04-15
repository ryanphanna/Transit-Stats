/**
 * Message parsing logic for transit trip tracking
 */
const { KNOWN_AGENCIES } = require('./constants');
const { toTitleCase, normalizeDirection, normalizeRoute, normalizeAgency } = require('./utils');

/**
 * Parse stop input to determine if it's a stop code (all digits) or stop name (contains letters)
 * @param {string} input - The stop input string
 * @returns {object} Object with stopCode and stopName fields (only one will be set)
 */
function parseStopInput(input) {
  if (!input) return { stopCode: null, stopName: null };
  const trimmed = input.trim();
  if (!trimmed) return { stopCode: null, stopName: null };

  // Check if the input is all digits (ignoring spaces, e.g., "123 45" -> "12345")
  const withoutSpaces = trimmed.replace(/\s+/g, '');
  if (/^\d+$/.test(withoutSpaces)) {
    return { stopCode: withoutSpaces, stopName: null };
  }
  // Contains letters - it's a stop name
  return { stopCode: null, stopName: toTitleCase(trimmed) };
}

/**
 * Parse multi-line trip format
 * @param {string} body - Message body
 * @param {string} defaultAgency - User's default agency
 * @returns {object|null} Parsed trip data or null if invalid
 */
function parseMultiLineTripFormat(body, defaultAgency) {
  // Guard against non-string input
  if (typeof body !== 'string') {
    return null;
  }

  const lines = body.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);

  // Need at least route and stop (lines 1 and 2)
  if (lines.length < 2) {
    return null;
  }

  // If first line is a command, don't parse as trip
  const firstLineUpper = lines[0].toUpperCase();
  if (['END', 'STATUS', 'DISCARD', 'INFO', '?', 'START', 'HELP', 'STOP'].includes(firstLineUpper)) {
    return null;
  }

  const route = normalizeRoute(lines[0]);
  const stop = toTitleCase(lines[1]);

  // Normalize direction if present on line 3
  let direction = lines.length > 2 ? normalizeDirection(lines[2]) : null;
  let agency = defaultAgency;

  // Check line 3 for agency if it's not a recognized direction (or even if it is, maybe it's an agency)
  // This helps when direction is omitted.
  if (lines.length === 3) {
    const potentialAgency = lines[2];
    const lowerAgency = potentialAgency.toLowerCase();
    const knownAgency = KNOWN_AGENCIES.find((a) => a.toLowerCase() === lowerAgency);
    if (knownAgency) {
      agency = normalizeAgency(knownAgency);
      direction = null; // Shift if it was an agency
    }
  } else if (lines.length > 3) {
    // Check line 4 for agency
    const potentialAgency = lines[3];
    const lowerAgency = potentialAgency.toLowerCase();
    const knownAgency = KNOWN_AGENCIES.find((a) => a.toLowerCase() === lowerAgency);
    if (knownAgency) {
      agency = normalizeAgency(knownAgency);
    }
  }

  // Reject if route/stop don't look like actual transit data (e.g. a freeform question)
  if (!isHeuristicLogValid(stop, route)) {
    return null;
  }

  return {
    route,
    stop,
    direction,
    agency,
  };
}

/**
 * Parse multi-line END trip format
 * @param {string} body - Message body
 * @returns {object|null} Parsed end trip data or null if not an END command
 */
function parseEndTripFormat(body) {
  // Guard against non-string input
  if (typeof body !== 'string') {
    return null;
  }

  const lines = body.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);

  // First line must be "END" or "STOP"
  if (lines.length === 0 || !['END', 'STOP'].includes(lines[0].toUpperCase())) {
    return null;
  }

  // Just "END" - no stop provided
  if (lines.length < 2) {
    return { isEnd: true, stop: null, route: null, notes: null };
  }

  // Format:
  // Line 1: END/STOP
  // Line 2: Stop Name
  // Line 3+: Notes
  const stop = lines[1];
  const notes = lines.length > 2 ? lines.slice(2).join('\n') : null;

  return {
    isEnd: true,
    stop,
    route: null, // Deprecated route verification in favor of simple stop + notes
    notes,
  };
}

/**
 * Parse agency override from end of message
 * @param {string} message - The full message
 * @returns {object} { agency: string|null, remainingMessage: string }
 */
function parseAgencyOverride(message) {
  const trimmed = message.trim();
  const lowerMessage = trimmed.toLowerCase();

  // Check each known agency (case-insensitive)
  for (const agency of KNOWN_AGENCIES) {
    const lowerAgency = agency.toLowerCase();

    // Check if message is exactly the agency name or ends with [whitespace][agency]
    // The regex \s covers spaces, newlines, and tabs.
    const pattern = new RegExp(`\\s${lowerAgency.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

    if (lowerMessage === lowerAgency || pattern.test(lowerMessage)) {
      // Remove agency from end of message
      const remainingMessage = lowerMessage === lowerAgency ?
        '' :
        trimmed.slice(0, -(agency.length + 1)).trim();

      // If there's no actual message left, this wasn't an override (e.g. they just sent "TTC")
      if (remainingMessage.length === 0) {
        return { agency: null, remainingMessage: trimmed };
      }

      // Return the canonical agency name
      return { agency: normalizeAgency(agency), remainingMessage };
    }
  }

  return { agency: null, remainingMessage: trimmed };
}

/**
 * Check if the input likely contains a trip log with heuristic parsing
 * @param {string} stopCodeRaw - raw stop name/code
 * @param {string} routeRaw - raw route number
 * @returns {boolean} true if it looks valid
 */
function isHeuristicLogValid(stopCodeRaw, routeRaw) {
  if (!stopCodeRaw || !routeRaw || typeof stopCodeRaw !== 'string' || typeof routeRaw !== 'string') {
    return false;
  }

  // 1. Sentence Starters: Reject if stop name starts with unlikely conversation starters
  // Heavily reduced list to avoid blocking "The"
  const sentenceStarters = ['I', 'IM', 'I\'M', 'ILL', 'I\'LL', 'HELLO', 'HI', 'HEY', 'PLEASE', 'THANKS', 'TO', 'ROUTE'];
  const firstWord = stopCodeRaw.split(' ')[0].toUpperCase();
  const isSentenceStart = sentenceStarters.includes(firstWord);

  // 2. Sentence Structure: Reject if text contains obvious motion sentences
  const sentencePattern = /\b(headed to|going to|im at|i am at|moving towards)\b/i;
  const isSentenceStructure = sentencePattern.test(stopCodeRaw) || sentencePattern.test(routeRaw);

  // 3. Bad Stop Names
  const badStopNames = ['BUS', 'STREETCAR', 'TRAIN', 'SUBWAY'];
  const isBadStopName = badStopNames.includes(firstWord);

  // 4. Length checks
  const isStopTooLong = stopCodeRaw.length > 60;
  const isRouteTooLong = routeRaw.length > 30; // Routes are usually short codes

  // Only accept if it passes all heuristics
  return (
    stopCodeRaw.length > 0 &&
    routeRaw.length > 0 &&
    !isSentenceStart &&
    !isSentenceStructure &&
    !isBadStopName &&
    !isStopTooLong &&
    !isRouteTooLong
  );
}

module.exports = {
  parseStopInput,
  parseMultiLineTripFormat,
  parseEndTripFormat,
  parseAgencyOverride,
  isHeuristicLogValid,
};
