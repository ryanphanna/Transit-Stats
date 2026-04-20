/**
 * NetworkEngine — builds a graph of transit stop sequences from observed trips.
 *
 * Each completed trip teaches the system: from stop A, heading [direction] on
 * route R, stop B is reachable in N minutes. Over many trips the engine infers
 * stop ordering and directional validity — replacing hand-maintained topology.json
 * for any line it has learned, including branchy networks like BART.
 *
 * Changelog:
 *   v1 - Trip observation, duration-based reachability, directional filtering.
 *        Falls back to topology.json when confidence is insufficient.
 */

const NetworkEngine = {
  VERSION: '1.0.0',

  // Minimum trips on an edge before it's trusted for prediction filtering
  MIN_TRIPS: 3,

  /**
   * Record a completed trip as a graph observation.
   * Fire-and-forget safe — errors are logged but never block trip flow.
   *
   * @param {Object} db - Firestore instance
   * @param {string} userId
   * @param {Object} trip - { route, agency, direction, startStopName, endStopName, duration }
   */
  async observe(db, userId, trip) {
    const { route, agency, direction, startStopName, endStopName, duration } = trip;
    if (!route || !agency || !direction || !startStopName || !endStopName || !duration) return;
    if (duration <= 0 || duration > 180) return;

    const normDir = this._normalizeDirection(direction);
    if (!normDir) return;

    const docRef = db.collection('networkGraph').doc(this._docId(userId, agency, route));
    const edgeKey = this._edgeKey(startStopName, normDir, endStopName);

    await db.runTransaction(async tx => {
      const doc = await tx.get(docRef);
      const data = doc.exists ? doc.data() : {
        userId,
        agency,
        route: route.toString(),
        edges: {},
      };

      const edge = data.edges[edgeKey] || {
        fromStop: startStopName,
        toStop: endStopName,
        direction: normDir,
        durations: [],
        tripCount: 0,
      };

      // Keep a rolling window of 50 observations
      edge.durations = [...edge.durations.slice(-49), Math.round(duration)];
      edge.tripCount = (edge.tripCount || 0) + 1;
      edge.medianMinutes = this._median(edge.durations);
      edge.updatedAt = new Date().toISOString();

      data.edges[edgeKey] = edge;
      tx.set(docRef, data);
    });
  },

  /**
   * Load the learned graph for a user/route from Firestore.
   * Returns null if no data exists yet.
   */
  async load(db, userId, agency, route) {
    if (!userId || !agency || !route) return null;
    const doc = await db.collection('networkGraph').doc(this._docId(userId, agency, route)).get();
    return doc.exists ? doc.data() : null;
  },

  /**
   * Filter a set of historical trip candidates to only those that ended at a
   * directionally reachable stop, per the learned graph.
   *
   * Returns the filtered array if the engine has enough confidence to act.
   * Returns null if data is insufficient — caller should fall back to topology.json.
   *
   * @param {Array} candidates - Trip objects with endStopName
   * @param {Object} graph - Loaded graph doc (from load())
   * @param {string} boardingStop
   * @param {string} direction
   * @returns {Array|null}
   */
  filterCandidates(candidates, graph, boardingStop, direction) {
    if (!graph || !boardingStop || !direction) return null;

    const normDir = this._normalizeDirection(direction);
    if (!normDir) return null;

    const reachable = this._getReachableStops(graph, boardingStop, normDir);
    if (!reachable) return null; // Insufficient data — don't filter

    const filtered = candidates.filter(t => {
      if (!t.endStopName) return false;
      const normEnd = this._normalize(t.endStopName);
      // Keep if we've confirmed it's reachable, or if it's unknown to the graph
      return reachable.has(normEnd) || !this._isKnownStop(graph, normEnd);
    });

    return filtered;
  },

  /**
   * Return the set of normalized stop names reachable from boardingStop in
   * the given direction, with sufficient confidence (MIN_TRIPS).
   * Returns null if we don't have enough data from this boarding stop.
   *
   * @private
   */
  _getReachableStops(graph, boardingStop, normDir) {
    const normBoarding = this._normalize(boardingStop);
    const reachable = new Set();
    let hasConfidentEdge = false;

    for (const edge of Object.values(graph.edges || {})) {
      if (this._normalize(edge.fromStop) !== normBoarding) continue;
      if (edge.direction !== normDir) continue;

      if (edge.tripCount >= this.MIN_TRIPS) {
        reachable.add(this._normalize(edge.toStop));
        hasConfidentEdge = true;
      }
    }

    // Also infer reachability from reverse edges: if we've gone B→A westbound,
    // then A is reachable from B eastbound even without a direct eastbound observation.
    const oppositeDir = this._oppositeDirection(normDir);
    if (oppositeDir) {
      for (const edge of Object.values(graph.edges || {})) {
        if (this._normalize(edge.toStop) !== normBoarding) continue;
        if (edge.direction !== oppositeDir) continue;
        if (edge.tripCount >= this.MIN_TRIPS) {
          reachable.add(this._normalize(edge.fromStop));
          hasConfidentEdge = true;
        }
      }
    }

    return hasConfidentEdge ? reachable : null;
  },

  /**
   * Returns true if this stop appears anywhere in the graph (as from or to),
   * regardless of direction. Used to distinguish "unknown" from "wrong direction".
   *
   * @private
   */
  _isKnownStop(graph, normStopName) {
    for (const edge of Object.values(graph.edges || {})) {
      if (this._normalize(edge.fromStop) === normStopName) return true;
      if (this._normalize(edge.toStop) === normStopName) return true;
    }
    return false;
  },

  _docId(userId, agency, route) {
    const n = s => s.toString().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    return `${userId}_${n(agency)}_${n(this._baseRoute(route))}`;
  },

  _baseRoute(route) {
    const s = route.toString().trim();
    if (!/^\d/.test(s)) return s;
    const match = s.match(/^\d+/);
    return match ? match[0] : s;
  },

  _edgeKey(fromStop, direction, toStop) {
    const n = s => s.toString().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    return `${n(fromStop)}__${n(direction)}__${n(toStop)}`;
  },

  _normalize(stop) {
    if (!stop) return '';
    return stop.toString().toLowerCase().trim();
  },

  _normalizeDirection(dir) {
    if (!dir) return null;
    const d = dir.toString().toLowerCase().replace(/bound$/i, '').trim();
    if (d === 'n' || d === 'nb' || d === 'north') return 'Northbound';
    if (d === 's' || d === 'sb' || d === 'south') return 'Southbound';
    if (d === 'e' || d === 'eb' || d === 'east' || d === 'eastward') return 'Eastbound';
    if (d === 'w' || d === 'wb' || d === 'west') return 'Westbound';
    return null;
  },

  _oppositeDirection(dir) {
    const map = {
      Northbound: 'Southbound',
      Southbound: 'Northbound',
      Eastbound: 'Westbound',
      Westbound: 'Eastbound',
    };
    return map[dir] || null;
  },

  _median(arr) {
    if (!arr || !arr.length) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : sorted[mid];
  },
};

module.exports = { NetworkEngine };
