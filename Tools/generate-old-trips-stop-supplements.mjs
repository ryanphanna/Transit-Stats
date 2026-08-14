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
    { agency: 'TTC', name: 'Sherbourne Station', lat: 43.67214, lng: -79.37617, aliases: ['Sherbourne', 'sherb'] },
    { agency: 'TTC', name: 'Bay Station', lat: 43.669999, lng: -79.3909, aliases: ['Bay'] },
    { agency: 'TTC', name: 'Dundas Station', lat: 43.6554, lng: -79.38, aliases: ['Dundas'] },
    { agency: 'TTC', name: 'Kennedy Station', lat: 43.7322, lng: -79.2638, aliases: ['Kennedy'] },
    { agency: 'TTC', name: 'Queen Station', lat: 43.651654, lng: -79.379372, aliases: ['Queen'] },
    { agency: 'TTC', name: 'Finch Station', code: '14683', lat: 43.780942, lng: -79.414829, aliases: ['Finch Weet'] },
    { agency: 'TTC', name: 'Vaughan Metropolitan Centre Station - Subway Platform', code: '15662', lat: 43.794021, lng: -79.527906, aliases: ['Vaughan Metropolitan Centre'] },
    { agency: 'TTC', name: 'Yorkdale Station - Northbound Platform', code: '13837', lat: 43.725248, lng: -79.447692, aliases: ['Yorkdale'] },
    { agency: 'YRT', name: 'Vaughan Metropolitan Centre', lat: 43.7967, lng: -79.5279, aliases: ['Vaughan Metropolitan Centre'] },
    { agency: 'YRT', name: 'Finch GO Bus Terminal', lat: 43.78235, lng: -79.4154, aliases: ['Finch', 'Finch Station'] },
    { agency: 'GO Transit', code: 'BE', name: 'Bramalea GO', lat: 43.7022591, lng: -79.6887512, aliases: ['Bramalea'] },
    { agency: 'GO Transit', code: 'NI', name: 'Niagara Falls GO', lat: 43.108882, lng: -79.063319, aliases: ['Niagara Falls'] },
    { agency: 'GO Transit', code: 'UN', name: 'Union Station GO', lat: 43.645195, lng: -79.3806, aliases: ['Union'] },
    { agency: 'GO Transit', code: 'BU', name: 'Burlington GO', lat: 43.341265, lng: -79.809141, aliases: ['Burlington'] },
    { agency: 'GO Transit', code: 'AL', name: 'Aldershot GO', lat: 43.313385, lng: -79.855659, aliases: ['Aldershot'] },
    { agency: 'GO Transit', code: 'WR', name: 'West Harbour GO', lat: 43.266775, lng: -79.866222, aliases: ['West Harbour'] },
    { agency: 'GO Transit', code: 'BL', name: 'Bloor GO', lat: 43.656928, lng: -79.450192, aliases: ['Bloor'] },
    { agency: 'GO Transit', code: 'HA', name: 'Hamilton GO Centre', lat: 43.253284, lng: -79.869192, aliases: ['Hamilton GO'] },
    { agency: 'TriMet', code: '8346', name: 'NE 82nd Ave MAX Station', lat: 45.533237, lng: -122.577811, aliases: ['NE 82nd Av'] },
    { agency: 'TriMet', code: '7777', name: 'Pioneer Courthouse/SW 6th Ave MAX Stn', lat: 45.518964, lng: -122.678558, aliases: ['Pioneer Courthouse / SW 6th Av'] },
    { agency: 'GCRTA', code: 'place_tcc', name: 'Tower City-Public Sq Stn', lat: 41.497524, lng: -81.693986, aliases: ['Tower City'] },
    { agency: 'GCRTA', code: '10932', name: 'VAN AKEN & WARRENSVILLE STN', lat: 41.465969, lng: -81.537991, aliases: ['Van Aken / Warrensville'] },
    { agency: 'Community Transit', code: '3225', name: 'Hwy 99 EB Station', lat: 47.821055, lng: -122.315824, aliases: ['Hwy 99'] },
    { agency: 'Community Transit', code: '3236', name: 'Mill Creek Blvd WB Station', lat: 47.849542, lng: -122.221095, aliases: ['Mill Creek Blvd'] },
    { agency: 'CDTA', code: '02663', name: 'Lark/Library Station - Washington Ave & Lark St', lat: 42.656833, lng: -73.763564, aliases: ['Lark/Library'] },
    { agency: 'CDTA', code: '11177', name: 'Congress & 5th Ave', lat: 42.79766, lng: -73.95265, aliases: ['Congress'] },
    { agency: 'CDTA', code: '00791', name: 'North Central Station - River St & Glen Ave', lat: 42.75208, lng: -73.6824, aliases: ['North Central'] },
    { agency: 'CDTA', code: '02665', name: 'State/Downtown Station - State St & Lodge St', lat: 42.650374, lng: -73.753571, aliases: ['State/Downtown'] },
    { agency: 'CDTA', code: '02342', name: 'State St & Elm St', lat: 42.79737, lng: -73.92299, aliases: ['State'] },
    { agency: 'RATP', code: 'IDFM:monomodalStopPlace:58759', name: 'Charles de Gaulle - Etoile', lat: 48.874172759565376, lng: 2.295231447641207, aliases: ['Charles de Gauelle Etoile'] },
    { agency: 'RATP', code: 'IDFM:492289', name: 'Châtelet', lat: 48.85763833122418, lng: 2.3484113851972435, aliases: ['Chatelet des Halles'] },
    { agency: 'SNCF Transilien', code: 'IDFM:monomodalStopPlace:43231', name: 'Le Bourget', lat: 48.930744340383264, lng: 2.425825637815098, aliases: ['LE BOURGET EB'] },
    { agency: 'SNCF Transilien', code: 'IDFM:monomodalStopPlace:46298', name: 'Les Saules', lat: 48.74520105223681, lng: 2.4174549898851208, aliases: ['LES SAULES NB'] },
    { agency: 'Portland Aerial Tram', code: '12845', name: 'South Waterfront Lower Tram Terminal', lat: 45.499271, lng: -122.67101, aliases: ['Lower Terminal'] },
    { agency: 'Portland Aerial Tram', code: '12844', name: 'Marquam Hill Upper Tram Terminal', lat: 45.499497, lng: -122.683919, aliases: ['Upper Terminal'] },
    { agency: 'Portland Parks & Recreation', code: '815440', name: 'TriMet Washington Park MAX Station', lat: 45.510506, lng: -122.716546, aliases: ['Washington Park'] },
    { agency: 'Sacramento Regional Transit', code: '7017', name: '16th Street Station (EB)', lat: 38.569773, lng: -121.489018, aliases: ['16th Street Station'] },
    { agency: 'Sacramento Regional Transit', code: '7021', name: 'Fruitridge Station (EB)', lat: 38.525188, lng: -121.479969, aliases: ['Fruitridge Station'] },
    { agency: 'Spokane Transit', name: 'STA Plaza', lat: 47.6576, lng: -117.4226, aliases: ['STA Plaza'] },
    { agency: 'RTC Washoe', code: '9999', name: 'RTC 4TH STREET STATION', lat: 39.529959, lng: -119.810806, aliases: ['4th Street Station'] },
    { agency: 'RTC Washoe', code: '1948', name: 'Orchard Plaza Station', lat: 39.503384, lng: -119.802269, aliases: ['Orchard Plaza Station'] },
    { agency: 'RTC Washoe', code: '9997', name: 'RTC Transfer Center / Meadowood Mall', lat: 39.471835, lng: -119.782974, aliases: ['Meadowwood Mall'] },
    { agency: 'RTC Washoe', code: '3003', name: '9th Street Station', lat: 39.535469, lng: -119.816139, aliases: ['9th Street Station'] },
    { agency: 'RTC Washoe', code: '1929', name: 'RTC CENTENNIAL PLAZA Bay L (Rt 54)', lat: 39.534412, lng: -119.761948, aliases: ['Centennial Plaza'] },
    { agency: 'RTC Washoe', code: '403', name: 'N Virginia Street and W 17th Street', lat: 39.548199, lng: -119.821342, aliases: ['N Virginia / W 17th'] },
    { agency: 'RTC Washoe', code: '775', name: 'Glendale Avenue and S 21st Street', lat: 39.527794, lng: -119.771721, aliases: ['775'] },
    { agency: 'NFTA Metro', name: 'Ellicott Street & MTC Static', lat: 42.883406, lng: -78.872355, aliases: ['Metropolitan Transportation Center'] },
    { agency: 'NFTA Metro', code: '55880', name: 'Walden Avenue & Galleria Mall', lat: 42.908898, lng: -78.761561, aliases: ['Walden Galleria'] },
    { agency: 'Muni', name: 'Metro Embarcadero Station', lat: 37.792922, lng: -122.3967905, aliases: ['Embarcadero'] },
    { agency: 'TTC', name: 'North York Centre Station', lat: 43.767947, lng: -79.412542, aliases: ['North York Centre'] },
    { agency: 'TTC', name: 'Osgoode Station', lat: 43.651099, lng: -79.386688, aliases: ['Osgoode'] },
    { agency: 'C-Tran', code: '3485', name: 'SE 164th Ave & 6th St', lat: 45.61742, lng: -122.504494, aliases: ['SE 164th Av / 6th St'] },
    { agency: 'CDTA', code: '03417', name: 'Madison Ave & Empire State Plaza', lat: 42.648721, lng: -73.760902, aliases: ['Madison Av/Empire State Plaza'] },
    { agency: 'NFTA Metro', code: '37660', name: 'Niagara Falls Boulevard & Brighton Road', lat: 42.974221, lng: -78.823113, aliases: ['Niagara Falls Blvd Brighton Rd'] },
    { agency: 'GO Transit', code: '102646', name: 'Niagara College', lat: 43.140787, lng: -79.231727, aliases: ['Niagara College Glendale Campus'] },
    { agency: 'King County Metro', code: '9138', name: 'NE Campus Pkwy & 12th Ave NE - Bay 4', lat: 47.656839, lng: -122.316388, aliases: ['NE Campus Pkwy / 12th Ave NE'] },
    { agency: 'AC Transit', code: '52584', name: 'City Center NB', lat: 37.805901, lng: -122.270578, aliases: ['City Center'] },
    { agency: 'CDTA', code: '00459', name: 'Holland Ave & Notre Dame Dr', lat: 42.660112, lng: -73.780714, aliases: ['Holland Av/Notre Dame Dr'] },
    { agency: 'CDTA', code: '00374', name: 'Western Ave & Chapman Dr', lat: 42.670646, lng: -73.819373, aliases: ['Western Av/Chapman Dr'] },
    { agency: 'CDTA', code: '00855', name: '111th Street Station - 2nd Ave & 111th St', lat: 42.764645, lng: -73.774539, aliases: ['111th St Station'] },
    { agency: 'CDTA', code: '03248', name: "Broadway/SUNY Plaza Station - B'way & SUNY Plaza", lat: 42.683477, lng: -73.735771, aliases: ['Broadway/SUNY Plaza'] },
    { agency: 'CDTA', code: '03744', name: 'Downtown/Train Station - State St & Broadway', lat: 42.648533, lng: -73.750451, aliases: ['Downtown/Train Station'] },
    { agency: 'CDTA', code: '12969', name: 'Hedley District Station - King St & River St', lat: 42.739526, lng: -73.691626, aliases: ['Hedley District'] },
    { agency: 'CDTA', code: '07130', name: 'Riverfront Station - 4th St & Fulton St', lat: 42.737819, lng: -73.689992, aliases: ['Riverfront'] },
    { agency: 'CDTA', code: '02342', name: 'State St & Elm St', lat: 42.79737, lng: -73.92299, aliases: ['State'] },
    { agency: 'CDTA', code: '02665', name: 'State/Downtown Station - State St & Lodge St', lat: 42.650374, lng: -73.753571, aliases: ['State/Downtown'] },
    { agency: 'CDTA', code: '12143', name: 'Walmart-Wilton', lat: 43.087072, lng: -73.773011, aliases: ['Walmart'] },
    { agency: 'CDTA', code: '03419', name: 'West Mall Station - 855 Central Ave', lat: 42.668954, lng: -73.775784, aliases: ['West Mall'] },
    { agency: 'Exo', code: '74212', name: 'Terminus Centre-Ville Porte 16', lat: 45.497794, lng: -73.565732, aliases: ['Terminus Centre-Ville'] },
    { agency: 'Exo', code: '76047', name: 'Terminus Georges-Gagné - Quai 5', lat: 45.466495, lng: -73.471847, aliases: ['Terminus Georges-Gagné'] },
    { agency: 'Exo', code: '75655', name: 'Terminus Panama - Quai 15', lat: 45.472126, lng: -73.46779, aliases: ['Terminus Panama'] },
    { agency: 'GO Transit', code: 'KI', name: 'Kitchener GO', lat: 43.451639, lng: -80.49154, aliases: ['Kitchener'] },
    { agency: 'GO Transit', code: 'MP', name: 'Maple GO', lat: 43.854395, lng: -79.508102, aliases: ['Maple'] },
    { agency: 'GO Transit', code: 'KP', name: 'Kipling GO', lat: 43.635287, lng: -79.535374, aliases: ['Kipling'] },
    { agency: 'HSR', code: '2022', name: 'FRANK A. COOKE TERMINAL PLATFORM 1', lat: 43.238904, lng: -79.829514, aliases: ['FRANK A COOKE', 'Frank A. Cooke Terminal'] },
    { agency: 'HSR', code: '1434', name: 'LIME RIDGE TERMINAL PLATFORM 2', lat: 43.217207, lng: -79.859778, aliases: ['LIME RIDGE', 'Lime Ridge Terminal'] },
    { agency: 'HSR', code: '1077', name: 'HAMILTON GO CENTRE PLATFORM 17', lat: 43.252665, lng: -79.869522, aliases: ['Hamilton GO'] },
    { agency: 'MiWay', code: 'place_scomnb', name: 'South Common Centre NB', lat: 43.522623, lng: -79.662587, aliases: ['South Common Centre'] },
    { agency: 'MiWay', code: 'place_cksngo', name: 'Clarkson GO Station', lat: 43.518307, lng: -79.633574, aliases: ['Clarkson'] },
    { agency: 'MiWay', code: 'place_subway', name: 'Islington Subway Station', lat: 43.64525, lng: -79.5241, aliases: ['Islington'] },
    { agency: 'NFTA Metro', code: '33572', name: 'Michigan Avenue & Buffalo Creek Casino', lat: 42.886733, lng: -78.870929, aliases: ['Michigan Av Buffalo Creek Casino'] },
    { agency: 'NFTA Metro', code: '35870', name: 'Niagara Street & Hertel Avenue', lat: 42.946887, lng: -78.894612, aliases: ['Niagara Street Hertel Avenue South'] },
    { agency: 'NFTA Metro', code: '50822', name: 'South Rainbow Boulevard & 1st Street', lat: 43.083813, lng: -79.067065, aliases: ['South Rainbow Blvd 1st Street South'] },
    { agency: 'RATP', code: 'IDFM:monomodalStopPlace:46007', name: 'La Croix de Berny', lat: 48.763666, lng: 2.307858, aliases: ['La Croix de Berny eb'] },
    { agency: 'RATP', code: 'IDFM:425537', name: 'Bibliothèque', lat: 48.829833, lng: 2.376893, aliases: ['BIBLIOTHEQUE CHEVALERET'] },
    { agency: 'Sound Transit', code: '320', name: '2nd Ave & Seneca St', lat: 47.606905, lng: -122.33441, aliases: ['2nd Av / Seneca St'] },
    { agency: 'Sound Transit', code: '1901', name: 'Pacific Ave & S 19th St', lat: 47.239991, lng: -122.445685, aliases: ['Pacific Av / S 19th St'] },
    { agency: 'TriMet', code: '5975', name: 'Portland VA Medical Center', lat: 45.497058, lng: -122.683271, aliases: ['Portland VA Medical Center'] },
    { agency: 'TriMet', code: '10756', name: 'NW 11th & Couch', lat: 45.523784, lng: -122.682223, aliases: ['NW 11th / Couch'] },
    { agency: 'TriMet', code: '9633', name: 'SW 11th & Taylor', lat: 45.519059, lng: -122.683873, aliases: ['SW 11th / Taylor'] },
    { agency: 'TriMet', code: '10491', name: 'SW 5th & Hall', lat: 45.510277, lng: -122.682286, aliases: ['SW 5th / Hall'] },
    { agency: 'TriMet', code: '7625', name: 'SW 5th & Morrison', lat: 45.518932, lng: -122.677571, aliases: ['SW 5th / Morrison'] },
    { agency: 'TriMet', code: '11151', name: 'SW Rose Garden Way & Sherwood', lat: 45.51849, lng: -122.706187, aliases: ['SW Rose Garden Way / Sherwood'] },
    { agency: 'Sacramento Regional Transit', code: '7092', name: 'Sacramento Valley Station (WB)', lat: 38.584599, lng: -121.500373, aliases: ['Sacramento Valley Station'] },
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
