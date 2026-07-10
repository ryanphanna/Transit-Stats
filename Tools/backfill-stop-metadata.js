/**
 * APPLY: backfill direction/routes/alias for TTC stops in Firestore from TTC GTFS.
 * Same signals and guardrails as backfill_dryrun.js:
 *  - never overwrites existing name/aliases/direction/routes values, only adds
 *  - direction written only when >=90% of scheduled visits agree AND the
 *    official name suffix doesn't contradict it
 * Also writes stopRoutes/TTC_{code} docs (full route list per stop).
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
const headsignDirection = h => { const m = /^(north|south|east|west)\s*-/i.exec(h || ''); return m ? DIR_WORD[m[1].toLowerCase()] : null; };
const nameSuffixDirection = n => { const m = /\b(north|south|east|west)\s*side\b/i.exec(n || ''); return m ? DIR_WORD[m[1].toLowerCase()] : null; };

(async () => {
  const snap = await db.collection('stops').get();
  const ourStops = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(s => (s.agencies || [s.agency]).includes('TTC') && s.code);

  const gtfsStops = loadCsv('stops.txt', ['stop_id', 'stop_code', 'stop_name']);
  const byCode = new Map();
  for (const s of gtfsStops) {
    if (!s.stop_code) continue;
    if (!byCode.has(s.stop_code)) byCode.set(s.stop_code, []);
    byCode.get(s.stop_code).push(s);
  }
  const routes = new Map(loadCsv('routes.txt', ['route_id', 'route_short_name']).map(r => [r.route_id, r.route_short_name]));
  const trips = new Map(loadCsv('trips.txt', ['trip_id', 'route_id', 'trip_headsign'])
    .map(t => [t.trip_id, { route: routes.get(t.route_id), dir: headsignDirection(t.trip_headsign) }]));

  const interest = new Map();
  for (const s of ourStops) {
    for (const g of byCode.get(String(s.code)) || []) interest.set(g.stop_id, String(s.code));
  }

  const tally = new Map();
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(GTFS, 'stop_times.txt')) });
  let header = null, iTrip, iStop;
  for await (const line of rl) {
    if (!header) {
      header = parseCsvLine(line.replace(/^﻿/, ''));
      iTrip = header.indexOf('trip_id'); iStop = header.indexOf('stop_id');
      continue;
    }
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

  const now = admin.firestore.FieldValue.serverTimestamp();
  let updatedStops = 0, wroteStopRoutes = 0, setDirection = 0, addedRoutes = 0, addedAlias = 0;

  for (const s of ourStops) {
    const code = String(s.code);
    const gtfsMatches = byCode.get(code) || [];
    if (!gtfsMatches.length) continue;
    const officialName = gtfsMatches[0].stop_name || null;
    const rec = tally.get(code);
    const routeList = rec ? [...rec.routes.entries()].sort((a, b) => b[1] - a[1]).map(([r]) => r) : [];
    const dirs = rec ? [...rec.dirs.entries()].sort((a, b) => b[1] - a[1]) : [];
    const total = dirs.reduce((n, [, c]) => n + c, 0);
    let proposedDir = dirs[0] && dirs[0][1] / total >= 0.9 ? dirs[0][0] : null;
    const suffixDir = nameSuffixDirection(officialName);
    if (proposedDir && suffixDir && proposedDir !== suffixDir) proposedDir = null;
    if (!proposedDir && !dirs.length && suffixDir) proposedDir = suffixDir;

    const update = {};
    if (!s.direction && proposedDir) { update.direction = proposedDir; setDirection++; }
    const existingRoutes = (s.routes || []).map(x => String(x));
    const newRoutes = routeList.filter(r => !existingRoutes.some(x => x.toLowerCase() === r.toLowerCase()));
    if (newRoutes.length) { update.routes = admin.firestore.FieldValue.arrayUnion(...newRoutes); addedRoutes++; }
    const knownNames = [s.name, ...(s.aliases || [])].filter(Boolean).map(n => n.toLowerCase());
    if (officialName && !knownNames.includes(officialName.toLowerCase())) {
      update.aliases = admin.firestore.FieldValue.arrayUnion(officialName);
      addedAlias++;
    }
    if (Object.keys(update).length) {
      update.gtfsBackfilledAt = now;
      update.updatedAt = now;
      await db.collection('stops').doc(s.id).update(update);
      updatedStops++;
    }

    // stopRoutes doc: union of curated + GTFS routes (create or merge)
    if (routeList.length || existingRoutes.length) {
      const all = [...new Set([...existingRoutes, ...routeList])];
      await db.collection('stopRoutes').doc(`TTC_${code}`.replace(/[^a-zA-Z0-9_-]/g, '_')).set({
        agency: 'TTC',
        stopCode: code,
        routes: all,
        source: 'gtfs_backfill',
        updatedAt: now,
      }, { merge: true });
      wroteStopRoutes++;
    }
  }

  console.log({ updatedStops, setDirection, addedRoutes, addedAlias, wroteStopRoutes });
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
