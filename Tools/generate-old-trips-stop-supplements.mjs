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
    { agency: 'Metrolinx', code: 'BL', name: 'Bloor GO', lat: 43.656928, lng: -79.450192, aliases: ['Bloor'] },
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
    { agency: 'HSR', code: '1252', name: 'BARTON at STRATHEARNE', lat: 43.246871, lng: -79.797046, aliases: ['Barton / Strathearne'] },
    { agency: 'HSR', code: '2710', name: 'MAIN opposite EAST BEND', lat: 43.244696, lng: -79.828894, aliases: ['MAIN / EAST BEND'] },
    { agency: 'HSR', code: '9210', name: 'UPPER JAMES at MONARCH', lat: 43.235929, lng: -79.878613, aliases: ['Upper James / Monarch'] },
    { agency: 'HSR', code: '2314', name: 'INVERNESS at WAVELL', lat: 43.243111, lng: -79.874638, aliases: ['Inverness / Wavell'] },
    { agency: 'HSR', code: '1092', name: 'JOHN at JACKSON', lat: 43.253676, lng: -79.867418, aliases: ['John / Jackson'] },
    { agency: 'HSR', code: '2702', name: 'MAIN at JOHN', lat: 43.254724, lng: -79.867108, aliases: ['Main / John'] },
    { agency: 'HSR', code: '2839', name: 'MAIN at MACNAB', lat: 43.255871, lng: -79.872194, aliases: ['MAIN/McNAB'] },
    { agency: 'HSR', code: '2782', name: 'KENILWORTH at MAIN', lat: 43.240733, lng: -79.809715, aliases: ['Kenilworth / Main'] },
    { agency: 'HSR', code: '2649', name: 'MAIN at EMERSON', lat: 43.257648, lng: -79.919485, aliases: ['Main / Emerson'] },
    { agency: 'HSR', code: '4433', name: 'CONFEDERATION GO PLATFORM 4', lat: 43.24248, lng: -79.75987, aliases: ['Confederation GO'] },
    { agency: 'HSR', code: '2722', name: 'QUEENSTON opposite EASTGATE SQUARE', lat: 43.228646, lng: -79.767501, aliases: ['EASTGATE SQUARE'] },
    { agency: 'HSR', code: '1088', name: 'MAIN at HUGHSON', lat: 43.255118, lng: -79.868915, aliases: ['Main / Hughson'] },
    { agency: 'Niagara Region Transit', code: '3634', name: 'Morrison-Dorchester Hub', lat: 43.103486, lng: -79.115698, aliases: ['Morrison-dorchester Hub'] },
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
    { agency: 'TTC', code: '3214', name: 'Yonge St at Bloor St West - Bloor Station', lat: 43.670441, lng: -79.386954, aliases: ['Bloor-Yonge', 'BLOOR-YONGE', 'b-y', 'bloor'] },
    { agency: 'TTC', code: '13765', name: 'Dufferin Station - Eastbound Platform', lat: 43.660849, lng: -79.43389, aliases: ['Dufferin'] },
    { agency: 'TTC', code: '13745', name: 'Pape Station - Westbound Platform', lat: 43.679649, lng: -79.345787, aliases: ['Pape'] },
    { agency: 'TTC', code: '13808', name: 'College Station - Northbound Platform', lat: 43.661449, lng: -79.383088, aliases: ['College'] },
    { agency: 'TTC', code: '13821', name: 'St Patrick Station - Northbound Platform', lat: 43.655249, lng: -79.388388, aliases: ['St Patrick'] },
    { agency: 'TTC', code: '13824', name: "Queen's Park Station - Northbound Platform", lat: 43.660549, lng: -79.390689, aliases: ["Queen's Park", 'Queen’s Park'] },
    { agency: 'TTC', code: '13813', name: 'King Station - Northbound Platform', lat: 43.649649, lng: -79.378088, aliases: ['King'] },
    { agency: 'TTC', code: '13767', name: 'Lansdowne Station - Westbound Platform', lat: 43.659314, lng: -79.442471, aliases: ['Lansdowne'] },
    { agency: 'TTC', code: '13748', name: 'Chester Station - Eastbound Platform', lat: 43.678241, lng: -79.352502, aliases: ['Chester'] },
    { agency: 'TTC', code: '13801', name: 'Summerhill Station - Northbound Platform', lat: 43.683349, lng: -79.391189, aliases: ['Summerhill'] },
    { agency: 'TTC', code: '13863', name: 'Bloor Station - Northbound Platform', lat: 43.671044, lng: -79.385918, aliases: ['Bloor'] },
    { agency: 'TTC', code: '14669', name: 'Eglinton Station', lat: 43.704582, lng: -79.39846, aliases: ['eg'] },
    { agency: 'TTC', code: '14743', name: 'Ossington Station', lat: 43.662271, lng: -79.426546, aliases: ['oss'] },
    { agency: 'TTC', code: '12415', name: 'Eastern Ave at Coxwell Ave', lat: 43.665602, lng: -79.316143, aliases: ['Eastern Av / Coxwell Av'] },
    { agency: 'TTC', code: '14278', name: 'Pearson Airport Terminal 3 (Arrivals Level Columns C8-C12)', lat: 43.686811, lng: -79.620932, aliases: ['Pearson Terminal 3 Arrivals'] },
    { agency: 'TTC', code: '12085', name: 'Spadina Ave at Queens Quay West North Side', lat: 43.638141, lng: -79.39201, aliases: ['Spadina / Queens Quay W North'] },
    { agency: 'MiWay', code: 'place_blokip', name: 'Bloor/Kipling', lat: 43.64182, lng: -79.535388, aliases: ['Kipling'] },
    { agency: 'HSR', code: '9231', name: 'MOUNTAIN TRANSIT CENTRE PLATFORM 3', lat: 43.184684, lng: -79.901928, aliases: ['Mountain Transit Terminal'] },
    { agency: 'HSR', code: '1039', name: 'KING at KESWICK', lat: 43.233257, lng: -79.814253, aliases: ['King / Keswick'] },
    { agency: 'Grand River Transit', code: '1446', name: 'Fairview / Bishop', lat: 43.391761, lng: -80.341924, aliases: ['Fairview'] },
    { agency: 'CDTA', code: '03407', name: 'Madison Station - S. Pearl St & Madison Ave', lat: 42.645641, lng: -73.754822, aliases: ['Madison'] },
    { agency: 'CDTA', code: '12964', name: 'Watervliet 19th St Station - 2nd Ave & 19th St', lat: 42.729788, lng: -73.701482, aliases: ['Waterline 19th St'] },
    { agency: 'CDTA', code: 'ritaid', name: 'Rite Aid', lat: 42.65046, lng: -73.752242, aliases: ['126th St/Rite Aid'] },
    { agency: 'NFTA Metro', code: '35615', name: 'Niagara Street & Blackrock Transit Hub', lat: 42.945641, lng: -78.907132, aliases: ['Black Rock Riverside Transit Hub'] },
    { agency: 'NFTA Metro', code: '160', name: '3rd Street & Old Falls Street', lat: 43.085908, lng: -79.059189, aliases: ['3rd St / Old Falls Street S'] },
    { agency: 'NFTA Metro', code: '36680', name: 'North Division Street & Main Street', lat: 42.883248, lng: -78.874593, aliases: ['N Division / Main St W'] },
    { agency: 'Niagara Region Transit', code: '102646', name: 'Niagara College - Glendale Campus', lat: 43.140787, lng: -79.231727, aliases: ['Niagara College Glendale Campus'] },
    { agency: 'GO Transit', code: '02153', name: 'Wilfrid Laurier University', lat: 43.4752655, lng: -80.5272827, aliases: ['Wilfred Laurier University'] },
    { agency: 'STM', code: '53816', name: 'Notre-Dame / Place Saint-Henri', lat: 45.47768, lng: -73.584619, aliases: ['Note-Dame/Place Saint-Henri'] },
    { agency: 'Exo', code: '81001', name: 'Arthur-Sauvé / devant le terminus Saint-Eustache', lat: 45.561705, lng: -73.893171, aliases: ['Terminus Saint-Eustache'] },
    { agency: 'CDPQ Infra', code: 'ST_GCT_1', name: 'Station Gare Centrale', lat: 45.500048, lng: -73.566978, aliases: ['Gare Centrale'] },
    { agency: 'CDPQ Infra', code: 'ST_PAN_1', name: 'Station Panama', lat: 45.464961, lng: -73.470599, aliases: ['Terminus Panama'] },
    { agency: 'GCRTA', code: '07693', name: 'SUPERIOR AV & E 6TH ST', lat: 41.501256, lng: -81.690363, aliases: ['Superior Av / 6th St'] },
    { agency: 'GCRTA', code: 'place_98s', name: 'West Blvd-Cudell Station', lat: 41.480275, lng: -81.753276, aliases: ['West Blvd-Cudwell'] },
    { agency: 'GCRTA', code: '00546', name: '2064 STEARNS RD', lat: 41.502392, lng: -81.609213, aliases: ['Stokes / Stearns'] },
    { agency: 'HSR', code: '101006', name: 'King St. W. @ Summers Ln. (Hamilton Place)', lat: 43.2576485, lng: -79.8717346, aliases: ['101006'] },
    { agency: 'Niagara Region Transit', code: '6208', name: 'VICTORIA AV + CENTRE ST', lat: 43.092335, lng: -79.07583, aliases: ['Ellen Av / Centre St'] },
    { agency: 'TriMet', code: '8343', name: 'Lloyd Center/NE 11th Ave MAX Station', lat: 45.530067, lng: -122.653638, aliases: ['Lloyd Center / NE 11th Av'] },
    { agency: 'TriMet', code: '8344', name: 'Hollywood/NE 42nd Ave MAX Station', lat: 45.532772, lng: -122.620708, aliases: ['Hollywood / NE 42nd Av'] },
    { agency: 'TriMet', code: '5846', name: 'Tigard Transit Center', lat: 45.429962, lng: -122.769151, aliases: ['Tigard'] },
    { agency: 'TriMet', code: '9818', name: 'Beaverton TC MAX Station', lat: 45.49133, lng: -122.801723, aliases: ['Beaverton'] },
    { agency: 'TriMet', code: '1496', name: 'SE Division & 8th', lat: 45.506113, lng: -122.658157, aliases: ['SE Division'] },
    { agency: 'TriMet', code: '13720', name: 'SE Park Ave MAX Station', lat: 45.430734, lng: -122.635065, aliases: ['SE Park Av'] },
    { agency: 'C-Tran', code: '6136', name: '7th Street at Turtle Place', lat: 45.626637, lng: -122.672005, aliases: ['7th Street / Turtle Place'] },
    { agency: 'Sound Transit', code: 'C09', name: 'International District Chinatown', lat: 47.598355, lng: -122.327992, aliases: ['International District / Chinatown'] },
    { agency: 'King County Metro', code: '77780', name: '5th Ave NE & NE 155th St', lat: 47.741787, lng: -122.323616, aliases: ['5th Av NE / NE 155th St'] },
    { agency: 'King County Metro', code: '59310', name: 'Andover Park W & Baker Blvd - Bay 2', lat: 47.457752, lng: -122.254478, aliases: ['Andover Park W / Baker Blvd'] },
    { agency: 'Utah Transit Authority', code: 'TX136084', name: '900 South Station', lat: 40.750058, lng: -111.896818, aliases: ['900 S'] },
    { agency: 'Sacramento Regional Transit', code: '7085', name: 'Historic Folsom Station (EB)', lat: 38.67635, lng: -121.180717, aliases: ['Historic Folsom'] },
    { agency: 'BART', code: '901301', name: 'Powell Street', lat: 37.784645, lng: -122.407387, aliases: ['Powell'] },
    { agency: 'BART', code: 'place_MLBR', name: 'Millbrae', lat: 37.5999, lng: -122.38675, aliases: ['Milbrae'] },
    { agency: 'Muni', code: '15731', name: 'Metro Montgomery Station/Downtown', lat: 37.789219, lng: -122.401351, aliases: ['Montgomery'] },
    { agency: 'Muni', code: '17356', name: 'UCSF Medical Center (Mariposa)', lat: 37.764391, lng: -122.388853, aliases: ['UCSF Medical Center'] },
    { agency: 'AC Transit', code: '51732', name: 'West Oakland BART', lat: 37.804564, lng: -122.295234, aliases: ['West Oakland'] },
    { agency: 'Caltrain', code: 'palo_alto', name: 'Palo Alto Station', lat: 37.44322, lng: -122.16429, aliases: ['Pablo Alto'] },
    { agency: 'SNCF Transilien', code: 'IDFM:462398', name: 'Aéroport CDG 1 (Terminal 3) - RER', lat: 49.00979397116337, lng: 2.5614121946317394, aliases: ['cdg'] },
    { agency: 'SNCF Transilien', code: 'IDFM:monomodalStopPlace:43077', name: 'Épinay-sur-Seine', lat: 48.95382604164122, lng: 2.302388375122374, aliases: ['Epinay-Sur-Siene'] },
    { agency: 'SNCF Transilien', code: 'IDFM:monomodalStopPlace:43071', name: 'Aulnay-sous-Bois', lat: 48.932150935734064, lng: 2.495597257815759, aliases: ['Aunlay sous Bois'] },
    { agency: 'RATP', code: 'IDFM:423008', name: 'Belle Epine Sud', lat: 48.75507429749962, lng: 2.36899383752397, aliases: ['La Belle Épine'] },
    { agency: 'RATP', code: 'IDFM:37799', name: 'Villejuif - Louis Aragon', lat: 48.78739974788206, lng: 2.3673642847378, aliases: ['Villejuif - Luis Aragon', 'VILLEJUIF - Luis Aragon'] },
    { agency: 'RATP', code: 'IDFM:22300', name: 'Les Coteaux', lat: 48.857297064253984, lng: 2.22063818146947, aliases: ['Les Coteaux'] },
    { agency: 'RATP', code: 'IDFM:491715', name: 'Chevilly-Larue', lat: 48.75906281542096, lng: 2.366360901588132, aliases: ['Cheville-Larue', 'CHEVILLY-LERUE'] },
    { agency: 'RATP', code: 'IDFM:28522', name: 'Trinité', lat: 48.87704768127846, lng: 2.33075707239642, aliases: ['trinite - d’estienne d’orleans'] },
    { agency: 'RATP', code: 'IDFM:28568', name: 'Sèvres - Babylone', lat: 48.8516516819961, lng: 2.3278261391472945, aliases: ['Sevres - Babylone'] },
    { agency: 'RATP', code: 'IDFM:492987', name: 'Palais Royal - Musée du Louvre', lat: 48.862102557345764, lng: 2.337573615859602, aliases: ['Palais Royale - Musee du Louvre'] },
    { agency: 'RATP', code: 'IDFM:22168', name: "Place d'Italie", lat: 48.830914982874944, lng: 2.356101612821528, aliases: ["PLACE S’ITALIE", "PLACE D’ITALIE"] },
    { agency: 'RATP', code: 'IDFM:470519', name: "Gare de l'Est", lat: 48.87857171221123, lng: 2.360305141171757, aliases: ['GARE DE L’EST'] },
    { agency: 'RATP', code: 'IDFM:28518', name: 'Porte des Lilas - Métro', lat: 48.877020944405615, lng: 2.4057888074179923, aliases: ['PORTE DES LINAS'] },
    { agency: 'TMB', code: '000329', name: 'Sant Adrià Centre', lat: 41.432803, lng: 2.215877, aliases: ['SANT ADRIÀ CENTRE'] },
    { agency: 'TMB', code: '001520', name: 'Diagonal - Pg de Gràcia', lat: 41.396809, lng: 2.160304, aliases: ['Passeig de Gràcia'] },
    { agency: 'TMB', code: '101151', name: 'Metro Artigues-St. Adrià', lat: 41.43383833, lng: 2.21654212, aliases: ['ARTIGUES / ZSANT ADRIÀ', 'ARTIGUES / SANT ADRIA'] },
    { agency: 'TMB', code: '001092', name: 'Metro La Pau', lat: 41.422866, lng: 2.205485, aliases: ['LA PAU'] },
    { agency: 'TMB', code: '001004', name: 'Metro Paral·lel', lat: 41.375031, lng: 2.170619, aliases: ['PARAL•LEL'] },
    { agency: 'TMB', code: '000493', name: 'Diagonal - Gran Via Carles III', lat: 41.387589, lng: 2.125577, aliases: ['DIAGONAL / GRAN VIA CARLES III'] },
    { agency: 'TMB', code: '000928', name: 'Diagonal - Muntaner', lat: 41.394302, lng: 2.150403, aliases: ['DIAGONAL / MUNTANER'] },
    { agency: 'TMB', code: '000753', name: 'Aiguablava - La Fosca', lat: 41.448396, lng: 2.181763, aliases: ['AIGUABLAVA / LA FOSCA / TRINITAT NOVA'] },
    { agency: 'TMB', code: '001210', name: 'Pl Catalunya - Pg de Gràcia', lat: 41.387757, lng: 2.169316, aliases: ['CATALUNYA'] },
    { agency: 'TMB', code: '000315', name: 'Pg de Sant Joan - Diputació', lat: 41.395419, lng: 2.174671, aliases: ['PG DE SANT JOAN / DIPUTACIO'] },
    { agency: 'TMB', code: '000123', name: 'Arc de Triomf', lat: 41.391274, lng: 2.178718, aliases: ['ARC DE TRIomf'] },
    { agency: 'TMB', code: '001376', name: 'Carles III - Maria Cristina', lat: 41.387436, lng: 2.126945, aliases: ['MARIA CRISTINA'] },
    { agency: 'TMB', code: '000635', name: 'Dos de Maig - Sant Antoni Maria Claret', lat: 41.41157, lng: 2.175979, aliases: ['SANT PAU / DOS DE MAIG'] },
    { agency: 'TMB', code: '001033', name: 'Guipúscoa - Verneda', lat: 41.425066, lng: 2.208422, aliases: ['VERNEDA'] },
    { agency: 'TMB', code: '001227', name: 'Pg Sant Joan - Diputació', lat: 41.399839, lng: 2.170428, aliases: ['PG DE SANT JOAN / DIPUTACIO'] },
    { agency: 'TMB', code: '003352', name: 'Sant Roc', lat: 41.436616, lng: 2.22282, aliases: ['SANt ROC'] },
    { agency: 'TMB', code: '100770', name: 'Metro Sant Roc', lat: 41.43418457, lng: 2.2276193, aliases: ['SANT ROC'] },
    { agency: 'TMB', code: '003038', name: 'Av del Baix Llobregat - Sant Antoni Maria Claret', lat: 41.367782, lng: 2.08033, aliases: ['SANT ANTONY'] },
    { agency: 'TMB', code: '100131', name: 'Metro Badalona Pompeu Fabra', lat: 41.44920088, lng: 2.24359946, aliases: ['BADALONA'] },
    { agency: 'STM', code: '10146', name: 'Berri-UQAM', lat: 45.514852, lng: -73.560106, aliases: ['Barri uqam'] },
    { agency: 'STM', code: '10252', name: 'Bonaventure', lat: 45.498053, lng: -73.567129, aliases: ['bonevuture'] },
    { agency: 'YRT', code: '26', name: 'Cornell Bus Terminal', lat: 43.880877, lng: -79.231556, aliases: ['Cornell Terminal'] },
    { agency: 'NFTA Metro', code: '150', name: '3rd Street & Niagara Street', lat: 43.088516, lng: -79.059399, aliases: ['3rd Street / Niagara St S'] },
    { agency: 'NFTA Metro', code: '36680', name: 'North Division Street & Main Street', lat: 42.883248, lng: -78.874593, aliases: ['North Division Ellicott Street W'] },
    { agency: 'Sound Transit', code: '45301', name: 'Renton Transit Center', lat: 47.4809074, lng: -122.20813, aliases: ['Renton Transit Center'] },
    { agency: 'King County Metro', code: 'C09', name: 'International District Chinatown', lat: 47.598355, lng: -122.327992, aliases: ['International District / Chinatown'] },
    { agency: 'TriMet', code: '5028', name: 'SW Sam Jackson Pk & OHSU', lat: 45.499332, lng: -122.685535, aliases: ['SW Sam Jackson Park / OHSU'] },
    { agency: 'TriMet', code: '7763', name: 'Union Station/NW 6th & Hoyt MAX Stn', lat: 45.527222, lng: -122.676517, aliases: ['Until Station / NW 6th / Hoyt'] },
    { agency: 'TriMet', code: 'station-144', name: 'Parkrose/Sumner TC MAX Station', lat: 45.559015, lng: -122.56562, aliases: ['Parkrose / Summer'] },
    { agency: 'TriMet', code: '9600', name: 'SW 11th & Alder', lat: 45.521094, lng: -122.682819, aliases: ['SW 11th / Adler'] },
    { agency: 'TriMet', code: '13132', name: 'Clackamas Town Center TC MAX Station', lat: 45.435721, lng: -122.567769, aliases: ['Clackmas Town Center'] },
    { agency: 'TMB', code: '000381', name: 'Clot - Biscaia', lat: 41.413988, lng: 2.190631, aliases: ['CLOT'] },
    { agency: 'TMB', code: '001290', name: 'La Rambla - Liceu', lat: 41.38161062, lng: 2.17307649, aliases: ['LICEU'] },
    { agency: 'TMB', code: '001492', name: 'Pg Sant Joan - Pl Mossèn Jacint Verdaguer', lat: 41.398624, lng: 2.170429, aliases: ['VERDAGUER'] },
    { agency: 'TMB', code: '002279', name: 'Pg Reina Elisenda - Av JV Foix', lat: 41.398388, lng: 2.11854, aliases: ['AV J V FOIX PG REINA ELISENEDA'] },
    { agency: 'FGC', code: '000921', name: 'Pl de Sarrià', lat: 41.399879, lng: 2.121379, aliases: ['SARRIA', 'SArra to Les Tres Torres'] },
    { agency: 'TRAM Barcelona', code: '001376', name: 'Carles III - Maria Cristina', lat: 41.387436, lng: 2.126945, aliases: ['MARIA CRISTINA'] },
    { agency: 'TTC', code: '14641', name: 'Castle Frank Station', lat: 43.678681, lng: -79.380737, aliases: ['castle'] },
    { agency: 'RATP', code: 'IDFM:492289', name: 'Châtelet', lat: 48.85763833122418, lng: 2.3484113851972435, aliases: ['chatelet', 'CHATELET'] },
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
