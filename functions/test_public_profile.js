/**
 * Unit tests for the public profile HTTP endpoint (functions/lib/public-profile.js).
 * Run with: node test_public_profile.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadPublicProfile(overrides = {}) {
  const modulePath = require.resolve('./lib/public-profile');
  delete require.cache[modulePath];

  const dbModule = {
    db: {
      collection: (name) => ({
        doc: (id) => ({
          get: async () => (overrides.docs?.[name]?.[id] ?? { exists: false }),
        }),
        where: () => {
          const query = {
            where: () => query,
            limit: () => query,
            get: async () => (overrides.tripsSnap ?? { size: 0, forEach: () => {} }),
          };
          return query;
        },
        get: async () => (overrides.stopsSnap ?? { docs: [] }),
      }),
    },
    getUserProfile: async () => overrides.profile ?? null,
    getStopsLibrary: async () => (overrides.stopsSnap ?? { docs: [] }).docs.map(doc => doc.data()),
    ...overrides.dbModule,
  };

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (parent && parent.id === modulePath) {
      if (request === './db') return dbModule;
      if (request === './logger') return { error: () => {}, info: () => {}, warn: () => {} };
      if (request === 'firebase-functions/v2/https') {
        return { onRequest: (_opts, handler) => handler };
      }
    }
    return originalLoad(request, parent, isMain);
  };

  let mod;
  try {
    mod = require('./lib/public-profile');
  } finally {
    Module._load = originalLoad;
  }
  return mod.publicProfile; // the raw handler, thanks to the onRequest stub
}

function mockRes() {
  const res = { statusCode: null, body: null, headers: {} };
  res.set = (k, v) => { res.headers[k] = v; return res; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.send = (body) => { res.body = body; return res; };
  return res;
}

test('publicProfile handles OPTIONS preflight with 204', async () => {
  const handler = loadPublicProfile();
  const res = mockRes();
  await handler({ method: 'OPTIONS', query: {} }, res);
  assert.equal(res.statusCode, 204);
});

test('publicProfile returns 400 when user query param is missing', async () => {
  const handler = loadPublicProfile();
  const res = mockRes();
  await handler({ method: 'GET', query: {} }, res);
  assert.equal(res.statusCode, 400);
});

test('publicProfile returns 404 when username is not found', async () => {
  const handler = loadPublicProfile({ docs: { usernames: {} } });
  const res = mockRes();
  await handler({ method: 'GET', query: { user: 'nobody' } }, res);
  assert.equal(res.statusCode, 404);
});

test('publicProfile returns 403 when profile is not public', async () => {
  const handler = loadPublicProfile({
    docs: { usernames: { 'subway-subway-subway': { exists: true, data: () => ({ uid: 'u1' }) } } },
    profile: { isPublic: false },
  });
  const res = mockRes();
  await handler({ method: 'GET', query: { user: 'subway-subway-subway' } }, res);
  assert.equal(res.statusCode, 403);
});

test('publicProfile marks other profiles as coming soon', async () => {
  const handler = loadPublicProfile({
    docs: { usernames: { r: { exists: true, data: () => ({ uid: 'u1' }) } } },
    profile: { isPublic: true, username: 'r' },
  });
  const res = mockRes();
  await handler({ method: 'GET', query: { user: 'r' } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'COMING_SOON');
});

test('publicProfile returns 200 with aggregated stats for a public profile', async () => {
  const tripDocs = [
    { data: () => ({ duration: 10, startTime: new Date(Date.now() - 7 * 60 * 60 * 1000), startStopName: 'Start', endStopName: 'End', boardingLocation: { lat: 1, lng: 2 }, exitLocation: { lat: 3, lng: 4 } }) },
  ];
  const handler = loadPublicProfile({
    docs: { usernames: { 'subway-subway-subway': { exists: true, data: () => ({ uid: 'u1' }) } } },
    profile: {
      isPublic: true,
      displayName: 'Alice',
      username: 'r',
      emojiUsername: 'subway-subway-subway',
      usernameAliases: ['subway-subway-subway'],
      defaultAgency: 'TTC',
      mapStopMode: 'exiting',
    },
    tripsSnap: { size: 1, forEach: (fn) => tripDocs.forEach(fn) },
  });
  const res = mockRes();
  await handler({ method: 'GET', query: { user: 'subway-subway-subway' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.totalTrips, 1);
  assert.equal(res.body.routes, 0);
  assert.equal(res.body.totalHours, Math.round((10 / 60) * 10) / 10);
  assert.equal(res.body.thisMonth, 1);
  assert.equal(res.body.thisWeek, 1);
  assert.equal(res.body.points.length, 2);
  assert.equal('names' in res.body.points[0], false);
  assert.equal(res.body.displayName, 'Alice');
  assert.equal(res.body.canonicalUsername, 'r');
  assert.equal(res.body.mapStopMode, 'exiting');
});

test('publicProfile resolves missing trip coordinates from the stop library', async () => {
  const handler = loadPublicProfile({
    docs: { usernames: { r: { exists: true, data: () => ({ uid: 'u1' }) } } },
    profile: { isPublic: true, username: 'r', emojiUsername: 'subway-subway-subway' },
    tripsSnap: {
      size: 1,
      forEach: (fn) => fn({ data: () => ({ agency: 'STM', startTime: new Date(Date.now() - 7 * 60 * 60 * 1000), startStopName: 'Berri-UQAM', endStopName: 'Lionel-Groulx' }) }),
    },
    stopsSnap: {
      docs: [
        { data: () => ({ name: 'Berri-UQAM', agencies: ['STM'], lat: 45.5152, lng: -73.5618 }) },
        { data: () => ({ name: 'Lionel-Groulx', agencies: ['STM'], lat: 45.4827, lng: -73.5802 }) },
      ],
    },
  });
  const res = mockRes();
  await handler({ method: 'GET', query: { user: 'r' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.points.map(point => [point.lat, point.lng]), [
    [45.5152, -73.5618],
    [45.4827, -73.5802],
  ]);
});

test('publicProfile returns 500 and does not leak internal error detail on unexpected failure', async () => {
  const handler = loadPublicProfile({
    dbModule: { db: { collection: () => { throw new Error('db down'); } } },
  });
  const res = mockRes();
  await handler({ method: 'GET', query: { user: 'alice' } }, res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, 'Internal error');
});
