// At 14, one stop is readable without opening labels over the city overview.
export const STOP_POPUP_MIN_ZOOM = 14;

const MAP_PIN_COLOR = '#066b4b';

export function addMapZoomControl(map) {
    const control = L.control({ position: 'bottomright' });
    control.onAdd = targetMap => {
        const container = L.DomUtil.create('div', 'atlas-zoom-control');
        const zoomIn = L.DomUtil.create('button', 'atlas-zoom-button atlas-zoom-button-in', container);
        const zoomOut = L.DomUtil.create('button', 'atlas-zoom-button atlas-zoom-button-out', container);

        zoomOut.type = 'button';
        zoomOut.textContent = '−';
        zoomOut.setAttribute('aria-label', 'Zoom out');
        zoomIn.type = 'button';
        zoomIn.textContent = '+';
        zoomIn.setAttribute('aria-label', 'Zoom in');

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.on(zoomOut, 'click', event => {
            L.DomEvent.stop(event);
            targetMap.zoomOut();
        });
        L.DomEvent.on(zoomIn, 'click', event => {
            L.DomEvent.stop(event);
            targetMap.zoomIn();
        });
        return container;
    };
    control.addTo(map);
}

function normalizeType(type) {
    return type === 'end' || type === 'exiting' ? 'exiting' : 'boarding';
}

function hexToRgb(hex) {
    return hex.match(/[\da-f]{2}/gi).map(value => parseInt(value, 16));
}

function rgbToHex(rgb) {
    return `#${rgb.map(value => value.toString(16).padStart(2, '0')).join('')}`;
}

function blend(from, to, amount) {
    const start = hexToRgb(from);
    const end = hexToRgb(to);
    return rgbToHex(start.map((value, index) => Math.round(value + ((end[index] - value) * amount))));
}

export function groupMapPoints(points = [], getLabel = () => null) {
    const grouped = new Map();

    points.forEach(point => {
        const lat = Number(point.lat);
        const lng = Number(point.lng ?? point.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        const type = normalizeType(point.type);
        const usage = Math.max(1, Number(point.usage ?? point.count ?? 1));
        // Saved coordinates can differ by a few metres for the same stop.
        // Round the fallback identity so those points still become one
        // usage-weighted marker instead of hundreds of overlapping markers.
        const locationKey = point.key || `${lat.toFixed(4)}:${lng.toFixed(4)}`;
        const key = `${type}:${locationKey}`;
        const label = getLabel(point);
        const existing = grouped.get(key);
        if (existing) {
            existing.usage += usage;
            if (label) existing.labels.add(label);
            return;
        }

        grouped.set(key, {
            lat,
            lng,
            type,
            usage,
            labels: new Set(label ? [label] : []),
        });
    });

    return [...grouped.values()];
}

export function clusterMapPoints(points = [], map, { zoom = map?.getZoom?.() } = {}) {
    const currentZoom = Number.isFinite(zoom) ? zoom : 13;
    if (!map || currentZoom >= 10) return points;

    // Keep more geographic detail visible in the wide view without changing
    // marker size or making city-level clusters compete with each other.
    const cellSize = currentZoom <= 8 ? 12 : 14;
    const clusters = new Map();

    points.forEach(point => {
        const projected = map.project([point.lat, point.lng], currentZoom);
        const cellX = Math.floor(projected.x / cellSize);
        const cellY = Math.floor(projected.y / cellSize);
        const key = `${point.type}:${cellX}:${cellY}`;
        const usage = Math.max(1, Number(point.usage) || 1);
        const existing = clusters.get(key);

        if (existing) {
            existing.lat += point.lat * usage;
            existing.lng += point.lng * usage;
            existing.usage += usage;
            point.labels?.forEach(label => existing.labels.add(label));
            return;
        }

        clusters.set(key, {
            lat: point.lat * usage,
            lng: point.lng * usage,
            type: point.type,
            usage,
            labels: new Set(point.labels || []),
        });
    });

    return [...clusters.values()].map(cluster => ({
        ...cluster,
        lat: cluster.lat / cluster.usage,
        lng: cluster.lng / cluster.usage,
    }));
}

export function getUsageMarkerStyle(point, maxUsage, { baseRadius = 4 } = {}) {
    const usageRatio = maxUsage <= 1
        ? 0
        : Math.log(Math.max(1, point.usage)) / Math.log(maxUsage);
    const usageIntensity = Math.pow(Math.max(0, Math.min(1, usageRatio)), 0.65);
    const baseColor = MAP_PIN_COLOR;

    return {
        radius: baseRadius,
        fillColor: blend('#d8eee6', baseColor, 0.12 + (usageIntensity * 0.88)),
        color: '#fff',
        weight: 1,
        opacity: 0.55 + (usageIntensity * 0.4),
        fillOpacity: 0.42 + (usageIntensity * 0.45),
    };
}

export function addMapPointMarkers({
    map,
    markers,
    renderer,
    points = [],
    getLabel = point => point.label,
    baseRadius = 4.5,
    formatPopup = value => value,
} = {}) {
    if (!markers) return [];
    const grouped = groupMapPoints(points, getLabel);
    const renderMarkers = () => {
        const visibleGroups = clusterMapPoints(grouped, map);
        const maxUsage = Math.max(...visibleGroups.map(point => point.usage), 1);
        markers.clearLayers();

        visibleGroups.forEach(point => {
            const marker = L.circleMarker([point.lat, point.lng], {
                renderer,
                ...getUsageMarkerStyle(point, maxUsage, { baseRadius }),
            });
            const popup = [...point.labels].map(formatPopup).filter(Boolean).join('<br>');
            if (popup && map) addZoomGatedPopup(marker, map, popup);
            markers.addLayer(marker);
        });

        return visibleGroups;
    };

    if (map) {
        if (map.__transitStatsMarkerZoomHandler) {
            map.off('zoomend', map.__transitStatsMarkerZoomHandler);
        }
        map.__transitStatsMarkerZoomHandler = renderMarkers;
        map.on('zoomend', renderMarkers);
    }

    return renderMarkers();
}

export function addZoomGatedPopup(marker, map, popup) {
    let popupBound = false;
    marker.on('click', () => {
        if (map.getZoom() < STOP_POPUP_MIN_ZOOM) {
            marker.closePopup();
            return;
        }
        if (!popupBound) {
            marker.bindPopup(popup);
            popupBound = true;
        }
        marker.openPopup();
    });
}

export function installPopupZoomGuard(map) {
    map.on('zoomend', () => {
        if (map.getZoom() < STOP_POPUP_MIN_ZOOM) map.closePopup();
    });
}

export function getDenseViewport(points = []) {
    const valid = points
        .map(point => ({
            lat: Number(point.lat),
            lng: Number(point.lng ?? point.lon),
            weight: Math.max(1, Number(point.usage ?? point.count ?? 1)),
        }))
        .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lng)
            && point.lat >= -90 && point.lat <= 90 && point.lng >= -180 && point.lng <= 180);
    const coordinates = valid.map(point => [point.lat, point.lng]);
    if (coordinates.length < 2) return coordinates;

    const latitudes = coordinates.map(([lat]) => lat);
    const longitudes = coordinates.map(([, lng]) => lng);
    const latSpan = Math.max(...latitudes) - Math.min(...latitudes);
    const lngSpan = Math.max(...longitudes) - Math.min(...longitudes);
    if (latSpan <= 24 && lngSpan <= 32) return coordinates;

    const regions = new Map();
    valid.forEach(point => {
        const key = `${Math.floor(point.lat / 8)}:${Math.floor(point.lng / 8)}`;
        if (!regions.has(key)) regions.set(key, { weight: 0, points: [] });
        const region = regions.get(key);
        region.weight += point.weight;
        region.points.push([point.lat, point.lng]);
    });

    const sortedRegions = [...regions.values()].sort((a, b) => b.weight - a.weight);
    const strongestWeight = sortedRegions[0]?.weight || 0;
    // Keep meaningful regions together. This prevents a tied NYC/Tokyo history
    // or a 75%-as-busy Boston history from arbitrarily opening on one city.
    return sortedRegions
        .filter(region => region.weight >= strongestWeight * 0.6)
        .slice(0, 3)
        .flatMap(region => region.points);
}

export function fitMapToDensePoints(map, points = [], {
    maxZoom = 13,
    padding = [60, 60],
    paddingTopLeft = null,
    paddingBottomRight = null,
} = {}) {
    if (!map) return false;
    const viewportPoints = getDenseViewport(points);
    const validPoints = viewportPoints
        .map(point => Array.isArray(point) ? point : [Number(point.lat), Number(point.lng ?? point.lon)])
        .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng)
            && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
            && lat !== 0 && lng !== 0);
    if (validPoints.length === 0) return false;

    const bounds = L.latLngBounds(validPoints);
    const southWest = bounds.getSouthWest();
    const northEast = bounds.getNorthEast();
    const latitudeSpan = Math.abs(northEast.lat - southWest.lat);
    const longitudeSpan = Math.abs(northEast.lng - southWest.lng);

    if (latitudeSpan < 0.001 && longitudeSpan < 0.001) {
        map.setView(validPoints[0], maxZoom, { animate: false });
    } else {
        const fitOptions = { padding, animate: false, maxZoom };
        if (paddingTopLeft) fitOptions.paddingTopLeft = paddingTopLeft;
        if (paddingBottomRight) fitOptions.paddingBottomRight = paddingBottomRight;
        map.fitBounds(bounds, fitOptions);
    }
    map.invalidateSize({ animate: false });
    return true;
}
