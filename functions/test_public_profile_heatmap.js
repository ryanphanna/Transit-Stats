const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildHeatmapBands } = require('./lib/public-profile-heatmap');

function feature(routeId = '510') {
  return {
    __agency: 'TTC',
    geometry: { type: 'LineString', coordinates: [[0, 0], [10, 0], [20, 0]] },
    properties: {
      routeId,
      routeShortName: routeId,
      directionId: '0',
      stopOrder: ['start', 'middle', 'end'],
      stopPositions: [0, 0.5, 1],
    },
  };
}

test('buildHeatmapBands counts overlapping clipped trips', () => {
  const bands = buildHeatmapBands([
    { agency: 'TTC', route: '510', startStopCode: 'start', endStopCode: 'middle' },
    { agency: 'TTC', route: '510', startStopCode: 'start', endStopCode: 'end' },
  ], [feature()], 4);

  assert.deepEqual(bands.map(band => band.count), [2, 2, 1, 1]);
});

test('buildHeatmapBands does not merge separate route features', () => {
  const bands = buildHeatmapBands([
    { agency: 'TTC', route: '510', startStopCode: 'start', endStopCode: 'middle' },
    { agency: 'TTC', route: '510B', startStopCode: 'start', endStopCode: 'middle' },
  ], [feature('510'), feature('510B')], 2);

  assert.deepEqual(bands.map(band => band.count), [1, 1]);
});

test('buildHeatmapBands ignores reversed and unmatched trips', () => {
  const bands = buildHeatmapBands([
    { agency: 'TTC', route: '510', startStopCode: 'end', endStopCode: 'start' },
    { agency: 'TTC', route: '999', startStopCode: 'start', endStopCode: 'end' },
  ], [feature()], 4);

  assert.deepEqual(bands, []);
});
