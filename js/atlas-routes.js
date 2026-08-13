const ATLAS_ROUTES_PROXY = import.meta.env.VITE_ATLAS_ROUTES_URL
    || (import.meta.env.DEV ? '/atlas-dev/routes' : 'https://us-central1-transitstats-21ba4.cloudfunctions.net/atlasRoutes');

export const ATLAS_AGENCY_SLUGS = {
    TTC: 'ttc',
    'GO Transit': 'go',
    GO: 'go',
    MiWay: 'miway',
    YRT: 'yrt',
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
    LADOT: 'ladot'
};

function routeValues(trips) {
    const routes = new Set();
    trips.forEach(trip => {
        const route = String(trip.route || '').trim();
        if (!route) return;
        routes.add(route);
        const base = route.match(/^(\d+)/)?.[1];
        if (base) routes.add(base);
    });
    return [...routes];
}

export async function loadAtlasRoutes(trips) {
    const byAgency = new Map();
    trips.forEach(trip => {
        const slug = ATLAS_AGENCY_SLUGS[trip.agency || 'TTC'] || trip.agency;
        if (!slug) return;
        if (!byAgency.has(slug)) byAgency.set(slug, []);
        byAgency.get(slug).push(trip);
    });

    const responses = await Promise.all([...byAgency.entries()].map(async ([slug, agencyTrips]) => {
        const routes = routeValues(agencyTrips);
        if (routes.length === 0) return [];
        const response = await fetch(`${ATLAS_ROUTES_PROXY}?agency=${encodeURIComponent(slug)}&routes=${encodeURIComponent(routes.join(','))}`);
        if (!response.ok) throw new Error(`Atlas route data unavailable for ${slug}`);
        const data = await response.json();
        return (data.features || []).map(feature => ({
            ...feature,
            __agencySlug: slug,
            __agency: agencyTrips[0]?.agency || 'TTC',
        }));
    }));

    return responses.flat();
}
