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
 *   v1.1 - Route-stop index (routeStopIndex): which routes serve each stop.
 *          Transfer index (transferIndex): which route pairs connect at each stop.
 *          Both updated in observe() alongside the main graph.
 *   v2 - Dual-write: every observation also updates a global graph (keyed by
 *        agency+route, no userId). Stop-sequence facts are objective — a route's
 *        stops don't change per rider. Global graph cold-starts new users and
 *        feeds stop disambiguation without waiting for personal history.
 */

const NetworkEngine = {
  VERSION: '1.3.0',

  // Minimum trips on an edge before it's trusted for prediction filtering
  MIN_TRIPS: 3,

  /**
   * Record a completed trip as a graph observation.
   * Fire-and-forget safe — errors are logged but never block trip flow.
   *
   * @param {Object} db - Firestore instance
   * @param {string} userId
   * @param {Object} trip - { route, agency, direction, startStopName, endStopName, duration }
   * @param {string|null} prevRoute - Route of the preceding trip, if any (records a transfer)
   */
  async observe(db, userId, trip, prevRoute = null) {
    const { route, agency, direction, startStopName, endStopName, duration } = trip;
    if (!route || !agency || !direction || !startStopName || !endStopName || !duration) return;
    if (duration <= 0 || duration > 180) return;

    const normDir = this._normalizeDirection(direction);
    if (!normDir) return;

    const edgeKey = this._edgeKey(startStopName, normDir, endStopName);
    const hourKey = new Date().getHours().toString();

    const writeGraph = async (docRef, baseData) => {
      await db.runTransaction(async tx => {
        const doc = await tx.get(docRef);
        const data = doc.exists ? doc.data() : { ...baseData, edges: {} };

        const edge = data.edges[edgeKey] || {
          fromStop: startStopName,
          toStop: endStopName,
          direction: normDir,
          durations: [],
          durationsByHour: {},
          tripCount: 0,
        };

        const roundedDuration = Math.round(duration);
        edge.durations = [...(edge.durations || []).slice(-49), roundedDuration];
        edge.durationsByHour = edge.durationsByHour || {};
        const bucket = edge.durationsByHour[hourKey] || [];
        edge.durationsByHour[hourKey] = [...bucket.slice(-19), roundedDuration];
        edge.tripCount = (edge.tripCount || 0) + 1;
        edge.medianMinutes = this._median(edge.durations);
        edge.updatedAt = new Date().toISOString();

        data.edges[edgeKey] = edge;
        tx.set(docRef, data);
      });
    };

    await Promise.all([
      // Per-user graph — personal analytics and preference-based predictions
      writeGraph(
        db.collection('networkGraph').doc(this._docId(userId, agency, route)),
        { userId, agency, route: route.toString() }
      ),
      // Global graph — cold-start, stop disambiguation, shared topology
      writeGraph(
        db.collection('networkGraph').doc(this._globalDocId(agency, route)),
        { agency, route: route.toString(), global: true }
      ),
      // Route-stop index — which routes serve each stop
      this._writeRouteStopIndex(db, agency, startStopName, route),
      this._writeRouteStopIndex(db, agency, endStopName, route),
      // Transfer index — which route pairs connect at this boarding stop
      prevRoute ? this._writeTransferIndex(db, agency, startStopName, prevRoute, route) : Promise.resolve(),
    ]);
  },

  /**
   * Load the graph for a user/route. Falls back to the global graph when the
   * personal graph has fewer than MIN_TRIPS on any edge (cold-start).
   */
  async load(db, userId, agency, route) {
    if (!userId || !agency || !route) return null;
    const [personal, global] = await Promise.all([
      db.collection('networkGraph').doc(this._docId(userId, agency, route)).get(),
      db.collection('networkGraph').doc(this._globalDocId(agency, route)).get(),
    ]);

    const personalData = personal.exists ? personal.data() : null;
    const globalData = global.exists ? global.data() : null;

    // Use personal if it has confident edges, otherwise fall back to global
    if (personalData) {
      const hasConfident = Object.values(personalData.edges || {})
        .some(e => e.tripCount >= this.MIN_TRIPS);
      if (hasConfident) return personalData;
    }

    return globalData || personalData || null;
  },

  /**
   * Load only the global graph (agency-wide, no user context).
   */
  async loadGlobal(db, agency, route) {
    if (!agency || !route) return null;
    const doc = await db.collection('networkGraph').doc(this._globalDocId(agency, route)).get();
    return doc.exists ? doc.data() : null;
  },

  /**
   * Return the routes observed at a stop, with trip counts.
   * { [routeKey]: count } — higher count = more observed trips through this stop.
   *
   * @param {Object} db
   * @param {string} agency
   * @param {string} stopName
   * @returns {Object} Route→count map (empty if stop unknown)
   */
  async getRoutesAtStop(db, agency, stopName) {
    if (!agency || !stopName) return {};
    const key = `${this._key(agency)}_${this._key(stopName)}`;
    const doc = await db.collection('routeStopIndex').doc(key).get();
    return doc.exists ? (doc.data().routes || {}) : {};
  },

  /**
   * Return route-pair transfers observed at a stop, with counts.
   * { [fromRoute_to_toRoute]: count } — e.g. { '506_to_510': 3 }
   *
   * @param {Object} db
   * @param {string} agency
   * @param {string} stopName
   * @returns {Object} Transfer pair→count map (empty if stop unknown)
   */
  async getConnectionsAtStop(db, agency, stopName) {
    if (!agency || !stopName) return {};
    const key = `${this._key(agency)}_${this._key(stopName)}`;
    const doc = await db.collection('transferIndex').doc(key).get();
    return doc.exists ? (doc.data().connections || {}) : {};
  },

  /**
   * Return the original route labels for transfer pairs observed at a stop.
   * { [connKey]: toRouteLabel } — preserves original capitalization/spacing.
   * Complements getConnectionsAtStop() which returns only counts.
   */
  async getConnectionLabels(db, agency, stopName) {
    if (!agency || !stopName) return {};
    const key = `${this._key(agency)}_${this._key(stopName)}`;
    const doc = await db.collection('transferIndex').doc(key).get();
    return doc.exists ? (doc.data().toLabels || {}) : {};
  },

  /**
   * Return the median travel time for a specific start→end stop pair.
   * Uses the hour-specific bucket when ≥3 observations exist, otherwise
   * the edge's aggregate median. Returns null if the pair has no observations.
   *
   * More accurate than getMedianDuration() for anomaly detection because it
   * compares against the actual destination rather than all edges from the stop.
   *
   * @param {Object} graph - Loaded graph doc
   * @param {string} fromStop
   * @param {string} toStop
   * @param {number} [hour]
   * @returns {number|null}
   */
  getEdgeMedianDuration(graph, fromStop, toStop, hour = null) {
    if (!graph || !fromStop || !toStop) return null;
    const normFrom = this._normalize(fromStop);
    const normTo = this._normalize(toStop);
    for (const edge of Object.values(graph.edges || {})) {
      if (this._normalize(edge.fromStop) !== normFrom) continue;
      if (this._normalize(edge.toStop) !== normTo) continue;
      const hourKey = hour !== null ? hour.toString() : null;
      const hourBucket = hourKey && edge.durationsByHour?.[hourKey];
      if (hourBucket && hourBucket.length >= 3) {
        return this._median(hourBucket);
      }
      return edge.medianMinutes || null;
    }
    return null;
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

    const augGraph = this._withTransitiveEdges(graph);
    const reachable = this._getReachableStops(augGraph, boardingStop, normDir);
    if (!reachable) return null; // Insufficient data — don't filter

    const filtered = candidates.filter(t => {
      if (!t.endStopName) return false;
      const normEnd = this._normalize(t.endStopName);
      // Keep if we've confirmed it's reachable, or if it's unknown to the graph
      return reachable.has(normEnd) || !this._isKnownStop(augGraph, normEnd);
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
  _getReachableStops(graph, boardingStop, normDir, minTrips = this.MIN_TRIPS) {
    const normBoarding = this._normalize(boardingStop);
    const reachable = new Set();
    let hasConfidentEdge = false;

    for (const edge of Object.values(graph.edges || {})) {
      if (this._normalize(edge.fromStop) !== normBoarding) continue;
      if (edge.direction !== normDir) continue;

      if (edge.tripCount >= minTrips) {
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
        if (edge.tripCount >= minTrips) {
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

  /**
   * Return a boolean mask over `classes` indicating which end stops are
   * reachable from boardingStop in the given direction, per the learned graph.
   *
   * Returns null if the graph has insufficient data to filter — caller should
   * fall back to topology.json. Unknown stops (not seen in the graph at all)
   * are kept so the model can still predict new stops.
   *
   * @param {Object} graph - Loaded graph doc (from load())
   * @param {string[]} classes - End stop class labels from the ML model
   * @param {string} boardingStop
   * @param {string} direction
   * @returns {boolean[]|null}
   */
  getMask(graph, classes, boardingStop, direction, minTrips = 2) {
    if (!graph || !boardingStop || !direction) return null;
    const normDir = this._normalizeDirection(direction);
    if (!normDir) return null;
    const augGraph = this._withTransitiveEdges(graph);
    const reachable = this._getReachableStops(augGraph, boardingStop, normDir, minTrips);
    if (!reachable) return null;
    return classes.map(cls => {
      const norm = this._normalize(cls);
      return reachable.has(norm) || !this._isKnownStop(augGraph, norm);
    });
  },

  /**
   * Return the median travel time from a boarding stop on a specific route.
   * When `hour` is provided and the edge has ≥3 observations in that hour bucket,
   * uses the hour-specific durations instead of the aggregate. Falls back to the
   * aggregate when the bucket is sparse (cold-start).
   *
   * @param {Object} graph - Loaded graph doc
   * @param {string} boardingStop
   * @param {number} [hour] - Hour of day (0–23); uses aggregate if omitted
   * @returns {number|null} Median minutes
   */
  getMedianDuration(graph, boardingStop, hour = null) {
    if (!graph || !boardingStop) return null;
    const normBoarding = this._normalize(boardingStop);
    const durations = [];
    for (const edge of Object.values(graph.edges || {})) {
      if (this._normalize(edge.fromStop) !== normBoarding) continue;
      const hourKey = hour !== null ? hour.toString() : null;
      const hourBucket = hourKey && edge.durationsByHour?.[hourKey];
      if (hourBucket && hourBucket.length >= 3) {
        durations.push(this._median(hourBucket));
      } else if (edge.medianMinutes) {
        durations.push(edge.medianMinutes);
      }
    }
    return this._median(durations);
  },

  /**
   * Synthesize inferred A→C edges from A→B + B→C pairs in the same direction.
   * Only real (non-inferred) edges are used as inputs — no chaining of transitives.
   * Caps at one hop (2-edge chains) to avoid over-inference.
   *
   * @private
   */
  _getTransitiveEdges(graph) {
    const realEdges = Object.values(graph.edges || {}).filter(e => !e.inferred);

    // Build a lookup: normalized fromStop → edges starting there
    const byFromStop = {};
    for (const e of realEdges) {
      const key = this._normalize(e.fromStop);
      if (!byFromStop[key]) byFromStop[key] = [];
      byFromStop[key].push(e);
    }

    const inferred = [];
    for (const e1 of realEdges) {
      const midKey = this._normalize(e1.toStop);
      const continuations = byFromStop[midKey] || [];
      for (const e2 of continuations) {
        if (e1.direction !== e2.direction) continue;
        // Prevent A→B→A cycles
        if (this._normalize(e1.fromStop) === this._normalize(e2.toStop)) continue;

        inferred.push({
          fromStop: e1.fromStop,
          toStop: e2.toStop,
          direction: e1.direction,
          tripCount: Math.min(e1.tripCount || 0, e2.tripCount || 0),
          medianMinutes: (e1.medianMinutes != null && e2.medianMinutes != null)
            ? e1.medianMinutes + e2.medianMinutes
            : null,
          inferred: true,
        });
      }
    }

    return inferred;
  },

  /**
   * Return an augmented graph with inferred transitive edges merged in.
   * Real edges are never overwritten — inferred edges only fill gaps.
   *
   * @private
   */
  _withTransitiveEdges(graph) {
    if (!graph) return graph;
    const inferred = this._getTransitiveEdges(graph);
    const augmentedEdges = { ...graph.edges };
    for (const edge of inferred) {
      const key = this._edgeKey(edge.fromStop, edge.direction, edge.toStop);
      if (!augmentedEdges[key]) {
        augmentedEdges[key] = edge;
      }
    }
    return { ...graph, edges: augmentedEdges };
  },

  async _writeRouteStopIndex(db, agency, stopName, route) {
    if (!agency || !stopName || !route) return;
    const key = `${this._key(agency)}_${this._key(stopName)}`;
    const routeKey = this._key(route);
    const ref = db.collection('routeStopIndex').doc(key);
    await db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      const data = doc.exists ? doc.data() : { agency, stop: stopName, routes: {} };
      data.routes[routeKey] = (data.routes[routeKey] || 0) + 1;
      data.updatedAt = new Date().toISOString();
      tx.set(ref, data);
    });
  },

  async _writeTransferIndex(db, agency, stopName, fromRoute, toRoute) {
    if (!agency || !stopName || !fromRoute || !toRoute) return;
    const key = `${this._key(agency)}_${this._key(stopName)}`;
    const connKey = `${this._key(fromRoute)}_to_${this._key(toRoute)}`;
    const ref = db.collection('transferIndex').doc(key);
    await db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      const data = doc.exists ? doc.data() : { agency, stop: stopName, connections: {}, toLabels: {} };
      data.connections[connKey] = (data.connections[connKey] || 0) + 1;
      data.toLabels = data.toLabels || {};
      data.toLabels[connKey] = toRoute.toString();
      data.updatedAt = new Date().toISOString();
      tx.set(ref, data);
    });
  },

  _key(s) {
    return s.toString().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  },

  _docId(userId, agency, route) {
    const n = s => s.toString().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    return `${userId}_${n(agency)}_${n(this._baseRoute(route))}`;
  },

  _globalDocId(agency, route) {
    const n = s => s.toString().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    return `global_${n(agency)}_${n(this._baseRoute(route))}`;
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
