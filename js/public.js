import {
    addMapPointMarkers,
    fitMapToDensePoints,
} from './map-presentation.js';
import { createMapSurface, DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from './map-surface.js';

// Public Profile Logic
document.addEventListener('DOMContentLoaded', async () => {
    const pathMatch = window.location.pathname.match(/^\/user\/([^/]+)\/?$/i);
    const params = new URLSearchParams(window.location.search);
    const username = pathMatch ? decodeURIComponent(pathMatch[1]) : params.get('user');

    if (!username) {
        showError('No user specified');
        return;
    }

    try {
        // Trips are never publicly readable from Firestore (see firestore.rules) —
        // this endpoint reads them server-side with the Admin SDK and returns only
        // aggregate/anonymized fields (totals + lat/lng points, no route/stop/userId).
        const res = await fetch(`https://us-central1-transitstats-21ba4.cloudfunctions.net/publicProfile?user=${encodeURIComponent(username.toLowerCase())}`);
        const errorData = res.ok ? null : await res.json().catch(() => ({}));
        if (errorData?.code === 'COMING_SOON') {
            showError('Public profiles are coming soon.');
            return;
        }
        if (res.status === 404) {
            showError('User not found');
            return;
        }
        if (res.status === 403) {
            showError('This profile is private');
            return;
        }
        if (!res.ok) {
            showError(errorData.error || 'Error loading profile');
            return;
        }

        const data = await res.json();

        if (data.canonicalUsername) {
            const canonicalPath = `/user/${encodeURIComponent(data.canonicalUsername)}`;
            if (window.location.pathname !== canonicalPath) {
                window.history.replaceState({}, document.title, canonicalPath);
            }
        }

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
        initPublicMap(data.points, data.mapStopMode);
        document.querySelector('.public-view')?.classList.remove('is-loading');
        document.getElementById('public-map-loading')?.remove();

    } catch (error) {
        console.error('Error loading profile:', error);
        showError('Error loading profile');
    }
});

function showError(msg) {
    const overlay = document.querySelector('.public-overlay');
    if (!overlay) {
        console.error(msg);
        return;
    }
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

function initPublicMap(points, mapStopMode = 'boarding') {
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
        const visibleType = mapStopMode === 'exiting' ? 'end' : 'start';
        const visiblePoints = points.filter(point => point.type === visibleType);
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
