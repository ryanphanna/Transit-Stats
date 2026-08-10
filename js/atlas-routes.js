const ATLAS_ROUTES_PROXY = import.meta.env.VITE_ATLAS_ROUTES_URL
    || 'https://us-central1-transitstats-21ba4.cloudfunctions.net/atlasRoutes';

export const ATLAS_AGENCY_SLUGS = {
    TTC: 'ttc',
    'OC Transpo': 'octranspo',
    'GO Transit': 'go',
    MiWay: 'miway',
    YRT: 'yrt',
    'Brampton Transit': 'brampton',
    'Durham Transit': 'drt',
    HSR: 'hamilton'
};

function routeValues(trips) {
    return [...new Set(trips.map(trip => String(trip.route || '').trim()).filter(Boolean))];
}

export async function loadAtlasRoutes(trips) {
    const byAgency = new Map();
    trips.forEach(trip => {
        const slug = ATLAS_AGENCY_SLUGS[trip.agency || 'TTC'];
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
        return (data.features || []).map(feature => ({ ...feature, __agencySlug: slug }));
    }));

    return responses.flat();
}
