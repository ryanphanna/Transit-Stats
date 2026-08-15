const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizePhoneNumber } = require('./lib/otp');

test('normalizePhoneNumber formats North American numbers as E.164', () => {
  assert.equal(normalizePhoneNumber('(519) 276-9853'), '+15192769853');
  assert.equal(normalizePhoneNumber('+1 519 276 9853'), '+15192769853');
});

test('normalizePhoneNumber retains international plus prefixes', () => {
  assert.equal(normalizePhoneNumber('+442071234567'), '+442071234567');
});
