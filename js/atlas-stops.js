const ATLAS_STOPS_PROXY = import.meta.env.VITE_ATLAS_STOPS_URL
    || (import.meta.env.DEV ? '/atlas-dev/stops' : 'https://us-central1-transitstats-21ba4.cloudfunctions.net/atlasStops');

export const ATLAS_AGENCY_SLUGS = {
    'TTC': 'ttc',
    'OC Transpo': 'octranspo',
    'GO Transit': 'go',
    'MiWay': 'miway',
    'YRT': 'yrt',
    'Brampton Transit': 'brampton',
    'Durham Transit': 'drt',
    'HSR': 'hamilton'
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
        .map(agency => [agency, ATLAS_AGENCY_SLUGS[agency]]);
    if (agencySlugs.length === 0) return [];

    const results = await Promise.allSettled(
        agencySlugs.map(([agency, slug]) => fetchAgencyStops(agency, slug))
    );
    return results
        .filter(result => result.status === 'fulfilled')
        .flatMap(result => result.value);
}
