const assert = require('node:assert/strict');
const test = require('node:test');

const {
  classifyType,
  dateSortKey,
  parseAmountCents,
  parseCsv,
  summarize,
  toRecord,
} = require('./presto-import-preview');

test('parses quoted commas and embedded newlines', () => {
  const rows = parseCsv(`Date,Location
"1/1/2026 1:00:00 PM","A, B
Terminal"
`);
  assert.equal(rows[0].Location, 'A, B\nTerminal');
});

test('classifies PRESTO report transaction types', () => {
  assert.equal(classifyType('Fare Payment'), 'fare_payment');
  assert.equal(classifyType('Period Pass Load'), 'period_pass_load');
  assert.equal(classifyType('Epurse Load'), 'epurse_load');
});

test('keeps cents exact and preserves the raw location alongside an alias', () => {
  const record = toRecord({
    Date: '4/22/2026 5:23:17 AM',
    TransitAgency: 'GO Transit',
    Location: 'Toronto- New USBT',
    Type: 'Fare Payment',
    Amount: '$-2.64',
  }, 19);

  assert.equal(parseAmountCents('$-2.64'), -264);
  assert.equal(record.location, 'Toronto- New USBT');
  assert.equal(record.locationLabel, 'Union Station Bus Terminal');
  assert.equal(record.locationAliasApplied, true);
  assert.equal(record.stopMatchStatus, 'pending');
});

test('summarizes dates chronologically instead of lexicographically', () => {
  const records = [
    toRecord({ Date: '7/30/2026 7:54:08 PM', TransitAgency: 'GO Transit', Location: 'Union', Type: 'Fare Payment', Amount: '$-4.38' }, 3),
    toRecord({ Date: '1/1/2026 12:13:10 PM', TransitAgency: 'Toronto Transit Commission', Location: 'A', Type: 'Period Pass Load', Amount: '$128.15' }, 2),
  ];
  const summary = summarize(records);

  assert.ok(dateSortKey('1/1/2026 12:13:10 PM') < dateSortKey('7/30/2026 7:54:08 PM'));
  assert.deepEqual(summary.dateRange, {
    first: '1/1/2026 12:13:10 PM',
    last: '7/30/2026 7:54:08 PM',
  });
  assert.equal(summary.fareChargedCents, 438);
  assert.equal(summary.loadedCents, 12815);
});
