import { describe, it, expect, beforeEach } from 'vitest';
import { PredictionEngine } from '../js/predict.js';

// Helper: create a mock trip with Firestore-style timestamps
function makeTrip({ route, direction, startStop, endStop, daysAgo, hour, duration } = {}) {
    const startTime = new Date();
    startTime.setDate(startTime.getDate() - (daysAgo ?? 1));
    startTime.setHours(hour ?? 9, 0, 0, 0);

    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + (duration ?? 20));

    return {
        route: route ?? '510',
        direction: direction ?? 'Northbound',
        startStopName: startStop ?? 'King Station',
        endStopName: endStop ?? 'Union Station',
        startTime: { toDate: () => startTime },
        endTime: { toDate: () => endTime },
        duration: duration ?? 20,
    };
}

function makeContext({ stop, daysAgo, hour } = {}) {
    const time = new Date();
    time.setDate(time.getDate() - (daysAgo ?? 0));
    time.setHours(hour ?? 9, 0, 0, 0);
    return { stopName: stop ?? 'King Station', time };
}

beforeEach(() => {
    // Reset stops library and index between tests
    PredictionEngine.stopsLibrary = [];
    PredictionEngine._stopsIndex = new Map();
});

// ---------------------------------------------------------------------------
// _baseRoute
// ---------------------------------------------------------------------------
describe('PredictionEngine._baseRoute', () => {
    it('strips letter suffix from numeric route', () => {
        expect(PredictionEngine._baseRoute('510a')).toBe('510');
        expect(PredictionEngine._baseRoute('510b')).toBe('510');
        expect(PredictionEngine._baseRoute('52g')).toBe('52');
    });

    it('leaves non-numeric routes unchanged', () => {
        expect(PredictionEngine._baseRoute('Line 1')).toBe('Line 1');
        expect(PredictionEngine._baseRoute('YRT 85')).toBe('YRT 85');
    });

    it('handles plain numeric routes', () => {
        expect(PredictionEngine._baseRoute('510')).toBe('510');
        expect(PredictionEngine._baseRoute('7')).toBe('7');
    });
});

// ---------------------------------------------------------------------------
// _normalizeDirection
// ---------------------------------------------------------------------------
describe('PredictionEngine._normalizeDirection', () => {
    it('normalizes shorthand north', () => {
        expect(PredictionEngine._normalizeDirection('N')).toBe('Northbound');
        expect(PredictionEngine._normalizeDirection('NB')).toBe('Northbound');
        expect(PredictionEngine._normalizeDirection('north')).toBe('Northbound');
        expect(PredictionEngine._normalizeDirection('Northbound')).toBe('Northbound');
    });

    it('normalizes south', () => {
        expect(PredictionEngine._normalizeDirection('S')).toBe('Southbound');
        expect(PredictionEngine._normalizeDirection('SB')).toBe('Southbound');
        expect(PredictionEngine._normalizeDirection('south')).toBe('Southbound');
    });

    it('normalizes east', () => {
        expect(PredictionEngine._normalizeDirection('E')).toBe('Eastbound');
        expect(PredictionEngine._normalizeDirection('EB')).toBe('Eastbound');
        expect(PredictionEngine._normalizeDirection('eastward')).toBe('Eastbound');
    });

    it('normalizes west', () => {
        expect(PredictionEngine._normalizeDirection('W')).toBe('Westbound');
        expect(PredictionEngine._normalizeDirection('WB')).toBe('Westbound');
    });

    it('returns null for null/undefined', () => {
        expect(PredictionEngine._normalizeDirection(null)).toBe(null);
        expect(PredictionEngine._normalizeDirection(undefined)).toBe(null);
    });

    it('returns original trimmed string for unknown values', () => {
        expect(PredictionEngine._normalizeDirection('Loop')).toBe('Loop');
    });
});

// ---------------------------------------------------------------------------
// _isValidTrip
// ---------------------------------------------------------------------------
describe('PredictionEngine._isValidTrip', () => {
    it('accepts a normal trip', () => {
        expect(PredictionEngine._isValidTrip(makeTrip())).toBe(true);
    });

    it('rejects a trip with no stop', () => {
        expect(PredictionEngine._isValidTrip({ route: '510', startStopName: null })).toBe(false);
    });

    it('rejects a trip with no route', () => {
        expect(PredictionEngine._isValidTrip({ route: null, startStopName: 'King Station' })).toBe(false);
    });

    it('rejects a stop name that looks like a sentence', () => {
        const trip = makeTrip({ startStop: "I'm just headed northbound on King" });
        expect(PredictionEngine._isValidTrip(trip)).toBe(false);
    });

    it('rejects a stop name longer than 60 characters', () => {
        const trip = makeTrip({ startStop: 'A'.repeat(61) });
        expect(PredictionEngine._isValidTrip(trip)).toBe(false);
    });

    it('rejects a route that looks like a word with no digits', () => {
        expect(PredictionEngine._isValidTrip({ route: 'St', startStopName: 'King' })).toBe(false);
        expect(PredictionEngine._isValidTrip({ route: 'Park', startStopName: 'King' })).toBe(false);
    });

    it('accepts Line-style routes', () => {
        expect(PredictionEngine._isValidTrip({ route: 'Line 1', startStopName: 'Bloor' })).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// _daySimilarity
// ---------------------------------------------------------------------------
describe('PredictionEngine._daySimilarity', () => {
    it('returns 1.0 for same day', () => {
        expect(PredictionEngine._daySimilarity(1, 1)).toBe(1.0);
    });

    it('returns low score across weekday/weekend boundary', () => {
        expect(PredictionEngine._daySimilarity(1, 0)).toBe(0.1); // Mon vs Sun
        expect(PredictionEngine._daySimilarity(5, 6)).toBe(0.1); // Fri vs Sat
    });

    it('returns 0.7 for Sat vs Sun', () => {
        expect(PredictionEngine._daySimilarity(6, 0)).toBe(0.7);
        expect(PredictionEngine._daySimilarity(0, 6)).toBe(0.7);
    });

    it('scores adjacent weekdays higher than distant ones', () => {
        const adjacent = PredictionEngine._daySimilarity(1, 2); // Mon vs Tue
        const distant = PredictionEngine._daySimilarity(1, 5);  // Mon vs Fri
        expect(adjacent).toBeGreaterThan(distant);
    });
});

// ---------------------------------------------------------------------------
// _timeSimilarity
// ---------------------------------------------------------------------------
describe('PredictionEngine._timeSimilarity', () => {
    it('returns 1.0 for same time', () => {
        const t = new Date('2026-01-01T09:00:00');
        expect(PredictionEngine._timeSimilarity(t, t)).toBeCloseTo(1.0);
    });

    it('returns lower score for larger time gap', () => {
        const now = new Date('2026-01-01T09:00:00');
        const close = new Date('2026-01-01T09:30:00');
        const far = new Date('2026-01-01T12:00:00');
        expect(PredictionEngine._timeSimilarity(now, close))
            .toBeGreaterThan(PredictionEngine._timeSimilarity(now, far));
    });

    it('wraps around midnight correctly', () => {
        const midnight = new Date('2026-01-01T00:00:00');
        const almostMidnight = new Date('2026-01-01T23:30:00');
        const score = PredictionEngine._timeSimilarity(midnight, almostMidnight);
        expect(score).toBeGreaterThan(0.5); // 30 min apart wrapping around = close
    });
});

// ---------------------------------------------------------------------------
// _durationSimilarity
// ---------------------------------------------------------------------------
describe('PredictionEngine._durationSimilarity', () => {
    it('returns 1.0 for equal durations', () => {
        expect(PredictionEngine._durationSimilarity(20, 20)).toBeCloseTo(1.0);
    });

    it('returns lower score for larger duration difference', () => {
        const close = PredictionEngine._durationSimilarity(20, 22);
        const far = PredictionEngine._durationSimilarity(20, 40);
        expect(close).toBeGreaterThan(far);
    });
});

// ---------------------------------------------------------------------------
// guess
// ---------------------------------------------------------------------------
describe('PredictionEngine.guess', () => {
    it('returns null for empty history', () => {
        expect(PredictionEngine.guess([], makeContext())).toBeNull();
    });

    it('returns null for null history', () => {
        expect(PredictionEngine.guess(null, makeContext())).toBeNull();
    });

    it('predicts the only route in history', () => {
        const history = [makeTrip({ route: '510', daysAgo: 1 })];
        const result = PredictionEngine.guess(history, makeContext());
        expect(result).not.toBeNull();
        expect(result.route).toBe('510');
    });

    it('predicts the most frequent route', () => {
        const history = [
            makeTrip({ route: '510', daysAgo: 1 }),
            makeTrip({ route: '510', daysAgo: 2 }),
            makeTrip({ route: '510', daysAgo: 3 }),
            makeTrip({ route: '29', daysAgo: 4 }),
        ];
        const result = PredictionEngine.guess(history, makeContext());
        expect(result.route).toBe('510');
    });

    it('pools route variants (510a and 510b → 510 family)', () => {
        const history = [
            makeTrip({ route: '510a', daysAgo: 1 }),
            makeTrip({ route: '510b', daysAgo: 2 }),
            makeTrip({ route: '29', daysAgo: 3 }),
        ];
        const result = PredictionEngine.guess(history, makeContext());
        expect(result.routeFamily).toBe('510');
    });

    it('includes confidence between 0 and 100', () => {
        const history = [makeTrip({ route: '510' }), makeTrip({ route: '29' })];
        const result = PredictionEngine.guess(history, makeContext());
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(100);
    });

    it('returns version number', () => {
        const history = [makeTrip()];
        const result = PredictionEngine.guess(history, makeContext());
        expect(result.version).toBe(3);
    });

    it('filters to matching stop when stopName is provided', () => {
        const history = [
            makeTrip({ route: '510', startStop: 'King Station' }),
            makeTrip({ route: '29', startStop: 'Queen Station' }),
        ];
        const result = PredictionEngine.guess(history, makeContext({ stop: 'King Station' }));
        expect(result.route).toBe('510');
    });

    it('returns null if no candidates match the stop', () => {
        const history = [makeTrip({ startStop: 'Bloor Station' })];
        const result = PredictionEngine.guess(history, makeContext({ stop: 'King Station' }));
        expect(result).toBeNull();
    });

    it('gives higher confidence to more recent trips', () => {
        const history = [
            makeTrip({ route: '510', daysAgo: 1 }),
            makeTrip({ route: '29', daysAgo: 60 }),
        ];
        const result = PredictionEngine.guess(history, makeContext());
        expect(result.route).toBe('510');
    });
});

// ---------------------------------------------------------------------------
// evaluate
// ---------------------------------------------------------------------------
describe('PredictionEngine.evaluate', () => {
    it('returns isHit true when route and direction match', () => {
        const history = [
            makeTrip({ route: '510', direction: 'Northbound', daysAgo: 1 }),
            makeTrip({ route: '510', direction: 'Northbound', daysAgo: 2 }),
        ];
        const actual = makeTrip({ route: '510', direction: 'Northbound', daysAgo: 0 });
        const result = PredictionEngine.evaluate(history, actual);
        expect(result.isHit).toBe(true);
        expect(result.isPartialHit).toBe(false);
    });

    it('returns isPartialHit when route family matches but variant differs', () => {
        const history = [
            makeTrip({ route: '510a', daysAgo: 1 }),
            makeTrip({ route: '510a', daysAgo: 2 }),
        ];
        const actual = makeTrip({ route: '510b', daysAgo: 0 });
        const result = PredictionEngine.evaluate(history, actual);
        // Same family (510) but different variant
        expect(result.isPartialHit).toBe(true);
        expect(result.isHit).toBe(false);
    });

    it('returns miss when prediction is wrong', () => {
        const history = [
            makeTrip({ route: '510', daysAgo: 1 }),
            makeTrip({ route: '510', daysAgo: 2 }),
        ];
        const actual = makeTrip({ route: '99', daysAgo: 0 });
        const result = PredictionEngine.evaluate(history, actual);
        expect(result.isHit).toBe(false);
        expect(result.isPartialHit).toBe(false);
    });

    it('returns miss with confidence 0 when no prediction possible', () => {
        const actual = makeTrip({ route: '510', startStop: 'Nowhere Station', daysAgo: 0 });
        const history = [makeTrip({ startStop: 'King Station', daysAgo: 1 })];
        const result = PredictionEngine.evaluate(history, actual);
        expect(result.isHit).toBe(false);
        expect(result.confidence).toBe(0);
    });

    it('result always includes required fields', () => {
        const history = [makeTrip({ daysAgo: 1 })];
        const actual = makeTrip({ daysAgo: 0 });
        const result = PredictionEngine.evaluate(history, actual);
        expect(result).toHaveProperty('isHit');
        expect(result).toHaveProperty('isPartialHit');
        expect(result).toHaveProperty('predicted');
        expect(result).toHaveProperty('actual');
        expect(result).toHaveProperty('confidence');
        expect(result).toHaveProperty('version');
        expect(result).toHaveProperty('timestamp');
    });
});

// ---------------------------------------------------------------------------
// guessEndStop
// ---------------------------------------------------------------------------
describe('PredictionEngine.guessEndStop', () => {
    it('returns null for empty history', () => {
        const ctx = { route: '510', startStopName: 'King Station', time: new Date() };
        expect(PredictionEngine.guessEndStop([], ctx)).toBeNull();
    });

    it('predicts the most common end stop for a route', () => {
        const history = [
            makeTrip({ route: '510', startStop: 'King Station', endStop: 'Union Station', daysAgo: 1 }),
            makeTrip({ route: '510', startStop: 'King Station', endStop: 'Union Station', daysAgo: 2 }),
            makeTrip({ route: '510', startStop: 'King Station', endStop: 'Spadina Station', daysAgo: 3 }),
        ];
        const ctx = { route: '510', startStopName: 'King Station', time: new Date() };
        const result = PredictionEngine.guessEndStop(history, ctx);
        expect(result).not.toBeNull();
        expect(result.stop).toBe('Union Station');
    });

    it('returns null if no trips match the route and start stop', () => {
        const history = [makeTrip({ route: '29', startStop: 'Dufferin Station' })];
        const ctx = { route: '510', startStopName: 'King Station', time: new Date() };
        expect(PredictionEngine.guessEndStop(history, ctx)).toBeNull();
    });

    it('narrows by direction when provided', () => {
        const history = [
            makeTrip({ route: '510', startStop: 'King Station', endStop: 'Union Station', direction: 'Southbound', daysAgo: 1 }),
            makeTrip({ route: '510', startStop: 'King Station', endStop: 'Spadina Station', direction: 'Northbound', daysAgo: 1 }),
        ];
        const ctx = { route: '510', startStopName: 'King Station', direction: 'Southbound', time: new Date() };
        const result = PredictionEngine.guessEndStop(history, ctx);
        expect(result.stop).toBe('Union Station');
    });

    it('includes confidence between 0 and 100', () => {
        const history = [makeTrip({ route: '510', startStop: 'King Station', endStop: 'Union Station' })];
        const ctx = { route: '510', startStopName: 'King Station', time: new Date() };
        const result = PredictionEngine.guessEndStop(history, ctx);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(100);
    });
});

// ---------------------------------------------------------------------------
// stop canonicalization
// ---------------------------------------------------------------------------
describe('PredictionEngine._canonicalizeStop', () => {
    it('lowercases and normalizes separators', () => {
        expect(PredictionEngine._canonicalizeStop('King & Queen')).toBe('king/queen');
        expect(PredictionEngine._canonicalizeStop('King at Queen')).toBe('king/queen');
        expect(PredictionEngine._canonicalizeStop('King / Queen')).toBe('king/queen');
    });

    it('returns null for null input', () => {
        expect(PredictionEngine._canonicalizeStop(null)).toBeNull();
    });

    it('resolves aliases via stops library', () => {
        PredictionEngine.stopsLibrary = [
            { name: 'King Station', aliases: ['King St Station', 'King'] }
        ];
        PredictionEngine._stopsIndex = new Map(); // force rebuild
        expect(PredictionEngine._canonicalizeStop('King St Station'))
            .toBe(PredictionEngine._canonicalizeStop('King Station'));
    });
});
