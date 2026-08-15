const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summarizeAdminMetrics } = require('./lib/admin-metrics');

test('admin metrics summarize accounts, processing, matching, and model rows', () => {
  const metrics = summarizeAdminMetrics({
    now: new Date('2026-08-15T12:00:00Z'),
    profiles: [{ isAdmin: true }, { isAdmin: false }],
    allowedUsers: [{ experimentalIntelligence: true }, { experimentalIntelligence: false }],
    stops: [
      { source: 'verified' },
      { source: 'gtfs' },
    ],
    trips: [
      { endTime: {}, stop_matched: true, backgroundFinalizedAt: {} },
      { endTime: {}, stop_matched: false },
      { endTime: {}, needs_review: true },
      { endTime: null },
    ],
    predictionStats: [
      { version: 'v3' },
      { version: 'v4-route' },
      { version: 'v5-endstop' },
      { version: 'habit-endstop' },
    ],
    loginActivity: [
      { loginCount: 3, lastLoginAt: new Date('2026-08-14T12:00:00Z') },
      { loginCount: 2, lastLoginAt: new Date('2026-07-01T12:00:00Z') },
    ],
    queryLogCount: 7,
  });

  assert.deepEqual(metrics.accounts, {
    total: 2,
    admins: 1,
    experimentalIntelligence: 1,
    totalLogins: 5,
    activeLogins30d: 1,
  });
  assert.deepEqual(metrics.rides, {
    total: 4,
    completed: 3,
    active: 1,
    needsReview: 1,
    awaitingFinalization: 2,
  });
  assert.deepEqual(metrics.stops, {
    library: 2,
    gtfs: 1,
    verified: 1,
    matchedTrips: 1,
    unmatchedTrips: 1,
    unknownMatchTrips: 1,
  });
  assert.deepEqual(metrics.intelligence, {
    predictionRows: 4,
    v3Rows: 1,
    v4Rows: 1,
    v5Rows: 1,
    otherRows: 1,
    questions: 7,
  });
});
