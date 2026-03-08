/**
 * TransitStats Prediction Engine
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
 */

export const PredictionEngine = {
    VERSION: 3,

    CONFIG: {
        TIME_SIGMA_HOURS: 1.5,
        DECAY_HALFLIFE_DAYS: 20,
        SEQUENCE_WINDOW_HOURS: 3,
        SEQUENCE_BOOST: 1.5,
    },

    /**
     * Stops library used for name canonicalization. Set this after loading stops:
     *   PredictionEngine.stopsLibrary = window.stopsLibrary;
     * Each entry: { name: string, aliases: string[] }
     */
    stopsLibrary: [],

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
            ? history.filter(t => this._isValidTrip(t) && this._stopMatch(t.startStopName, stopName))
            : history.filter(t => this._isValidTrip(t));

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
            // Group by route family (strip variant letters/suffixes) so 510, 510a, 510b
            // pool their votes together rather than splitting the signal.
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
            // Track weight per specific route variant to pick the most likely one
            const routeKey = trip.route.toString().trim();
            votes[key].specificRoutes[routeKey] = (votes[key].specificRoutes[routeKey] || 0) + weight;
        }

        if (totalWeight === 0) return null;

        const sorted = Object.values(votes).sort((a, b) => b.weight - a.weight);
        const top = sorted[0];

        // Return the most likely specific variant within the winning family
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
            this._normalizeDirection(prediction.direction) === this._normalizeDirection(actualTrip.direction)
        );
        const isHit = routeMatch && directionMatch;

        const isPartialHit = !isHit && prediction && directionMatch &&
            baseRoute(prediction.route) === baseRoute(actualTrip.route) &&
            baseRoute(prediction.route) !== '';

        const actualLabel = actualTrip.route +
            (actualTrip.direction ? ' ' + actualTrip.direction : '') +
            ' from ' + (actualTrip.startStopName || actualTrip.startStop);
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

    /**
     * Extract the base route number from a numeric variant like "510a", "510b", "510 Shuttle".
     * Only strips suffixes when the route starts with a digit, so numeric routes pool correctly
     * ("510a" → "510", "52g" → "52") while word-based routes like "Line 1" are left as-is
     * rather than collapsing to an empty string.
     */
    _baseRoute: function (route) {
        const s = route.toString().trim();
        return /^\d/.test(s) ? s.replace(/[a-zA-Z]+(\s.*)?$/, '').trim() : s;
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
     * Resolve a stop name to its canonical form using the stops library.
     * Falls back to lowercased input if not found in the library.
     */
    /**
     * Returns false for trips with obviously malformed data (bad SMS parses, sentence-as-stop-name, etc.)
     * These are excluded from the candidate pool so they don't corrupt vote weights.
     */
    _isValidTrip: function (trip) {
        const stop = trip.startStopName || trip.startStop;
        const route = trip.route;
        if (!stop || !route) return false;

        // Stop name looks like a sentence fragment from a failed SMS parse
        const stopStr = stop.toString();
        if (stopStr.length > 60) return false;
        const sentenceWords = /\b(i'm|i am|just|boarded|headed|northbound|southbound|eastbound|westbound)\b/i;
        if (sentenceWords.test(stopStr)) return false;

        // Route looks like a partial word with no digits (e.g. "St", "Station", "Park")
        const routeStr = route.toString().trim();
        if (routeStr.length <= 4 && !/\d/.test(routeStr) && !/^line\s*\d/i.test(routeStr)) return false;

        return true;
    },

    _canonicalizeStop: function (name) {
        if (!name) return null;
        const lower = name.trim().toLowerCase();
        if (this.stopsLibrary && this.stopsLibrary.length > 0) {
            const match = this.stopsLibrary.find(s => {
                const candidates = [s.name, ...(s.aliases || [])];
                return candidates.some(c => c.trim().toLowerCase() === lower);
            });
            if (match) return match.name.toLowerCase();
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
        // Cross weekday/weekend boundary is a strong mismatch
        if (nowIsWeekend !== tripIsWeekend) return 0.1;
        if (nowIsWeekend) {
            // Both weekend: Sat vs Sun is close
            return 0.7;
        }
        // Both weekdays (Mon=1…Fri=5): closer days score higher
        const dist = Math.abs(nowDay - tripDay); // 1–4
        return 1.0 - dist * 0.15; // 1 apart → 0.85, 2 → 0.70, 3 → 0.55, 4 → 0.40
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

if (typeof window !== 'undefined') {
    window.PredictionEngine = PredictionEngine;
}
