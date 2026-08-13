import { baseRouteKey } from './route-segment.js';

function tripKey(agency, route) {
    const normalizedRoute = baseRouteKey(route);
    return normalizedRoute ? `${agency}::${normalizedRoute}` : null;
}

/**
 * Joins personal trip counts to Atlas route shapes, which are generated from
 * GTFS. Each shape keeps its own geometry, while branches share the base route
 * usage count so the heatmap reflects the rider's route family.
 */
export function summarizeGtfsRouteUsage(features = [], trips = [], agencyBySlug = {}) {
    const counts = new Map();
    trips
        .filter(trip => !trip.discarded && trip.route)
        .forEach(trip => {
            const key = tripKey(trip.agency || 'TTC', trip.route);
            if (key) counts.set(key, (counts.get(key) || 0) + 1);
        });

    const routes = features
        .map(feature => {
            const properties = feature.properties || {};
            const route = String(properties.routeShortName || properties.routeId || '').trim();
            const agency = agencyBySlug[feature.__agencySlug] || properties.agency || 'Transit';
            const key = tripKey(agency, route);
            return {
                feature,
                agency,
                route,
                rides: key ? counts.get(key) || 0 : 0,
            };
        })
        .filter(item => item.route);

    const maxRides = routes.reduce((max, route) => Math.max(max, route.rides), 0);
    const uniqueRoutes = new Map(routes.map(route => [`${route.agency}::${baseRouteKey(route.route)}`, route]));

    return {
        routes,
        maxRides,
        totalRoutes: uniqueRoutes.size,
        riddenRoutes: [...uniqueRoutes.values()].filter(route => route.rides > 0).length,
        totalRides: [...counts.values()].reduce((total, count) => total + count, 0),
    };
}

export function heatmapRouteStyle(rides, maxRides) {
    const intensity = maxRides > 0 && rides > 0 ? Math.max(0.15, rides / maxRides) : 0;
    return {
        color: intensity === 0 ? '#94a3b8' : `hsl(${Math.round(220 - intensity * 205)} 82% 52%)`,
        weight: intensity === 0 ? 1.5 : 3 + intensity * 5,
        opacity: intensity === 0 ? 0.2 : 0.45 + intensity * 0.5,
        lineCap: 'round',
        lineJoin: 'round',
    };
}
