const {test} = require('node:test');
const assert = require('node:assert/strict');

const {
  canonicalizeStop,
  getStopFeature,
  normalizeRouteForMl,
  getGapFeatures,
} = require('./lib/ml_utils');

test('normalizeRouteForMl collapses TTC branch and shuttle variants', () => {
  assert.equal(normalizeRouteForMl('510A', 'TTC'), '510');
  assert.equal(normalizeRouteForMl('510 Shuttle', 'TTC'), '510');
  assert.equal(normalizeRouteForMl('510 Short Turn (to Queen)', 'TTC'), '510');
  assert.equal(normalizeRouteForMl('52G', 'TTC'), '52');
});

test('normalizeRouteForMl preserves distinct non-TTC route identities', () => {
  assert.equal(normalizeRouteForMl('Red', 'BART'), 'Red');
  assert.equal(normalizeRouteForMl('n', 'Muni'), 'N');
  assert.equal(normalizeRouteForMl('18c', 'GO Transit'), '18C');
  assert.equal(normalizeRouteForMl('1t', 'AC Transit'), '1T');
});

test('canonicalizeStop and getStopFeature normalize aliases consistently', () => {
  const lib = [
    {name: 'Spadina Ave at Nassau St South Side', aliases: ['Spadina / Nassau', 'SPADINA & NASSAU']},
  ];
  assert.equal(
      canonicalizeStop('SPADINA & NASSAU', lib),
      'spadina ave/nassau st south side',
  );
  assert.equal(
      getStopFeature('Spadina / Nassau', lib),
      'stop_spadina_ave_nassau_st_south_side',
  );
});

test('getGapFeatures encodes missing and present gaps predictably', () => {
  assert.deepEqual(getGapFeatures(null), {gapLog: 0, gapMissing: 1});
  assert.deepEqual(getGapFeatures(-5), {gapLog: 0, gapMissing: 1});

  const zero = getGapFeatures(0);
  assert.equal(zero.gapMissing, 0);
  assert.equal(zero.gapLog, 0);

  const sixty = getGapFeatures(60);
  assert.equal(sixty.gapMissing, 0);
  assert.ok(sixty.gapLog > 0);

  const capped = getGapFeatures(5000);
  const maxed = getGapFeatures(720);
  assert.equal(capped.gapMissing, 0);
  assert.equal(capped.gapLog, maxed.gapLog);
});
