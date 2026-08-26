import { requireAuth } from '../shared/auth-guard.js';
import { initHeader } from '../shared/header.js';
import { db } from '../firebase.js';
import { loadAtlasStops } from '../atlas-stops.js';
import { loadAtlasRoutes } from '../atlas-routes.js';
import { buildStopIndex, resolveStopLocation } from '../atlas-stop-resolver.js';
import { clipFeatureToTrip, routeMatches } from '../route-segment.js';
import { getTripStopLabel } from '../trip-display.js';

const state = {
    map: null,
    trips: [],
    atlasStops: [],
    normalizedStops: [],
    routeFeatures: [],
    filter: 'both',
    view: 'paths',
    hasFit: false,
    routesLoaded: false,
    loadedStopAgencies: new Set(),
    loadingStopAgencies: new Set(),
    layers: { paths: null, points: null }
};

function emptyResolutionStats() {
    return { atlas: 0, unresolved: 0 };
}

function buildPointData() {
    const stopIndex = buildStopIndex({
        atlasStops: state.atlasStops,
        normalizedStops: state.normalizedStops,
    });
    const showBoarding = state.filter === 'boarding' || state.filter === 'both';
    const showExiting = state.filter === 'exiting' || state.filter === 'both';
    const points = [];
    const diagnostics = {
        boarding: emptyResolutionStats(),
        exiting: emptyResolutionStats(),
        unmatchedByAgency: {},
    };

    state.trips.forEach(trip => {
        for (const [side, visible] of [['boarding', showBoarding], ['exiting', showExiting]]) {
            const resolution = resolveStopLocation(trip, side, stopIndex);
            diagnostics[side][resolution.source]++;
            if (resolution.source === 'unresolved') {
                const agency = trip.agency || 'Unknown agency';
                diagnostics.unmatchedByAgency[agency] = (diagnostics.unmatchedByAgency[agency] || 0) + 1;
            }
            if (visible && resolution.location) {
                points.push({ ...resolution.location, type: side, trip, resolution });
            }
        }
    });

    return {
        points,
        diagnostics,
        tripCount: state.trips.length,
        capped: false,
    };
}

function renderDiagnostics({ boarding, exiting, unmatchedByAgency, tripCount, capped }) {
    const container = document.getElementById('trip-paths-diagnostics');
    if (!container) return;

    const totals = ['atlas', 'unresolved'].reduce((result, source) => {
        result[source] = boarding[source] + exiting[source];
        return result;
    }, {});
    const resolved = totals.atlas;
    const capNote = capped ? ` · showing first ${tripCount} trips` : '';
    const unmatched = Object.entries(unmatchedByAgency || {})
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([agency, count]) => `${agency} ${count}`)
        .join(' · ');

    container.innerHTML = `
        <strong>Stop locations</strong>
        <span><b>${resolved}</b> matched</span>
        <span><b>${totals.atlas}</b> Atlas</span>
        <span><b>${totals.unresolved}</b> unresolved</span>
        <small>Boarding ${boarding.atlas}/${tripCount} · Exiting ${exiting.atlas}/${tripCount}${capNote}</small>
        ${unmatched ? `<small>Not mapped: ${unmatched}</small>` : ''}
    `;
}

function clearLayers() {
    state.layers.paths.clearLayers();
    state.layers.points.clearLayers();
}

function buildPathData() {
    const stopIndex = buildStopIndex({
        atlasStops: state.atlasStops,
        normalizedStops: state.normalizedStops,
    });
    const segments = [];
    let unresolved = 0;
    const limitedTrips = state.trips;

    limitedTrips.forEach(trip => {
        const start = resolveStopLocation(trip, 'boarding', stopIndex);
        const end = resolveStopLocation(trip, 'exiting', stopIndex);
        if (!start.location || !end.location) {
            unresolved += 1;
            return;
        }

        const agencySlug = trip.agency || 'TTC';
        const candidates = state.routeFeatures.filter(feature => {
            const route = feature.properties?.routeShortName || feature.properties?.routeId;
            return feature.__agencySlug === agencySlug && routeMatches(route, trip.route);
        });
        const match = candidates
            .map(feature => ({ feature, line: clipFeatureToTrip(feature, trip, start.location, end.location) }))
            .find(candidate => candidate.line);
        if (match) segments.push({ ...match, trip, startResolution: start, endResolution: end });
        else unresolved += 1;
    });

    return {
        segments,
        tripCount: limitedTrips.length,
        unresolved,
        capped: false,
    };
}

function renderPaths() {
    const pathData = buildPathData();
    const coordinates = [];
    pathData.segments.forEach(({ feature, line, trip, startResolution, endResolution }) => {
        const properties = feature.properties || {};
        const route = String(properties.routeShortName || properties.routeId || trip.route || '').trim();
        const color = /^[0-9a-f]{6}$/i.test(properties.routeColor || '')
            ? `#${properties.routeColor}`
            : '#4f46e5';
        L.polyline(line, {
            color,
            weight: 2.5,
            opacity: 0.65
        }).bindPopup(`${route} · ${getTripStopLabel(trip, 'boarding', startResolution)} → ${getTripStopLabel(trip, 'exiting', endResolution)}`).addTo(state.layers.paths);
        coordinates.push(...line);
    });

    return { coordinates, pathData };
}

function renderPoints(points) {
    points.forEach(point => L.circleMarker([point.lat, point.lng], {
        radius: 6,
        fillColor: point.type === 'boarding' ? '#4f46e5' : '#10b981',
        color: '#fff',
        weight: 1.5,
        fillOpacity: 0.85
    }).bindPopup(getTripStopLabel(
        point.trip,
        point.type === 'boarding' ? 'boarding' : 'exiting',
        point.resolution,
    )).addTo(state.layers.points));
    return points.map(point => [point.lat, point.lng]);
}

function render() {
    if (!state.map) return;
    clearLayers();
    const pointData = buildPointData();
    renderDiagnostics({ ...pointData.diagnostics, tripCount: pointData.tripCount, capped: pointData.capped });
    const rendered = state.view === 'paths' ? renderPaths() : { coordinates: renderPoints(pointData.points) };
    if (state.view === 'paths') {
        const { pathData } = rendered;
        const container = document.getElementById('trip-paths-diagnostics');
        if (container) {
            const pathNote = pathData.capped ? ` · showing first ${pathData.tripCount} trips` : '';
            container.querySelector('small').textContent += ` · Paths ${pathData.segments.length}/${pathData.tripCount} clipped${pathData.unresolved ? ` · ${pathData.unresolved} without a verified segment` : ''}${pathNote}`;
        }
    }
    const coordinates = rendered.coordinates;
    if (coordinates.length > 0 && !state.hasFit) {
        state.map.fitBounds(L.latLngBounds(coordinates), { padding: [60, 60], animate: false });
        state.hasFit = true;
    }
}

async function loadAtlasStopData() {
    const agencies = [...new Set(state.trips.map(trip => trip.agency || 'TTC'))];
    const missing = agencies.filter(agency =>
        !state.loadedStopAgencies.has(agency) && !state.loadingStopAgencies.has(agency)
    );
    if (missing.length === 0) return;

    missing.forEach(agency => state.loadingStopAgencies.add(agency));
    try {
        const loadedStops = await loadAtlasStops(missing);
        state.atlasStops = [...state.atlasStops, ...loadedStops];
        missing.forEach(agency => state.loadedStopAgencies.add(agency));
    } finally {
        missing.forEach(agency => state.loadingStopAgencies.delete(agency));
    }
    render();
}

async function loadAtlasRoutePaths() {
    if (state.routesLoaded || state.trips.length === 0) return;
    state.routeFeatures = await loadAtlasRoutes(state.trips);
    state.routesLoaded = true;
    render();
}

function setupControls() {
    document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
        document.querySelectorAll('[data-filter]').forEach(item => item.classList.remove('active'));
        button.classList.add('active');
        state.filter = button.dataset.filter;
        render();
    }));

    document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
        document.querySelectorAll('[data-view]').forEach(item => item.classList.remove('active'));
        button.classList.add('active');
        state.view = button.dataset.view;
        render();
    }));
}

async function init() {
    const { user, isAdmin } = await requireAuth();
    initHeader({ isAdmin, currentPage: 'trip-paths' });
    state.map = L.map('trip-paths-map', { zoomControl: true, attributionControl: true }).setView([43.6532, -79.3832], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        subdomains: 'abc',
        maxZoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(state.map);
    state.layers.paths = L.layerGroup().addTo(state.map);
    state.layers.points = L.layerGroup().addTo(state.map);
    setupControls();

    try {
        const stopsSnapshot = await db.collection('stops').get();
        state.normalizedStops = stopsSnapshot.docs.map(doc => doc.data());
    } catch (error) {
        console.warn('Trip paths beta: normalized stop aliases unavailable', error);
    }

    db.collection('trips').where('userId', '==', user.uid).orderBy('startTime', 'desc').onSnapshot(snapshot => {
        state.trips = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        state.hasFit = false;
        render();
        loadAtlasRoutePaths().catch(error => console.warn('Trip paths beta: Atlas routes unavailable', error));
        loadAtlasStopData().catch(error => console.warn('Trip paths beta: Atlas stops unavailable', error));
    }, error => console.error('Trip paths beta: trip stream failed', error));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
