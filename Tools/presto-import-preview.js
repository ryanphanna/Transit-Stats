#!/usr/bin/env node

/**
 * Preview a PRESTO Transit Usage Report without writing to Transit Stats.
 *
 * This intentionally produces transaction records, not canonical trips:
 * the report does not consistently identify route, direction, or destination.
 */

const fs = require('node:fs');

const AGENCY_ALIASES = new Map([
  ['Toronto Transit Commission', 'TTC'],
  ['GO Transit', 'GO'],
  ['Mississauga Transit', 'MiWay'],
  ['Hamilton Street Railway', 'HSR'],
  ['York Region Transit', 'YRT'],
]);

// Keep the source spelling while offering a reviewed rider-facing label.
const LOCATION_ALIASES = new Map([
  ['Toronto- New USBT', 'Union Station Bus Terminal'],
]);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (field || row.length > 0) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }

  const [headers, ...values] = rows;
  if (!headers?.length) throw new Error('CSV has no header row');
  return values
    .filter(value => value.length === headers.length && value.some(Boolean))
    .map(value => Object.fromEntries(headers.map((header, index) => [header, value[index]])));
}

function parseAmountCents(value) {
  const numeric = Number(String(value || '').replace(/[$,]/g, ''));
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric * 100);
}

function classifyType(value) {
  if (value === 'Fare Payment') return 'fare_payment';
  if (value === 'Period Pass Load') return 'period_pass_load';
  if (value === 'Epurse Load') return 'epurse_load';
  return 'unknown';
}

function dateSortKey(value) {
  const match = String(value || '').match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)$/i,
  );
  if (!match) return Number.POSITIVE_INFINITY;
  let hour = Number(match[4]);
  if (match[7].toUpperCase() === 'PM' && hour !== 12) hour += 12;
  if (match[7].toUpperCase() === 'AM' && hour === 12) hour = 0;
  return Date.UTC(
    Number(match[3]),
    Number(match[1]) - 1,
    Number(match[2]),
    hour,
    Number(match[5]),
    Number(match[6]),
  );
}

function toRecord(row, rowNumber) {
  const rawLocation = row.Location || null;
  return {
    rowNumber,
    occurredAtLocal: row.Date || null,
    agency: AGENCY_ALIASES.get(row.TransitAgency) || row.TransitAgency || null,
    agencySource: row.TransitAgency || null,
    type: classifyType(row.Type),
    amountCents: parseAmountCents(row.Amount),
    location: rawLocation,
    locationLabel: LOCATION_ALIASES.get(rawLocation) || rawLocation,
    locationAliasApplied: LOCATION_ALIASES.has(rawLocation),
    raw: row,
  };
}

function summarize(records) {
  const farePayments = records.filter(record => record.type === 'fare_payment');
  const loads = records.filter(record => record.type !== 'fare_payment');
  const amounts = records
    .map(record => record.amountCents)
    .filter(amount => Number.isInteger(amount));
  const dates = records
    .map(record => record.occurredAtLocal)
    .filter(Boolean)
    .sort((left, right) => dateSortKey(left) - dateSortKey(right));

  return {
    rows: records.length,
    farePayments: farePayments.length,
    loads: loads.length,
    fareChargedCents: -farePayments.reduce((total, record) => total + (record.amountCents || 0), 0),
    loadedCents: loads.reduce((total, record) => total + (record.amountCents || 0), 0),
    dateRange: dates.length ? { first: dates[0], last: dates[dates.length - 1] } : null,
    agencies: Object.fromEntries(
      [...new Set(records.map(record => record.agency).filter(Boolean))]
        .sort()
        .map(agency => [agency, records.filter(record => record.agency === agency).length]),
    ),
    aliasResolutions: records
      .filter(record => record.locationAliasApplied)
      .map(record => ({ raw: record.location, label: record.locationLabel })),
    invalidRows: records.filter(record => record.amountCents === null || !record.occurredAtLocal)
      .map(record => record.rowNumber),
    amountRangeCents: amounts.length ? { min: Math.min(...amounts), max: Math.max(...amounts) } : null,
  };
}

function loadReport(path) {
  const rows = parseCsv(fs.readFileSync(path, 'utf8'));
  return rows.map((row, index) => toRecord(row, index + 2));
}

if (require.main === module) {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: node Tools/presto-import-preview.js /path/to/transit_usage_report.csv');
    process.exitCode = 1;
  } else {
    const records = loadReport(path);
    console.log(JSON.stringify({ summary: summarize(records), records }, null, 2));
  }
}

module.exports = { classifyType, dateSortKey, loadReport, parseAmountCents, parseCsv, summarize, toRecord };
