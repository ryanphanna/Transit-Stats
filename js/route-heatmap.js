import { validLocation } from './atlas-stop-resolver.js';

export function aggregateTripCorridors(endpointTrips = []) {
    const corridors = new Map();

    endpointTrips.forEach(({ trip = {}, boarding, exiting }) => {
        const start = validLocation(boarding?.location);
        const end = validLocation(exiting?.location);
        if (!start || !end || (start.lat === end.lat && start.lng === end.lng)) return;

        const agency = String(trip.agency || 'Unknown').trim() || 'Unknown';
        const key = [agency.toLowerCase(), start.lat.toFixed(5), start.lng.toFixed(5), end.lat.toFixed(5), end.lng.toFixed(5)].join(':');
        const existing = corridors.get(key);
        if (existing) {
            existing.count += 1;
            return;
        }

        corridors.set(key, {
            key,
            count: 1,
            agency,
            start,
            end,
            startLabel: boarding.label || trip.startStopName || trip.startStop || 'Boarding stop',
            endLabel: exiting.label || trip.endStopName || trip.endStop || 'Exit stop',
        });
    });

    return [...corridors.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export function getCorridorStyle(count, maxCount = count) {
    const ratio = Math.log1p(Math.max(0, count)) / Math.log1p(Math.max(1, maxCount));
    return {
        color: '#066b4b',
        weight: 2 + (7 * ratio),
        opacity: 0.28 + (0.52 * ratio),
    };
}
