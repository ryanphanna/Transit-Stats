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
        // Public profiles receive only anonymous coordinates. Render those
        // with the same clustered stop-dot treatment as the signed-in map,
        // without adding labels, routes, or trip details to the public page.
        const markers = typeof L.markerClusterGroup === 'function'
            ? L.markerClusterGroup({
                chunkedLoading: true,
                chunkInterval: 50,
                chunkDelay: 10,
                maxClusterRadius: 45,
                removeOutsideVisibleBounds: true,
                showCoverageOnHover: false,
            }).addTo(map)
            : L.layerGroup().addTo(map);

        const seen = new Set();
        points.forEach(point => {
            const lat = Number(point.lat);
            const lng = Number(point.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

            const type = point.type === 'start' ? 'boarding' : 'exiting';
            const key = `${type}:${lat}:${lng}`;
            if (seen.has(key)) return;
            seen.add(key);

            markers.addLayer(L.marker([lat, lng], {
                keyboard: false,
                icon: L.divIcon({
                    className: `map-stop-dot map-stop-dot--${type}`,
                    html: '',
                    iconSize: [10, 10],
                    iconAnchor: [5, 5],
                }),
            }));
        });

        const bounds = points
            .map(p => [Number(p.lat), Number(p.lng)])
            .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
        if (bounds.length > 0) map.fitBounds(bounds, { padding: [100, 100] });
    }
}
