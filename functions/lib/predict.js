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
 *   topology filter - Post-inference filter for subway/LRT end stop predictions (Lines 1, 2,
 *        4, 5). Uses topology.json stop sequences to zero out directionally impossible
 *        candidates (e.g. boarding eastbound at Spadina → can't exit at Kipling). Line 1
 *        handled specially: U-shape means direction logic depends on which branch (Yonge vs
 *        University) the boarding stop is on, using Union as the turning point.
 */

let _topology = null;
try { _topology = require('./topology.json'); } catch (e) { /* topology filter disabled */ }

const { NetworkEngine } = require('./network');

const PredictionEngine = {
  VERSION: '3.2.0',

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
   * Learned network graph for the current trip's route/agency.
   * Set before calling guessEndStop / guessTopEndStops.
   * When set, used as a higher-priority filter than topology.json.
   */
  networkGraph: null,

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

    // Pre-filter: remove trips that ended at a topologically impossible stop.
    // Only applies when topology covers this route + boarding stop + direction.
    candidates = this._preFilterCandidatesByTopology(candidates, context.route, context.startStopName, context.direction);

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

    // Pre-filter: remove trips that ended at a topologically impossible stop.
    candidates = this._preFilterCandidatesByTopology(candidates, context.route, context.startStopName, context.direction);

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

    const sorted = Object.values(votes).sort((a, b) => b.weight - a.weight);
    return sorted.slice(0, topN).map(v => ({
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

  /**
   * Pre-filter historical trip candidates to only those that ended at a topologically valid stop.
   * Called before voting so the model never scores impossible destinations.
   * Falls back to the unfiltered array if topology doesn't cover this route/stop/direction.
   * @param {Array} candidates - Trip objects with endStopName
   * @param {string} route
   * @param {string} boardingStop
   * @param {string} direction
   * @returns {Array}
   */
  _preFilterCandidatesByTopology: function (candidates, route, boardingStop, direction) {
    if (!boardingStop || !direction) return candidates;

    // NetworkEngine takes priority over topology.json — it learns from real trips
    // and handles branchy networks (BART, etc.) without manual curation.
    if (this.networkGraph) {
      const filtered = NetworkEngine.filterCandidates(candidates, this.networkGraph, boardingStop, direction);
      if (filtered !== null) return filtered;
      // null means insufficient data — fall through to topology.json
    }

    if (!_topology) return candidates;

    const routeStr = this._baseRoute(route.toString());
    const line = this._topologyLine(routeStr);
    if (!line) return candidates; // Route not in topology — can't filter

    const normDir = this._normalizeDirection(direction);
    if (!normDir) return candidates;

    const boardingIdx = this._topologyStopIndex(line, this._canonicalizeStop(boardingStop) || boardingStop);
    if (boardingIdx === -1) return candidates; // Boarding stop not in topology — can't filter

    // Topology fully covers this route/stop/direction. Return filtered set even if empty —
    // empty means no valid history exists for this direction, which is correct (don't
    // bleed wrong-direction trips through when the user travels a new direction).
    let goingHigher;
    if (line.name === 'Yonge-University') {
      const unionIdx = this._topologyStopIndex(line, this._canonicalizeStop('Union') || 'Union');
      if (unionIdx === -1) return candidates;
      // Union is the branch pivot — either branch is valid from here, so topology can't
      // constrain direction. Fall back to unfiltered candidates.
      if (boardingIdx === unionIdx) return candidates;
      goingHigher = boardingIdx <= unionIdx ? normDir === 'Southbound' : normDir === 'Northbound';
    } else {
      goingHigher = normDir === 'Eastbound' || normDir === 'Northbound';
    }

    return candidates.filter(t => {
      const endIdx = this._topologyStopIndex(line, this._canonicalizeStop(t.endStopName) || t.endStopName);
      if (endIdx === -1) return true; // Unknown stop — keep
      return goingHigher ? endIdx > boardingIdx : endIdx < boardingIdx;
    });
  },

  /**
   * Filter predicted end stops to only those that are directionally valid per subway topology.
   * Only applies to linear lines (2, 4, 5). Line 1 excluded — U-shape.
   * Falls back to unfiltered array if topology doesn't cover this route/stop.
   * @param {Array} candidates - Array of { stop, weight, ... }
   * @param {string} route
   * @param {string} boardingStop
   * @param {string} direction
   * @returns {Array}
   */
  _applyTopologyFilter: function (candidates, route, boardingStop, direction) {
    if (!_topology || !boardingStop || !direction) return candidates;

    const routeStr = this._baseRoute(route.toString());

    const line = this._topologyLine(routeStr);
    if (!line) return candidates;

    const normDir = this._normalizeDirection(direction);
    if (!normDir) return candidates;

    const boardingIdx = this._topologyStopIndex(line, this._canonicalizeStop(boardingStop) || boardingStop);
    if (boardingIdx === -1) return candidates;

    // Line 1 is U-shaped: Finch(0)→Union(16)→VMC(35).
    // Direction meaning depends on which branch you're on.
    // Yonge branch (0–16): southbound = toward Union = higher index.
    // University branch (16–35): northbound = toward VMC = higher index.
    let goingHigher;
    if (line.name === 'Yonge-University') {
      const unionIdx = this._topologyStopIndex(line, this._canonicalizeStop('Union') || 'Union');
      if (unionIdx === -1) return candidates;
      // Union is the branch pivot — either branch is valid from here, so topology can't
      // constrain direction. Fall back to unfiltered candidates.
      if (boardingIdx === unionIdx) return candidates;
      if (boardingIdx < unionIdx) {
        // Yonge branch: southbound → higher (toward Union), northbound → lower (toward Finch)
        goingHigher = normDir === 'Southbound';
      } else {
        // University branch: northbound → higher (toward VMC), southbound → lower (toward Union)
        goingHigher = normDir === 'Northbound';
      }
    } else {
      goingHigher = normDir === 'Eastbound' || normDir === 'Northbound';
    }

    // Topology fully covers this route/stop/direction. Return filtered set even if empty.
    return candidates.filter(c => {
      const endIdx = this._topologyStopIndex(line, this._canonicalizeStop(c.stop) || c.stop);
      if (endIdx === -1) return true; // Unknown stop — keep (don't over-filter)
      return goingHigher ? endIdx > boardingIdx : endIdx < boardingIdx;
    });
  },

  /**
   * Resolve a route string to a topology line entry.
   * Checks the exact key first, then route_aliases on each line (case-insensitive).
   * Returns null if no match — filter silently skips, predictions still returned unfiltered.
   */
  _topologyLine: function (routeStr) {
    if (!_topology) return null;
    const lines = _topology.lines;
    // Exact key match
    if (lines[routeStr]) return lines[routeStr];
    // Alias match
    const lower = routeStr.toLowerCase();
    for (const line of Object.values(lines)) {
      const aliases = line.route_aliases || [];
      if (aliases.some(a => a.toLowerCase() === lower)) return line;
    }
    return null;
  },

  /**
   * Find the index of a stop name (or alias) within a topology line's stop sequence.
   * Returns -1 if not found.
   */
  _topologyStopIndex: function (line, stopName) {
    if (!stopName) return -1;
    const lower = stopName.trim().toLowerCase();
    for (let i = 0; i < line.stops.length; i++) {
      const canon = line.stops[i];
      if (canon.toLowerCase() === lower) return i;
      const aliases = (line.aliases && line.aliases[canon]) || [];
      if (aliases.some(a => a.toLowerCase() === lower)) return i;
    }
    return -1;
  },
};

module.exports = { PredictionEngine };
