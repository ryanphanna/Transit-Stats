/**
 * Dispatcher regression tests for idempotency and duplicate handling.
 * Run with: node test_dispatcher.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function buildHarness({
  idempotent = false,
  contentDuplicate = false,
  parseEndTripResult = null,
  user = { userId: 'user_1' },
  shouldRespondToUnknown = false,
  pendingState = null,
} = {}) {
  const calls = {
    checkIdempotency: 0,
    checkContentDuplicate: 0,
    handleEndTrip: 0,
    handleTripLog: 0,
    handleQuery: 0,
    handleMmsTrip: [],
    sendSmsReply: [],
    setPendingState: [],
    clearPendingState: 0,
    handleTripLogArgs: [],
  };

  const handlers = {
    handleHelp: async () => {},
    handleRegister: async () => {},
    handleStatus: async () => {},
    handleStatsCommand: async () => {},
    handleIncomplete: async () => {},
    handleDiscard: async () => {},
    handleUnlink: async () => {},
    handleMmsTrip: async (phoneNumber, userData, mediaUrl, receivedAt) => {
      calls.handleMmsTrip.push({ phoneNumber, userData, mediaUrl, receivedAt });
    },
    handleTripLog: async (...args) => {
      calls.handleTripLog++;
      calls.handleTripLogArgs.push(args);
    },
    handleEndTrip: async () => { calls.handleEndTrip++; },
    handleQuery: async () => { calls.handleQuery++; },
  };

  const dbModule = {
    isRateLimited: async () => false,
    checkIdempotency: async () => {
      calls.checkIdempotency++;
      return idempotent;
    },
    checkContentDuplicate: async () => {
      calls.checkContentDuplicate++;
      return contentDuplicate;
    },
    getFirestore: () => ({
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: false }),
        }),
      }),
    }),
    getPendingState: async () => pendingState,
    getUserByPhone: async () => user,
    getUserProfile: async () => ({ defaultAgency: 'TTC' }),
    shouldRespondToUnknown: async () => shouldRespondToUnknown,
    clearPendingState: async () => { calls.clearPendingState++; },
    setPendingState: async (_phoneNumber, state) => { calls.setPendingState.push(state); },
    db: {
      collection: () => ({
        add: async () => {},
        doc: () => ({
          update: async () => {},
          delete: async () => {},
        }),
      }),
    },
    admin: {
      firestore: {
        FieldValue: {
          serverTimestamp: () => new Date(),
        },
      },
    },
  };

  const twilio = {
    sendSmsReply: async (phoneNumber, message) => {
      calls.sendSmsReply.push({ phoneNumber, message });
    },
    getTwilioPhoneNumber: () => '+19999999999',
  };

  const gemini = {
    parseWithGemini: async () => null,
    constructStopInput: () => null,
  };

  const parsing = {
    parseMultiLineTripFormat: () => null,
    parseSingleLineTripFormat: () => null,
    parseEndTripFormat: () => parseEndTripResult,
  };

  const utils = {
    isValidRoute: () => true,
    normalizeDirection: (v) => v,
    getRouteDisplay: (route, dir) => (dir ? `${route} ${dir}` : `${route}`),
    getStopDisplay: (code, name, fallback) => code || name || fallback || 'Unknown',
    normalizeAgency: (v) => v,
  };

  const logger = {
    info: () => {},
    error: () => {},
  };

  const dispatcherPath = require.resolve('./lib/dispatcher');
  delete require.cache[dispatcherPath];

  const originalLoad = Module._load;
  const patchedLoad = function patchedLoad(request, parent, isMain) {
    if (parent && parent.id === dispatcherPath) {
      if (request === './db') return dbModule;
      if (request === './twilio') return twilio;
      if (request === './gemini') return gemini;
      if (request === './parsing') return parsing;
      if (request === './utils') return utils;
      if (request === './handlers') return handlers;
      if (request === './logger') return logger;
    }
    return originalLoad(request, parent, isMain);
  };
  Module._load = patchedLoad;

  let realDispatch;
  try {
    ({ dispatch: realDispatch } = require('./lib/dispatcher'));
  } finally {
    Module._load = originalLoad;
  }

  const dispatch = async (...args) => {
    Module._load = patchedLoad;
    try {
      return await realDispatch(...args);
    } finally {
      Module._load = originalLoad;
    }
  };

  return { dispatch, calls };
}

test('dispatcher: duplicate MessageSid short-circuits before content dedup', async () => {
  const { dispatch, calls } = buildHarness({ idempotent: true, contentDuplicate: true });
  await dispatch('+14165551234', 'END Union', 'SM_DUPLICATE');

  assert.equal(calls.checkIdempotency, 1);
  assert.equal(calls.checkContentDuplicate, 0);
  assert.equal(calls.handleEndTrip, 0);
  assert.equal(calls.handleTripLog, 0);
  assert.equal(calls.handleQuery, 0);
});

test('dispatcher: END command bypasses content dedup and reaches end handler', async () => {
  const { dispatch, calls } = buildHarness({
    contentDuplicate: true,
    parseEndTripResult: { isEnd: true, stop: 'Union Station', notes: null },
  });
  await dispatch('+14165551234', 'END\nUnion Station', 'SM_END_1');

  assert.equal(calls.checkIdempotency, 1);
  assert.equal(calls.checkContentDuplicate, 0);
  assert.equal(calls.handleEndTrip, 1);
  assert.equal(calls.handleTripLog, 0);
});

test('dispatcher: single-line END [stop] also bypasses content dedup', async () => {
  const { dispatch, calls } = buildHarness({
    contentDuplicate: true,
    parseEndTripResult: null,
  });
  await dispatch('+14165551234', 'END College / Spadina', 'SM_END_2');

  assert.equal(calls.checkContentDuplicate, 0);
  assert.equal(calls.handleEndTrip, 1);
  assert.equal(calls.handleTripLog, 0);
});

test('dispatcher: non-END duplicate content is dropped before parsing', async () => {
  const { dispatch, calls } = buildHarness({
    contentDuplicate: true,
    parseEndTripResult: null,
  });
  await dispatch('+14165551234', '510 Spadina North', 'SM_DUP_CONTENT');

  assert.equal(calls.checkIdempotency, 1);
  assert.equal(calls.checkContentDuplicate, 1);
  assert.equal(calls.handleEndTrip, 0);
  assert.equal(calls.handleTripLog, 0);
  assert.equal(calls.handleQuery, 0);
});

test('dispatcher: MMS from known user triggers Snap-to-Start handler', async () => {
  const { dispatch, calls } = buildHarness({
    user: { userId: 'user_mms' },
  });
  await dispatch('+14165551234', '', 'SM_MMS_1', { numMedia: 1, mediaUrl: 'https://example.com/stop.jpg' });

  assert.equal(calls.handleMmsTrip.length, 1);
  assert.equal(calls.handleMmsTrip[0].phoneNumber, '+14165551234');
  assert.equal(calls.handleMmsTrip[0].userData.userId, 'user_mms');
  assert.equal(calls.handleMmsTrip[0].mediaUrl, 'https://example.com/stop.jpg');
  assert.equal(typeof calls.handleMmsTrip[0].receivedAt, 'number');
  assert.equal(calls.sendSmsReply.length, 0);
});

test('dispatcher: MMS from unknown user gets REGISTER prompt when allowed', async () => {
  const { dispatch, calls } = buildHarness({
    user: null,
    shouldRespondToUnknown: true,
  });
  await dispatch('+14165550000', '', 'SM_MMS_2', { numMedia: 1, mediaUrl: 'https://example.com/stop.jpg' });

  assert.equal(calls.handleMmsTrip.length, 0);
  assert.equal(calls.sendSmsReply.length, 1);
  assert.equal(calls.sendSmsReply[0].phoneNumber, '+14165550000');
  assert.equal(calls.sendSmsReply[0].message, 'Text REGISTER [email] to get started');
});

test('dispatcher: mms_stop_needed single route uses stop reply and preserves receivedAt', async () => {
  const { dispatch, calls } = buildHarness({
    user: { userId: 'user_mms_followup' },
    pendingState: {
      type: 'mms_stop_needed',
      routeCandidates: [{ route: '510', agency: 'TTC' }],
      defaultAgency: 'TTC',
      receivedAt: 1710000000123,
    },
  });

  await dispatch('+14165557777', 'Spadina / College', 'SM_MMS_FOLLOWUP_1');

  assert.equal(calls.clearPendingState, 1);
  assert.equal(calls.handleTripLog, 1);
  const [, , stopInput, route, direction, agency, options] = calls.handleTripLogArgs[0];
  assert.equal(stopInput, 'Spadina / College');
  assert.equal(route, '510');
  assert.equal(direction, null);
  assert.equal(agency, 'TTC');
  assert.deepEqual(options, {
    parsed_by: 'mms',
    startTime: 1710000000123,
    source: 'mms',
    timing_reliability: 'approximate',
  });
});

test('dispatcher: mms_stop_needed multiple routes sets confirm_mms_route pending state', async () => {
  const { dispatch, calls } = buildHarness({
    user: { userId: 'user_mms_followup' },
    pendingState: {
      type: 'mms_stop_needed',
      routeCandidates: [{ route: '510', agency: 'TTC' }, { route: '310', agency: 'TTC' }],
      defaultAgency: 'TTC',
      receivedAt: 1710000000456,
    },
  });

  await dispatch('+14165557777', 'Spadina / College', 'SM_MMS_FOLLOWUP_2');

  assert.equal(calls.handleTripLog, 0);
  assert.equal(calls.setPendingState.length, 1);
  assert.equal(calls.setPendingState[0].type, 'confirm_mms_route');
  assert.equal(calls.setPendingState[0].stopInput, 'Spadina / College');
  assert.equal(calls.setPendingState[0].receivedAt, 1710000000456);
  assert.equal(calls.sendSmsReply.length, 1);
  assert.match(calls.sendSmsReply[0].message, /Which route\?/i);
});

test('dispatcher: confirm_mms_route selection starts trip with preserved timing metadata', async () => {
  const { dispatch, calls } = buildHarness({
    user: { userId: 'user_mms_followup' },
    pendingState: {
      type: 'confirm_mms_route',
      stopInput: 'Spadina / College',
      routeCandidates: [{ route: '510', agency: 'TTC' }, { route: '310', agency: 'TTC' }],
      defaultAgency: 'TTC',
      receivedAt: 1710000000789,
    },
  });

  await dispatch('+14165557777', '2', 'SM_MMS_FOLLOWUP_3');

  assert.equal(calls.clearPendingState, 1);
  assert.equal(calls.handleTripLog, 1);
  const [, , stopInput, route, direction, agency, options] = calls.handleTripLogArgs[0];
  assert.equal(stopInput, 'Spadina / College');
  assert.equal(route, '310');
  assert.equal(direction, null);
  assert.equal(agency, 'TTC');
  assert.deepEqual(options, {
    parsed_by: 'mms',
    startTime: 1710000000789,
    source: 'mms',
    timing_reliability: 'approximate',
  });
});
