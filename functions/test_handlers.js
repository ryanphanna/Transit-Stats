/**
 * Focused tests for handlers disambiguation + MMS timing metadata.
 * Run with: node test_handlers.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadHandlers(overrides = {}) {
  const handlersPath = require.resolve('./lib/handlers');
  const handlerPaths = new Set([
    handlersPath,
    require.resolve('./lib/handlers-utils'),
    require.resolve('./lib/handlers-commands'),
    require.resolve('./lib/handlers-trip'),
    require.resolve('./lib/handlers-query'),
    require.resolve('./lib/handlers-intelligence'),
    require.resolve('./lib/finalization'),
  ]);
  // Bust the entire handler module graph so mocks take effect
  for (const p of handlerPaths) delete require.cache[p];

  const calls = {
    setPendingState: [],
    sendSmsReply: [],
    createTrip: [],
    batchUpdates: [],
    docUpdates: [],
    docGets: [],
    loggerInfo: [],
    loggerWarn: [],
    loggerError: [],
  };

  const dbModule = {
    getActiveTrip: async () => null,
    setPendingState: async (_phone, state) => { calls.setPendingState.push(state); },
    clearPendingState: async () => {},
    storeVerificationCode: async () => {},
    getVerificationData: async () => null,
    isEmailAllowed: async () => true,
    isEmailAdmin: async () => false,
    getUserByPhone: async () => ({ userId: 'u1', email: 'user@example.com' }),
    getUserProfile: async () => ({ defaultAgency: 'TTC', isAdmin: false }),
    lookupStop: async () => ({
      id: 'stop_1',
      stopCode: '11985',
      stopName: 'Spadina / College',
      lat: 43.1,
      lng: -79.1,
      source: 'verified',
    }),
    findMatchingStops: async () => [],
    getRoutesAtStop: async () => null,
    db: {
      collection: () => ({
        add: async () => {},
        doc: () => ({
          update: async (data) => { calls.docUpdates.push(data); },
          set: async () => {},
          get: async () => { calls.docGets.push(true); return { exists: false, data: () => ({}) }; },
          delete: async () => {},
        }),
        where: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () => ({
                get: async () => ({ empty: true, docs: [], forEach: () => {} }),
              }),
            }),
          }),
          orderBy: () => ({
            limit: () => ({
              get: async () => ({ empty: true, docs: [], forEach: () => {} }),
            }),
          }),
          limit: () => ({
            get: async () => ({ empty: true, docs: [], forEach: () => {} }),
          }),
          get: async () => ({ empty: true, docs: [], forEach: () => {} }),
        }),
      }),
      batch: () => ({
        update: (ref, data) => { calls.batchUpdates.push({ type: 'update', ref, data }); },
        delete: (ref) => { calls.batchUpdates.push({ type: 'delete', ref }); },
        commit: async () => {},
      }),
    },
    hasBlockingCorrection: () => false,
    isGeminiRateLimited: async () => false,
    createTrip: async (payload) => {
      calls.createTrip.push(payload);
      return `trip_${calls.createTrip.length}`;
    },
    getRecentCompletedTrips: async () => [],
    getStopsLibrary: async () => [],
    getConversationHistory: async () => [],
    saveConversationTurn: async () => {},
    getLastTripAgency: async () => null,
    getTripCount: async () => 0,
    ...overrides.dbModule,
  };

  const twilio = {
    sendSmsReply: async (phone, message) => { calls.sendSmsReply.push({ phone, message }); },
    ...overrides.twilio,
  };

  const utils = {
    getStopDisplay: (code, name, fallback) => code || name || fallback || 'Unknown',
    getRouteDisplay: (route, direction) => direction ? `${route} ${direction}` : `${route}`,
    normalizeDirection: (v) => {
      if (!v) return null;
      const s = v.toString().toLowerCase();
      if (s.startsWith('north')) return 'Northbound';
      if (s.startsWith('south')) return 'Southbound';
      if (s.startsWith('east')) return 'Eastbound';
      if (s.startsWith('west')) return 'Westbound';
      return v;
    },
    normalizeRoute: (r) => (r == null ? r : r.toString().trim()),
    isValidRoute: () => true,
    generateVerificationCode: () => '123456',
    determineReliability: () => 'approximate',
    normalizeAgency: (a) => a,
    ...overrides.utils,
  };

  const gemini = {
    aggregateTripStats: () => ({}),
    answerQueryWithGemini: async () => 'ok',
    lookupAgencyTimezone: async () => 'America/Toronto',
    parseStopSignImage: async () => ({ routes: [{ route: '510', agency: 'TTC' }], stopCode: '11985' }),
    ...overrides.gemini,
  };

  const parsing = {
    parseStopInput: (input) => (/^\d+$/.test(String(input))
      ? { stopCode: String(input), stopName: null }
      : { stopCode: null, stopName: String(input) }),
    ...overrides.parsing,
  };

  const firebaseAdmin = {
    firestore: {
      FieldValue: {
        delete: () => ({ _op: 'delete' }),
        increment: v => ({ _op: 'increment', v }),
        serverTimestamp: () => new Date(),
        arrayUnion: (...vals) => ({ _op: 'arrayUnion', vals }),
      },
      Timestamp: {
        now: () => ({ toDate: () => new Date() }),
      },
    },
  };

  const predict = {
    PredictionEngine: {
      stopsLibrary: [],
      networkGraph: null,
      guess: () => null,
      guessEndStop: () => null,
      guessTopEndStops: () => [],
      getEndStopConstraint: () => ({ source: 'none', legalStops: null }),
      _stopMatch: () => false,
    },
    ...overrides.predict,
  };

  const transfer = {
    TransferEngine: {
      score: () => 0,
      CONFIDENCE_THRESHOLD: 0.5,
      ...(overrides.transfer?.TransferEngine || {}),
    },
  };
  const network = {
    NetworkEngine: {
      load: async () => null,
      observe: async () => {},
      filterCandidates: () => null,
      getEdgeMedianDuration: () => null,
      getMedianDuration: () => null,
      getConnectionsAtStop: async () => ({}),
      getConnectionLabels: async () => ({}),
      _key: (s) => s.toString().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
      ...(overrides.network?.NetworkEngine || {}),
    },
  };
  const predictV4 = {
    PredictionEngineV4: {
      guessTopRoutes: () => [],
      guessTopEndStops: () => [],
      ...(overrides.predictV4?.PredictionEngineV4 || {}),
    },
  };
  const predictV5 = {
    PredictionEngineV5: {
      guessTopRoutes: async () => [],
      guessTopEndStops: async () => [],
      ...(overrides.predictV5?.PredictionEngineV5 || {}),
    },
  };
  const constants = { AGENCY_CITY: { TTC: 'Toronto' } };

  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'image/jpeg' },
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  });

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (parent && handlerPaths.has(parent.id)) {
      if (request === './db') return dbModule;
      if (request === './twilio') return twilio;
      if (request === './utils') return utils;
      if (request === './gemini') return gemini;
      if (request === './parsing') return parsing;
      if (request === './predict.js') return predict;
      if (request === './transfer.js') return transfer;
      if (request === './network.js') return network;
      if (request === './predict_v4.js') return predictV4;
      if (request === './predict_v5.js') return predictV5;
      if (request === './constants') return constants;
      if (request === 'firebase-admin') return firebaseAdmin;
      if (request === './logger') {
        return {
          warn: (message, data) => { calls.loggerWarn.push({ message, data }); },
          info: (message, data) => { calls.loggerInfo.push({ message, data }); },
          error: (message, data) => { calls.loggerError.push({ message, data }); },
        };
      }
    }
    return originalLoad(request, parent, isMain);
  };

  let handlers;
  try {
    handlers = require('./lib/handlers');
  } finally {
    Module._load = originalLoad;
  }

  const restore = () => {
    global.fetch = originalFetch;
  };

  return { handlers, calls, restore };
}

test('handleTripLog: disambiguation prompt includes direction labels', async () => {
  const startTime = 1778770440000;
  const { handlers, calls, restore } = loadHandlers({
    dbModule: {
      findMatchingStops: async () => [
        { id: 's1', stopCode: '2069', stopName: 'Dufferin / Lawrence', routes: ['29'], direction: 'Northbound' },
        { id: 's2', stopCode: '2070', stopName: 'Dufferin / Lawrence', routes: ['29'], direction: 'Southbound' },
      ],
    },
  });

  try {
    await handlers.handleTripLog(
      '+14165550001',
      { userId: 'u1' },
      'Dufferin / Lawrence',
      '29',
      null,
      'TTC',
      { startTime }
    );
  } finally {
    restore();
  }

  assert.equal(calls.createTrip.length, 1);
  assert.equal(calls.createTrip[0].startTime, startTime);
  assert.equal(calls.setPendingState.length, 1);
  assert.equal(calls.setPendingState[0].type, 'confirm_stop');
  const msg = calls.sendSmsReply[0]?.message || '';
  assert.match(msg, /\(Northbound, stop 2069\)/);
  assert.match(msg, /\(Southbound, stop 2070\)/);
});

test('handleTripLog: 506 College Westbound auto-resolves to one surface stop', async () => {
  const { handlers, calls, restore } = loadHandlers({
    dbModule: {
      findMatchingStops: async () => [
        { id: 'station', stopCode: null, stopName: 'College Station', routes: ['1', '506'], direction: null },
        { id: 's760', stopCode: '760', stopName: 'College Station', routes: ['506'], direction: 'Westbound' },
        { id: 's761', stopCode: '761', stopName: 'College Station', routes: ['506'], direction: 'Eastbound' },
      ],
      lookupStop: async (_code, stopName, _agency, route, direction) => {
        if (stopName === 'College' && route === '506' && direction === 'Westbound') {
          return { id: 's760', stopCode: '760', stopName: 'College Station', source: 'verified' };
        }
        return null;
      },
    },
  });

  try {
    await handlers.handleTripLog('+14165550011', { userId: 'u11' }, 'College', '506', 'Westbound', 'TTC');
  } finally {
    restore();
  }

  assert.equal(calls.setPendingState.length, 0);
  assert.equal(calls.createTrip.length, 1);
  assert.equal(calls.createTrip[0].startStopCode, '760');
  assert.equal(calls.createTrip[0].startStopName, 'College Station');
});

test('handleTripLog: 506 College with no direction falls back to disambiguation prompt', async () => {
  const { handlers, calls, restore } = loadHandlers({
    dbModule: {
      findMatchingStops: async () => [
        { id: 's760', stopCode: '760', stopName: 'College Station', routes: ['506'], direction: 'Westbound' },
        { id: 's761', stopCode: '761', stopName: 'College Station', routes: ['506'], direction: 'Eastbound' },
      ],
      lookupStop: async () => null,
    },
  });

  try {
    await handlers.handleTripLog('+14165550012', { userId: 'u12' }, 'College', '506', null, 'TTC');
  } finally {
    restore();
  }

  assert.equal(calls.createTrip.length, 1);
  assert.equal(calls.setPendingState.length, 1);
  assert.equal(calls.setPendingState[0].type, 'confirm_stop');
  const msg = calls.sendSmsReply[0]?.message || '';
  assert.match(msg, /Multiple stops match "College"/);
  assert.match(msg, /stop 760/);
  assert.match(msg, /stop 761/);
});

test('handleTripLog: 506 Dufferin / College Eastbound uses stopRoutes before prompting', async () => {
  const { handlers, calls, restore } = loadHandlers({
    dbModule: {
      findMatchingStops: async () => [
        { id: 's2033', stopCode: '2033', stopName: 'Dufferin / College', routes: ['29'], direction: null },
        { id: 's827', stopCode: '827', stopName: 'Dufferin / College', routes: [], direction: 'Westbound' },
        { id: 's826', stopCode: '826', stopName: 'Dufferin / College', routes: [], direction: 'Eastbound' },
        { id: 's2034', stopCode: '2034', stopName: 'Dufferin / College', routes: [], direction: null },
      ],
      getRoutesAtStop: async (code) => ({
        827: ['506'],
        826: ['506'],
        2034: ['29'],
      }[code] || []),
      lookupStop: async (_code, stopName, _agency, route, direction) => {
        if (stopName === 'Dufferin / College' && route === '506' && direction === 'Eastbound') {
          return { id: 's826', stopCode: '826', stopName: 'Dufferin / College', source: 'verified' };
        }
        return null;
      },
    },
  });

  try {
    await handlers.handleTripLog('+14165550014', { userId: 'u14' }, 'Dufferin / College', '506', 'Eastbound', 'TTC');
  } finally {
    restore();
  }

  assert.equal(calls.setPendingState.length, 0);
  assert.equal(calls.createTrip.length, 1);
  assert.equal(calls.createTrip[0].startStopCode, '826');
  assert.equal(calls.createTrip[0].startStopName, 'Dufferin / College');
});

test('handleTripLog: Line 1 College auto-resolves to subway station', async () => {
  const { handlers, calls, restore } = loadHandlers({
    dbModule: {
      findMatchingStops: async () => [
        { id: 'line1_college', stopCode: '9001', stopName: 'College', routes: ['1'] },
        { id: 'surface_west', stopCode: '760', stopName: 'College Station', routes: ['506'], direction: 'Westbound' },
        { id: 'surface_east', stopCode: '761', stopName: 'College Station', routes: ['506'], direction: 'Eastbound' },
      ],
      lookupStop: async (_code, stopName, _agency, route, direction) => {
        if (stopName === 'College' && route === '1' && direction === 'Northbound') {
          return { id: 'line1_college', stopCode: '9001', stopName: 'College', source: 'verified' };
        }
        return null;
      },
    },
  });

  try {
    await handlers.handleTripLog('+14165550013', { userId: 'u13' }, 'College', '1', 'Northbound', 'TTC');
  } finally {
    restore();
  }

  assert.equal(calls.setPendingState.length, 0);
  assert.equal(calls.createTrip.length, 1);
  assert.equal(calls.createTrip[0].startStopCode, '9001');
  assert.equal(calls.createTrip[0].startStopName, 'College');
});

test('handleTripLog: 506 College Station Westbound auto-resolves to westbound surface stop', async () => {
  const { handlers, calls, restore } = loadHandlers({
    dbModule: {
      findMatchingStops: async () => [
        { id: 's760', stopCode: '760', stopName: 'College Station', routes: ['506'], direction: 'Westbound' },
        { id: 's761', stopCode: '761', stopName: 'College Station', routes: ['506'], direction: 'Eastbound' },
      ],
      lookupStop: async (_code, stopName, _agency, route, direction) => {
        if (stopName === 'College Station' && route === '506' && direction === 'Westbound') {
          return { id: 's760', stopCode: '760', stopName: 'College Station', source: 'verified' };
        }
        return null;
      },
    },
  });

  try {
    await handlers.handleTripLog('+14165550014', { userId: 'u14' }, 'College Station', '506', 'Westbound', 'TTC');
  } finally {
    restore();
  }

  assert.equal(calls.setPendingState.length, 0);
  assert.equal(calls.createTrip.length, 1);
  assert.equal(calls.createTrip[0].startStopCode, '760');
  assert.equal(calls.createTrip[0].startStopName, 'College Station');
});

test('handleMmsTrip: missing stop sets mms_stop_needed with receivedAt', async () => {
  const { handlers, calls, restore } = loadHandlers({
    gemini: {
      parseStopSignImage: async () => ({
        routes: [{ route: '510', agency: 'TTC' }, { route: '310', agency: 'TTC' }],
        stopCode: null,
        stopName: null,
      }),
    },
  });

  try {
    await handlers.handleMmsTrip('+14165550002', { userId: 'u2' }, 'https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages/MMtest/Media/MEtest', 1710000000001);
  } finally {
    restore();
  }

  assert.equal(calls.setPendingState.length, 1);
  assert.equal(calls.setPendingState[0].type, 'mms_stop_needed');
  assert.equal(calls.setPendingState[0].receivedAt, 1710000000001);
  assert.match(calls.sendSmsReply[0].message, /what stop are you at/i);
});

test('handleMmsTrip: single-route snap-to-start preserves startTime/source metadata', async () => {
  const { handlers, calls, restore } = loadHandlers({
    gemini: {
      parseStopSignImage: async () => ({
        routes: [{ route: '510', agency: 'TTC' }],
        stopCode: '11985',
        stopName: null,
      }),
    },
  });

  try {
    await handlers.handleMmsTrip('+14165550003', { userId: 'u3' }, 'https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages/MMtest/Media/MEtest', 1710000000002);
  } finally {
    restore();
  }

  assert.equal(calls.createTrip.length, 1);
  assert.equal(calls.createTrip[0].startTime, 1710000000002);
  assert.equal(calls.createTrip[0].source, 'mms');
  assert.equal(calls.createTrip[0].timing_reliability, 'approximate');
  assert.equal(calls.createTrip[0].parsed_by, 'mms');
});

test('handleTripLog: GTFS correction picks route supported by routesAtStop for V4/V5', async () => {
  const { handlers, calls, restore } = loadHandlers({
    dbModule: {
      getRoutesAtStop: async () => ['510'],
    },
    predictV4: {
      PredictionEngineV4: {
        guessTopRoutes: () => [
          { route: '29', confidence: 90, version: 'v4' },
          { route: '510', confidence: 70, version: 'v4' },
        ],
        guessTopEndStops: () => [],
      },
    },
    predictV5: {
      PredictionEngineV5: {
        guessTopRoutes: async () => [
          { route: '310', confidence: 95, version: 'v5' },
          { route: '510', confidence: 60, version: 'v5' },
        ],
        guessTopEndStops: async () => [],
      },
    },
  });

  try {
    await handlers.handleTripLog('+14165550004', { userId: 'u4' }, '11985', '510', null, 'TTC');
  } finally {
    restore();
  }

  assert.equal(calls.createTrip.length, 1);
  assert.equal(calls.createTrip[0].predictionV4.route, '510');
  assert.equal(calls.createTrip[0].predictionV5.route, '510');
});

test('handleTripLog: end-to-end prediction prompt does not surface illegal 506 destinations', async () => {
  const { PredictionEngine } = require('./lib/predict.js');
  const now = new Date();
  const makeTrip = ({ endStopName, daysAgo }) => {
    const startTime = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + 25 * 60 * 1000);
    return {
      route: '506',
      startStopName: 'College Station',
      endStopName,
      direction: 'Westbound',
      startTime,
      endTime,
    };
  };

  const history = [
    ...Array.from({ length: 8 }, (_, i) => makeTrip({ endStopName: 'Spadina Station', daysAgo: i + 1 })),
    makeTrip({ endStopName: 'College / Spadina', daysAgo: 1 }),
    makeTrip({ endStopName: 'College St at Bathurst St', daysAgo: 2 }),
  ];

  const { handlers, calls, restore } = loadHandlers({
    dbModule: {
      getRecentCompletedTrips: async () => history,
      isEmailAdmin: async () => true,
      getUserProfile: async () => ({ defaultAgency: 'TTC', isAdmin: true }),
      lookupStop: async () => ({
        id: 'stop_506',
        stopCode: '14400',
        stopName: 'College Station',
        source: 'verified',
      }),
    },
    predict: { PredictionEngine },
    predictV4: {
      PredictionEngineV4: {
        guessTopRoutes: () => [],
        guessTopEndStops: () => [],
      },
    },
    predictV5: {
      PredictionEngineV5: {
        guessTopRoutes: async () => [],
        guessTopEndStops: async () => [],
      },
    },
  });

  try {
    await handlers.handleTripLog('+14165550004', { userId: 'u4' }, '14400', '506', 'Westbound', 'TTC');
  } finally {
    restore();
    PredictionEngine.networkGraph = null;
    PredictionEngine.stopsLibrary = [];
  }

  const reply = calls.sendSmsReply[0]?.message || '';
  assert.doesNotMatch(reply, /Spadina Station/);
  assert.match(reply, /College \/ Spadina|College St at Bathurst St/);
  assert.equal(calls.createTrip[0].endStopConstraintSource, 'topology');
  assert.notEqual(calls.createTrip[0].endStopPrediction?.stop, 'Spadina Station');
  assert.match(calls.createTrip[0].endStopPrediction?.stop || '', /College \/ Spadina|College St at Bathurst St/);
  assert.ok(calls.loggerInfo.some(entry =>
    entry.message === 'Trip-start end-stop constraint' &&
    entry.data?.constraintSource === 'topology'
  ));
});

test('handleTripLog: writes provisional transfer metadata at second-leg start', async () => {
  const { TransferEngine } = require('./lib/transfer.js');
  const now = Date.now();
  const prevTrip = {
    id: 'prev_506',
    route: '506',
    endStopName: 'College Station',
    endTime: new Date(now - 4 * 60000),
    startTime: new Date(now - 14 * 60000),
  };

  const { handlers, calls, restore } = loadHandlers({
    dbModule: {
      getRecentCompletedTrips: async () => [prevTrip],
      lookupStop: async () => ({
        id: 'stop_college',
        stopCode: '1234',
        stopName: 'College Station',
        source: 'verified',
      }),
    },
    transfer: { TransferEngine },
  });

  try {
    await handlers.handleTripLog('+14165550009', { userId: 'u9' }, '1234', '1', 'Northbound', 'TTC');
  } finally {
    restore();
  }

  assert.equal(calls.createTrip.length, 1);
  assert.equal(calls.createTrip[0].provisionalTransfer, true);
  assert.equal(calls.createTrip[0].provisionalPrevTripId, 'prev_506');
  assert.ok(calls.createTrip[0].provisionalJourneyConfidence >= 0.55);
  assert.ok(calls.loggerInfo.some(entry =>
    entry.message === 'Trip-start provisional transfer detected' &&
    entry.data?.prevTripId === 'prev_506'
  ));
});

test('handleEndTrip: next-leg suggestion appended when transfer index has known connection', async () => {
  const { handlers, calls, restore } = loadHandlers({
    dbModule: {
      getActiveTrip: async () => ({
        id: 'trip_1',
        userId: 'u5',
        route: '510',
        direction: 'Westbound',
        agency: 'TTC',
        startStopName: 'King / Spadina',
        startStopCode: '11985',
        startTime: { toDate: () => new Date(Date.now() - 20 * 60000) },
        prediction: null,
        predictionV4: null,
        predictionV5: null,
        habitPrediction: null,
        endStopPrediction: null,
        endStopPredictionV4: null,
        endStopPredictionV5: null,
        endStopPredictions: null,
        stop_matched: true,
      }),
    },
    network: {
      NetworkEngine: {
        load: async () => null,
        observe: async () => {},
        filterCandidates: () => null,
        getMedianDuration: () => null,
        getConnectionsAtStop: async () => ({ '510_to_2': 4, '510_to_504': 1 }),
        getConnectionLabels: async () => ({ '510_to_2': '2', '510_to_504': '504' }),
        _key: (s) => s.toString().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
      },
    },
  });

  try {
    await handlers.handleEndTrip('+14165550005', { userId: 'u5' }, 'Spadina Station');
  } finally {
    restore();
  }

  const reply = calls.sendSmsReply[0]?.message || '';
  assert.match(reply, /Usually take the 2 from here/);
});

test('handleEndTrip: next-leg suggestion suppressed when connection count below threshold', async () => {
  const { handlers, calls, restore } = loadHandlers({
    dbModule: {
      getActiveTrip: async () => ({
        id: 'trip_1',
        userId: 'u6',
        route: '510',
        direction: 'Westbound',
        agency: 'TTC',
        startStopName: 'King / Spadina',
        startStopCode: '11985',
        startTime: { toDate: () => new Date(Date.now() - 20 * 60000) },
        prediction: null, predictionV4: null, predictionV5: null,
        habitPrediction: null, endStopPrediction: null,
        endStopPredictionV4: null, endStopPredictionV5: null,
        endStopPredictions: null, stop_matched: true,
      }),
    },
    network: {
      NetworkEngine: {
        load: async () => null,
        observe: async () => {},
        filterCandidates: () => null,
        getMedianDuration: () => null,
        getConnectionsAtStop: async () => ({ '510_to_2': 1 }), // below threshold
        getConnectionLabels: async () => ({ '510_to_2': '2' }),
        _key: (s) => s.toString().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
      },
    },
  });

  try {
    await handlers.handleEndTrip('+14165550006', { userId: 'u6' }, 'Spadina Station');
  } finally {
    restore();
  }

  const reply = calls.sendSmsReply[0]?.message || '';
  assert.doesNotMatch(reply, /Usually take/);
});

test('handleEndTrip: transfer scoring uses network connections and observe receives prevRoute', async () => {
  const scoreCalls = [];
  const observeCalls = [];
  const prevTrip = {
    id: 'prev_trip',
    route: '2',
    endStopName: 'Bloor-Yonge Station',
    endTime: { toDate: () => new Date(Date.now() - 5 * 60000) },
    startTime: { toDate: () => new Date(Date.now() - 9 * 60000) },
  };

  const { handlers, restore } = loadHandlers({
    dbModule: {
      getActiveTrip: async () => ({
        id: 'trip_1',
        userId: 'u7',
        route: '1',
        direction: 'Northbound',
        agency: 'TTC',
        startStopName: 'Bloor-Yonge Station',
        startStopCode: '',
        startTime: { toDate: () => new Date(Date.now() - 4 * 60000) },
        prediction: null, predictionV4: null, predictionV5: null,
        habitPrediction: null, endStopPrediction: null,
        endStopPredictionV4: null, endStopPredictionV5: null,
        endStopPredictions: null, stop_matched: true,
      }),
      getRecentCompletedTrips: async () => [prevTrip],
      lookupStop: async (_code, name) => ({
        id: 'stop_1',
        stopCode: '',
        stopName: name === 'Davisville' ? 'Davisville' : 'Bloor-Yonge Station',
        source: 'verified',
      }),
    },
    network: {
      NetworkEngine: {
        load: async () => null,
        observe: async (_db, _userId, trip, prevRoute) => { observeCalls.push({ trip, prevRoute }); },
        filterCandidates: () => null,
        getMedianDuration: () => null,
        getConnectionsAtStop: async () => ({ '2_to_1': 3 }),
        getConnectionLabels: async () => ({}),
        _key: (s) => s.toString().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
      },
    },
    transfer: {
      TransferEngine: {
        score: (_prev, _next, _history, connections) => {
          scoreCalls.push(connections);
          return 0.8;
        },
        CONFIDENCE_THRESHOLD: 0.55,
      },
    },
  });

  try {
    await handlers.handleEndTrip('+14165550007', { userId: 'u7' }, 'Davisville');
  } finally {
    restore();
  }

  // Verify TransferEngine.score was called with the correct network connections
  assert.deepEqual(scoreCalls[0], { '2_to_1': 3 });
  // observeCalls removed: NetworkEngine.observe now runs in background finalization, not handleEndTrip
});

test('handleEndTrip: single text-matched end candidate without a stop code still counts as matched', async () => {
  const { handlers, calls, restore } = loadHandlers({
    dbModule: {
      getActiveTrip: async () => ({
        id: 'trip_code_less_end',
        userId: 'u11',
        route: '1',
        direction: 'Southbound',
        agency: 'TTC',
        startStopName: 'Davisville',
        startStopCode: null,
        startTime: { toDate: () => new Date(Date.now() - 10 * 60000) },
        prediction: null,
        predictionV4: null,
        predictionV5: null,
        habitPrediction: null,
        endStopPrediction: null,
        endStopPredictionV4: null,
        endStopPredictionV5: null,
        endStopPredictions: null,
        stop_matched: true,
      }),
      findMatchingStops: async (name) => (
        name === 'College Station'
          ? [{ id: 'stop_college', stopCode: null, stopName: 'College Station', routes: ['1'], direction: null, source: 'manual' }]
          : []
      ),
      lookupStop: async (code, name) => {
        if (code === null && name === 'College Station') {
          return { id: 'stop_college', stopCode: null, stopName: 'College Station', source: 'manual' };
        }
        return null;
      },
    },
  });

  try {
    await handlers.handleEndTrip('+14165550011', { userId: 'u11' }, 'College Station');
  } finally {
    restore();
  }

  assert.ok(calls.docUpdates.length > 0);
  assert.equal(calls.docUpdates[0].endStopName, 'College Station');
  assert.equal(calls.docUpdates[0].stop_matched, true);
});

test('handleEndTrip: final journey reconciliation prefers provisional previous trip', async () => {
  const { TransferEngine } = require('./lib/transfer.js');
  const now = Date.now();
  const trip504 = {
    id: 'prev_504',
    route: '504',
    endStopName: 'College Station',
    endTime: { toDate: () => new Date(now - 8 * 60000) },
    startTime: { toDate: () => new Date(now - 23 * 60000) },
  };
  const trip506 = {
    id: 'prev_506',
    route: '506',
    endStopName: 'College Station',
    endTime: { toDate: () => new Date(now - 3 * 60000) },
    startTime: { toDate: () => new Date(now - 14 * 60000) },
  };

  const { handlers, calls, restore } = loadHandlers({
    dbModule: {
      getActiveTrip: async () => ({
        id: 'trip_1',
        userId: 'u10',
        route: '1',
        direction: 'Northbound',
        agency: 'TTC',
        startStopName: 'College Station',
        startStopCode: '1234',
        startTime: { toDate: () => new Date(now) },
        prediction: null, predictionV4: null, predictionV5: null,
        habitPrediction: null, endStopPrediction: null,
        endStopPredictionV4: null, endStopPredictionV5: null,
        endStopPredictions: null, stop_matched: true,
        provisionalPrevTripId: 'prev_506',
      }),
      getRecentCompletedTrips: async () => [trip504, trip506],
      lookupStop: async (_code, stopName) => ({
        id: `stop_${String(stopName || 'college').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        stopCode: '1234',
        stopName: stopName || 'Davisville',
        source: 'verified',
      }),
    },
    network: {
      NetworkEngine: {
        load: async () => null,
        observe: async () => {},
        filterCandidates: () => null,
        getEdgeMedianDuration: () => null,
        getMedianDuration: () => null,
        getConnectionsAtStop: async () => ({}),
        getConnectionLabels: async () => ({}),
        _key: (s) => s.toString().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
      },
    },
    transfer: { TransferEngine },
  });

  try {
    await handlers.handleEndTrip('+14165550010', { userId: 'u10' }, 'Davisville');
  } finally {
    restore();
  }

  const reply = calls.sendSmsReply[0]?.message || '';
  assert.match(reply, /Linked to your 506 trip/);
});

function makeEndTripHandlers(networkOverride) {
  return loadHandlers({
    dbModule: {
      getActiveTrip: async () => ({
        id: 'trip_1',
        userId: 'u7',
        route: '510',
        direction: 'Westbound',
        agency: 'TTC',
        startStopName: 'King / Spadina',
        startStopCode: '11985',
        startTime: { toDate: () => new Date(Date.now() - 40 * 60000) },
        prediction: null, predictionV4: null, predictionV5: null,
        habitPrediction: null, endStopPrediction: null,
        endStopPredictionV4: null, endStopPredictionV5: null,
        endStopPredictions: null, stop_matched: true,
      }),
    },
    network: { NetworkEngine: networkOverride },
  });
}

test('handleEndTrip: anomaly note appended when trip duration >= 2x hour-specific median', async () => {
  const { handlers, calls, restore } = makeEndTripHandlers({
    load: async () => ({
      edges: {
        e1: {
          fromStop: 'King / Spadina',
          toStop: 'Spadina Station',
          direction: 'Westbound',
          durations: [10, 10, 10],
          medianMinutes: 10,
          durationsByHour: { [new Date().getHours().toString()]: [10, 10, 10] },
          tripCount: 3,
        },
      },
    }),
    observe: async () => {},
    filterCandidates: () => null,
    getEdgeMedianDuration: () => 10, // specific edge: King→Spadina Station typical = 10 min
    getMedianDuration: () => 10,
    getConnectionsAtStop: async () => ({}),
    getConnectionLabels: async () => ({}),
    _key: (s) => s.toString().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
  });

  try {
    await handlers.handleEndTrip('+14165550007', { userId: 'u7' }, 'Spadina Station');
  } finally {
    restore();
  }

  const reply = calls.sendSmsReply[0]?.message || '';
  assert.match(reply, /took longer than usual/);
  assert.match(reply, /40 min vs\. typical 10 min/);
});

test('handleEndTrip: anomaly note suppressed when duration is within normal range', async () => {
  const { handlers, calls, restore } = makeEndTripHandlers({
    load: async () => ({
      edges: {
        e1: {
          fromStop: 'King / Spadina',
          toStop: 'Spadina Station',
          direction: 'Westbound',
          durations: [35, 38, 40],
          medianMinutes: 38,
          durationsByHour: { [new Date().getHours().toString()]: [35, 38, 40] },
          tripCount: 3,
        },
      },
    }),
    observe: async () => {},
    filterCandidates: () => null,
    getEdgeMedianDuration: () => 38, // specific edge: typical = 38 min; trip took 40 min (within 2x)
    getMedianDuration: () => 38,
    getConnectionsAtStop: async () => ({}),
    getConnectionLabels: async () => ({}),
    _key: (s) => s.toString().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
  });

  try {
    await handlers.handleEndTrip('+14165550008', { userId: 'u8' }, 'Spadina Station');
  } finally {
    restore();
  }

  const reply = calls.sendSmsReply[0]?.message || '';
  assert.doesNotMatch(reply, /took longer than usual/);
});

test('handleEndTrip: completion reply advertises NOTES follow-up', async () => {
  const { handlers, calls, restore } = loadHandlers({
    dbModule: {
      getActiveTrip: async () => ({
        id: 'trip_notes_prompt',
        userId: 'u12',
        route: '510',
        direction: 'Westbound',
        agency: 'TTC',
        startStopName: 'Spadina Station',
        startStopCode: '11985',
        startTime: { toDate: () => new Date(Date.now() - 12 * 60000) },
        prediction: null,
        predictionV4: null,
        predictionV5: null,
        habitPrediction: null,
        endStopPrediction: null,
        endStopPredictionV4: null,
        endStopPredictionV5: null,
        endStopPredictions: null,
        stop_matched: true,
      }),
      lookupStop: async (_code, name) => ({
        id: 'stop_notes',
        stopCode: '844',
        stopName: name || 'College St at Spadina Ave',
        source: 'verified',
      }),
    },
  });

  try {
    await handlers.handleEndTrip('+14165550012', { userId: 'u12' }, 'College St at Spadina Ave');
  } finally {
    restore();
  }

  const reply = calls.sendSmsReply[0]?.message || '';
  assert.match(reply, /Reply NOTES \(your note\) to add a note\./);
});

test('handleAddNotes: updates most recent completed trip notes', async () => {
  const { handlers, calls, restore } = loadHandlers({
    dbModule: {
      getRecentCompletedTrips: async () => [{
        id: 'recent_trip_1',
        route: '510',
        direction: 'Southbound',
      }],
    },
  });

  try {
    await handlers.handleAddNotes('+14165550013', { userId: 'u13' }, 'crowded but fast');
  } finally {
    restore();
  }

  assert.equal(calls.docUpdates.length, 1);
  assert.deepEqual(calls.docUpdates[0], { notes: 'crowded but fast' });
  assert.equal(calls.sendSmsReply[0]?.message, 'Added notes to 510 Southbound.');
});
