/**
 * Read-only stop resolution shared by the Atlas beta surfaces.
 * Atlas is preferred; Firestore stops are only a fallback for local aliases
 * and historical data that Atlas does not recognize.
 */

export function normalizeStopLabel(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function validLocation(location) {
    const lat = Number(location?.lat);
    const lng = Number(location?.lng ?? location?.lon);
    return Number.isFinite(lat) && Number.isFinite(lng)
        ? { lat, lng }
        : null;
}

function agencyKey(value) {
    return String(value || '').trim().toLowerCase();
}

function indexKey(agency, label) {
    const normalized = normalizeStopLabel(label);
    if (!normalized) return null;
    return `${agency ? agencyKey(agency) : '*'}:${normalized}`;
}

function stopLabels(stop) {
    return [stop.code, stop.name, ...(stop.aliases || [])].filter(Boolean);
}

function addStops(index, stops, source) {
    (stops || []).forEach(stop => {
        const location = validLocation(stop);
        if (!location) return;
        const displayName = stop.name || stop.stopName || stop.code || null;

        stopLabels(stop).forEach(label => {
            const key = indexKey(stop.agency, label);
            if (key && !index.has(key)) {
                index.set(key, { location, source, label: displayName });
            }
        });
    });
}

export function buildStopIndex({ atlasStops = [], firestoreStops = [] } = {}) {
    const index = new Map();

    // Insert Atlas first so it wins when both sources contain the same key.
    addStops(index, atlasStops, 'atlas');
    addStops(index, firestoreStops, 'firestore');
    return index;
}

function lookup(index, agency, label) {
    const normalized = normalizeStopLabel(label);
    if (!normalized) return null;

    return index.get(`${agencyKey(agency)}:${normalized}`)
        || index.get(`*:${normalized}`)
        || null;
}

export function resolveStopLocation(trip, side, index) {
    const stopCode = side === 'boarding' ? trip.startStopCode : trip.endStopCode;
    const stopName = side === 'boarding'
        ? (trip.startStopName || trip.startStop)
        : (trip.endStopName || trip.endStop);
    const saved = validLocation(side === 'boarding'
        ? (trip.boardingLocation || trip.boardLocation)
        : trip.exitLocation);
    if (saved) return {
        location: saved,
        source: 'saved',
        label: stopName || (stopCode ? `Stop ${stopCode}` : null),
    };

    const agency = trip.agency || 'TTC';

    for (const label of [stopCode, stopName]) {
        const match = lookup(index, agency, label);
        if (match) return match;
    }

    return { location: null, source: 'unresolved' };
}
