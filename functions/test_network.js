/**
 * Tests for NetworkEngine fallback behavior.
 * Run with: node test_network.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NetworkEngine } = require('./lib/network');

function makeDb(docsById) {
  return {
    collection(name) {
      assert.equal(name, 'networkGraph');
      return {
        doc(id) {
          return {
            get: async () => {
              const data = docsById[id];
              return {
                exists: !!data,
                data: () => data,
              };
            },
          };
        },
      };
    },
  };
}

test('load: returns personal graph when it has confident edges', async () => {
  const personalId = NetworkEngine._docId('u1', 'TTC', '510');
  const globalId = NetworkEngine._globalDocId('TTC', '510');
  const db = makeDb({
    [personalId]: {
      source: 'personal',
      edges: {
        e1: { fromStop: 'A', toStop: 'B', direction: 'Northbound', tripCount: 3 },
      },
    },
    [globalId]: {
      source: 'global',
      edges: {
        e2: { fromStop: 'A', toStop: 'C', direction: 'Northbound', tripCount: 9 },
      },
    },
  });

  const graph = await NetworkEngine.load(db, 'u1', 'TTC', '510');
  assert.equal(graph.source, 'personal');
});

test('load: falls back to global graph when personal graph has no confident edges', async () => {
  const personalId = NetworkEngine._docId('u1', 'TTC', '510');
  const globalId = NetworkEngine._globalDocId('TTC', '510');
  const db = makeDb({
    [personalId]: {
      source: 'personal',
      edges: {
        e1: { fromStop: 'A', toStop: 'B', direction: 'Northbound', tripCount: 1 },
      },
    },
    [globalId]: {
      source: 'global',
      edges: {
        e2: { fromStop: 'A', toStop: 'C', direction: 'Northbound', tripCount: 6 },
      },
    },
  });

  const graph = await NetworkEngine.load(db, 'u1', 'TTC', '510');
  assert.equal(graph.source, 'global');
});

test('loadGlobal: returns global graph by agency+route key', async () => {
  const globalId = NetworkEngine._globalDocId('TTC', '510');
  const db = makeDb({
    [globalId]: {
      source: 'global',
      edges: {},
    },
  });

  const graph = await NetworkEngine.loadGlobal(db, 'TTC', '510');
  assert.equal(graph.source, 'global');
});

// ---------------------------------------------------------------------------
// Writable in-memory mock — supports multiple collections, transactions, writes
// ---------------------------------------------------------------------------

function makeWriteableDb() {
  const store = {};
  const ref = (path) => ({
    _path: path,
    get: async () => ({
      exists: path in store,
      data: () => (path in store ? { ...store[path] } : undefined),
    }),
    set: async (data) => { store[path] = { ...data }; },
  });
  return {
    _store: store,
    collection: (c) => ({ doc: (id) => ref(`${c}/${id}`) }),
    runTransaction: async (fn) => {
      const tx = {
        get: async (r) => r.get(),
        set: (r, data) => { store[r._path] = { ...data }; },
      };
      await fn(tx);
    },
  };
}

// Valid trip for observe()
function observeTrip(overrides = {}) {
  return {
    route: '510',
    agency: 'TTC',
    direction: 'Northbound',
    startStopName: 'Spadina / College',
    endStopName: 'Spadina Station',
    duration: 8,
    ...overrides,
  };
}

// ─── _key ────────────────────────────────────────────────────────────────────

test('_key: lowercases and replaces spaces with underscores', () => {
  assert.equal(NetworkEngine._key('Spadina Station'), 'spadina_station');
});

test('_key: strips special characters', () => {
  assert.equal(NetworkEngine._key('Spadina / College'), 'spadina__college');
});

test('_key: handles route labels', () => {
  assert.equal(NetworkEngine._key('510'), '510');
  assert.equal(NetworkEngine._key('510A'), '510a');
  assert.equal(NetworkEngine._key('Red'), 'red');
});

// ─── getRoutesAtStop ─────────────────────────────────────────────────────────

test('getRoutesAtStop: returns empty object for unknown stop', async () => {
  const db = makeWriteableDb();
  assert.deepEqual(await NetworkEngine.getRoutesAtStop(db, 'TTC', 'Unknown Stop'), {});
});

test('getRoutesAtStop: returns empty object for missing args', async () => {
  const db = makeWriteableDb();
  assert.deepEqual(await NetworkEngine.getRoutesAtStop(db, null, 'Spadina Station'), {});
  assert.deepEqual(await NetworkEngine.getRoutesAtStop(db, 'TTC', null), {});
});

// ─── getConnectionsAtStop ────────────────────────────────────────────────────

test('getConnectionsAtStop: returns empty object for unknown stop', async () => {
  const db = makeWriteableDb();
  assert.deepEqual(await NetworkEngine.getConnectionsAtStop(db, 'TTC', 'Unknown Stop'), {});
});

// ─── _writeRouteStopIndex ────────────────────────────────────────────────────

test('_writeRouteStopIndex: writes a route with count 1', async () => {
  const db = makeWriteableDb();
  await NetworkEngine._writeRouteStopIndex(db, 'TTC', 'Spadina Station', '510');
  const result = await NetworkEngine.getRoutesAtStop(db, 'TTC', 'Spadina Station');
  assert.equal(result['510'], 1);
});

test('_writeRouteStopIndex: increments on repeated writes', async () => {
  const db = makeWriteableDb();
  await NetworkEngine._writeRouteStopIndex(db, 'TTC', 'Spadina Station', '510');
  await NetworkEngine._writeRouteStopIndex(db, 'TTC', 'Spadina Station', '510');
  await NetworkEngine._writeRouteStopIndex(db, 'TTC', 'Spadina Station', '510');
  assert.equal((await NetworkEngine.getRoutesAtStop(db, 'TTC', 'Spadina Station'))['510'], 3);
});

test('_writeRouteStopIndex: tracks multiple routes at the same stop', async () => {
  const db = makeWriteableDb();
  await NetworkEngine._writeRouteStopIndex(db, 'TTC', 'Spadina Station', '510');
  await NetworkEngine._writeRouteStopIndex(db, 'TTC', 'Spadina Station', '2');
  const result = await NetworkEngine.getRoutesAtStop(db, 'TTC', 'Spadina Station');
  assert.equal(result['510'], 1);
  assert.equal(result['2'], 1);
});

test('_writeRouteStopIndex: skips when any required arg is missing', async () => {
  const db = makeWriteableDb();
  await NetworkEngine._writeRouteStopIndex(db, null, 'Spadina Station', '510');
  await NetworkEngine._writeRouteStopIndex(db, 'TTC', null, '510');
  await NetworkEngine._writeRouteStopIndex(db, 'TTC', 'Spadina Station', null);
  assert.equal(Object.keys(db._store).length, 0);
});

// ─── _writeTransferIndex ─────────────────────────────────────────────────────

test('_writeTransferIndex: writes correct route pair key', async () => {
  const db = makeWriteableDb();
  await NetworkEngine._writeTransferIndex(db, 'TTC', 'Spadina Station', '510', '2');
  const result = await NetworkEngine.getConnectionsAtStop(db, 'TTC', 'Spadina Station');
  assert.equal(result['510_to_2'], 1);
});

test('_writeTransferIndex: increments on repeated transfers', async () => {
  const db = makeWriteableDb();
  await NetworkEngine._writeTransferIndex(db, 'TTC', 'Spadina Station', '510', '2');
  await NetworkEngine._writeTransferIndex(db, 'TTC', 'Spadina Station', '510', '2');
  assert.equal((await NetworkEngine.getConnectionsAtStop(db, 'TTC', 'Spadina Station'))['510_to_2'], 2);
});

test('_writeTransferIndex: tracks multiple transfer pairs at the same stop', async () => {
  const db = makeWriteableDb();
  await NetworkEngine._writeTransferIndex(db, 'TTC', 'Spadina Station', '510', '2');
  await NetworkEngine._writeTransferIndex(db, 'TTC', 'Spadina Station', '2', '510');
  const result = await NetworkEngine.getConnectionsAtStop(db, 'TTC', 'Spadina Station');
  assert.equal(result['510_to_2'], 1);
  assert.equal(result['2_to_510'], 1);
});

test('_writeTransferIndex: skips when any required arg is missing', async () => {
  const db = makeWriteableDb();
  await NetworkEngine._writeTransferIndex(db, null, 'Spadina Station', '510', '2');
  await NetworkEngine._writeTransferIndex(db, 'TTC', null, '510', '2');
  await NetworkEngine._writeTransferIndex(db, 'TTC', 'Spadina Station', null, '2');
  await NetworkEngine._writeTransferIndex(db, 'TTC', 'Spadina Station', '510', null);
  assert.equal(Object.keys(db._store).length, 0);
});

// ─── observe ─────────────────────────────────────────────────────────────────

test('observe: writes to routeStopIndex for boarding and alighting stops', async () => {
  const db = makeWriteableDb();
  await NetworkEngine.observe(db, 'user1', observeTrip());
  const boarding = await NetworkEngine.getRoutesAtStop(db, 'TTC', 'Spadina / College');
  const alighting = await NetworkEngine.getRoutesAtStop(db, 'TTC', 'Spadina Station');
  assert.equal(boarding['510'], 1, 'boarding stop should have route count');
  assert.equal(alighting['510'], 1, 'alighting stop should have route count');
});

test('observe: writes to transferIndex when prevRoute is provided', async () => {
  const db = makeWriteableDb();
  await NetworkEngine.observe(db, 'user1', observeTrip(), '506');
  const connections = await NetworkEngine.getConnectionsAtStop(db, 'TTC', 'Spadina / College');
  assert.equal(connections['506_to_510'], 1);
});

test('observe: does not write to transferIndex when prevRoute is null', async () => {
  const db = makeWriteableDb();
  await NetworkEngine.observe(db, 'user1', observeTrip(), null);
  const connections = await NetworkEngine.getConnectionsAtStop(db, 'TTC', 'Spadina / College');
  assert.deepEqual(connections, {});
});

test('observe: writes to both personal and global networkGraph', async () => {
  const db = makeWriteableDb();
  await NetworkEngine.observe(db, 'user1', observeTrip());
  const personalKey = NetworkEngine._docId('user1', 'TTC', '510');
  const globalKey = NetworkEngine._globalDocId('TTC', '510');
  assert.ok(`networkGraph/${personalKey}` in db._store, 'personal graph missing');
  assert.ok(`networkGraph/${globalKey}` in db._store, 'global graph missing');
});

test('observe: skips entirely when a required trip field is missing', async () => {
  const db = makeWriteableDb();
  await NetworkEngine.observe(db, 'user1', observeTrip({ route: null }));
  assert.equal(Object.keys(db._store).length, 0);
});

test('observe: skips when duration is 0', async () => {
  const db = makeWriteableDb();
  await NetworkEngine.observe(db, 'user1', observeTrip({ duration: 0 }));
  assert.equal(Object.keys(db._store).length, 0);
});

test('observe: skips when duration exceeds 180 min', async () => {
  const db = makeWriteableDb();
  await NetworkEngine.observe(db, 'user1', observeTrip({ duration: 181 }));
  assert.equal(Object.keys(db._store).length, 0);
});

test('observe: skips when direction is unrecognized', async () => {
  const db = makeWriteableDb();
  await NetworkEngine.observe(db, 'user1', observeTrip({ direction: 'diagonal' }));
  assert.equal(Object.keys(db._store).length, 0);
});

test('observe: normalizes direction aliases before writing', async () => {
  const db = makeWriteableDb();
  await NetworkEngine.observe(db, 'user1', observeTrip({ direction: 'nb' }));
  const globalKey = NetworkEngine._globalDocId('TTC', '510');
  const doc = db._store[`networkGraph/${globalKey}`];
  const edge = Object.values(doc.edges)[0];
  assert.equal(edge.direction, 'Northbound');
});

// ─── getMask ─────────────────────────────────────────────────────────────────

test('getMask: returns null when graph has no edges', () => {
  const graph = { edges: {} };
  assert.equal(NetworkEngine.getMask(graph, ['Stop A', 'Stop B'], 'Boarding Stop', 'Northbound'), null);
});

test('getMask: keeps reachable stops, filters known-unreachable, keeps unknown', () => {
  const graph = {
    edges: {
      e1: { fromStop: 'Boarding Stop', toStop: 'Stop A', direction: 'Northbound', tripCount: 3 },
      e2: { fromStop: 'Boarding Stop', toStop: 'Stop B', direction: 'Northbound', tripCount: 1 },
    },
  };
  // Stop A: reachable (tripCount 3 >= getMask default minTrips 2)
  // Stop B: known but not reachable (tripCount 1 < 2)
  // Stop C: unknown to graph — kept so model can still predict new stops
  const mask = NetworkEngine.getMask(graph, ['Stop A', 'Stop B', 'Stop C'], 'Boarding Stop', 'Northbound');
  assert.ok(mask !== null);
  assert.equal(mask[0], true,  'Stop A should be reachable');
  assert.equal(mask[1], false, 'Stop B known but below threshold — filtered');
  assert.equal(mask[2], true,  'Stop C unknown to graph — kept');
});

test('getMask: returns null when boarding stop has no edges from it', () => {
  const graph = {
    edges: {
      e1: { fromStop: 'Other Stop', toStop: 'Stop A', direction: 'Northbound', tripCount: 5 },
    },
  };
  assert.equal(NetworkEngine.getMask(graph, ['Stop A'], 'Boarding Stop', 'Northbound'), null);
});

test('getMask: infers reachability from reverse edges', () => {
  // Went B→BoardingStop southbound → BoardingStop→B northbound is reachable
  const graph = {
    edges: {
      e1: { fromStop: 'Stop B', toStop: 'Boarding Stop', direction: 'Southbound', tripCount: 3 },
    },
  };
  const mask = NetworkEngine.getMask(graph, ['Stop B', 'Stop C'], 'Boarding Stop', 'Northbound');
  assert.ok(mask !== null);
  assert.equal(mask[0], true, 'Stop B reachable via reverse southbound edge');
});

// ─── hour-slot travel time buckets ─────────────────────────────────────────

test('getMedianDuration: returns aggregate median when no hour specified', () => {
  const graph = {
    edges: {
      e1: {
        fromStop: 'King / Spadina',
        toStop: 'Spadina Station',
        direction: 'Westbound',
        durations: [10, 12, 14],
        medianMinutes: 12,
        durationsByHour: { '8': [8, 9, 10], '17': [15, 16, 17] },
        tripCount: 3,
      },
    },
  };
  assert.equal(NetworkEngine.getMedianDuration(graph, 'King / Spadina'), 12);
});

test('getMedianDuration: prefers hour bucket when it has ≥3 observations', () => {
  const graph = {
    edges: {
      e1: {
        fromStop: 'King / Spadina',
        toStop: 'Spadina Station',
        direction: 'Westbound',
        durations: [8, 10, 12, 14, 16],
        medianMinutes: 12,
        durationsByHour: { '8': [8, 9, 10] }, // median 9
        tripCount: 5,
      },
    },
  };
  // Hour 8 bucket has 3 observations — should use its median (9), not aggregate (12)
  assert.equal(NetworkEngine.getMedianDuration(graph, 'King / Spadina', 8), 9);
});

test('getMedianDuration: falls back to aggregate when hour bucket has <3 observations', () => {
  const graph = {
    edges: {
      e1: {
        fromStop: 'King / Spadina',
        toStop: 'Spadina Station',
        direction: 'Westbound',
        durations: [10, 12, 14],
        medianMinutes: 12,
        durationsByHour: { '8': [9] }, // only 1 observation — sparse
        tripCount: 3,
      },
    },
  };
  assert.equal(NetworkEngine.getMedianDuration(graph, 'King / Spadina', 8), 12);
});

test('getMedianDuration: falls back to aggregate when hour bucket missing entirely', () => {
  const graph = {
    edges: {
      e1: {
        fromStop: 'King / Spadina',
        toStop: 'Spadina Station',
        direction: 'Westbound',
        durations: [10, 12, 14],
        medianMinutes: 12,
        durationsByHour: {},
        tripCount: 3,
      },
    },
  };
  assert.equal(NetworkEngine.getMedianDuration(graph, 'King / Spadina', 22), 12);
});

test('observe: writes durationsByHour alongside flat durations', async () => {
  const db = makeWriteableDb();
  await NetworkEngine.observe(db, 'u1', {
    route: '510', agency: 'TTC', direction: 'Westbound',
    startStopName: 'King / Spadina', endStopName: 'Spadina Station', duration: 12,
  });

  const graphDoc = Object.values(db._store).find(d => d && d.edges);
  assert.ok(graphDoc, 'graph doc should have been written');
  const edge = Object.values(graphDoc.edges)[0];
  assert.ok(edge.durationsByHour, 'durationsByHour should exist on edge');
  const hourKey = new Date().getHours().toString();
  assert.ok(Array.isArray(edge.durationsByHour[hourKey]), 'current hour bucket should be an array');
  assert.ok(edge.durationsByHour[hourKey].includes(12), 'duration should be in hour bucket');
});
