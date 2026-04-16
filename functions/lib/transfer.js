/**
 * TransferEngine — learns whether two consecutive trips are a journey transfer
 * or two separate trips, based on historical journey patterns.
 *
 * Changelog:
 *   v1 - Confidence scoring from historical transfers. Signals: stop pair match,
 *        route pair match, gap time vs historical average, time-of-day similarity.
 *        Cold start fallback: 15-minute hard limit when no history exists.
 */

const TransferEngine = {
  VERSION: '1.0.0',

  CONFIDENCE_THRESHOLD: 0.55, // Minimum confidence to auto-link

  /**
   * Extract historical transfer records from a set of completed trips.
   * Finds consecutive pairs within journeys (shared journeyId) and
   * returns the features of each real transfer.
   *
   * @param {Array} trips - Completed trips with journeyId, endTime, startTime, etc.
   * @returns {Array} Transfer records: { routeA, routeB, endStop, startStop, gap, hour, dayOfWeek }
   */
  extractTransfers(trips) {
    const journeys = {};
    for (const trip of trips) {
      if (!trip.journeyId || !trip.endTime || !trip.startTime) continue;
      if (!journeys[trip.journeyId]) journeys[trip.journeyId] = [];
      journeys[trip.journeyId].push(trip);
    }

    const transfers = [];
    for (const journeyTrips of Object.values(journeys)) {
      if (journeyTrips.length < 2) continue;

      journeyTrips.sort((a, b) => {
        const ta = a.startTime?.toDate ? a.startTime.toDate() : new Date(a.startTime);
        const tb = b.startTime?.toDate ? b.startTime.toDate() : new Date(b.startTime);
        return ta - tb;
      });

      for (let i = 0; i < journeyTrips.length - 1; i++) {
        const prev = journeyTrips[i];
        const next = journeyTrips[i + 1];

        if (!prev.endTime || !next.startTime || !prev.endStopName || !next.startStopName) continue;

        const prevEnd = prev.endTime?.toDate ? prev.endTime.toDate() : new Date(prev.endTime);
        const nextStart = next.startTime?.toDate ? next.startTime.toDate() : new Date(next.startTime);
        const gap = (nextStart - prevEnd) / 60000;

        if (gap < 0 || gap > 120) continue;

        transfers.push({
          routeA: prev.route?.toString(),
          routeB: next.route?.toString(),
          endStop: prev.endStopName,
          startStop: next.startStopName,
          gap,
          hour: nextStart.getHours(),
          dayOfWeek: nextStart.getDay(),
        });
      }
    }

    return transfers;
  },

  /**
   * Score whether a candidate (prevTrip → nextTrip) is a journey transfer.
   *
   * @param {Object} prevTrip - The trip that just ended
   * @param {Object} nextTrip - The trip that just started
   * @param {Array} history - Recent completed trips to learn from (ideally 50+)
   * @returns {number} Confidence score 0–1
   */
  score(prevTrip, nextTrip, history) {
    if (!prevTrip.endTime || !nextTrip.startTime) return 0;

    const prevEnd = prevTrip.endTime?.toDate ? prevTrip.endTime.toDate() : new Date(prevTrip.endTime);
    const nextStart = nextTrip.startTime?.toDate ? nextTrip.startTime.toDate() : new Date(nextTrip.startTime);
    const gap = (nextStart - prevEnd) / 60000;

    // Hard limits
    if (gap < 0 || gap > 90) return 0;

    const prevEndStop = prevTrip.endStopName;
    const nextStartStop = nextTrip.startStopName || nextTrip.startStop;
    const routeA = prevTrip.route?.toString();
    const routeB = nextTrip.route?.toString();
    const hour = nextStart.getHours();

    const transfers = this.extractTransfers(history);

    // Cold start — no history to learn from
    if (transfers.length === 0) {
      return gap <= 15 ? 0.6 : 0;
    }

    // Stop pair matches
    const stopPairMatches = transfers.filter(t =>
      this._stopMatch(t.endStop, prevEndStop) &&
      this._stopMatch(t.startStop, nextStartStop)
    );

    // Route pair matches
    const routePairMatches = transfers.filter(t =>
      t.routeA === routeA && t.routeB === routeB
    );

    let confidence = 0;

    if (stopPairMatches.length > 0) {
      const gaps = stopPairMatches.map(t => t.gap);
      const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const maxGap = Math.max(...gaps);

      confidence += 0.4; // Stop pair has been a real transfer before

      if (gap <= avgGap * 1.5) confidence += 0.25; // Within typical range
      else if (gap <= maxGap * 1.2) confidence += 0.1; // Within extended range

      if (routePairMatches.length > 0) confidence += 0.2; // Route pair also matches

      // Time-of-day similarity
      const hourMatches = stopPairMatches.filter(t => Math.abs(t.hour - hour) <= 2);
      if (hourMatches.length > 0) confidence += 0.1;

    } else if (routePairMatches.length > 0) {
      // Route pair matches but not at the same stops
      const gaps = routePairMatches.map(t => t.gap);
      const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;

      confidence += 0.25;
      if (gap <= avgGap * 1.5) confidence += 0.15;

    } else {
      // No historical pattern — conservative
      if (gap <= 10) confidence = 0.5;
      else if (gap <= 20) confidence = 0.3;
      else confidence = 0;
    }

    return Math.min(confidence, 1.0);
  },

  /**
   * Normalize and compare two stop names.
   * Strips punctuation/spaces before comparing.
   */
  _stopMatch(a, b) {
    if (!a || !b) return false;
    const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    return normalize(a) === normalize(b);
  },
};

module.exports = { TransferEngine };
