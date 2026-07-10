const test = require('node:test');
const assert = require('node:assert');
const { buildStopEnrichment } = require('./lib/atlas-enrich');

const meta = (stops) => ({ generatedAt: 'x', stopCount: stops.length, stops });

test('buildStopEnrichment: fills direction, routes, official alias on a bare stop', () => {
  const result = buildStopEnrichment(
    { code: '7349', name: 'Spadina / Dundas', aliases: [] },
    meta([{ code: '7349', id: '7349', name: 'Spadina Ave at Dundas St West North Side', routes: ['510', '310'], direction: 'Northbound' }])
  );
  assert.deepEqual(result.stopUpdate, {
    direction: 'Northbound',
    newRoutes: ['510', '310'],
    newAliases: ['Spadina Ave at Dundas St West North Side'],
  });
  assert.deepEqual(result.stopRoutes, ['510', '310']);
});

test('buildStopEnrichment: never proposes touching name; existing values kept', () => {
  const result = buildStopEnrichment(
    { code: '7349', name: 'My Corner', direction: 'Southbound', routes: ['510'], aliases: ['Spadina Ave at Dundas St West North Side'] },
    meta([{ code: '7349', id: '7349', name: 'Spadina Ave at Dundas St West North Side', routes: ['510', '310'], direction: 'Northbound' }])
  );
  // direction already set (even though it disagrees) — not overwritten
  assert.equal(result.stopUpdate.direction, undefined);
  assert.deepEqual(result.stopUpdate.newRoutes, ['310']);
  assert.equal(result.stopUpdate.newAliases, undefined);
  assert.equal(Object.hasOwn(result.stopUpdate, 'name'), false);
});

test('buildStopEnrichment: paired platforms sharing a code only agree-on facts', () => {
  const result = buildStopEnrichment(
    { code: '99', name: 'X', aliases: [] },
    meta([
      { code: '99', id: 'a', name: 'X St North Side', routes: ['510'], direction: 'Northbound' },
      { code: '99', id: 'b', name: 'X St South Side', routes: ['510'], direction: 'Southbound' },
    ])
  );
  assert.equal(result.stopUpdate.direction, undefined, 'conflicting directions -> no direction');
  assert.deepEqual(result.stopUpdate.newRoutes, ['510']);
  assert.deepEqual(result.stopUpdate.newAliases, ['X St North Side', 'X St South Side']);
});

test('buildStopEnrichment: returns null when nothing to add or no match', () => {
  const full = { code: '1', name: 'A', direction: 'Northbound', routes: ['510'], aliases: ['Official A'] };
  assert.equal(buildStopEnrichment(full, meta([{ code: '1', id: '1', name: 'Official A', routes: ['510'], direction: 'Northbound' }])), null);
  assert.equal(buildStopEnrichment({ code: '404', name: 'B' }, meta([])), null);
  assert.equal(buildStopEnrichment({ name: 'no code' }, meta([])), null);
});
