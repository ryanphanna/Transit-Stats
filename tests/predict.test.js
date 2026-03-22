const { PredictionEngine } = require('../functions/lib/predict');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock trip. startTime and endTime can be plain Date objects — the engine
 * handles both Firestore Timestamps (via .toDate()) and plain Dates/ISO strings.
 */
function makeTrip({
  route = '501',
  startStopName = 'Union',
  endStopName = null,
  direction = null,
  daysAgo = 1,
  hour = 8,
  duration = null,
} = {}) {
  const startTime = new Date();
  startTime.setDate(startTime.getDate() - daysAgo);
  startTime.setHours(hour, 0, 0, 0);
  const endTime = new Date(startTime.getTime() + (duration ?? 30) * 60 * 1000);
  return { route, startStopName, endStopName, direction, startTime, endTime };
}

// Ensure the engine starts with a clean stops library for each test
beforeEach(() => {
  PredictionEngine.stopsLibrary = [];
});

// ---------------------------------------------------------------------------
// _baseRoute
// ---------------------------------------------------------------------------

describe('PredictionEngine._baseRoute', () => {
  test('numeric route is unchanged', () => {
    expect(PredictionEngine._baseRoute('501')).toBe('501');
  });

  test('trailing letter suffix is stripped for numeric routes', () => {
    expect(PredictionEngine._baseRoute('510a')).toBe('510');
    expect(PredictionEngine._baseRoute('510A')).toBe('510');
    expect(PredictionEngine._baseRoute('52g')).toBe('52');
  });

  test('trailing word after space is stripped for numeric routes', () => {
    expect(PredictionEngine._baseRoute('510 Shuttle')).toBe('510');
  });

  test('word-based routes (e.g. "Line 1") are left as-is', () => {
    expect(PredictionEngine._baseRoute('Line 1')).toBe('Line 1');
  });

  test('single digit route', () => {
    expect(PredictionEngine._baseRoute('7')).toBe('7');
    expect(PredictionEngine._baseRoute('7b')).toBe('7');
  });
});

// ---------------------------------------------------------------------------
// _normalizeDirection
// ---------------------------------------------------------------------------

describe('PredictionEngine._normalizeDirection', () => {
  test('null/undefined returns null', () => {
    expect(PredictionEngine._normalizeDirection(null)).toBeNull();
    expect(PredictionEngine._normalizeDirection(undefined)).toBeNull();
  });

  test('northbound variants', () => {
    for (const input of ['N', 'NB', 'north', 'Northbound']) {
      expect(PredictionEngine._normalizeDirection(input)).toBe('Northbound');
    }
  });

  test('southbound variants', () => {
    for (const input of ['S', 'SB', 'south', 'Southbound']) {
      expect(PredictionEngine._normalizeDirection(input)).toBe('Southbound');
    }
  });

  test('eastbound variants', () => {
    for (const input of ['E', 'EB', 'east', 'Eastbound', 'eastward']) {
      expect(PredictionEngine._normalizeDirection(input)).toBe('Eastbound');
    }
  });

  test('westbound variants', () => {
    for (const input of ['W', 'WB', 'west', 'Westbound']) {
      expect(PredictionEngine._normalizeDirection(input)).toBe('Westbound');
    }
  });

  test('unrecognized value is returned trimmed', () => {
    expect(PredictionEngine._normalizeDirection('  Platform 2  ')).toBe('Platform 2');
  });
});

// ---------------------------------------------------------------------------
// _isValidTrip
// ---------------------------------------------------------------------------

describe('PredictionEngine._isValidTrip', () => {
  test('valid trip passes', () => {
    expect(PredictionEngine._isValidTrip({ route: '501', startStopName: 'Union' })).toBe(true);
  });

  test('missing stop returns false', () => {
    expect(PredictionEngine._isValidTrip({ route: '501' })).toBe(false);
  });

  test('missing route returns false', () => {
    expect(PredictionEngine._isValidTrip({ startStopName: 'Union' })).toBe(false);
  });

  test('stop over 60 chars is rejected', () => {
    const longStop = 'A'.repeat(61);
    expect(PredictionEngine._isValidTrip({ route: '501', startStopName: longStop })).toBe(false);
  });

  test('stop containing sentence words is rejected', () => {
    expect(PredictionEngine._isValidTrip({ route: '501', startStopName: "I'm at Union" })).toBe(false);
    expect(PredictionEngine._isValidTrip({ route: '501', startStopName: 'Just boarded here' })).toBe(false);
    expect(PredictionEngine._isValidTrip({ route: '501', startStopName: 'headed northbound' })).toBe(false);
  });

  test('short all-letter route with no digit is rejected', () => {
    // e.g. a bad SMS parse where the route field is a word
    expect(PredictionEngine._isValidTrip({ route: 'BIKE', startStopName: 'Union' })).toBe(false);
    expect(PredictionEngine._isValidTrip({ route: 'BUS', startStopName: 'Union' })).toBe(false);
  });

  test('route with digit is accepted even if short', () => {
    expect(PredictionEngine._isValidTrip({ route: '7', startStopName: 'Union' })).toBe(true);
  });

  test('"Line N" format is accepted', () => {
    expect(PredictionEngine._isValidTrip({ route: 'Line 1', startStopName: 'Union' })).toBe(true);
  });

  test('uses startStop as fallback when startStopName is absent', () => {
    expect(PredictionEngine._isValidTrip({ route: '501', startStop: 'Union' })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// _canonicalizeStop
// ---------------------------------------------------------------------------

describe('PredictionEngine._canonicalizeStop', () => {
  test('null returns null', () => {
    expect(PredictionEngine._canonicalizeStop(null)).toBeNull();
  });

  test('lowercases and trims', () => {
    expect(PredictionEngine._canonicalizeStop('  UNION  ')).toBe('union');
  });

  test('"&" and "@" are replaced with "/"', () => {
    expect(PredictionEngine._canonicalizeStop('Queen & Spadina')).toBe('queen/spadina');
    expect(PredictionEngine._canonicalizeStop('Queen @ Spadina')).toBe('queen/spadina');
  });

  test('"at" is replaced with "/"', () => {
    expect(PredictionEngine._canonicalizeStop('Queen at Spadina')).toBe('queen/spadina');
  });

  test('stops library alias resolves to canonical name', () => {
    PredictionEngine.stopsLibrary = [
      { name: 'Union Station', aliases: ['Union', 'Union St'] },
    ];
    expect(PredictionEngine._canonicalizeStop('union')).toBe('union station');
    expect(PredictionEngine._canonicalizeStop('Union St')).toBe('union station');
  });
});

// ---------------------------------------------------------------------------
// _stopMatch
// ---------------------------------------------------------------------------

describe('PredictionEngine._stopMatch', () => {
  test('identical names match', () => {
    expect(PredictionEngine._stopMatch('Union', 'Union')).toBe(true);
  });

  test('case-insensitive match', () => {
    expect(PredictionEngine._stopMatch('UNION', 'union')).toBe(true);
  });

  test('null inputs return false', () => {
    expect(PredictionEngine._stopMatch(null, 'Union')).toBe(false);
    expect(PredictionEngine._stopMatch('Union', null)).toBe(false);
  });

  test('"at" vs "/" normalized to match', () => {
    expect(PredictionEngine._stopMatch('Queen at Spadina', 'Queen & Spadina')).toBe(true);
  });

  test('different stops do not match', () => {
    expect(PredictionEngine._stopMatch('Union', 'King')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// _daySimilarity
// ---------------------------------------------------------------------------

describe('PredictionEngine._daySimilarity', () => {
  test('same day returns 1.0', () => {
    expect(PredictionEngine._daySimilarity(1, 1)).toBe(1.0); // Mon–Mon
    expect(PredictionEngine._daySimilarity(0, 0)).toBe(1.0); // Sun–Sun
  });

  test('weekday vs weekend returns 0.1', () => {
    expect(PredictionEngine._daySimilarity(1, 0)).toBe(0.1); // Mon vs Sun
    expect(PredictionEngine._daySimilarity(5, 6)).toBe(0.1); // Fri vs Sat
  });

  test('both weekend days return 0.7', () => {
    expect(PredictionEngine._daySimilarity(6, 0)).toBe(0.7); // Sat vs Sun
  });

  test('adjacent weekdays score high', () => {
    const score = PredictionEngine._daySimilarity(1, 2); // Mon vs Tue
    expect(score).toBeCloseTo(0.85, 2);
  });

  test('weekdays 4 apart score lower', () => {
    const score = PredictionEngine._daySimilarity(1, 5); // Mon vs Fri
    expect(score).toBeCloseTo(0.4, 2);
  });

  test('score decreases as weekday distance increases', () => {
    const d1 = PredictionEngine._daySimilarity(1, 2);
    const d2 = PredictionEngine._daySimilarity(1, 3);
    const d3 = PredictionEngine._daySimilarity(1, 4);
    expect(d1).toBeGreaterThan(d2);
    expect(d2).toBeGreaterThan(d3);
  });
});

// ---------------------------------------------------------------------------
// _timeSimilarity
// ---------------------------------------------------------------------------

describe('PredictionEngine._timeSimilarity', () => {
  function makeTime(hour, minute = 0) {
    const d = new Date(2024, 0, 15); // fixed date, monday
    d.setHours(hour, minute, 0, 0);
    return d;
  }

  test('same time returns 1.0', () => {
    const t = makeTime(8);
    expect(PredictionEngine._timeSimilarity(t, t)).toBeCloseTo(1.0, 5);
  });

  test('at sigma distance (1.5 hrs) returns ~0.607', () => {
    const now = makeTime(8, 0);
    const trip = makeTime(9, 30); // 1.5 hours later
    expect(PredictionEngine._timeSimilarity(now, trip)).toBeCloseTo(Math.exp(-0.5), 2);
  });

  test('farther apart returns lower score', () => {
    const now = makeTime(8);
    expect(PredictionEngine._timeSimilarity(now, makeTime(9)))
      .toBeGreaterThan(PredictionEngine._timeSimilarity(now, makeTime(11)));
  });

  test('wraps around midnight correctly', () => {
    const now = makeTime(0, 30);    // 00:30
    const trip = makeTime(23, 0);   // 23:00 — 1.5 hrs away via midnight
    expect(PredictionEngine._timeSimilarity(now, trip)).toBeCloseTo(Math.exp(-0.5), 2);
  });
});

// ---------------------------------------------------------------------------
// _recencyWeight
// ---------------------------------------------------------------------------

describe('PredictionEngine._recencyWeight', () => {
  test('same moment returns 1.0', () => {
    const now = new Date();
    expect(PredictionEngine._recencyWeight(now, now)).toBeCloseTo(1.0, 5);
  });

  test('half-life (20 days) returns ~0.5', () => {
    const now = new Date();
    const past = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);
    expect(PredictionEngine._recencyWeight(past, now)).toBeCloseTo(0.5, 2);
  });

  test('older trips weigh less than recent ones', () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    const older = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    expect(PredictionEngine._recencyWeight(recent, now))
      .toBeGreaterThan(PredictionEngine._recencyWeight(older, now));
  });
});

// ---------------------------------------------------------------------------
// _durationSimilarity
// ---------------------------------------------------------------------------

describe('PredictionEngine._durationSimilarity', () => {
  test('identical duration returns 1.0', () => {
    expect(PredictionEngine._durationSimilarity(30, 30)).toBeCloseTo(1.0, 5);
  });

  test('similar durations score high', () => {
    const score = PredictionEngine._durationSimilarity(30, 32);
    expect(score).toBeGreaterThan(0.85);
  });

  test('very different durations score low', () => {
    const score = PredictionEngine._durationSimilarity(10, 60);
    expect(score).toBeLessThan(0.1);
  });
});

// ---------------------------------------------------------------------------
// guess (integration)
// ---------------------------------------------------------------------------

describe('PredictionEngine.guess', () => {
  test('returns null for empty history', () => {
    expect(PredictionEngine.guess([], { stopName: 'Union', time: new Date() })).toBeNull();
  });

  test('returns null when no trip matches current stop', () => {
    const history = [makeTrip({ route: '501', startStopName: 'King', daysAgo: 1 })];
    expect(PredictionEngine.guess(history, { stopName: 'Union', time: new Date() })).toBeNull();
  });

  test('predicts route from single matching trip', () => {
    const history = [makeTrip({ route: '501', startStopName: 'Union', daysAgo: 1 })];
    const result = PredictionEngine.guess(history, { stopName: 'Union', time: new Date() });
    expect(result).not.toBeNull();
    expect(result.route).toBe('501');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.version).toBe(3);
  });

  test('groups route variants (510a, 510b) into one family', () => {
    const history = [
      makeTrip({ route: '510a', startStopName: 'Union', daysAgo: 2 }),
      makeTrip({ route: '510b', startStopName: 'Union', daysAgo: 3 }),
    ];
    const result = PredictionEngine.guess(history, { stopName: 'Union', time: new Date() });
    expect(result.routeFamily).toBe('510');
  });

  test('most frequent + recent route wins', () => {
    const history = [
      makeTrip({ route: '501', startStopName: 'Dundas', daysAgo: 1 }),
      makeTrip({ route: '501', startStopName: 'Dundas', daysAgo: 2 }),
      makeTrip({ route: '510', startStopName: 'Dundas', daysAgo: 1 }),
    ];
    const result = PredictionEngine.guess(history, { stopName: 'Dundas', time: new Date() });
    expect(result.route).toBe('501');
  });

  test('GTFS filter removes routes not serving the stop', () => {
    const history = [
      makeTrip({ route: '501', startStopName: 'Union', daysAgo: 1 }),
      makeTrip({ route: '510', startStopName: 'Union', daysAgo: 1 }),
    ];
    const result = PredictionEngine.guess(history, {
      stopName: 'Union',
      time: new Date(),
      routesAtStop: ['510'],
    });
    expect(result.route).toBe('510');
  });

  test('falls back to unfiltered if GTFS filter removes all candidates', () => {
    const history = [makeTrip({ route: '501', startStopName: 'Union', daysAgo: 1 })];
    const result = PredictionEngine.guess(history, {
      stopName: 'Union',
      time: new Date(),
      routesAtStop: ['999'], // no match
    });
    expect(result).not.toBeNull();
    expect(result.route).toBe('501');
  });

  test('invalid trips (bad SMS parses) are excluded from candidates', () => {
    // "I am at Union" contains "i am" which _isValidTrip blocks
    const history = [
      makeTrip({ route: '501', startStopName: 'I am at Union', daysAgo: 1 }),
    ];
    const result = PredictionEngine.guess(history, { stopName: 'I am at Union', time: new Date() });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// guessEndStop (integration)
// ---------------------------------------------------------------------------

describe('PredictionEngine.guessEndStop', () => {
  test('returns null for empty history', () => {
    expect(PredictionEngine.guessEndStop([], { route: '501', startStopName: 'Union', time: new Date() })).toBeNull();
  });

  test('returns null when no trip has an end stop', () => {
    const history = [makeTrip({ route: '501', startStopName: 'Union', endStopName: null })];
    expect(PredictionEngine.guessEndStop(history, { route: '501', startStopName: 'Union', time: new Date() })).toBeNull();
  });

  test('predicts end stop from single matching trip', () => {
    const history = [makeTrip({ route: '501', startStopName: 'Union', endStopName: 'Spadina', daysAgo: 1 })];
    const result = PredictionEngine.guessEndStop(history, { route: '501', startStopName: 'Union', time: new Date() });
    expect(result).not.toBeNull();
    expect(result.stop).toBe('Spadina');
    expect(result.confidence).toBe(100);
  });

  test('groups 510a and 510b under the same family for end-stop prediction', () => {
    const history = [
      makeTrip({ route: '510a', startStopName: 'Union', endStopName: 'Spadina', daysAgo: 1 }),
      makeTrip({ route: '510b', startStopName: 'Union', endStopName: 'Spadina', daysAgo: 2 }),
    ];
    const result = PredictionEngine.guessEndStop(history, { route: '510', startStopName: 'Union', time: new Date() });
    expect(result.stop).toBe('Spadina');
  });

  test('direction filter narrows to matching trips', () => {
    const history = [
      makeTrip({ route: '501', startStopName: 'Union', endStopName: 'Spadina', direction: 'Westbound', daysAgo: 1 }),
      makeTrip({ route: '501', startStopName: 'Union', endStopName: 'Parliament', direction: 'Eastbound', daysAgo: 1 }),
    ];
    const result = PredictionEngine.guessEndStop(history, {
      route: '501',
      startStopName: 'Union',
      direction: 'Westbound',
      time: new Date(),
    });
    expect(result.stop).toBe('Spadina');
  });

  test('falls back to all directions if none match the requested direction', () => {
    const history = [
      makeTrip({ route: '501', startStopName: 'Union', endStopName: 'Spadina', direction: 'Westbound', daysAgo: 1 }),
    ];
    const result = PredictionEngine.guessEndStop(history, {
      route: '501',
      startStopName: 'Union',
      direction: 'Eastbound', // no match
      time: new Date(),
    });
    expect(result).not.toBeNull();
    expect(result.stop).toBe('Spadina');
  });
});
