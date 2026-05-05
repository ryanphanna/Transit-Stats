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
