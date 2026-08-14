import { Identity } from './identity.js';

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

        const emojiEl = document.getElementById('userEmoji');
        if (data.username) {
            emojiEl.textContent = Identity.toEmojis(data.username);
        } else if (data.emoji) {
            emojiEl.textContent = data.emoji;
        } else {
            emojiEl.innerHTML = '<i data-lucide="user"></i>';
            if (window.lucide) window.lucide.createIcons();
        }

        if (data.defaultAgency) {
            document.getElementById('userAgency').textContent = data.defaultAgency;
        }

        // Render Stats
        document.getElementById('totalTrips').textContent = data.totalTrips;
        document.getElementById('totalHours').textContent = data.totalHours;

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

function initPublicMap(points) {
    const map = L.map('publicMap', {
        zoomControl: false,
        attributionControl: false,
        preferCanvas: true,
    }).setView([43.70, -79.42], 12);

    const isDark = document.documentElement.dataset.theme === 'dark'
        || document.body.classList.contains('dark');
    const tileTheme = isDark ? 'dark_nolabels' : 'light_nolabels';
    L.tileLayer(`https://{s}.basemaps.cartocdn.com/${tileTheme}/{z}/{x}/{y}{r}.png`, {
        maxZoom: 19,
        attribution: '© CARTO © OpenStreetMap',
    }).addTo(map);

    if (points && points.length > 0) {
        // Public profiles receive only anonymous coordinates. Keep the map
        // quiet and show repeat visits with the same weighted dots as the
        // signed-in map, without exposing labels or trip details.
        const markers = L.layerGroup().addTo(map);
        const markersByStop = new Map();
        points.forEach(point => {
            const lat = Number(point.lat);
            const lng = Number(point.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

            const type = point.type === 'start' ? 'boarding' : 'exiting';
            const key = `${type}:${lat}:${lng}`;
            const existing = markersByStop.get(key);
            if (existing) {
                existing.usage += 1;
                return;
            }
            markersByStop.set(key, { lat, lng, type, usage: 1 });
        });

        const maxUsage = Math.max(...[...markersByStop.values()].map(point => point.usage), 1);
        markersByStop.forEach(point => {
            const ratio = maxUsage === 1 ? 0.35 : Math.log(point.usage) / Math.log(maxUsage);
            const color = point.type === 'boarding' ? '#0b9f6e' : '#7c5ce6';
            markers.addLayer(L.circleMarker([point.lat, point.lng], {
                radius: 4 + (ratio * 3),
                fillColor: color,
                color: '#fff',
                weight: 1,
                opacity: 0.55 + (ratio * 0.4),
                fillOpacity: 0.42 + (ratio * 0.45),
            }));
        });

        const bounds = getPublicViewport(points);
        if (bounds.length === 1) {
            map.setView(bounds[0], 13, { animate: false });
        } else if (bounds.length > 1) {
            map.fitBounds(bounds, { padding: [100, 100], maxZoom: 13 });
        }
    }
}

function getPublicViewport(points) {
    const valid = (points || [])
        .map(point => [Number(point.lat), Number(point.lng)])
        .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng)
            && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180);
    if (valid.length < 2) return valid;

    const latitudes = valid.map(([lat]) => lat);
    const longitudes = valid.map(([, lng]) => lng);
    const latSpan = Math.max(...latitudes) - Math.min(...latitudes);
    const lngSpan = Math.max(...longitudes) - Math.min(...longitudes);
    if (latSpan <= 24 && lngSpan <= 32) return valid;

    // A public profile can contain occasional trips in another country. Use
    // the densest 8-degree region so the first view stays useful instead of
    // zooming out to the entire world.
    const regions = new Map();
    valid.forEach(point => {
        const key = `${Math.floor(point[0] / 8)}:${Math.floor(point[1] / 8)}`;
        if (!regions.has(key)) regions.set(key, []);
        regions.get(key).push(point);
    });
    return [...regions.values()].sort((a, b) => b.length - a.length)[0];
}
