const STOP_FIELDS = {
    boarding: ['startStopName', 'startStop', 'boardingStopName', 'boardingStop'],
    exiting: ['endStopName', 'endStop', 'exitingStopName', 'exitingStop'],
};

export function getTripStopLabel(trip = {}, side = 'boarding', resolution = null) {
    if (resolution?.label && resolution.source === 'atlas') return resolution.label;

    const fields = STOP_FIELDS[side] || STOP_FIELDS.boarding;
    for (const field of fields) {
        const value = trip[field];
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    if (resolution?.label) return resolution.label;
    if (resolution?.source === 'saved') return 'Saved stop location';
    return trip.incomplete && side === 'exiting'
        ? 'Incomplete trip'
        : side === 'boarding' ? 'Unknown boarding stop' : 'Unknown exit stop';
}

export function getTripRouteLabel(trip = {}) {
    const route = typeof trip.route === 'string' ? trip.route.trim() : '';
    if (!route) return 'Unknown route';

    // Stored route values can be all-caps display names (for example, PURPLE).
    // Keep route numbers and short agency-style codes unchanged, but make longer
    // rider-facing names read naturally in map popups and trip cards.
    if (/^[A-Z][A-Z\s-]+$/.test(route) && route.replace(/[^A-Z]/g, '').length > 3) {
        return route.toLowerCase().replace(/(^|[\s-])[a-z]/g, match => match.toUpperCase());
    }

    return route;
}

export function getTripStatusLabel(trip = {}) {
    if (trip.incomplete) return 'Incomplete';
    if (!trip.endTime) return 'In progress';
    if (trip.discarded) return 'Discarded';
    return '';
}
