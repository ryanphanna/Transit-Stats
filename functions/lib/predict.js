/**
 * TransitStats Prediction Engine (CommonJS)
 *
 * Changelog:
 *   v1 - Additive point scoring across 5 signals (location, sequence, time, day, frequency).
 *        Sequence matching broken (checked wrong field). Location dead without normalization.
 *        In practice only time + day + frequency were working.
 *   v2 - Stop-first filtering with multiplicative weighted voting.
 *        Each past trip votes for its (route, direction) pair with weight =
 *        recency × time_similarity × day_similarity. Sequence applies a flat
 *        boost when the last trip ended at the current stop. No location dependency.
 *   v3 - Stop canonicalization via stops library (aliases collapse variants to one canonical
 *        name). Day similarity is now distance-based within weekdays rather than flat 0.5.
 *        Trip validity filter excludes malformed SMS-parse trips from the candidate pool.
 *        Direction normalization on votes (nb/sb/eb/wb handled).
 */

const PredictionEngine = {
  VERSION: 3,

  CONFIG: {
    TIME_SIGMA_HOURS: 1.5,
    DECAY_HALFLIFE_DAYS: 20,
    SEQUENCE_WINDOW_HOURS: 3,
    SEQUENCE_BOOST: 1.5,
  },

  /**
   * Stops library used for name canonicalization.
   * Each entry: { name: string, aliases: string[] }
   */
  stopsLibrary: [],

  /**
   * Guess the next route given the current stop and time.
   * @param {Array} history - Completed trips (should exclude the trip being evaluated)
   * @param {Object} context - { stopName, time, routesAtStop? }
   *   routesAtStop: optional array of routeShortNames known to serve this stop (from GTFS stop→route
   *   mapping). When provided, candidates are hard-filtered to only routes in this set, which
   *   eliminates impossible predictions. Falls back to unfiltered if no candidates survive.
   * @returns {Object|null} { route, direction, stop, confidence, version }
   */
  guess: function (history, context) {
    if (!history || history.length === 0) return null;

    const now = context.time instanceof Date ? context.time : new Date(context.time);
    const stopName = context.stopName ? context.stopName.trim().toLowerCase() : null;

    let candidates = stopName
      ? history.filter(t => this._isValidTrip(t) && this._stopMatch(t.startStopName, stopName))
      : history.filter(t => this._isValidTrip(t));

    if (candidates.length === 0) return null;

    // Apply GTFS stop→route filter: remove candidates for routes that don't serve this stop.
    // Only applied when the mapping is present; falls back to unfiltered if no candidates survive
    // (guards against stale/incomplete GTFS data).
    if (context.routesAtStop && context.routesAtStop.length > 0) {
      const validFamilies = new Set(context.routesAtStop.map(r => this._baseRoute(r.toString())));
      const filtered = candidates.filter(t => validFamilies.has(this._baseRoute(t.route)));
      if (filtered.length > 0) candidates = filtered;
    }

    const lastTrip = this._getLastRecentTrip(history, now);
    const atTransferPoint = lastTrip && this._stopMatch(lastTrip.endStopName, stopName);

    const votes = {};
    let totalWeight = 0;

    for (const trip of candidates) {
      const tripTime = trip.startTime && trip.startTime.toDate
        ? trip.startTime.toDate()
        : new Date(trip.startTime);

      const normDir = this._normalizeDirection(trip.direction);
      // Group by route family so 510, 510a, 510b pool votes rather than splitting signal.
      const family = this._baseRoute(trip.route);
      const key = `${family}|${normDir || ''}`;
      const weight =
        this._recencyWeight(tripTime, now) *
        this._timeSimilarity(now, tripTime) *
        this._daySimilarity(now.getDay(), tripTime.getDay()) *
        (atTransferPoint ? this.CONFIG.SEQUENCE_BOOST : 1.0);

      if (!votes[key]) {
        votes[key] = {
          family,
          direction: normDir || null,
          stop: trip.startStopName,
          weight: 0,
          specificRoutes: {},
        };
      }
      votes[key].weight += weight;
      totalWeight += weight;
      const routeKey = trip.route.toString().trim();
      votes[key].specificRoutes[routeKey] = (votes[key].specificRoutes[routeKey] || 0) + weight;
    }

    if (totalWeight === 0) return null;

    const sorted = Object.values(votes).sort((a, b) => b.weight - a.weight);
    const top = sorted[0];

    const bestSpecific = Object.entries(top.specificRoutes)
      .sort((a, b) => b[1] - a[1])[0][0];

    return {
      route: bestSpecific,
      routeFamily: top.family,
      direction: top.direction,
      stop: top.stop,
      confidence: Math.round((top.weight / totalWeight) * 100),
      version: this.VERSION,
    };
  },

  /**
   * Predict the most likely exit stop given a known route and boarding stop.
   * @param {Array} history - Completed trips
   * @param {Object} context - { route, startStopName, direction, time, duration? }
   * @returns {Object|null} { stop, confidence, version }
   */
  guessEndStop: function (history, context) {
    if (!history || history.length === 0) return null;

    const now = context.time instanceof Date ? context.time : new Date(context.time);
    const routeFamily = this._baseRoute(context.route);
    const normDir = context.direction ? this._normalizeDirection(context.direction) : null;

    let candidates = history.filter(t => {
      if (!this._isValidTrip(t)) return false;
      if (!t.endStopName) return false;
      return this._baseRoute(t.route) === routeFamily &&
        this._stopMatch(t.startStopName, context.startStopName);
    });

    if (candidates.length === 0) return null;

    // Narrow by direction if known, fall back to all if no matches
    if (normDir) {
      const withDir = candidates.filter(t => {
        const tDir = this._normalizeDirection(t.direction);
        return !tDir || tDir === normDir;
      });
      if (withDir.length > 0) candidates = withDir;
    }

    const votes = {};
    let totalWeight = 0;

    for (const trip of candidates) {
      const tripTime = trip.startTime && trip.startTime.toDate
        ? trip.startTime.toDate()
        : new Date(trip.startTime);

      const weight =
        this._recencyWeight(tripTime, now) *
        this._timeSimilarity(now, tripTime) *
        this._daySimilarity(now.getDay(), tripTime.getDay()) *
        (context.duration && trip.duration ? this._durationSimilarity(context.duration, trip.duration) : 1.0);

      const key = this._canonicalizeStop(trip.endStopName);
      if (!votes[key]) votes[key] = { stop: trip.endStopName, weight: 0 };
      votes[key].weight += weight;
      totalWeight += weight;
    }

    if (totalWeight === 0) return null;

    const top = Object.values(votes).sort((a, b) => b.weight - a.weight)[0];
    return {
      stop: top.stop,
      confidence: Math.round((top.weight / totalWeight) * 100),
      version: this.VERSION,
    };
  },

  /**
   * Return the top N predicted exit stops, ranked by weight.
   * Same voting logic as guessEndStop but returns an array.
   * @param {Array} history - Completed trips
   * @param {Object} context - { route, startStopName, direction, time, duration? }
   * @param {number} topN - Number of predictions to return (default 3)
   * @returns {Array} Array of { stop, confidence, version }, highest confidence first
   */
  guessTopEndStops: function (history, context, topN = 3) {
    if (!history || history.length === 0) return [];

    const now = context.time instanceof Date ? context.time : new Date(context.time);
    const routeFamily = this._baseRoute(context.route);
    const normDir = context.direction ? this._normalizeDirection(context.direction) : null;

    let candidates = history.filter(t => {
      if (!this._isValidTrip(t)) return false;
      if (!t.endStopName) return false;
      return this._baseRoute(t.route) === routeFamily &&
        this._stopMatch(t.startStopName, context.startStopName);
    });

    if (candidates.length === 0) return [];

    if (normDir) {
      const withDir = candidates.filter(t => {
        const tDir = this._normalizeDirection(t.direction);
        return !tDir || tDir === normDir;
      });
      if (withDir.length > 0) candidates = withDir;
    }

    const votes = {};
    let totalWeight = 0;

    for (const trip of candidates) {
      const tripTime = trip.startTime && trip.startTime.toDate
        ? trip.startTime.toDate()
        : new Date(trip.startTime);

      const weight =
        this._recencyWeight(tripTime, now) *
        this._timeSimilarity(now, tripTime) *
        this._daySimilarity(now.getDay(), tripTime.getDay()) *
        (context.duration && trip.duration ? this._durationSimilarity(context.duration, trip.duration) : 1.0);

      const key = this._canonicalizeStop(trip.endStopName);
      if (!votes[key]) votes[key] = { stop: trip.endStopName, weight: 0 };
      votes[key].weight += weight;
      totalWeight += weight;
    }

    if (totalWeight === 0) return [];

    return Object.values(votes)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, topN)
      .map(v => ({
        stop: v.stop,
        confidence: Math.round((v.weight / totalWeight) * 100),
        version: this.VERSION,
      }));
  },

  /**
   * Extract the base route number from a numeric variant like "510a", "510b", "510 Shuttle".
   * Only strips suffixes when the route starts with a digit, so numeric routes pool correctly
   * ("510a" → "510", "52g" → "52") while word-based routes like "Line 1" are left as-is.
   */
  _baseRoute: function (route) {
    const s = route.toString().trim();
    // Only strip suffixes if it starts with a digit. 
    // This allows pooling "510a" and "510 Shuttle" into data for "510".
    if (!/^\d/.test(s)) return s;
    const match = s.match(/^\d+/);
    return match ? match[0] : s;
  },

  _normalizeDirection: function (dir) {
    if (!dir) return null;
    const d = dir.toString().toLowerCase().replace(/bound$/i, '').trim();
    if (d === 'n' || d === 'nb' || d === 'north') return 'Northbound';
    if (d === 's' || d === 'sb' || d === 'south') return 'Southbound';
    if (d === 'e' || d === 'eb' || d === 'east' || d === 'eastward') return 'Eastbound';
    if (d === 'w' || d === 'wb' || d === 'west') return 'Westbound';
    return dir.trim();
  },

  /**
   * Returns false for trips with obviously malformed data (bad SMS parses, sentence-as-stop-name, etc.)
   */
  _isValidTrip: function (trip) {
    const stop = trip.startStopName || trip.startStop;
    const route = trip.route;
    if (!stop || !route) return false;

    const stopStr = stop.toString();
    if (stopStr.length > 60) return false;
    const sentenceWords = /\b(i'm|i am|just|boarded|headed|northbound|southbound|eastbound|westbound)\b/i;
    if (sentenceWords.test(stopStr)) return false;

    const routeStr = route.toString().trim();
    if (routeStr.length <= 4 && !/\d/.test(routeStr) && !/^line\s*\d/i.test(routeStr)) return false;

    return true;
  },

  /**
   * Resolve a stop name to its canonical form using the stops library.
   */
  _canonicalizeStop: function (name) {
    if (!name) return null;
    const lower = name.trim().toLowerCase()
      .replace(/\s*[/&@]\s*/g, '/')
      .replace(/\s+at\s+/g, '/');
    if (this.stopsLibrary && this.stopsLibrary.length > 0) {
      const match = this.stopsLibrary.find(s => {
        const candidates = [s.name, ...(s.aliases || [])];
        return candidates.some(c => c.trim().toLowerCase()
          .replace(/\s*[/&@]\s*/g, '/')
          .replace(/\s+at\s+/g, '/') === lower);
      });
      if (match) return match.name.toLowerCase().replace(/\s*[/&@]\s*/g, '/').replace(/\s+at\s+/g, '/');
    }
    return lower;
  },

  _stopMatch: function (a, b) {
    if (!a || !b) return false;
    return this._canonicalizeStop(a) === this._canonicalizeStop(b);
  },

  _recencyWeight: function (tripTime, now) {
    const daysSince = (now - tripTime) / (1000 * 60 * 60 * 24);
    const lambda = Math.log(2) / this.CONFIG.DECAY_HALFLIFE_DAYS;
    return Math.exp(-lambda * daysSince);
  },

  _timeSimilarity: function (now, tripTime) {
    const nowHour = now.getHours() + now.getMinutes() / 60;
    const tripHour = tripTime.getHours() + tripTime.getMinutes() / 60;
    let diff = Math.abs(nowHour - tripHour);
    if (diff > 12) diff = 24 - diff;
    return Math.exp(-(diff ** 2) / (2 * this.CONFIG.TIME_SIGMA_HOURS ** 2));
  },

  _daySimilarity: function (nowDay, tripDay) {
    if (nowDay === tripDay) return 1.0;
    const isWeekend = d => d === 0 || d === 6;
    const nowIsWeekend = isWeekend(nowDay);
    const tripIsWeekend = isWeekend(tripDay);
    if (nowIsWeekend !== tripIsWeekend) return 0.1;
    if (nowIsWeekend) return 0.7;
    // Both weekdays: closer days score higher
    const dist = Math.abs(nowDay - tripDay); // 1–4
    return 1.0 - dist * 0.15;
  },

  _durationSimilarity: function (actualMinutes, pastMinutes) {
    const diff = Math.abs(actualMinutes - pastMinutes);
    return Math.exp(-(diff * diff) / (2 * 25)); // sigma = 5 minutes
  },

  _getLastRecentTrip: function (history, now) {
    return history.find(t => {
      if (!t.endTime) return false;
      const end = t.endTime.toDate ? t.endTime.toDate() : new Date(t.endTime);
      const hoursSince = (now - end) / (1000 * 60 * 60);
      return hoursSince > 0 && hoursSince < this.CONFIG.SEQUENCE_WINDOW_HOURS;
    });
  },
};

module.exports = { PredictionEngine };
