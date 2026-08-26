function normalizedRoute(value) {
    return String(value || '').trim().toLowerCase().replace(/^(route|line)\s*/i, '');
}

export function baseRouteKey(value) {
    const route = normalizedRoute(value);
    const match = route.match(/^(\d+)/);
    return match ? match[1] : route;
}

export function routeMatches(featureRoute, tripRoute) {
    const feature = normalizedRoute(featureRoute);
    const trip = normalizedRoute(tripRoute);
    return Boolean(feature && trip && (feature === trip || baseRouteKey(feature) === baseRouteKey(trip)));
}

function projectionForPoint(point, coordinates) {
    const [lat, lng] = [Number(point?.lat), Number(point?.lng)];
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || coordinates.length < 2) return null;

    const lengths = [];
    let totalLength = 0;
    for (let index = 0; index < coordinates.length - 1; index += 1) {
        const [x1, y1] = coordinates[index];
        const [x2, y2] = coordinates[index + 1];
        const length = Math.hypot(x2 - x1, y2 - y1);
        lengths.push(length);
        totalLength += length;
    }
    if (totalLength === 0) return null;

    let best = null;
    let distanceBefore = 0;
    coordinates.slice(0, -1).forEach(([x1, y1], index) => {
        const [x2, y2] = coordinates[index + 1];
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lengthSquared = dx * dx + dy * dy;
        const t = lengthSquared === 0
            ? 0
            : Math.max(0, Math.min(1, ((lng - x1) * dx + (lat - y1) * dy) / lengthSquared));
        const projectedLng = x1 + dx * t;
        const projectedLat = y1 + dy * t;
        const distance = Math.hypot(lng - projectedLng, lat - projectedLat);
        if (!best || distance < best.distance) {
            best = {
                fraction: (distanceBefore + lengths[index] * t) / totalLength,
                distance,
            };
        }
        distanceBefore += lengths[index];
    });
    return best;
}

function stopPosition(feature, code) {
    if (!code) return null;
    const properties = feature.properties || {};
    const order = Array.isArray(properties.stopOrder) ? properties.stopOrder : [];
    const positions = Array.isArray(properties.stopPositions) ? properties.stopPositions : [];
    const index = order.findIndex(value => String(value) === String(code));
    const position = index >= 0 ? Number(positions[index]) : NaN;
    return Number.isFinite(position) ? Math.max(0, Math.min(1, position)) : null;
}

function pointAtFraction(coordinates, fraction) {
    const clamped = Math.max(0, Math.min(1, fraction));
    const segments = [];
    let totalLength = 0;
    for (let index = 0; index < coordinates.length - 1; index += 1) {
        const [x1, y1] = coordinates[index];
        const [x2, y2] = coordinates[index + 1];
        const length = Math.hypot(x2 - x1, y2 - y1);
        segments.push(length);
        totalLength += length;
    }
    if (totalLength === 0) return coordinates[0];

    let remaining = totalLength * clamped;
    for (let index = 0; index < segments.length; index += 1) {
        if (remaining <= segments[index] || index === segments.length - 1) {
            const [x1, y1] = coordinates[index];
            const [x2, y2] = coordinates[index + 1];
            const t = segments[index] === 0 ? 0 : remaining / segments[index];
            return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
        }
        remaining -= segments[index];
    }
    return coordinates.at(-1);
}

export function sliceLineByFractions(coordinates, startFraction, endFraction) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
    const start = Number(startFraction);
    const end = Number(endFraction);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;

    const result = [pointAtFraction(coordinates, start)];
    let distance = 0;
    let totalLength = 0;
    for (let index = 0; index < coordinates.length - 1; index += 1) {
        totalLength += Math.hypot(
            coordinates[index + 1][0] - coordinates[index][0],
            coordinates[index + 1][1] - coordinates[index][1]
        );
    }
    for (let index = 1; index < coordinates.length - 1; index += 1) {
        distance += Math.hypot(
            coordinates[index][0] - coordinates[index - 1][0],
            coordinates[index][1] - coordinates[index - 1][1]
        );
        const fraction = distance / totalLength;
        if (fraction > start && fraction < end) result.push(coordinates[index]);
    }
    result.push(pointAtFraction(coordinates, end));
    return result.map(([lng, lat]) => [lat, lng]);
}

export function getTripCoverageFractions(feature, trip, startLocation, endLocation) {
    const coordinates = feature?.geometry?.type === 'LineString'
        ? feature.geometry.coordinates
        : null;
    if (!coordinates || coordinates.length < 2) return null;

    const startCode = trip.startStopCode;
    const endCode = trip.endStopCode;
    const startPosition = stopPosition(feature, startCode);
    const endPosition = stopPosition(feature, endCode);

    if (startPosition !== null && endPosition !== null) {
        return endPosition > startPosition
            ? { start: startPosition, end: endPosition }
            : null;
    }

    const projectedStart = projectionForPoint(startLocation, coordinates);
    const projectedEnd = projectionForPoint(endLocation, coordinates);
    if (!projectedStart || !projectedEnd || projectedEnd.fraction <= projectedStart.fraction) return null;

    // A point far from the scheduled shape is not enough evidence to draw a path.
    if (projectedStart.distance > 0.01 || projectedEnd.distance > 0.01) return null;
    return { start: projectedStart.fraction, end: projectedEnd.fraction };
}

export function clipFeatureToTrip(feature, trip, startLocation, endLocation) {
    const coordinates = feature?.geometry?.type === 'LineString'
        ? feature.geometry.coordinates
        : null;
    const fractions = getTripCoverageFractions(feature, trip, startLocation, endLocation);
    if (!coordinates || !fractions) return null;
    return sliceLineByFractions(coordinates, fractions.start, fractions.end);
}

/** Aggregate clipped trips into fixed route-relative bands for a line heatmap. */
export function aggregateRouteHeatmapSegments(segments, binCount = 24) {
    if (!Array.isArray(segments) || !Number.isInteger(binCount) || binCount < 1) return [];

    const groups = new Map();
    segments.forEach(segment => {
        const coordinates = segment?.feature?.geometry?.type === 'LineString'
            ? segment.feature.geometry.coordinates
            : null;
        const start = Number(segment?.startFraction);
        const end = Number(segment?.endFraction);
        if (!coordinates || coordinates.length < 2 || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;

        const key = String(segment.groupKey || 'default');
        let group = groups.get(key);
        if (!group) {
            group = { coordinates, counts: new Array(binCount).fill(0), metadata: segment.metadata || {} };
            groups.set(key, group);
        }

        const firstBin = Math.max(0, Math.floor(Math.max(0, start) * binCount));
        const lastBin = Math.min(binCount - 1, Math.ceil(Math.min(1, end) * binCount) - 1);
        for (let bin = firstBin; bin <= lastBin; bin += 1) group.counts[bin] += 1;
    });

    const result = [];
    groups.forEach(group => {
        group.counts.forEach((count, bin) => {
            if (count === 0) return;
            const start = bin / binCount;
            const end = (bin + 1) / binCount;
            const line = sliceLineByFractions(group.coordinates, start, end);
            if (line) result.push({ line, count, ...group.metadata });
        });
    });
    return result;
}
