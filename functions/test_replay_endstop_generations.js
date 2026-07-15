const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseArgs,
  createV6State,
  chooseWithNetworkFallback,
  predictV6,
  observeReplayGraph,
} = require('../Tools/replay-endstop-generations');

test('replay args: NetworkEngine replay defaults off', () => {
  const args = parseArgs(['node', 'script', 'user-1']);
  assert.equal(args.network, false);
});

test('replay args: --network enables replay and explicit false disables it', () => {
  assert.equal(parseArgs(['node', 'script', 'user-1', '--network']).network, true);
  assert.equal(parseArgs(['node', 'script', 'user-1', '--network=false']).network, false);
  assert.equal(parseArgs(['node', 'script', 'user-1', '--network', '--no-network']).network, false);
});

test('replay V6: NetworkEngine narrowing falls back inside the same bucket', () => {
  const counter = new Map([
    ['college', 2],
    ['st. george', 1],
  ]);
  const topologyLegal = new Set(['college', 'st. george']);
  const networkLegal = new Set(['st. george']);

  const result = chooseWithNetworkFallback(counter, 2, topologyLegal, networkLegal);

  assert.ok(result.choice);
  assert.equal(result.choice.stops[0].stop, 'college');
  assert.equal(result.constraintSource, 'topology+network-fallback');
});

test('replay V6: prediction does not train the replay graph before observation', () => {
  const state = createV6State('TTC', true);
  const trip = {
    id: 't1',
    userId: 'u1',
    agency: 'TTC',
    route: '510',
    direction: 'Southbound',
    startStopName: 'Spadina Station',
    endStopName: 'Queens Quay',
    startTime: new Date('2026-05-01T12:00:00Z'),
    endTime: new Date('2026-05-01T12:12:00Z'),
    duration: 12,
  };

  predictV6(trip, state, 2);
  assert.equal(state.network.graphs.size, 0);

  observeReplayGraph(state.network, trip, null);
  assert.equal(state.network.graphs.size, 2);
});
