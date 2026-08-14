import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const auditPath = '/Users/ryan/Desktop/Old Trips — Transit Stats Prep/working/gtfs-stop-match-audit.csv';
const outputPath = path.join(appRoot, 'js/old-trips-gtfs-supplements.js');

function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        const next = text[i + 1];
        if (quoted) {
            if (char === '"' && next === '"') { field += '"'; i += 1; }
            else if (char === '"') quoted = false;
            else field += char;
        } else if (char === '"') quoted = true;
        else if (char === ',') { row.push(field); field = ''; }
        else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
        else field += char;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    const headers = rows.shift();
    return rows.filter(values => values.some(Boolean)).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function normalize(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

const { LOCAL_GTFS_STOP_SUPPLEMENTS } = await import(pathToFileURL(path.join(appRoot, 'js/local-gtfs-stop-supplements.js')));
const existing = Object.values(LOCAL_GTFS_STOP_SUPPLEMENTS).flat();
const rows = parseCsv(fs.readFileSync(auditPath, 'utf8'))
    .filter(row => ['route+stop', 'stop-only'].includes(row.match) && row.gtfsName && row.lat && row.lng);

const grouped = new Map();
for (const row of rows) {
    const key = [row.agency, row.gtfsCode || normalize(row.gtfsName), row.lat, row.lng].join('|');
    const group = grouped.get(key) || {
        agency: row.agency,
        code: row.gtfsCode,
        name: row.gtfsName,
        lat: Number(row.lat),
        lng: Number(row.lng),
        aliases: new Set(),
    };
    if (row.rawStop && normalize(row.rawStop) !== normalize(row.gtfsName)) group.aliases.add(row.rawStop);
    grouped.set(key, group);
}

const supplements = {};
for (const group of grouped.values()) {
    const alreadyPresent = existing.some(stop => {
        const agencies = stop.agencies || (stop.agency ? [stop.agency] : []);
        if (!agencies.includes(group.agency)) return false;
        if (group.code && stop.code) return String(stop.code) === String(group.code);
        return normalize(stop.name) === normalize(group.name)
            && Math.abs(Number(stop.lat) - group.lat) < 0.0001
            && Math.abs(Number(stop.lng) - group.lng) < 0.0001;
    });
    if (alreadyPresent) continue;
    if (!supplements[group.agency]) supplements[group.agency] = [];
    supplements[group.agency].push({
        ...(group.code ? { code: group.code } : {}),
        name: group.name,
        lat: group.lat,
        lng: group.lng,
        ...(group.aliases.size ? { aliases: [...group.aliases].sort() } : {}),
    });
}

for (const stops of Object.values(supplements)) stops.sort((a, b) => a.name.localeCompare(b.name));
const output = `/**\n * Exact local-GTFS stop matches for the imported Old Trips history.\n * Generated from the read-only audit; raw trip records are not changed.\n */\nexport const OLD_TRIPS_GTFS_STOP_SUPPLEMENTS = ${JSON.stringify(supplements, null, 4)};\n`;
fs.writeFileSync(outputPath, output);
console.log(JSON.stringify({ agencies: Object.keys(supplements).length, stops: Object.values(supplements).reduce((sum, stops) => sum + stops.length, 0), outputPath }, null, 2));
