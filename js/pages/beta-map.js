import { requireAuth } from '../shared/auth-guard.js';
import { initHeader } from '../shared/header.js';
import { db } from '../firebase.js';
import { ATLAS_AGENCY_SLUGS as STOP_AGENCIES, loadAtlasStops } from '../atlas-stops.js';
import { ATLAS_AGENCY_SLUGS as ROUTE_AGENCIES, loadAtlasRoutes } from '../atlas-routes.js';

const state = {
    map: null,
    trips: [],
    firestoreStops: [],
    atlasStops: [],
    routeFeatures: [],
    filter: 'boarding',
    view: 'paths',
    hasFit: false,
    routesLoaded: false,
    stopsLoaded: false,
    layers: { paths: null, points: null }
};

const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function validLocation(location) {
    const lat = Number(location?.lat);
    const lng = Number(location?.lng ?? location?.lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function rebuildStopIndex() {
    const index = new Map();
    [...state.atlasStops, ...state.firestoreStops].forEach(stop => {
        const location = validLocation(stop);
        if (!location) return;
        [stop.name, stop.code, ...(stop.aliases || [])].forEach(label => {
            const key = normalize(label);
            if (key) index.set(key, location);
        });
    });
    return index;
}

function getTripLocation(trip, side, stopIndex) {
    const saved = validLocation(side === 'boarding'
        ? (trip.boardingLocation || trip.boardLocation)
        : trip.exitLocation);
    if (saved) return saved;

    const stopName = side === 'boarding'
        ? (trip.startStopName || trip.startStop)
        : (trip.endStopName || trip.endStop);
    return stopIndex.get(normalize(stopName)) || null;
}

function buildPoints() {
    const stopIndex = rebuildStopIndex();
    const showBoarding = state.filter === 'boarding' || state.filter === 'both';
    const showExiting = state.filter === 'exiting' || state.filter === 'both';
    const points = [];

    state.trips.slice(0, 1000).forEach(trip => {
        if (showBoarding) {
            const location = getTripLocation(trip, 'boarding', stopIndex);
            if (location) points.push({ ...location, type: 'boarding', trip });
        }
        if (showExiting) {
            const location = getTripLocation(trip, 'exiting', stopIndex);
            if (location) points.push({ ...location, type: 'exiting', trip });
        }
    });
    return points;
}

function clearLayers() {
    state.layers.paths.clearLayers();
    state.layers.points.clearLayers();
}

function routeKey(route) {
    return String(route || '').trim();
}

function renderPaths() {
    const counts = new Map();
    state.trips.forEach(trip => {
        const slug = ROUTE_AGENCIES[trip.agency || 'TTC'];
        const key = `${slug}:${routeKey(trip.route)}`;
        counts.set(key, (counts.get(key) || 0) + 1);
    });

    const coordinates = [];
    state.routeFeatures.forEach(feature => {
        const properties = feature.properties || {};
        const route = routeKey(properties.routeShortName || properties.routeId);
        const count = counts.get(`${feature.__agencySlug}:${route}`) || 0;
        if (!count || feature.geometry?.type !== 'LineString') return;

        const line = feature.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
        const color = /^[0-9a-f]{6}$/i.test(properties.routeColor || '')
            ? `#${properties.routeColor}`
            : '#4f46e5';
        L.polyline(line, {
            color,
            weight: Math.min(11, 3 + Math.log2(count + 1) * 2),
            opacity: 0.35 + Math.min(0.55, count / 20)
        }).bindPopup(`${route} · ${count} logged ${count === 1 ? 'ride' : 'rides'}`).addTo(state.layers.paths);
        coordinates.push(...line);
    });

    return coordinates;
}

function renderPoints() {
    const points = buildPoints();
    points.forEach(point => L.circleMarker([point.lat, point.lng], {
        radius: 6,
        fillColor: point.type === 'boarding' ? '#4f46e5' : '#10b981',
        color: '#fff',
        weight: 1.5,
        fillOpacity: 0.85
    }).bindPopup(`${point.type === 'boarding' ? 'Boarded' : 'Exited'} ${point.trip.route || ''}`).addTo(state.layers.points));
    return points.map(point => [point.lat, point.lng]);
}

function render() {
    if (!state.map) return;
    clearLayers();
    const coordinates = state.view === 'paths' ? renderPaths() : renderPoints();
    if (coordinates.length > 0 && !state.hasFit) {
        state.map.fitBounds(L.latLngBounds(coordinates), { padding: [60, 60], animate: false });
        state.hasFit = true;
    }
}

async function loadAtlasStopFallbacks() {
    if (state.stopsLoaded) return;
    const agencies = [...new Set(state.trips.map(trip => trip.agency || 'TTC'))]
        .filter(agency => STOP_AGENCIES[agency]);
    if (agencies.length === 0) return;
    state.atlasStops = await loadAtlasStops(agencies);
    state.stopsLoaded = true;
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
    initHeader({ isAdmin, currentPage: 'map' });
    state.map = L.map('beta-map', { zoomControl: true, attributionControl: true }).setView([43.6532, -79.3832], 12);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(state.map);
    state.layers.paths = L.layerGroup().addTo(state.map);
    state.layers.points = L.layerGroup().addTo(state.map);
    setupControls();

    const stopsSnapshot = await db.collection('stops').get();
    state.firestoreStops = stopsSnapshot.docs.map(doc => doc.data());
    db.collection('trips').where('userId', '==', user.uid).orderBy('startTime', 'desc').onSnapshot(snapshot => {
        state.trips = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        state.hasFit = false;
        render();
        loadAtlasRoutePaths().catch(error => console.warn('Trip paths beta: Atlas routes unavailable', error));
        loadAtlasStopFallbacks().catch(error => console.warn('Trip paths beta: Atlas stops unavailable', error));
    }, error => console.error('Trip paths beta: trip stream failed', error));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
