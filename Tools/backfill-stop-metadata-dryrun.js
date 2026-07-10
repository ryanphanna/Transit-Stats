/**
 * DRY RUN: propose direction/routes/alias backfill for TTC stops in Firestore
 * from the official TTC GTFS feed. Writes nothing.
 *
 * Signals per stop code:
 *  - routes: route_short_names actually serving the stop (stop_times -> trips -> routes)
 *  - direction: majority of trip_headsign direction prefixes at the stop
 *  - cross-check: side-of-street suffix in the official GTFS stop name
 */
const fs = require('fs');
const readline = require('readline');
const path = require('path');
const admin = require(path.join('/Users/ryan/Desktop/Production/Transit Stats/functions/node_modules/firebase-admin'));

admin.initializeApp({
  credential: admin.credential.cert(require('/Users/ryan/Desktop/Dev/Credentials/Firebase for Transit Stats.json')),
});
const db = admin.firestore();
const GTFS = path.join(__dirname, 'ttc_gtfs');

// Minimal CSV line parser (TTC feed has no embedded commas in the fields we use,
// but handle quotes defensively)
function parseCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function loadCsv(file, wantedCols) {
  const lines = fs.readFileSync(path.join(GTFS, file), 'utf8').split('\n');
  const header = parseCsvLine(lines[0].replace(/^﻿/, '').trim());
  const idx = Object.fromEntries(wantedCols.map(c => [c, header.indexOf(c)]));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = parseCsvLine(line);
    rows.push(Object.fromEntries(wantedCols.map(c => [c, cells[idx[c]]])));
  }
  return rows;
}

const DIR_WORD = { north: 'Northbound', south: 'Southbound', east: 'Eastbound', west: 'Westbound' };

function headsignDirection(headsign) {
  const m = /^(north|south|east|west)\s*-/i.exec(headsign || '');
  return m ? DIR_WORD[m[1].toLowerCase()] : null;
}

function nameSuffixDirection(name) {
  const m = /\b(north|south|east|west)\s*side\b/i.exec(name || '');
  return m ? DIR_WORD[m[1].toLowerCase()] : null;
}

(async () => {
  // 1. Our stops needing data
  const snap = await db.collection('stops').get();
  const ourStops = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(s => (s.agencies || [s.agency]).includes('TTC') && s.code);
  console.error(`Firestore TTC stops with a code: ${ourStops.length}`);

  // 2. GTFS lookups
  const gtfsStops = loadCsv('stops.txt', ['stop_id', 'stop_code', 'stop_name']);
  const byCode = new Map(); // stop_code -> [{stop_id, stop_name}]
  for (const s of gtfsStops) {
    if (!s.stop_code) continue;
    if (!byCode.has(s.stop_code)) byCode.set(s.stop_code, []);
    byCode.get(s.stop_code).push(s);
  }
  const routes = new Map(loadCsv('routes.txt', ['route_id', 'route_short_name'])
    .map(r => [r.route_id, r.route_short_name]));
  const trips = new Map(loadCsv('trips.txt', ['trip_id', 'route_id', 'trip_headsign'])
    .map(t => [t.trip_id, { route: routes.get(t.route_id), dir: headsignDirection(t.trip_headsign) }]));

  // 3. stop_ids of interest
  const interest = new Map(); // stop_id -> our stop code
  for (const s of ourStops) {
    for (const g of byCode.get(String(s.code)) || []) interest.set(g.stop_id, String(s.code));
  }
  console.error(`GTFS stop_ids matched: ${interest.size}`);

  // 4. Stream stop_times, tally route + direction per our stop code
  const tally = new Map(); // code -> { routes: Map, dirs: Map }
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(GTFS, 'stop_times.txt')) });
  let header = null, iTrip, iStop;
  for await (const line of rl) {
    if (!header) {
      header = parseCsvLine(line.replace(/^﻿/, ''));
      iTrip = header.indexOf('trip_id'); iStop = header.indexOf('stop_id');
      continue;
    }
    // fast path: split is safe for these two leading columns
    const cells = line.split(',');
    const code = interest.get(cells[iStop]);
    if (!code) continue;
    const t = trips.get(cells[iTrip]);
    if (!t) continue;
    if (!tally.has(code)) tally.set(code, { routes: new Map(), dirs: new Map() });
    const rec = tally.get(code);
    if (t.route) rec.routes.set(t.route, (rec.routes.get(t.route) || 0) + 1);
    if (t.dir) rec.dirs.set(t.dir, (rec.dirs.get(t.dir) || 0) + 1);
  }

  // 5. Build proposals
  const rows = [];
  const summary = { propose: 0, alreadyComplete: 0, noGtfsMatch: 0, dirAmbiguous: 0, signalConflict: 0 };
  for (const s of ourStops.sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }))) {
    const code = String(s.code);
    const gtfsMatches = byCode.get(code) || [];
    const officialName = gtfsMatches[0]?.stop_name || null;
    const rec = tally.get(code);

    if (!gtfsMatches.length) {
      summary.noGtfsMatch++;
      rows.push({ code, name: s.name, status: 'NO GTFS MATCH', official: '-', direction: '-', routes: '-' });
      continue;
    }

    const routeList = rec ? [...rec.routes.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r) : [];
    const dirs = rec ? [...rec.dirs.entries()].sort((a, b) => b[1] - a[1]) : [];
    const total = dirs.reduce((n, [, c]) => n + c, 0);
    const topDir = dirs[0] && dirs[0][1] / total >= 0.9 ? dirs[0][0] : null;
    const suffixDir = nameSuffixDirection(officialName);

    let dirNote = '';
    let proposedDir = topDir;
    if (topDir && suffixDir && topDir !== suffixDir) {
      summary.signalConflict++;
      dirNote = ` CONFLICT(name says ${suffixDir})`;
      proposedDir = null; // don't write on conflict
    } else if (!topDir && dirs.length > 1) {
      summary.dirAmbiguous++;
      dirNote = ` AMBIGUOUS(${dirs.map(([d, c]) => `${d}:${c}`).join(' ')})`;
    } else if (!topDir && suffixDir) {
      proposedDir = suffixDir;
      dirNote = ' (from name suffix)';
    }

    const needsDir = !s.direction && proposedDir;
    const existingRoutes = s.routes || [];
    const newRoutes = routeList.filter(r => !existingRoutes.map(x => String(x).toLowerCase()).includes(r.toLowerCase()));
    const needsRoutes = newRoutes.length > 0;
    const needsAlias = officialName && ![s.name, ...(s.aliases || [])].some(n => n && n.toLowerCase() === officialName.toLowerCase());

    if (!needsDir && !needsRoutes && !needsAlias) {
      summary.alreadyComplete++;
      continue;
    }
    summary.propose++;
    rows.push({
      code,
      name: s.name,
      status: 'PROPOSE',
      official: needsAlias ? `+alias "${officialName}"` : '(alias ok)',
      direction: s.direction ? `keep ${s.direction}` : (proposedDir ? `set ${proposedDir}${dirNote}` : `none${dirNote}`),
      routes: needsRoutes ? `+[${newRoutes.join(', ')}]${existingRoutes.length ? ` (have [${existingRoutes.join(', ')}])` : ''}` : '(routes ok)',
    });
  }

  for (const r of rows) {
    console.log([r.code.padEnd(6), r.status.padEnd(14), (r.name || '').padEnd(34), r.direction.padEnd(42), r.routes.padEnd(40), r.official].join(' | '));
  }
  console.error('\nSummary: ' + JSON.stringify(summary));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
