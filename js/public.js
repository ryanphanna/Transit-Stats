import {
    addMapPointMarkers,
    fitMapToDensePoints,
} from './map-presentation.js';
import { createMapSurface, DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from './map-surface.js';
import { refreshIcons } from './shared/icons.js';
import {
    formatAtlasNumber,
    getAtlasPageTitle,
    renderAtlasCard,
    setAtlasDisplayName,
} from './shared/atlas-card.js';

// Public Profile Logic
document.addEventListener('DOMContentLoaded', async () => {
    // Public profiles use the light presentation consistently; the signed-in
    // dashboard can still follow each rider's theme preference.
    document.documentElement.dataset.theme = 'light';
    document.body.classList.remove('dark');
    renderAtlasCard({ publicProfile: true, loading: true });
    refreshIcons();
    const pathMatch = window.location.pathname.match(/^\/user\/([^/]+)\/?$/i);
    const params = new URLSearchParams(window.location.search);
    const username = pathMatch ? decodeURIComponent(pathMatch[1]) : params.get('user');

    if (!username) {
        showError('Profile not found', 'No public profile was specified.');
        return;
    }

    try {
        // Trips are never publicly readable from Firestore (see firestore.rules) —
        // this endpoint reads them server-side with the Admin SDK and returns only
        // aggregate/anonymized fields (totals + lat/lng points, no route/stop/userId).
        const res = await fetch(`https://us-central1-transitstats-21ba4.cloudfunctions.net/publicProfile?user=${encodeURIComponent(username.toLowerCase())}`);
        const errorData = res.ok ? null : await res.json().catch(() => ({}));
        if (errorData?.code === 'COMING_SOON') {
            showError('Public profiles are coming soon.', 'Public profiles are not available to everyone yet.');
            return;
        }
        if (res.status === 404) {
            showError('Profile not found', 'That profile link does not point to an available TransitStats profile.');
            return;
        }
        if (res.status === 403) {
            showError('This profile is private', 'The owner has not enabled public sharing for this map.');
            return;
        }
        if (!res.ok) {
            showError('We could not load this profile', errorData.error || 'Please try again later.');
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
        const displayName = data.displayName || 'Traveler';
        setAtlasDisplayName(displayName);
        document.title = getAtlasPageTitle(displayName);

        // Render the same dashboard facts as the signed-in card.
        document.getElementById('stat-trips-lifetime').textContent = formatAtlasNumber(data.totalTrips ?? 0);
        document.getElementById('stat-trips-month').textContent = formatAtlasNumber(data.thisMonth ?? 0);
        document.getElementById('stat-trips-week').textContent = formatAtlasNumber(data.thisWeek ?? 0);
        document.getElementById('stat-days-ridden').textContent = formatAtlasNumber(data.daysRidden ?? 0);
        document.getElementById('stat-agencies-ridden').textContent = formatAtlasNumber(data.agencies ?? 0);
        document.getElementById('stat-countries-ridden').textContent = formatAtlasNumber(data.countries ?? 0);
        const atlasCard = document.querySelector('[data-atlas-card]');
        atlasCard?.classList.remove('is-loading');
        atlasCard?.setAttribute('aria-busy', 'false');

        // Render Map
        const refitPublicMap = initPublicMap(data.points, data.mapStopMode);
        document.querySelector('.public-view')?.classList.remove('is-loading');
        document.getElementById('public-map-loading')?.remove();
        // The map can be measured before the loading state is removed. Refit
        // once the public profile has its final viewport so no city is lost.
        requestAnimationFrame(() => refitPublicMap?.());

    } catch (error) {
        console.error('Error loading profile:', error);
        showError('We could not load this profile', 'Please try again later.');
    }
});

function showError(title, message) {
    document.querySelector('.public-view')?.classList.remove('is-loading');
    document.querySelector('.dashboard-map')?.setAttribute('hidden', '');
    document.querySelector('.dashboard-map-wash')?.setAttribute('hidden', '');
    document.getElementById('public-map-loading')?.remove();
    document.querySelector('.dashboard-atlas-hero-inner')?.setAttribute('hidden', '');

    const error = document.getElementById('public-error');
    if (!error) {
        console.error(title, message);
        return;
    }

    document.getElementById('public-error-title').textContent = title;
    document.getElementById('public-error-message').textContent = message;
    error.hidden = false;
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
    const surface = createMapSurface({
        containerId: 'publicMap',
        center: DEFAULT_MAP_CENTER,
        zoom: DEFAULT_MAP_ZOOM,
        tileTheme: 'light_all',
    });
    const { map, markers, renderer } = surface;
    let refit = null;

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

        refit = () => fitMapToDensePoints(map, visiblePoints, { maxZoom: 13 });
        refit();
    }

    return refit;
}
