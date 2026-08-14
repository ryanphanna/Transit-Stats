import {
    addMapPointMarkers,
    fitMapToDensePoints,
} from './map-presentation.js';
import { createMapSurface, DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from './map-surface.js';

// Public Profile Logic
document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const username = params.get('user');

    if (!username) {
        showError('No user specified');
        return;
    }

    try {
        // Trips are never publicly readable from Firestore (see firestore.rules) —
        // this endpoint reads them server-side with the Admin SDK and returns only
        // aggregate/anonymized fields (totals + lat/lng points, no route/stop/userId).
        const res = await fetch(`https://us-central1-transitstats-21ba4.cloudfunctions.net/publicProfile?user=${encodeURIComponent(username.toLowerCase())}`);
        if (res.status === 404) {
            showError('User not found');
            return;
        }
        if (res.status === 403) {
            showError('This profile is private');
            return;
        }
        if (!res.ok) {
            showError('Error loading profile');
            return;
        }

        const data = await res.json();

        // Render Profile Header
        document.getElementById('profile-name').textContent = data.displayName || 'Traveler';

        // Render the same dashboard facts as the signed-in card.
        document.getElementById('stat-trips-lifetime').textContent = data.totalTrips ?? 0;
        document.getElementById('stat-trips-month').textContent = data.thisMonth ?? 0;
        document.getElementById('stat-trips-week').textContent = data.thisWeek ?? 0;
        document.getElementById('stat-days-ridden').textContent = data.daysRidden ?? 0;
        document.getElementById('stat-agencies-ridden').textContent = data.agencies ?? 0;
        document.getElementById('stat-countries-ridden').textContent = data.countries ?? 0;

        // Render Map
        initPublicMap(data.points);
        document.querySelector('.public-view')?.classList.remove('is-loading');
        document.getElementById('public-map-loading')?.remove();

    } catch (error) {
        console.error('Error loading profile:', error);
        showError('Error loading profile');
    }
});

function showError(msg) {
    const overlay = document.querySelector('.public-overlay');
    overlay.innerHTML = `
        <div class="public-card" style="text-align: center;">
            <div style="font-size: 2em; margin-bottom: 10px; color: var(--danger);"><i data-lucide="alert-circle"></i></div>
            <h2 style="font-size: 1.1rem; margin-bottom: 1rem;">${msg}</h2>
            <a href="/" class="btn btn-sm btn-outline full-width">Go Home</a>
        </div>
    `;
    if (window.lucide) window.lucide.createIcons();
}

function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
    }[character]));
}

function initPublicMap(points) {
    const isDark = document.documentElement.dataset.theme === 'dark'
        || document.body.classList.contains('dark');
    const tileTheme = isDark ? 'dark_all' : 'light_all';
    const surface = createMapSurface({
        containerId: 'publicMap',
        center: DEFAULT_MAP_CENTER,
        zoom: DEFAULT_MAP_ZOOM,
        tileTheme,
    });
    const { map, markers, renderer } = surface;

    if (points && points.length > 0) {
        // Match the signed-in map's default: show boarding stops first.
        const visiblePoints = points.filter(point => point.type === 'start' || point.type === 'boarding');
        addMapPointMarkers({
            map,
            markers,
            renderer,
            points: visiblePoints,
            getLabel: point => {
                const names = Array.isArray(point.names) ? point.names : [point.name];
                return names.filter(Boolean).map(escapeHtml).join('<br>');
            },
            formatPopup: value => value,
        });

        fitMapToDensePoints(map, visiblePoints, { maxZoom: 13 });
    }
}
