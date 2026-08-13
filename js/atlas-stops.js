import { LOCAL_GTFS_STOP_SUPPLEMENTS } from './local-gtfs-stop-supplements.js';

const ATLAS_STOPS_PROXY = import.meta.env.VITE_ATLAS_STOPS_URL
    || (import.meta.env.DEV ? '/atlas-dev/stops' : 'https://us-central1-transitstats-21ba4.cloudfunctions.net/atlasStops');

export const ATLAS_AGENCY_SLUGS = {
    'TTC': 'ttc',
    'GO Transit': 'go',
    GO: 'go',
    'MiWay': 'miway',
    'YRT': 'yrt',
    HSR: 'hamilton',
    'LA Metro': 'lacmta',
    'Niagara Region Transit': 'niagara',
    BART: 'bart',
    Muni: 'sfmta',
    VTA: 'vta',
    'AC Transit': 'actransit',
    MTS: 'sdmts',
    'Golden Gate Transit': 'goldengate',
    'Santa Rosa CityBus': 'santarosa',
    'Big Blue Bus': 'bigbluebus',
    'Oakville Transit': 'oakville',
    'NFTA Metro': 'nfta',
    SMART: 'smart-ca',
    SamTrans: 'samtrans',
    LADOT: 'ladot',
    Amtrak: 'sdmts',
    'Flagship Cruises & Events': 'sdmts',
    'GTAA Terminal Link': 'ttc'
};

// Some user agencies share physical stops with an Atlas agency. Keep the
// trip's agency on the returned stop while loading every verified GTFS source
// needed to resolve that trip endpoint.
export const ATLAS_STOP_SOURCE_SLUGS = {
    Amtrak: ['sdmts', 'lacmta'],
    'Flagship Cruises & Events': ['sdmts'],
    'GTAA Terminal Link': ['ttc'],
};

async function fetchAgencyStops(agency, slug) {
    const response = await fetch(`${ATLAS_STOPS_PROXY}?agency=${encodeURIComponent(slug)}`);
    if (!response.ok) throw new Error(`Atlas stop data unavailable for ${slug}`);

    const index = await response.json();
    return Object.entries(index)
        .map(([code, stop]) => ({
            code,
            name: stop.name,
            lat: Number(stop.lat),
            lng: Number(stop.lon),
            agency,
            source: 'atlas'
        }))
        .filter(stop => stop.name && Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
}

export async function loadAtlasStops(agencies) {
    const agencySlugs = [...new Set(agencies)]
        .filter(agency => ATLAS_AGENCY_SLUGS[agency])
        .flatMap(agency => (ATLAS_STOP_SOURCE_SLUGS[agency] || [ATLAS_AGENCY_SLUGS[agency]])
            .map(slug => [agency, slug]));
    if (agencySlugs.length === 0) return [];

    const results = await Promise.allSettled(
        agencySlugs.map(([agency, slug]) => fetchAgencyStops(agency, slug))
    );
    const publishedStops = results
        .filter(result => result.status === 'fulfilled')
        .flatMap(result => result.value);
    const supplements = agencySlugs.flatMap(([agency]) =>
        (LOCAL_GTFS_STOP_SUPPLEMENTS[agency] || []).map(stop => ({
            ...stop,
            agency,
            source: 'atlas',
        }))
    );
    return [...publishedStops, ...supplements];
}
