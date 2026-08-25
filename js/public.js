import {
    addMapPointMarkers,
    fitMapToDensePoints,
    getAtlasMapFitOptions,
} from './map-presentation.js';
import { auth, authPersistenceReady } from './firebase.js';
import { createMapSurface, DEFAULT_MAP_CENTER, DEFAULT_MAP_OVERVIEW_ZOOM } from './map-surface.js';
import { refreshIcons } from './shared/icons.js';
import {
    formatAtlasNumber,
    getAtlasPageTitle,
    renderAtlasCard,
    setAtlasDisplayName,
} from './shared/atlas-card.js';

const PUBLIC_PROFILE_CACHE_PREFIX = 'transitstats-public-profile:';
const PUBLIC_PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
let publicMapState = null;
let publicMapRefitFrame = null;

function updatePublicNavigation(user) {
    const signedIn = Boolean(user);
    const branding = document.querySelector('.public-branding');
    const cardAction = document.querySelector('.atlas-card-cta');

    if (branding) branding.href = signedIn ? '/dashboard' : '/';
    if (!cardAction) return;

    cardAction.href = signedIn ? '/dashboard' : '/';
    cardAction.innerHTML = signedIn
        ? 'Dashboard <span aria-hidden="true">→</span>'
        : 'Make your own map <span aria-hidden="true">→</span>';
}

async function initializePublicNavigation() {
    auth.onAuthStateChanged(updatePublicNavigation);
    try {
        await authPersistenceReady;
        await auth.authStateReady();
        updatePublicNavigation(auth.currentUser);
    } catch (error) {
        console.warn('Public profile auth state unavailable:', error.message);
        updatePublicNavigation(null);
    }
}

function getPublicProfileCacheKey(username) {
    return `${PUBLIC_PROFILE_CACHE_PREFIX}${username.trim().toLowerCase()}`;
}

function readCachedPublicProfile(username) {
    try {
        const cached = JSON.parse(localStorage.getItem(getPublicProfileCacheKey(username)) || 'null');
        if (!cached?.data || Date.now() - cached.cachedAt >= PUBLIC_PROFILE_CACHE_TTL_MS) return null;
        return cached.data;
    } catch (error) {
        console.warn('Public profile cache unavailable:', error);
        return null;
    }
}

function writeCachedPublicProfile(username, data) {
    try {
        localStorage.setItem(getPublicProfileCacheKey(username), JSON.stringify({
            cachedAt: Date.now(),
            data,
        }));
    } catch (error) {
        console.warn('Public profile cache could not be saved:', error);
    }
}

function clearCachedPublicProfile(username) {
    try {
        localStorage.removeItem(getPublicProfileCacheKey(username));
    } catch (error) {
        console.warn('Public profile cache could not be cleared:', error);
    }
}

// Public Profile Logic
document.addEventListener('DOMContentLoaded', async () => {
    // Public profiles use the light presentation consistently; the signed-in
    // dashboard can still follow each rider's theme preference.
    document.documentElement.dataset.theme = 'light';
    document.body.classList.remove('dark');
    renderAtlasCard({ publicProfile: true, loading: true });
    void initializePublicNavigation();
    refreshIcons();
    const pathMatch = window.location.pathname.match(/^\/user\/([^/]+)\/?$/i);
    const params = new URLSearchParams(window.location.search);
    const username = pathMatch ? decodeURIComponent(pathMatch[1]) : params.get('user');

    if (!username) {
        showError('Profile not found', 'No public profile was specified.');
        return;
    }

    const normalizedUsername = username.trim().toLowerCase();
    const cachedData = readCachedPublicProfile(normalizedUsername);
    if (cachedData) renderPublicProfile(cachedData);

    try {
        // Trips are never publicly readable from Firestore (see firestore.rules) —
        // this endpoint reads them server-side with the Admin SDK and returns only
        // aggregate/anonymized fields (totals + lat/lng points, no route/stop/userId).
        const res = await fetch(`https://us-central1-transitstats-21ba4.cloudfunctions.net/publicProfile?user=${encodeURIComponent(normalizedUsername)}`, {
            cache: 'no-store',
        });
        const errorData = res.ok ? null : await res.json().catch(() => ({}));
        if (errorData?.code === 'COMING_SOON') {
            clearCachedPublicProfile(normalizedUsername);
            showError('Public profiles are coming soon.', 'Public profiles are not available to everyone yet.');
            return;
        }
        if (res.status === 404) {
            clearCachedPublicProfile(normalizedUsername);
            showError('Profile not found', 'That profile link does not point to an available TransitStats profile.');
            return;
        }
        if (res.status === 403) {
            clearCachedPublicProfile(normalizedUsername);
            showError('This profile is private', 'The owner has not enabled public sharing for this map.');
            return;
        }
        if (!res.ok) {
            if (cachedData) {
                console.warn('Public profile refresh failed; keeping cached profile.');
                return;
            }
            showError('We could not load this profile', errorData.error || 'Please try again later.');
            return;
        }

        const data = await res.json();
        writeCachedPublicProfile(normalizedUsername, data);
        renderPublicProfile(data);

    } catch (error) {
        if (cachedData) {
            console.warn('Public profile refresh failed; keeping cached profile.', error);
            return;
        }
        console.error('Error loading profile:', error);
        showError('We could not load this profile', 'Please try again later.');
    }
});

function renderPublicProfile(data) {
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
    if (publicMapRefitFrame) cancelAnimationFrame(publicMapRefitFrame);
    publicMapRefitFrame = refitPublicMap
        ? requestAnimationFrame(() => {
            publicMapRefitFrame = null;
            refitPublicMap();
        })
        : null;
}

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
    if (!publicMapState) {
        publicMapState = {
            surface: createMapSurface({
                containerId: 'publicMap',
                center: DEFAULT_MAP_CENTER,
                zoom: DEFAULT_MAP_OVERVIEW_ZOOM,
                tileTheme: 'light_all',
            }),
            hasFitted: false,
            hasUserInteracted: false,
            isFitting: false,
        };
        const { map } = publicMapState.surface;
        map.on('dragstart zoomstart', () => {
            if (!publicMapState.isFitting) publicMapState.hasUserInteracted = true;
        });
    }
    const { surface } = publicMapState;
    const { map, markers, renderer } = surface;
    let refit = null;

    if (Array.isArray(points)) {
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

        if (!publicMapState.hasUserInteracted && visiblePoints.length > 0) {
            refit = () => {
                publicMapState.isFitting = true;
                fitMapToDensePoints(map, visiblePoints, getAtlasMapFitOptions());
                requestAnimationFrame(() => {
                    if (publicMapState) publicMapState.isFitting = false;
                });
            };
            if (!publicMapState.hasFitted) {
                refit();
                publicMapState.hasFitted = true;
            }
        }
    }

    return refit;
}
