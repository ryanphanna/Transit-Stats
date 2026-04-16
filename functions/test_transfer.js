/**
 * Tests for TransferEngine
 * Run with: node test_transfer.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TransferEngine } = require('./lib/transfer');

// Helper to build a fake trip
function trip({ route, startStop, endStop, startTime, endTime, journeyId } = {}) {
  const toTS = (d) => ({ toDate: () => d });
  return {
    id: Math.random().toString(36).slice(2),
    route: route || '510',
    startStopName: startStop || 'Spadina / College',
    endStopName: endStop || 'Spadina Station',
    startTime: toTS(startTime || new Date('2026-04-15T20:00:00Z')),
    endTime: toTS(endTime || new Date('2026-04-15T20:10:00Z')),
    journeyId: journeyId || null,
  };
}

// Build a pair of linked trips (with journeyId) for history
function linkedPair({ routeA = '510', routeB = '2', endStop = 'Spadina Station', startStop = 'Spadina Station', gap = 5, baseTime = new Date('2026-04-15T20:00:00Z') } = {}) {
  const id = Math.random().toString(36).slice(2);
  const endTime = new Date(baseTime.getTime() + 10 * 60000);
  const nextStart = new Date(endTime.getTime() + gap * 60000);
  const nextEnd = new Date(nextStart.getTime() + 8 * 60000);
  return [
    trip({ route: routeA, endStop, endTime, journeyId: id, startTime: baseTime }),
    trip({ route: routeB, startStop, startTime: nextStart, endTime: nextEnd, journeyId: id }),
  ];
}

// ─── extractTransfers ────────────────────────────────────────────────────────

test('extractTransfers: finds transfer from linked pair', () => {
  const history = linkedPair({ routeA: '510', routeB: '2', endStop: 'Spadina Station', startStop: 'Spadina Station', gap: 5 });
  const transfers = TransferEngine.extractTransfers(history);
  assert.equal(transfers.length, 1);
  assert.equal(transfers[0].routeA, '510');
  assert.equal(transfers[0].routeB, '2');
  assert.ok(Math.abs(transfers[0].gap - 5) < 1);
});

test('extractTransfers: ignores trips without journeyId', () => {
  const history = [trip(), trip()];
  const transfers = TransferEngine.extractTransfers(history);
  assert.equal(transfers.length, 0);
});

test('extractTransfers: ignores single-trip journeys', () => {
  const t = trip({ journeyId: 'abc' });
  const transfers = TransferEngine.extractTransfers([t]);
  assert.equal(transfers.length, 0);
});

// ─── score ───────────────────────────────────────────────────────────────────

test('score: cold start, small gap links', () => {
  const prev = trip({ endStop: 'Spadina Station', endTime: new Date('2026-04-15T20:10:00Z') });
  const next = trip({ startStop: 'Spadina Station', startTime: new Date('2026-04-15T20:20:00Z') });
  const confidence = TransferEngine.score(prev, next, []);
  assert.ok(confidence >= TransferEngine.CONFIDENCE_THRESHOLD, `Expected >= ${TransferEngine.CONFIDENCE_THRESHOLD}, got ${confidence}`);
});

test('score: cold start, large gap does not link', () => {
  const prev = trip({ endStop: 'Spadina Station', endTime: new Date('2026-04-15T20:10:00Z') });
  const next = trip({ startStop: 'Spadina Station', startTime: new Date('2026-04-15T21:00:00Z') });
  const confidence = TransferEngine.score(prev, next, []);
  assert.ok(confidence < TransferEngine.CONFIDENCE_THRESHOLD);
});

test('score: known stop pair within typical gap links', () => {
  const history = [
    ...linkedPair({ routeA: '47', routeB: '506', endStop: 'Lansdowne / Dupont', startStop: 'Lansdowne / Dupont', gap: 4 }),
    ...linkedPair({ routeA: '47', routeB: '506', endStop: 'Lansdowne / Dupont', startStop: 'Lansdowne / Dupont', gap: 6 }),
  ];
  const prev = trip({ route: '47', endStop: 'Lansdowne / Dupont', endTime: new Date('2026-04-15T20:10:00Z') });
  const next = trip({ route: '506', startStop: 'Lansdowne / Dupont', startTime: new Date('2026-04-15T20:15:00Z') });
  const confidence = TransferEngine.score(prev, next, history);
  assert.ok(confidence >= TransferEngine.CONFIDENCE_THRESHOLD, `Expected >= ${TransferEngine.CONFIDENCE_THRESHOLD}, got ${confidence}`);
});

test('score: known stop pair but gap way outside historical range does not link', () => {
  // Historical transfers at this stop averaged 5 min — 31 min should not link
  const history = [
    ...linkedPair({ endStop: 'Lansdowne / Dupont', startStop: 'Lansdowne / Dupont', gap: 4 }),
    ...linkedPair({ endStop: 'Lansdowne / Dupont', startStop: 'Lansdowne / Dupont', gap: 5 }),
    ...linkedPair({ endStop: 'Lansdowne / Dupont', startStop: 'Lansdowne / Dupont', gap: 6 }),
  ];
  const prev = trip({ endStop: 'Lansdowne / Dupont', endTime: new Date('2026-04-15T20:10:00Z') });
  const next = trip({ startStop: 'Lansdowne / Dupont', startTime: new Date('2026-04-15T20:41:00Z') }); // 31 min gap
  const confidence = TransferEngine.score(prev, next, history);
  assert.ok(confidence < TransferEngine.CONFIDENCE_THRESHOLD, `Expected < ${TransferEngine.CONFIDENCE_THRESHOLD}, got ${confidence}`);
});

test('score: negative gap returns 0', () => {
  const prev = trip({ endTime: new Date('2026-04-15T20:10:00Z') });
  const next = trip({ startTime: new Date('2026-04-15T20:05:00Z') });
  assert.equal(TransferEngine.score(prev, next, []), 0);
});

test('score: gap over 90 min returns 0', () => {
  const prev = trip({ endTime: new Date('2026-04-15T20:00:00Z') });
  const next = trip({ startTime: new Date('2026-04-15T21:31:00Z') });
  assert.equal(TransferEngine.score(prev, next, []), 0);
});

test('score: tonight\'s false positive (31 min, no history) does not link', () => {
  // Before TransferEngine, two 47 trips 31 min apart got linked — should not happen without history
  const prev = trip({ route: '47', endStop: 'College / Lansdowne', endTime: new Date('2026-04-16T00:56:00Z') });
  const next = trip({ route: '47', startStop: 'College / Lansdowne', startTime: new Date('2026-04-16T01:00:00Z') });
  // With only 4 min gap it would still link — the issue was 31 min. Let's test 31 min.
  const prev2 = trip({ route: '47', endStop: 'Lansdowne / Dupont', endTime: new Date('2026-04-16T00:20:00Z') });
  const next2 = trip({ route: '47', startStop: 'Lansdowne / Dupont', startTime: new Date('2026-04-16T00:51:00Z') });
  const confidence = TransferEngine.score(prev2, next2, []);
  assert.ok(confidence < TransferEngine.CONFIDENCE_THRESHOLD, `31-min gap with no history should not link, got ${confidence}`);
});

// ─── _stopMatch ──────────────────────────────────────────────────────────────

test('_stopMatch: same name matches', () => {
  assert.equal(TransferEngine._stopMatch('Spadina Station', 'Spadina Station'), true);
});

test('_stopMatch: different punctuation matches', () => {
  assert.equal(TransferEngine._stopMatch('Lansdowne / Dupont', 'Lansdowne/Dupont'), true);
});

test('_stopMatch: case insensitive', () => {
  assert.equal(TransferEngine._stopMatch('spadina station', 'Spadina Station'), true);
});

test('_stopMatch: different stops do not match', () => {
  assert.equal(TransferEngine._stopMatch('Spadina Station', 'Bathurst Station'), false);
});

test('_stopMatch: null inputs return false', () => {
  assert.equal(TransferEngine._stopMatch(null, 'Spadina Station'), false);
  assert.equal(TransferEngine._stopMatch('Spadina Station', null), false);
});
