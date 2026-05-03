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

  // Canonical direction values returned by normalizeDirection — anything else is unrecognized.
  const CANONICAL_DIRECTIONS = new Set([
    'Northbound', 'Southbound', 'Eastbound', 'Westbound',
    'Clockwise', 'Counterclockwise', 'Inbound', 'Outbound',
    'Up Valley', 'Down Valley',
  ]);

  // Direction is line 3 only when it resolves to a recognized canonical word.
  // "Barrie Transit" passes through normalizeDirection unchanged, so it won't
  // match here and falls through to the agency check below instead.
  let direction = null;
  if (lines.length > 2) {
    const nd = normalizeDirection(lines[2]);
    if (CANONICAL_DIRECTIONS.has(nd)) direction = nd;
  }

  let agency = defaultAgency;
  let agencyExplicit = false;

  if (lines.length === 3) {
    // Line 3: check KNOWN_AGENCIES first (for canonical normalization), then
    // treat any non-direction text as an agency — even if not pre-registered.
    const potentialAgency = lines[2];
    const lowerAgency = potentialAgency.toLowerCase();
    const knownAgency = KNOWN_AGENCIES.find((a) => a.toLowerCase() === lowerAgency);
    if (knownAgency) {
      agency = normalizeAgency(knownAgency);
      direction = null;
      agencyExplicit = true;
    } else if (!direction) {
      // Not a direction and not a known agency — store as-is (e.g. "Barrie Transit")
      agency = normalizeAgency(potentialAgency);
      agencyExplicit = true;
    }
  } else if (lines.length > 3) {
    // Line 4 is always the agency — no direction ambiguity at this position.
    const potentialAgency = lines[3].trim();
    if (potentialAgency) {
      agency = normalizeAgency(potentialAgency);
      agencyExplicit = true;
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
    agencyExplicit,
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

/**
 * Parse single-line trip format: "[route] [stop] [direction]"
 * e.g. "510 Spadina/College North" or "47 Lansdowne / Dupont South"
 * @param {string} body - Message body (must be a single line)
 * @param {string} defaultAgency - User's default agency
 * @returns {object|null} Parsed trip data or null if not a match
 */
function parseSingleLineTripFormat(body, defaultAgency) {
  if (typeof body !== 'string') return null;

  const trimmed = body.trim();

  // Only handle single-line messages
  const lines = trimmed.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length !== 1) return null;

  const DIRECTION_WORDS = new Set([
    'N', 'NB', 'NORTH', 'NORTHBOUND', 'NORTHWARD',
    'S', 'SB', 'SOUTH', 'SOUTHBOUND', 'SOUTHWARD',
    'E', 'EB', 'EAST', 'EASTBOUND', 'EASTWARD',
    'W', 'WB', 'WEST', 'WESTBOUND', 'WESTWARD',
    'CW', 'CLOCKWISE', 'CCW', 'COUNTERCLOCKWISE',
    'IB', 'IN', 'INBOUND', 'OB', 'OUT', 'OUTBOUND',
  ]);

  const words = trimmed.split(/\s+/);
  if (words.length < 3) return null; // Need at least route + stop + direction

  // First word is the route
  const route = normalizeRoute(words[0]);
  if (!route) return null;

  // Last word must be a direction — without it we can't distinguish from other formats
  const lastWord = words[words.length - 1].toUpperCase();
  if (!DIRECTION_WORDS.has(lastWord)) return null;

  const direction = normalizeDirection(words[words.length - 1]);
  const stopWords = words.slice(1, -1);
  if (stopWords.length === 0) return null;

  const stop = toTitleCase(stopWords.join(' '));

  if (!isHeuristicLogValid(stop, route)) return null;

  return { route, stop, direction, agency: defaultAgency, agencyExplicit: false };
}

module.exports = {
  parseStopInput,
  parseMultiLineTripFormat,
  parseSingleLineTripFormat,
  parseEndTripFormat,
  parseAgencyOverride,
  isHeuristicLogValid,
};
