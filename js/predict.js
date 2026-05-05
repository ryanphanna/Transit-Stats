/**
 * TransitStats V2 - Prediction Engine
 * Ported from Legacy V3 with weighted voting, sequence boosting, and fuzzy matching.
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
     * Stops library for name canonicalization. 
     */
    stopsLibrary: [],
    _stopsIndex: new Map(),
    _normCache: new Map(),

    /**
     * Guess the next route given the current stop and time.
     * @param {Array} history - Completed trips (should exclude the trip being evaluated)
     * @param {Object} context - { stopName, time, routesAtStop? }
     *   routesAtStop: optional array of routeShortNames known to serve this stop (from GTFS
     *   stop→route mapping). When provided, candidates are hard-filtered to only routes in this
     *   set. Falls back to unfiltered if no candidates survive (guards against stale GTFS data).
     * @returns {Object|null} { route, direction, stop, confidence, version }
     */
    guess(history, context) {
        if (!history || history.length === 0) return null;

        const now = context.time instanceof Date ? context.time : new Date(context.time);
        const stopName = context.stopName ? context.stopName.trim().toLowerCase() : null;

        let candidates = stopName
            ? history.filter(t => this._isValidTrip(t) && this._stopMatch(t.startStopName || t.startStop, stopName))
            : history.filter(t => this._isValidTrip(t));

        if (candidates.length === 0) return null;

        // Apply GTFS stop→route filter: remove candidates for routes that don't serve this stop.
        if (context.routesAtStop && context.routesAtStop.length > 0) {
            const validFamilies = new Set(context.routesAtStop.map(r => this._baseRoute(r.toString())));
            const filtered = candidates.filter(t => validFamilies.has(this._baseRoute(t.route)));
            if (filtered.length > 0) candidates = filtered;
        }

        const lastTrip = this._getLastRecentTrip(history, now);
        // In V2, startStop and endStop are already normalized, but we still use _stopMatch for robustness (aliases)
        const atTransferPoint = lastTrip && this._stopMatch(lastTrip.endStop, stopName);

        const votes = {};
        let totalWeight = 0;

        for (const trip of candidates) {
            const tripTime = trip.startTime && trip.startTime.toDate
                ? trip.startTime.toDate()
                : new Date(trip.startTime);

            const normDir = this._normalizeDirection(trip.direction);
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
                    stop: trip.startStop,
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
     */
    guessEndStop(history, context) {
        if (!history || history.length === 0) return null;

        const now = context.time instanceof Date ? context.time : new Date(context.time);
        const routeFamily = this._baseRoute(context.route);
        const normDir = context.direction ? this._normalizeDirection(context.direction) : null;

        let candidates = history.filter(t => {
            if (!this._isValidTrip(t)) return false;
            // Trip must have a destination to be a candidate for end stop prediction
            if (!t.endStop && !t.endStopName) return false;
            return this._baseRoute(t.route) === routeFamily &&
                this._stopMatch(t.startStop || t.startStopName, context.startStopName);
        });

        if (candidates.length === 0) return null;

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

            const key = this._canonicalizeStop(trip.endStop || trip.endStopName);
            if (!votes[key]) votes[key] = { stop: trip.endStop || trip.endStopName, weight: 0 };
            votes[key].weight += weight;
            totalWeight += weight;
        }

        if (totalWeight === 0) return null;

        const top = Object.values(votes).sort((a, b) => b.weight - a.weight)[0];
        
        // Find average duration for this corridor to predict "Arrival Time"
        const durations = candidates.filter(t => this._stopMatch(t.endStop || t.endStopName, top.stop)).map(t => t.duration);
        const avgDuration = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

        return {
            stop: top.stop,
            avgDuration,
            confidence: Math.round((top.weight / totalWeight) * 100),
            version: this.VERSION,
        };
    },

    _isValidTrip(trip) {
        const stop = trip.startStop || trip.startStopName;
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

    _canonicalizeStop(name) {
        if (!name) return null;
        if (this._normCache.has(name)) return this._normCache.get(name);

        const norm = n => n.trim().toLowerCase()
            .replace(/\s*[\/&@]\s*/g, '/')
            .replace(/\s+at\s+/g, '/');

        const lower = norm(name);

        if (this._stopsIndex.size === 0 && this.stopsLibrary && this.stopsLibrary.length > 0) {
            for (const s of this.stopsLibrary) {
                const cName = norm(s.name);
                this._stopsIndex.set(cName, cName);
                if (s.aliases) {
                    s.aliases.forEach(a => this._stopsIndex.set(norm(a), cName));
                }
            }
        }
        const result = this._stopsIndex.get(lower) || lower;
        this._normCache.set(name, result);
        return result;
    },

    _stopMatch(a, b) {
        if (!a || !b) return false;
        return this._canonicalizeStop(a) === this._canonicalizeStop(b);
    },

    _recencyWeight(tripTime, now) {
        const daysSince = (now - tripTime) / (1000 * 60 * 60 * 24);
        const lambda = Math.log(2) / this.CONFIG.DECAY_HALFLIFE_DAYS;
        return Math.exp(-lambda * daysSince);
    },

    _timeSimilarity(now, tripTime) {
        const nowHour = now.getHours() + now.getMinutes() / 60;
        const tripHour = tripTime.getHours() + tripTime.getMinutes() / 60;
        let diff = Math.abs(nowHour - tripHour);
        if (diff > 12) diff = 24 - diff;
        return Math.exp(-(diff ** 2) / (2 * this.CONFIG.TIME_SIGMA_HOURS ** 2));
    },

    _daySimilarity(nowDay, tripDay) {
        if (nowDay === tripDay) return 1.0;
        const isWeekend = d => d === 0 || d === 6;
        const nowIsWeekend = isWeekend(nowDay);
        const tripIsWeekend = isWeekend(tripDay);
        if (nowIsWeekend !== tripIsWeekend) return 0.1;
        if (nowIsWeekend) return 0.7;
        const dist = Math.abs(nowDay - tripDay);
        return 1.0 - dist * 0.15;
    },

    _durationSimilarity(actualMinutes, pastMinutes) {
        const diff = Math.abs(actualMinutes - pastMinutes);
        return Math.exp(-(diff * diff) / (2 * 25)); // sigma = 5 minutes
    },

    _getLastRecentTrip(history, now) {
        return history.find(t => {
            if (!t.endTime) return false;
            const end = t.endTime.toDate ? t.endTime.toDate() : new Date(t.endTime);
            const hoursSince = (now - end) / (1000 * 60 * 60);
            return hoursSince > 0 && hoursSince < this.CONFIG.SEQUENCE_WINDOW_HOURS;
        });
    },

    _baseRoute(route) {
        const s = route.toString().trim();
        return /^\d/.test(s) ? s.replace(/[a-zA-Z]+(\s.*)?$/, '').trim() : s;
    },

    _normalizeDirection(input) {
        if (!input) return null;

        const upper = input.toString().trim().toUpperCase();

        // North/Northbound
        if (['N', 'NB', 'N/B', 'NORTH', 'NORTHBOUND', 'NORTHWARD'].includes(upper)) return 'Northbound';

        // South/Southbound
        if (['S', 'SB', 'S/B', 'SOUTH', 'SOUTHBOUND', 'SOUTHWARD'].includes(upper)) return 'Southbound';

        // East/Eastbound
        if (['E', 'EB', 'E/B', 'EAST', 'EASTBOUND', 'EASTWARD'].includes(upper)) return 'Eastbound';

        // West/Westbound
        if (['W', 'WB', 'W/B', 'WEST', 'WESTBOUND', 'WESTWARD'].includes(upper)) return 'Westbound';

        // Clockwise
        if (['CW', 'CLOCKWISE'].includes(upper)) return 'Clockwise';

        // Counterclockwise
        if (['CCW', 'COUNTERCLOCKWISE', 'ANTICLOCKWISE', 'ANTI-CLOCKWISE'].includes(upper)) return 'Counterclockwise';

        // Inbound
        if (['IB', 'IN', 'INBOUND'].includes(upper)) return 'Inbound';

        // Outbound
        if (['OB', 'OUT', 'OUTBOUND'].includes(upper)) return 'Outbound';

        // Return original if no match (e.g. specific destination name)
        return input.toString().trim();
    }
};
