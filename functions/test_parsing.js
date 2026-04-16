/**
 * Tests for SMS parsing logic
 * Run with: node test_parsing.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  parseMultiLineTripFormat,
  parseSingleLineTripFormat,
  parseEndTripFormat,
  isHeuristicLogValid,
} = require('./lib/parsing');

const DEFAULT_AGENCY = 'TTC';

// ─── parseMultiLineTripFormat ────────────────────────────────────────────────

test('multi-line: route + stop', () => {
  const result = parseMultiLineTripFormat('510\nSpadina / College', DEFAULT_AGENCY);
  assert.equal(result.route, '510');
  assert.equal(result.stop, 'Spadina / College');
  assert.equal(result.direction, null);
});

test('multi-line: route + stop + direction', () => {
  const result = parseMultiLineTripFormat('47\nLansdowne / Dupont\nNorth', DEFAULT_AGENCY);
  assert.equal(result.route, '47');
  assert.equal(result.stop, 'Lansdowne / Dupont');
  assert.equal(result.direction, 'Northbound');
});

test('multi-line: direction abbreviations', () => {
  assert.equal(parseMultiLineTripFormat('506\nCollege / Spadina\nEB', DEFAULT_AGENCY).direction, 'Eastbound');
  assert.equal(parseMultiLineTripFormat('506\nCollege / Spadina\nS', DEFAULT_AGENCY).direction, 'Southbound');
  assert.equal(parseMultiLineTripFormat('506\nCollege / Spadina\nWB', DEFAULT_AGENCY).direction, 'Westbound');
});

test('multi-line: single line returns null', () => {
  assert.equal(parseMultiLineTripFormat('510', DEFAULT_AGENCY), null);
});

test('multi-line: command on first line returns null', () => {
  assert.equal(parseMultiLineTripFormat('END\nSpadina', DEFAULT_AGENCY), null);
  assert.equal(parseMultiLineTripFormat('STATUS\nSpadina', DEFAULT_AGENCY), null);
});

test('multi-line: slash in stop name normalizes correctly', () => {
  const result = parseMultiLineTripFormat('506\nCollege/Spadina\nEast', DEFAULT_AGENCY);
  assert.equal(result.stop, 'College / Spadina'); // toTitleCase adds spaces around slashes
  assert.equal(result.direction, 'Eastbound');
});

test('multi-line: agency on line 3 when no direction', () => {
  const result = parseMultiLineTripFormat('47\nLansdowne / Dupont\nGO', DEFAULT_AGENCY);
  // GO is not a known agency so direction should be set
  assert.ok(result !== null);
});

// ─── parseSingleLineTripFormat ───────────────────────────────────────────────

test('single-line: route + stop + direction', () => {
  const result = parseSingleLineTripFormat('510 Spadina/College North', DEFAULT_AGENCY);
  assert.equal(result.route, '510');
  assert.equal(result.stop, 'Spadina / College'); // toTitleCase adds spaces around slashes
  assert.equal(result.direction, 'Northbound');
});

test('single-line: stop with spaces and slash', () => {
  const result = parseSingleLineTripFormat('47 Lansdowne / Dupont South', DEFAULT_AGENCY);
  assert.equal(result.route, '47');
  assert.equal(result.stop, 'Lansdowne / Dupont');
  assert.equal(result.direction, 'Southbound');
});

test('single-line: direction abbreviation', () => {
  const result = parseSingleLineTripFormat('506 College / Spadina EB', DEFAULT_AGENCY);
  assert.equal(result.route, '506');
  assert.equal(result.direction, 'Eastbound');
});

test('single-line: no direction returns null', () => {
  // Without direction we can\'t reliably distinguish from other message types
  assert.equal(parseSingleLineTripFormat('510 Spadina/College', DEFAULT_AGENCY), null);
});

test('single-line: only route + direction (no stop) returns null', () => {
  assert.equal(parseSingleLineTripFormat('510 North', DEFAULT_AGENCY), null);
});

test('single-line: multi-line input returns null', () => {
  assert.equal(parseSingleLineTripFormat('510\nSpadina\nNorth', DEFAULT_AGENCY), null);
});

test('single-line: sentence with motion phrase rejected by heuristic', () => {
  // "going to" in the stop triggers the sentence pattern
  assert.equal(parseSingleLineTripFormat('Hey going to Spadina North', DEFAULT_AGENCY), null);
});

test('single-line: tonight\'s failing case', () => {
  const result = parseSingleLineTripFormat('510 Spadina/College North', DEFAULT_AGENCY);
  assert.ok(result !== null, 'Should have parsed');
  assert.equal(result.route, '510');
  assert.equal(result.direction, 'Northbound');
});

// ─── parseEndTripFormat ──────────────────────────────────────────────────────

test('end: multi-line END + stop', () => {
  const result = parseEndTripFormat('End\nCollege / Spadina');
  assert.ok(result !== null);
  assert.equal(result.stop, 'College / Spadina');
  assert.equal(result.isEnd, true);
});

test('end: bare END', () => {
  const result = parseEndTripFormat('End');
  assert.ok(result !== null);
  assert.equal(result.stop, null);
});

test('end: STOP keyword works', () => {
  const result = parseEndTripFormat('STOP\nBathurst Station');
  assert.ok(result !== null);
  assert.equal(result.stop, 'Bathurst Station');
});

test('end: non-end message returns null', () => {
  assert.equal(parseEndTripFormat('510\nSpadina'), null);
  assert.equal(parseEndTripFormat('STATUS'), null);
});

test('end: END with notes', () => {
  const result = parseEndTripFormat('End\nCollege / Spadina\nCrowded');
  assert.equal(result.stop, 'College / Spadina');
  assert.equal(result.notes, 'Crowded');
});

test('end: single-line END [stop] returns null from parseEndTripFormat', () => {
  // Single-line end is handled by singleLineEndMatch in dispatcher, not this parser
  assert.equal(parseEndTripFormat('End College / Spadina'), null);
});

// ─── isHeuristicLogValid ─────────────────────────────────────────────────────

test('heuristic: valid stop and route', () => {
  assert.equal(isHeuristicLogValid('Spadina / College', '510'), true);
});

test('heuristic: sentence starter rejected', () => {
  assert.equal(isHeuristicLogValid('I am at Spadina', '510'), false);
  assert.equal(isHeuristicLogValid('Hey there', '510'), false);
});

test('heuristic: bad stop name rejected', () => {
  assert.equal(isHeuristicLogValid('BUS stop', '510'), false);
});

test('heuristic: empty inputs rejected', () => {
  assert.equal(isHeuristicLogValid('', '510'), false);
  assert.equal(isHeuristicLogValid('Spadina', ''), false);
  assert.equal(isHeuristicLogValid(null, '510'), false);
});

test('heuristic: motion sentence rejected', () => {
  assert.equal(isHeuristicLogValid('headed to spadina', '510'), false);
});

test('heuristic: stop too long rejected', () => {
  assert.equal(isHeuristicLogValid('A'.repeat(61), '510'), false);
});
