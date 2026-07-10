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
        attributionControl: false
    }).setView([43.70, -79.42], 12);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png').addTo(map);

    // Transit Routes Overlay
    L.tileLayer('https://tile.memomaps.de/tilegen/{z}/{x}/{y}.png', {
        maxZoom: 18,
        opacity: 0.4
    }).addTo(map);

    if (points && points.length > 0) {
        // Built directly from anonymized {lat,lng,type} points rather than
        // Visuals.renderHeatmap, which expects full trip objects — the public
        // profile endpoint never receives raw trips, so it can't build those.
        const heatPoints = points.map(p => [p.lat, p.lng, p.type === 'start' ? 0.8 : 0.5]);
        if (typeof L.heatLayer !== 'undefined') {
            L.heatLayer(heatPoints, {
                radius: 25,
                blur: 15,
                maxZoom: 17,
                gradient: { 0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red' }
            }).addTo(map);
        }

        const bounds = points.map(p => [p.lat, p.lng]);
        map.fitBounds(bounds, { padding: [100, 100] });
    }
}
