import { requireAuth } from '../shared/auth-guard.js';
import { initHeader } from '../shared/header.js';
import { db } from '../firebase.js';
import { loadAtlasRoutes } from '../atlas-routes.js';
import { heatmapRouteStyle, summarizeGtfsRouteUsage } from '../gtfs-heatmap.js';

const state = {
    map: null,
    layer: null,
    trips: [],
    routeFeatures: [],
    routeSignature: '',
    scope: 'ridden',
    requestId: 0,
    hasFit: false,
};

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function routeSignature(trips) {
    return [...new Set(trips
        .filter(trip => !trip.discarded && trip.route)
        .map(trip => `${trip.agency || 'TTC'}:${String(trip.route).trim().toLowerCase()}`))]
        .sort()
        .join('|');
}

function renderStats(summary) {
    const container = document.getElementById('beta-heatmap-stats');
    if (!container) return;
    container.innerHTML = `
        <div class="beta-heatmap-stat"><strong>${summary.riddenRoutes}</strong><span>Routes ridden</span></div>
        <div class="beta-heatmap-stat"><strong>${summary.totalRoutes}</strong><span>GTFS corridors</span></div>
        <div class="beta-heatmap-stat"><strong>${summary.totalRides}</strong><span>Total rides</span></div>`;
}

function setStatus(message) {
    const status = document.getElementById('beta-heatmap-status');
    if (status) status.textContent = message;
}

function render() {
    if (!state.map || !state.layer) return;
    state.layer.clearLayers();

    const summary = summarizeGtfsRouteUsage(state.routeFeatures, state.trips);
    renderStats(summary);
    const visibleRoutes = summary.routes.filter(route => state.scope === 'all' || route.rides > 0);

    visibleRoutes.forEach(route => {
        const layer = L.geoJSON(route.feature, {
            style: heatmapRouteStyle(route.rides, summary.maxRides),
        });
        const label = `${route.agency} · ${route.route} · ${route.rides} ${route.rides === 1 ? 'ride' : 'rides'}`;
        layer.bindTooltip(`<span class="beta-heatmap-route-label">${escapeHtml(label)}</span>`, { sticky: true });
        layer.addTo(state.layer);
    });

    if (visibleRoutes.length > 0 && !state.hasFit) {
        const bounds = state.layer.getBounds();
        if (bounds.isValid()) {
            state.map.fitBounds(bounds, { padding: [40, 40], animate: false });
            state.hasFit = true;
        }
    }

    setStatus(visibleRoutes.length === 0
        ? 'No GTFS corridor matches are available for your trips yet.'
        : `${visibleRoutes.length} GTFS corridor${visibleRoutes.length === 1 ? '' : 's'} shown.`);
}

async function loadRoutes() {
    const signature = routeSignature(state.trips);
    if (!signature) {
        state.routeFeatures = [];
        state.routeSignature = '';
        render();
        setStatus('Ride a route first and its GTFS corridor will appear here.');
        return;
    }
    if (signature === state.routeSignature) return;

    const requestId = ++state.requestId;
    state.routeSignature = signature;
    setStatus('Loading GTFS corridors…');
    try {
        const features = await loadAtlasRoutes(state.trips);
        if (requestId !== state.requestId) return;
        state.routeFeatures = features;
        render();
    } catch (error) {
        if (requestId !== state.requestId) return;
        console.warn('GTFS heatmap: route data unavailable', error);
        state.routeFeatures = [];
        render();
        setStatus('GTFS route data could not be loaded right now.');
    }
}

function setupControls() {
    document.querySelectorAll('[data-scope]').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('[data-scope]').forEach(item => {
                const active = item === button;
                item.classList.toggle('active', active);
                item.setAttribute('aria-pressed', String(active));
            });
            state.scope = button.dataset.scope;
            render();
        });
    });
}

async function init() {
    const { user, isAdmin } = await requireAuth();
    initHeader({ isAdmin, currentPage: 'heatmap' });
    state.map = L.map('beta-heatmap', { zoomControl: true, attributionControl: true })
        .setView([43.6532, -79.3832], 11);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    }).addTo(state.map);
    state.layer = L.layerGroup().addTo(state.map);
    setupControls();

    db.collection('trips').where('userId', '==', user.uid).orderBy('startTime', 'desc').onSnapshot(snapshot => {
        state.trips = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        state.hasFit = false;
        render();
        loadRoutes();
    }, error => {
        console.error('GTFS heatmap: trip stream failed', error);
        setStatus('Your trips could not be loaded right now.');
    });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
