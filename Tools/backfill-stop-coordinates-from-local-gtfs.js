/**
 * Backfill missing coordinates on existing normalized stops from local GTFS
 * stop feeds. This is deliberately additive: it never changes trips, names,
 * aliases, codes, or other stop metadata.
 *
 * Usage:
 *   node Tools/backfill-stop-coordinates-from-local-gtfs.js
 *   node Tools/backfill-stop-coordinates-from-local-gtfs.js --apply
 *   node Tools/backfill-stop-coordinates-from-local-gtfs.js --agency TTC
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const KEY_PATH = '/Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json';
const DEFAULT_GTFS_ROOT = '/Users/ryan/Desktop/Data/GTFS/Files';
const APPLY = process.argv.includes('--apply');
const AGENCY_FILTER = valueAfter('--agency');
const GTFS_ROOT = valueAfter('--gtfs-root') || DEFAULT_GTFS_ROOT;

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function normalize(value) {
  return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const input = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    if (row.some(value => value !== '')) rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0].map(header => header.trim());
  return rows.slice(1).map(values => Object.fromEntries(headers.map((header, i) => [header, values[i] || ''])));
}

function readZipEntry(zipPath, entryName) {
  try {
    const entries = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
        .split(/\r?\n/)
        .filter(Boolean);
    const entry = entries.find(candidate => candidate.toLowerCase() === entryName.toLowerCase())
      || entries.find(candidate => candidate.toLowerCase().endsWith(`/${entryName.toLowerCase()}`));
    if (!entry) return '';
    return execFileSync('unzip', ['-p', zipPath, entry], {
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

function findZips(root) {
  const result = [];
  for (const name of fs.readdirSync(root)) {
    const fullPath = path.join(root, name);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) result.push(...findZips(fullPath));
    else if (name.toLowerCase().endsWith('.zip')) result.push(fullPath);
  }
  return result;
}

function canonicalAgencies(agencyRows, zipPath) {
  const values = agencyRows.map(row => `${row.agency_name} ${row.agency_id}`).join(' ').toLowerCase();
  const file = zipPath.toLowerCase();
  const matches = new Set();
  const add = (agency, pattern) => { if (pattern.test(values) || pattern.test(file)) matches.add(agency); };
  add('TTC', /\bttc\b|toronto transit/);
  add('GO Transit', /go transit|metrolinx/);
  add('YRT', /york region transit|\byrt\b/);
  add('Oakville Transit', /oakville transit/);
  add('MiWay', /miway/);
  add('AC Transit', /ac transit/);
  add('BART', /bay area rapid transit|\bbart\b/);
  add('MTS', /san diego mts|\bmts\b/);
  add('Muni', /san francisco municipal transportation agency|sfmta|\bmuni\b/);
  add('SamTrans', /samtrans|san mateo county transit/);
  add('VTA', /santa clara valley transportation authority|\bvta\b/);
  add('Santa Rosa CityBus', /santa rosa citybus/);
  add('CDTA', /\bcdta\b|capital district transportation/);
  add('NFTA Metro', /\bnfta\b|nfta metro/);
  return [...matches];
}

function validCoordinate(row) {
  const lat = Number(row.stop_lat);
  const lng = Number(row.stop_lon);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function coordinateKey(lat, lng) {
  return `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;
}

async function run() {
  initializeApp({ credential: cert(require(KEY_PATH)) });
  const db = getFirestore();
  const snapshot = await db.collection('stops').get();
  const stops = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const missing = stops.filter(stop => !validCoordinate({ stop_lat: stop.lat, stop_lon: stop.lng }));
  const feeds = [];
  const zipPaths = findZips(GTFS_ROOT);

  for (const zipPath of zipPaths) {
    const agencyRows = parseCsv(readZipEntry(zipPath, 'agency.txt'));
    const agencies = canonicalAgencies(agencyRows, zipPath);
    if (!agencies.length) continue;
    const rows = parseCsv(readZipEntry(zipPath, 'stops.txt')).filter(validCoordinate);
    if (rows.length) feeds.push({ zipPath, agencies, rows });
  }

  const targets = AGENCY_FILTER ? missing.filter(stop => (stop.agencies || [stop.agency]).includes(AGENCY_FILTER)) : missing;
  const proposals = [];
  const unmatched = [];
  const ambiguous = [];

  for (const stop of targets) {
    const stopAgencies = stop.agencies || [stop.agency];
    const candidates = [];
    for (const feed of feeds) {
      if (!feed.agencies.some(agency => stopAgencies.includes(agency))) continue;
      for (const row of feed.rows) {
        const codeMatch = stop.code && String(row.stop_code || '') === String(stop.code);
        const nameMatch = !stop.code && normalize(row.stop_name) === normalize(stop.name);
        if (codeMatch || nameMatch) candidates.push({ ...row, feed: feed.zipPath });
      }
    }
    const uniqueCoordinates = new Map();
    for (const candidate of candidates) uniqueCoordinates.set(coordinateKey(candidate.stop_lat, candidate.stop_lon), candidate);
    if (!uniqueCoordinates.size) {
      unmatched.push(stop);
    } else if (uniqueCoordinates.size > 1) {
      ambiguous.push({ stop, candidates: [...uniqueCoordinates.values()] });
    } else {
      const candidate = [...uniqueCoordinates.values()][0];
      proposals.push({
        id: stop.id,
        agency: stop.agency,
        name: stop.name,
        code: stop.code || '',
        lat: Number(candidate.stop_lat),
        lng: Number(candidate.stop_lon),
        feed: path.relative(GTFS_ROOT, candidate.feed),
        match: stop.code ? 'code' : 'canonical name',
      });
    }
  }

  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} · ${feeds.length} relevant GTFS feeds · ${targets.length} missing stops`);
  console.log(`Proposed coordinate updates: ${proposals.length}`);
  console.log(`Unmatched: ${unmatched.length} · ambiguous: ${ambiguous.length}`);
  for (const proposal of proposals) {
    console.log(`UPDATE ${proposal.agency} · ${proposal.name}${proposal.code ? ` [${proposal.code}]` : ''} → ${proposal.lat},${proposal.lng} (${proposal.match}; ${proposal.feed})`);
  }
  for (const stop of unmatched) console.log(`UNMATCHED ${stop.agency} · ${stop.name}${stop.code ? ` [${stop.code}]` : ''}`);
  for (const item of ambiguous) console.log(`AMBIGUOUS ${item.stop.agency} · ${item.stop.name}${item.stop.code ? ` [${item.stop.code}]` : ''} · ${item.candidates.map(c => `${c.stop_lat},${c.stop_lon}`).join(' | ')}`);

  if (!APPLY || !proposals.length) return;
  let batch = db.batch();
  let writes = 0;
  for (const proposal of proposals) {
    batch.update(db.collection('stops').doc(proposal.id), { lat: proposal.lat, lng: proposal.lng });
    writes += 1;
    if (writes === 450) {
      await batch.commit();
      batch = db.batch();
      writes = 0;
    }
  }
  if (writes) await batch.commit();
  console.log(`Applied ${proposals.length} coordinate updates. No trip documents were written.`);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
