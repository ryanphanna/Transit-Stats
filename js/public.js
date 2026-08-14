import {
    addZoomGatedPopup,
    getDenseViewport,
    getUsageMarkerStyle,
    groupMapPoints,
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
        document.getElementById('userName').textContent = data.displayName || 'Traveler';

        // Render Stats
        document.getElementById('totalTrips').textContent = data.totalTrips;
        document.getElementById('totalHours').textContent = data.totalHours;
        document.getElementById('public-stops').textContent = data.points?.length || 0;

        // Render Map
        initPublicMap(data.points);

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
    const { map, markers } = surface;

    if (points && points.length > 0) {
        // Match the signed-in map's default: show boarding stops first.
        const visiblePoints = points.filter(point => point.type === 'start' || point.type === 'boarding');
        const markersByStop = groupMapPoints(visiblePoints, point => {
            const names = Array.isArray(point.names) ? point.names : [point.name];
            return names.filter(Boolean).map(escapeHtml).join('<br>');
        });
        const maxUsage = Math.max(...markersByStop.map(point => point.usage), 1);
        markersByStop.forEach(point => {
            const marker = L.circleMarker([point.lat, point.lng], getUsageMarkerStyle(point, maxUsage));
            const popup = [...point.labels].join('<br>');
            if (popup) addZoomGatedPopup(marker, map, popup);
            markers.addLayer(marker);
        });

        const bounds = getDenseViewport(visiblePoints);
        if (bounds.length === 1) {
            map.setView(bounds[0], 13, { animate: false });
        } else if (bounds.length > 1) {
            map.fitBounds(bounds, { padding: [60, 60], maxZoom: 13 });
        }
    }
}
