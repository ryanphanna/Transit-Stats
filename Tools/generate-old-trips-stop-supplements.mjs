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

// High-frequency labels that are intentionally shorter than the GTFS name.
// These are unambiguous from the agency/route context and are kept separate
// from the exact-match batch so the generated file remains reproducible.
const manualStops = [
    { agency: 'TTC', name: 'Sherbourne Station', lat: 43.67214, lng: -79.37617, aliases: ['Sherbourne'] },
    { agency: 'TTC', name: 'Bay Station', lat: 43.669999, lng: -79.3909, aliases: ['Bay'] },
    { agency: 'TTC', name: 'Dundas Station', lat: 43.6554, lng: -79.38, aliases: ['Dundas'] },
    { agency: 'TTC', name: 'Kennedy Station', lat: 43.7322, lng: -79.2638, aliases: ['Kennedy'] },
    { agency: 'YRT', name: 'Vaughan Metropolitan Centre', lat: 43.7967, lng: -79.5279, aliases: ['Vaughan Metropolitan Centre'] },
    { agency: 'GO Transit', code: 'BE', name: 'Bramalea GO', lat: 43.7022591, lng: -79.6887512, aliases: ['Bramalea'] },
    { agency: 'GO Transit', code: 'NI', name: 'Niagara Falls GO', lat: 43.108882, lng: -79.063319, aliases: ['Niagara Falls'] },
    { agency: 'GO Transit', code: 'UN', name: 'Union Station GO', lat: 43.645195, lng: -79.3806, aliases: ['Union'] },
    { agency: 'TriMet', code: '8346', name: 'NE 82nd Ave MAX Station', lat: 45.533237, lng: -122.577811, aliases: ['NE 82nd Av'] },
    { agency: 'TriMet', code: '7777', name: 'Pioneer Courthouse/SW 6th Ave MAX Stn', lat: 45.518964, lng: -122.678558, aliases: ['Pioneer Courthouse / SW 6th Av'] },
    { agency: 'GCRTA', code: 'place_tcc', name: 'Tower City-Public Sq Stn', lat: 41.497524, lng: -81.693986, aliases: ['Tower City'] },
    { agency: 'GCRTA', code: '10932', name: 'VAN AKEN & WARRENSVILLE STN', lat: 41.465969, lng: -81.537991, aliases: ['Van Aken / Warrensville'] },
    { agency: 'Community Transit', code: '3225', name: 'Hwy 99 EB Station', lat: 47.821055, lng: -122.315824, aliases: ['Hwy 99'] },
    { agency: 'Community Transit', code: '3236', name: 'Mill Creek Blvd WB Station', lat: 47.849542, lng: -122.221095, aliases: ['Mill Creek Blvd'] },
    { agency: 'RATP', code: 'IDFM:monomodalStopPlace:58759', name: 'Charles de Gaulle - Etoile', lat: 48.874172759565376, lng: 2.295231447641207, aliases: ['Charles de Gauelle Etoile'] },
    { agency: 'RATP', code: 'IDFM:492289', name: 'Châtelet', lat: 48.85763833122418, lng: 2.3484113851972435, aliases: ['Chatelet des Halles'] },
    { agency: 'SNCF Transilien', code: 'IDFM:monomodalStopPlace:43231', name: 'Le Bourget', lat: 48.930744340383264, lng: 2.425825637815098, aliases: ['LE BOURGET EB'] },
    { agency: 'SNCF Transilien', code: 'IDFM:monomodalStopPlace:46298', name: 'Les Saules', lat: 48.74520105223681, lng: 2.4174549898851208, aliases: ['LES SAULES NB'] },
    { agency: 'Portland Aerial Tram', code: '12845', name: 'South Waterfront Lower Tram Terminal', lat: 45.499271, lng: -122.67101, aliases: ['Lower Terminal'] },
    { agency: 'Portland Aerial Tram', code: '12844', name: 'Marquam Hill Upper Tram Terminal', lat: 45.499497, lng: -122.683919, aliases: ['Upper Terminal'] },
    { agency: 'Portland Parks & Recreation', code: '815440', name: 'TriMet Washington Park MAX Station', lat: 45.510506, lng: -122.716546, aliases: ['Washington Park'] },
];

for (const manual of manualStops) {
    if (!supplements[manual.agency]) supplements[manual.agency] = [];
    const existingManual = supplements[manual.agency].find(stop => (manual.code && stop.code === manual.code) || normalize(stop.name) === normalize(manual.name));
    if (existingManual) {
        existingManual.aliases = [...new Set([...(existingManual.aliases || []), ...(manual.aliases || [])])].sort();
    } else {
        supplements[manual.agency].push(manual);
    }
}

for (const stops of Object.values(supplements)) stops.sort((a, b) => a.name.localeCompare(b.name));
const output = `/**\n * Exact local-GTFS stop matches for the imported Old Trips history.\n * Generated from the read-only audit; raw trip records are not changed.\n */\nexport const OLD_TRIPS_GTFS_STOP_SUPPLEMENTS = ${JSON.stringify(supplements, null, 4)};\n`;
fs.writeFileSync(outputPath, output);
console.log(JSON.stringify({ agencies: Object.keys(supplements).length, stops: Object.values(supplements).reduce((sum, stops) => sum + stops.length, 0), outputPath }, null, 2));
