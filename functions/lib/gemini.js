/**
 * Gemini AI helper functions for SMS parsing and querying
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { defineSecret } = require('firebase-functions/params');
const { VALID_INTENTS, VALID_SENTIMENTS } = require('./constants');

const geminiApiKey = defineSecret('GEMINI_API_KEY');

/**
 * Retry helper with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Initial delay in milliseconds
 * @returns {Promise<any>} Result of function
 */
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1;

      // Don't retry on certain error types
      if (error.message && (
        error.message.includes('API key') ||
        error.message.includes('unauthorized') ||
        error.message.includes('invalid') && !error.message.includes('invalid response')
      )) {
        throw error; // Don't retry on auth/config errors
      }

      if (isLastAttempt) {
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * Aggregate trip data into summary stats for AI context
 * @param {Array} trips - List of trip objects
 * @returns {object} Aggregated stats
 */
function aggregateTripStats(trips) {
  const routeMap = {};
  const pairMap = {};
  const boardingStopMap = {};
  const exitStopMap = {};
  const hourMap = {};

  trips.forEach((trip) => {
    const route = trip.route || 'Unknown';
    const dur = trip.duration || 0;
    const startStop = trip.startStopName || trip.startStop || trip.startStopCode || 'Unknown';
    const endStop = trip.endStopName || trip.endStop || trip.endStopCode || 'Unknown';
    const pairKey = `${startStop} → ${endStop}`;

    if (!routeMap[route]) routeMap[route] = { count: 0, durations: [] };
    routeMap[route].count++;
    if (dur > 0) routeMap[route].durations.push(dur);

    if (!pairMap[pairKey]) pairMap[pairKey] = { route, count: 0, durations: [] };
    pairMap[pairKey].count++;
    if (dur > 0) pairMap[pairKey].durations.push(dur);

    if (startStop !== 'Unknown') {
      boardingStopMap[startStop] = (boardingStopMap[startStop] || 0) + 1;
    }
    if (endStop !== 'Unknown') {
      exitStopMap[endStop] = (exitStopMap[endStop] || 0) + 1;
    }

    if (trip.startTime) {
      const date = trip.startTime.toDate ? trip.startTime.toDate() : new Date(trip.startTime);
      const hour = date.getHours();
      hourMap[hour] = (hourMap[hour] || 0) + 1;
    }
  });

  const avg = (arr) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

  const routeStats = Object.entries(routeMap).map(([route, data]) => ({
    route,
    count: data.count,
    avgDuration: avg(data.durations),
    minDuration: data.durations.length ? Math.min(...data.durations) : null,
    maxDuration: data.durations.length ? Math.max(...data.durations) : null,
  })).sort((a, b) => b.count - a.count).slice(0, 10);

  const pairStats = Object.entries(pairMap).map(([pair, data]) => ({
    pair,
    route: data.route,
    count: data.count,
    avgDuration: avg(data.durations),
    minDuration: data.durations.length ? Math.min(...data.durations) : null,
    maxDuration: data.durations.length ? Math.max(...data.durations) : null,
  })).sort((a, b) => b.count - a.count).slice(0, 20);

  const boardingStops = Object.entries(boardingStopMap)
    .map(([stop, count]) => ({ stop, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const exitStops = Object.entries(exitStopMap)
    .map(([stop, count]) => ({ stop, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const timeOfDay = { morning: 0, midday: 0, afternoon: 0, evening: 0, night: 0 };
  Object.entries(hourMap).forEach(([hour, count]) => {
    const h = parseInt(hour);
    if (h >= 6 && h <= 9) timeOfDay.morning += count;
    else if (h >= 10 && h <= 14) timeOfDay.midday += count;
    else if (h >= 15 && h <= 18) timeOfDay.afternoon += count;
    else if (h >= 19 && h <= 22) timeOfDay.evening += count;
    else timeOfDay.night += count;
  });

  return { total: trips.length, routeStats, pairStats, boardingStops, exitStops, timeOfDay };
}

/**
 * Sanitize Gemini output to prevent prompt injection attacks and invalid data.
 * @param {object} parsed - Gemini result object
 * @returns {object|null} Sanitized result
 */
function sanitizeGeminiOutput(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;

  const MAX_FIELD_LENGTH = 100;

  // Strip HTML tags from a string (recursive to prevent bypass)
  const stripHtml = (str) => {
    if (typeof str !== 'string') return str;
    let oldStr;
    do {
      oldStr = str;
      str = str.replace(/<[^>]*>/g, '');
    } while (str !== oldStr);
    return str.trim();
  };

  // Sanitize and cap a string field
  const sanitizeField = (val, maxLen = MAX_FIELD_LENGTH) => {
    if (val == null) return null;
    if (typeof val !== 'string') return null;
    return stripHtml(val).slice(0, maxLen) || null;
  };

  // Validate intent
  const intent = VALID_INTENTS.includes(parsed.intent) ? parsed.intent : 'OTHER';

  // Validate sentiment
  const sentiment = VALID_SENTIMENTS.includes(parsed.sentiment) ? parsed.sentiment : 'NEUTRAL';

  // Sanitize tags array
  const tags = Array.isArray(parsed.tags) ?
    parsed.tags.filter((t) => typeof t === 'string').map((t) => stripHtml(t).slice(0, 30)).slice(0, 5) :
    [];

  return {
    intent,
    route: sanitizeField(parsed.route, 50),
    stop_name: sanitizeField(parsed.stop_name),
    stop_id: sanitizeField(parsed.stop_id, 20),
    direction: sanitizeField(parsed.direction, 30),
    sentiment,
    tags,
    question: sanitizeField(parsed.question, 300),
    notes: sanitizeField(parsed.notes, 300),
  };
}

/**
 * Use Gemini to answer a natural-language question given aggregated trip stats
 * @param {string} question - User question
 * @param {object} stats - Aggregated stats object
 * @returns {Promise<string>} AI answer
 */
async function answerQueryWithGemini(question, stats) {
  const apiKey = geminiApiKey.value();
  if (!apiKey) return 'AI unavailable right now.';

  return await retryWithBackoff(async () => {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `You are a transit stats assistant for TransitStats. ` +
      `Answer the user's question using their personal transit data below. ` +
      `Be concise and friendly. Keep the response under 300 characters ` +
      `if possible so it fits in an SMS.

User question: "${question}"

Their transit data:
- Total completed trips: ${stats.total}
- Top routes: ${JSON.stringify(stats.routeStats.slice(0, 5))}
- Top stop pairs (start → end): ${JSON.stringify(stats.pairStats.slice(0, 10))}
- Most boarded stops: ${JSON.stringify(stats.boardingStops?.slice(0, 5) || [])}
- Most exited stops: ${JSON.stringify(stats.exitStops?.slice(0, 5) || [])}
- Trips by time of day: ${JSON.stringify(stats.timeOfDay || {})}

If the data doesn't contain enough info to answer, say so briefly.`;

    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  }).catch(() => 'Sorry, I had trouble answering that. Try again?');
}

/**
 * Construct stop input from Gemini result
 * Prefer stop_id (code) if available, otherwise stop_name
 * @param {object} result - Gemini result object
 * @returns {string|null} Stop input string or null
 */
function constructStopInput(result) {
  if (!result) return null;
  return result.stop_id || result.stop_name || null;
}

/**
 * Parse natural language trip text using Gemini Flash
 * @param {string} text - Raw SMS text
 * @returns {Promise<object|null>} Parsed and sanitized data or null if failed
 */
async function parseWithGemini(text) {
  const apiKey = geminiApiKey.value();
  if (!apiKey) {
    console.error('Gemini API key not configured');
    return null;
  }

  // Truncate input to prevent prompt injection via very long messages
  const truncatedText = text.length > 500 ? text.slice(0, 500) : text;

  return await retryWithBackoff(async () => {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `Analyze this SMS from a transit tracker user. Determine the intent and extract data.
    Text: "${truncatedText}"
    
    Possible Intents:
    - START_TRIP: User is starting a new trip (requires route and stop).
    - END_TRIP: User is ending the current trip (extract stop if present).
    - DISCARD_TRIP: User wants to cancel/delete the active trip.
    - INCOMPLETE_TRIP: User forgot to end the trip earlier.
    - QUERY: User is asking a question about their history.
    - OTHER: Not a transit command.

    Extraction Rules:
    - Direction: Normalize: "Northbound", "Southbound", "Eastbound", "Westbound".
    - Route: Extract ONLY the route identifier explicitly mentioned (e.g., "504", "Line 1", "510a"). Routes are typically 1-3 digits or "Line X". Never infer or guess a route — if none is clearly stated, return null.
    - Stop ID: A number explicitly labeled as a stop ("stop 815", "from stop 11986") in the message. If ambiguous, prefer stop_name over stop_id. Never put a route number in stop_id.
    - Stop Name: Extract the full location name.
    - Ignore conversational text: "Just boarded", "I'm on", "taking", etc.
    - Sentiment: Determine if POSITIVE, NEGATIVE, or NEUTRAL.
    - Tags: Extract 1-3 keyword tags (e.g., "crowded", "delayed", "clean").

    Examples:
    - "Just boarded Route 1 NB" -> Route: "1", Dir: "Northbound"
    - "Packed 504 from King" -> Route: "504", Tags: ["crowded"]

    Return ONLY JSON:
    {
      "intent": "START_TRIP" | "END_TRIP" | "DISCARD_TRIP" | "INCOMPLETE_TRIP" | "QUERY" | "OTHER",
      "route": "string" | null,
      "stop_name": "string" | null,
      "stop_id": "string" | null,
      "direction": "string" | null,
      "sentiment": "POSITIVE" | "NEGATIVE" | "NEUTRAL",
      "tags": ["string"],
      "question": "string" | null
    }`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const textResponse = response.text();

    // Clean up markdown code blocks if present
    const jsonStr = textResponse.replace(/^```json\n|\n```$/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    // Sanitize output to prevent prompt injection
    const sanitized = sanitizeGeminiOutput(parsed);

    // Log successful API call for monitoring
    console.log('Gemini API call successful', {
      intent: sanitized?.intent,
      hasRoute: !!sanitized?.route,
      hasStop: !!(sanitized?.stop_name || sanitized?.stop_id),
    });

    return sanitized;
  }).catch((error) => {
    console.error('Gemini parsing error after retries:', error.message);
    // Return null to fall back to heuristic parsing
    return null;
  });
}

module.exports = {
  retryWithBackoff,
  aggregateTripStats,
  answerQueryWithGemini,
  constructStopInput,
  parseWithGemini,
};
