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
  const dayOfWeekMap = {};
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let windowStart = null;
  let windowEnd = null;

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
      const day = DAY_NAMES[date.getDay()];
      dayOfWeekMap[day] = (dayOfWeekMap[day] || 0) + 1;
      if (!windowStart || date < windowStart) windowStart = date;
      if (!windowEnd || date > windowEnd) windowEnd = date;
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

  // Daily trip counts (YYYY-MM-DD → count) for specific date queries
  const dailyCounts = {};
  trips.forEach((trip) => {
    if (!trip.startTime) return;
    const date = trip.startTime.toDate ? trip.startTime.toDate() : new Date(trip.startTime);
    const key = date.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
    dailyCounts[key] = (dailyCounts[key] || 0) + 1;
  });

  const allStops = Array.from(new Set([
    ...Object.keys(boardingStopMap),
    ...Object.keys(exitStopMap),
  ])).sort();

  return {
    total: trips.length,
    routeStats, pairStats, boardingStops, exitStops, timeOfDay, dailyCounts, allStops,
    dayOfWeek: dayOfWeekMap,
    windowStart: windowStart ? windowStart.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }) : null,
    windowEnd: windowEnd ? windowEnd.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }) : null,
  };
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
 * Use Gemini to answer a natural-language question given aggregated trip stats,
 * using function calling (tools) to search the database if needed.
 * @param {string} userId - User identifier
 * @param {string} question - User question
 * @param {Array} recentTrips - Most recent 200 trips (raw)
 * @param {object} stats - Aggregated stats for the recent 200 trips
 * @returns {Promise<string>} AI answer
 */
async function answerQueryWithGemini(userId, question, recentTrips, stats) {
  const apiKey = geminiApiKey.value();
  if (!apiKey) return 'AI unavailable right now.';

  const admin = require('firebase-admin');
  const db = admin.firestore();

  // Define tools available to the AI
  const tools = [
    {
      functionDeclarations: [
        {
          name: 'get_all_time_stats',
          description: 'Get total trip, route, and stop counts across all time. ' +
            'Call this for "total ever", "all time", or "since I started" questions.',
        },
        {
          name: 'get_all_time_stop_stats',
          description: 'Get the top boarding and exit stops (up to 20 each) across all time. ' +
            'Call this for all-time stop frequency questions.',
        },
        {
          name: 'get_all_time_route_stats',
          description: 'Get all routes and their frequency across all time. ' +
            'Call this for all-time route frequency questions.',
        },
        {
          name: 'get_monthly_trip_counts',
          description: 'Get trip counts grouped by year-month across all time. ' +
            'Call this for questions about a specific month, year, or date range ' +
            'that may fall outside the recent window.',
        },
        {
          name: 'get_day_of_week_stats',
          description: 'Get trip counts by day of week (Monday, Tuesday, etc.) across all time. ' +
            'Call this for questions about busiest days, Fridays, weekdays vs weekends, etc.',
        },
      ]
    }
  ];

  // Tool implementations
  const toolExecutors = {
    get_all_time_stats: async () => {
      const tripsCol = db.collection('trips').where('userId', '==', userId).where('endTime', '!=', null);
      const snapshot = await tripsCol.count().get();
      const count = snapshot.data().count;

      const trips = await tripsCol.select('route', 'startStopName', 'endStopName').get();
      const routes = new Set(trips.docs.map((t) => t.data().route).filter(Boolean)).size;
      const boarding = new Set(trips.docs.map((t) => t.data().startStopName).filter(Boolean));
      const exit = new Set(trips.docs.map((t) => t.data().endStopName).filter(Boolean));
      const stops = new Set([...boarding, ...exit]).size;

      return { totalTrips: count, uniqueRoutes: routes, uniqueStops: stops };
    },
    get_all_time_stop_stats: async () => {
      const trips = await db.collection('trips')
        .where('userId', '==', userId)
        .where('endTime', '!=', null)
        .select('startStopName', 'endStopName')
        .get();

      const boarding = {};
      const exit = {};
      trips.docs.forEach((d) => {
        const t = d.data();
        if (t.startStopName) boarding[t.startStopName] = (boarding[t.startStopName] || 0) + 1;
        if (t.endStopName) exit[t.endStopName] = (exit[t.endStopName] || 0) + 1;
      });

      const topBoarding = Object.entries(boarding).sort((a, b) => b[1] - a[1]).slice(0, 20);
      const topExit = Object.entries(exit).sort((a, b) => b[1] - a[1]).slice(0, 20);
      return { topBoardingStops: topBoarding, topExitStops: topExit };
    },
    get_all_time_route_stats: async () => {
      const trips = await db.collection('trips')
        .where('userId', '==', userId)
        .where('endTime', '!=', null)
        .select('route')
        .get();

      const routes = {};
      trips.docs.forEach((d) => {
        const r = d.data().route;
        if (r) routes[r] = (routes[r] || 0) + 1;
      });
      return Object.entries(routes).sort((a, b) => b[1] - a[1]);
    },
    get_monthly_trip_counts: async () => {
      const trips = await db.collection('trips')
        .where('userId', '==', userId)
        .where('endTime', '!=', null)
        .select('endTime')
        .get();

      const months = {};
      trips.docs.forEach((d) => {
        const ts = d.data().endTime;
        const date = ts.toDate ? ts.toDate() : new Date(ts);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        months[key] = (months[key] || 0) + 1;
      });
      return months;
    },
    get_day_of_week_stats: async () => {
      const trips = await db.collection('trips')
        .where('userId', '==', userId)
        .where('endTime', '!=', null)
        .select('startTime')
        .get();

      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const days = {};
      trips.docs.forEach((d) => {
        const ts = d.data().startTime;
        if (!ts) return;
        const date = ts.toDate ? ts.toDate() : new Date(ts);
        const day = dayNames[date.getDay()];
        days[day] = (days[day] || 0) + 1;
      });
      return days;
    },
  };

  return await retryWithBackoff(async () => {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      tools: tools,
    });

    const chat = model.startChat({
      history: [],
    });

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
    const introPrompt = `You are a transit stats assistant for TransitStats.
Answer the user's question using their personal transit data below.
Be concise and friendly. Keep the response under 300 characters for SMS.

You have access to the most recent 200 trips spanning ${stats.windowStart || '?'} to ${stats.windowEnd || today}:
- Window size (NOT a date-filtered count): ${stats.total} trips
- Top 5 routes in window: ${JSON.stringify(stats.routeStats.slice(0, 5))}
- Top stop pairs: ${JSON.stringify(stats.pairStats.slice(0, 5))}
- Trips by day of week in window: ${JSON.stringify(stats.dayOfWeek || {})}
- Daily trip counts (YYYY-MM-DD): ${JSON.stringify(stats.dailyCounts || {})}
- Stops visited recently: ${stats.allStops?.join(', ')}

IMPORTANT:
- "Window size" is NOT the answer to any date-scoped question. For "last month", "this year", or any specific period, sum the relevant entries from dailyCounts, or call get_monthly_trip_counts.
- If the question asks about dates outside ${stats.windowStart || '?'}–${stats.windowEnd || today}, or asks for all-time stats, CALL the appropriate tool. NEVER guess!

Today's date: ${today}
Question: "${question}"`;

    let result = await chat.sendMessage(introPrompt);
    let response = result.response;

    // Handle tool calls in a loop (up to 3 levels deep)
    for (let i = 0; i < 3; i++) {
      const calls = response.functionCalls();
      if (!calls || calls.length === 0) break;

      const results = await Promise.all(calls.map(async (call) => {
        const executor = toolExecutors[call.name];
        if (!executor) return { name: call.name, response: { error: 'Tool not found' } };
        const data = await executor(call.args);
        return { name: call.name, response: { content: data } };
      }));

      result = await chat.sendMessage(results.map((r) => ({ functionResponse: r })));
      response = result.response;
    }

    return response.text().trim();
  }).catch((err) => {
    console.error('Gemini Tooling Error:', err);
    return 'Sorry, I had trouble searching your data. Try again?';
  });
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
    - Route: Extract ONLY the route identifier explicitly mentioned (e.g., "504", "Line 1", "510a").
      Routes are typically 1-3 digits or "Line X". Never infer or guess a route —
      if none is clearly stated, return null.
    - Stop ID: A number explicitly labeled as a stop ("stop 815", "from stop 11986") in the message.
      If ambiguous, prefer stop_name over stop_id. Never put a route number in stop_id.
    - Stop Name: Extract the full location name.
    - Ignore conversational text: "Just boarded", "I'm on", "taking", etc.
    - Sentiment: Determine if POSITIVE, NEGATIVE, or NEUTRAL.
    - Tags: Extract 1-3 keyword tags (e.g., "crowded", "delayed", "clean").

    Examples:
    - "Just boarded Route 1 NB" -> intent: "START_TRIP", route: "1", direction: "Northbound"
    - "Packed 504 from King" -> intent: "START_TRIP", route: "504", tags: ["crowded"]
    - "How many trips have I taken in total ever?" -> intent: "QUERY", question: "How many trips have I taken in total ever?"
    - "How many trips have I taken in 2026 so far?" -> intent: "QUERY", question: "How many trips have I taken in 2026 so far?"
    - "LMK the number of trips I've taken in the last month" -> intent: "QUERY", question: "LMK the number of trips I've taken in the last month"
    - "What's my most used route?" -> intent: "QUERY", question: "What's my most used route?"
    - "Tell me my stats" -> intent: "QUERY", question: "Tell me my stats"

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
