const STOP_FIELDS = {
    boarding: ['startStopName', 'startStop', 'boardingStopName', 'boardingStop'],
    exiting: ['endStopName', 'endStop', 'exitingStopName', 'exitingStop'],
};

export function getTripStopLabel(trip = {}, side = 'boarding') {
    const fields = STOP_FIELDS[side] || STOP_FIELDS.boarding;
    for (const field of fields) {
        const value = trip[field];
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return trip.incomplete && side === 'exiting'
        ? 'Incomplete trip'
        : side === 'boarding' ? 'Unknown boarding stop' : 'Unknown exit stop';
}

export function getTripRouteLabel(trip = {}) {
    const route = typeof trip.route === 'string' ? trip.route.trim() : '';
    return route || 'Unknown route';
}

export function getTripStatusLabel(trip = {}) {
    if (trip.incomplete) return 'Incomplete';
    if (!trip.endTime) return 'In progress';
    if (trip.discarded) return 'Discarded';
    return '';
}
