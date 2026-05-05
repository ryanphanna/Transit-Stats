/**
 * Tests for route-aware stop lookup in db/stops.
 * Run with: node test_stops.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadStopsModule({ stops = [], stopRoutes = {} } = {}) {
  const stopsPath = require.resolve('./lib/db/stops');
  delete require.cache[stopsPath];

  const wrapDoc = (id, data) => ({
    id,
    data: () => data,
    ref: { update: async () => {} },
  });

  const fakeDb = {
    collection(name) {
      if (name === 'stops') {
        return {
          where(field, op, value) {
            if (field === 'agencies' && op === 'array-contains') {
              const docs = stops
                .filter(s => Array.isArray(s.data.agencies) && s.data.agencies.includes(value))
                .map(s => wrapDoc(s.id, s.data));
              return { get: async () => ({ docs, empty: docs.length === 0 }) };
            }
            throw new Error(`Unexpected stops.where: ${field} ${op}`);
          },
          get: async () => ({ docs: stops.map(s => wrapDoc(s.id, s.data)) }),
        };
      }

      if (name === 'stopRoutes') {
        return {
          doc(docId) {
            const routes = stopRoutes[docId];
            return {
              get: async () => ({
                exists: Array.isArray(routes),
                data: () => ({ routes: routes || [] }),
              }),
            };
          },
        };
      }

      throw new Error(`Unexpected collection: ${name}`);
    },
  };

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (parent && parent.id === stopsPath) {
      if (request === './core') return { db: fakeDb };
      if (request === '../constants') return { AGENCY_CITY: { TTC: 'Toronto' } };
      if (request === 'firebase-admin') {
        return {
          firestore: {
            FieldValue: { arrayUnion: (...v) => ({ _op: 'arrayUnion', values: v }) },
          },
        };
      }
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    return require('./lib/db/stops');
  } finally {
    Module._load = originalLoad;
  }
}

test('lookupStop: prefers candidate whose stopRoutes serves the requested route', async () => {
  const { lookupStop } = loadStopsModule({
    stops: [
      {
        id: 's_2070',
        data: { agencies: ['TTC'], code: '2070', name: 'Dufferin / Lawrence', aliases: [] },
      },
      {
        id: 's_5360',
        data: { agencies: ['TTC'], code: '5360', name: 'Dufferin / Lawrence', aliases: [] },
      },
    ],
    stopRoutes: {
      TTC_2070: ['929'],
      TTC_5360: ['52', '52B'],
    },
  });

  const result = await lookupStop(null, 'Dufferin / Lawrence', 'TTC', '52B');
  assert.ok(result);
  assert.equal(result.stopCode, '5360');
});

test('lookupStop: returns null when multiple same-name candidates are unconfirmed for route', async () => {
  const { lookupStop } = loadStopsModule({
    stops: [
      {
        id: 's_a',
        data: { agencies: ['TTC'], code: '1000', name: 'Main / King', aliases: [] },
      },
      {
        id: 's_b',
        data: { agencies: ['TTC'], code: '1001', name: 'Main / King', aliases: [] },
      },
    ],
    stopRoutes: {
      TTC_1000: ['1'],
      TTC_1001: ['2'],
    },
  });

  const result = await lookupStop(null, 'Main / King', 'TTC', '999');
  assert.equal(result, null);
});
