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
 *   v3 - Route family grouping: 510, 510a, 510b, 510 Shuttle pool their votes
 *        into one bucket keyed by base route number. The most weight-heavy specific
 *        variant is returned, so predictions improve when service changes between
 *        variants (e.g. 510 → 510b shuttle) without resetting the signal.
 */

const PredictionEngine = {
  VERSION: 2,

  CONFIG: {
    TIME_SIGMA_HOURS: 1.5,
    DECAY_HALFLIFE_DAYS: 20,
    SEQUENCE_WINDOW_HOURS: 3,
    SEQUENCE_BOOST: 1.5,
  },

  /**
     * Guess the next route given the current stop and time.
     * @param {Array} history - Completed trips (should exclude the trip being evaluated)
     * @param {Object} context - { stopName, time }
     * @returns {Object|null} { route, direction, stop, confidence, version }
     */
  guess: function (history, context) {
    if (!history || history.length === 0) return null;

    const now = context.time instanceof Date ? context.time : new Date(context.time);
    const stopName = context.stopName ? context.stopName.trim().toLowerCase() : null;

    const candidates = stopName
      ? history.filter(t => this._stopMatch(t.startStopName, stopName))
      : history;

    if (candidates.length === 0) return null;

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
          direction: trip.direction || null,
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
     * Evaluate a prediction against an actual trip for silent accuracy logging.
     * @param {Array} history - Trip history before this trip started
     * @param {Object} actualTrip - The trip that actually happened
     * @returns {Object} { isHit, predicted, actual, confidence, version, timestamp }
     */
  evaluate: function (history, actualTrip) {
    const context = {
      stopName: actualTrip.startStopName,
      time: actualTrip.startTime && actualTrip.startTime.toDate
        ? actualTrip.startTime.toDate()
        : new Date(actualTrip.startTime),
    };

    const prediction = this.guess(history, context);

    const baseRoute = r => r.toString().replace(/[a-zA-Z]+(\s.*)?$/, '').trim();

    const routeMatch = prediction &&
            prediction.route.toString() === actualTrip.route.toString();
    const directionMatch = !prediction || (
      !prediction.direction ||
            !actualTrip.direction ||
            prediction.direction === actualTrip.direction
    );
    const isHit = routeMatch && directionMatch;

    const isPartialHit = !isHit && prediction && directionMatch &&
            baseRoute(prediction.route) === baseRoute(actualTrip.route) &&
            baseRoute(prediction.route) !== '';

    const actualLabel = actualTrip.route +
            (actualTrip.direction ? ' ' + actualTrip.direction : '') +
            ' from ' + actualTrip.startStopName;
    const predictedLabel = prediction
      ? prediction.route + (prediction.direction ? ' ' + prediction.direction : '') + ' from ' + prediction.stop
      : 'None';

    return {
      isHit: !!isHit,
      isPartialHit: !isHit && !!isPartialHit,
      predicted: predictedLabel,
      actual: actualLabel,
      confidence: prediction ? prediction.confidence : 0,
      version: this.VERSION,
      timestamp: new Date(),
    };
  },

  _baseRoute: function (route) {
    const s = route.toString().trim();
    return /^\d/.test(s) ? s.replace(/[a-zA-Z]+(\s.*)?$/, '').trim() : s;
  },

  _normalizeDirection: function (dir) {
    if (!dir) return null;
    const d = dir.toString().toLowerCase().replace(/bound$/i, '').trim();
    if (d === 'n' || d === 'north') return 'Northbound';
    if (d === 's' || d === 'south') return 'Southbound';
    if (d === 'e' || d === 'east') return 'Eastbound';
    if (d === 'w' || d === 'west') return 'Westbound';
    return dir.trim();
  },

  _stopMatch: function (a, b) {
    if (!a || !b) return false;
    return a.trim().toLowerCase() === b.trim().toLowerCase();
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
    if (isWeekend(nowDay) === isWeekend(tripDay)) return 0.5;
    return 0.1;
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
