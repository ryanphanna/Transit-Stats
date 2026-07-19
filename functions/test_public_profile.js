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
        where: () => ({
          where: () => ({
            limit: () => ({ get: async () => (overrides.tripsSnap ?? { size: 0, forEach: () => {} }) }),
          }),
        }),
      }),
    },
    getUserProfile: async () => overrides.profile ?? null,
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
    docs: { usernames: { alice: { exists: true, data: () => ({ uid: 'u1' }) } } },
    profile: { isPublic: false },
  });
  const res = mockRes();
  await handler({ method: 'GET', query: { user: 'alice' } }, res);
  assert.equal(res.statusCode, 403);
});

test('publicProfile returns 200 with aggregated stats for a public profile', async () => {
  const tripDocs = [
    { data: () => ({ duration: 10, boardingLocation: { lat: 1, lng: 2 }, exitLocation: { lat: 3, lng: 4 } }) },
  ];
  const handler = loadPublicProfile({
    docs: { usernames: { alice: { exists: true, data: () => ({ uid: 'u1' }) } } },
    profile: { isPublic: true, displayName: 'Alice', username: 'alice', defaultAgency: 'TTC' },
    tripsSnap: { size: 1, forEach: (fn) => tripDocs.forEach(fn) },
  });
  const res = mockRes();
  await handler({ method: 'GET', query: { user: 'alice' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.totalTrips, 1);
  assert.equal(res.body.totalHours, Math.round((10 / 60) * 10) / 10);
  assert.equal(res.body.points.length, 2);
  assert.equal(res.body.displayName, 'Alice');
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
