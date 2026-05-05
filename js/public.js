import { db } from './firebase.js';
import { UI } from './ui-utils.js';
import { Visuals } from './visuals.js';

const escapeHtml = UI.escapeHtml;

// Public Profile Logic

// Main Logic
document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const username = params.get('user');

    if (!username) {
        showError('No user specified');
        return;
    }

    try {
        // 1. Resolve Username to UID
        const usernameDoc = await db.collection('usernames').doc(username.toLowerCase()).get();
        if (!usernameDoc.exists) {
            showError('User not found');
            return;
        }

        const userId = usernameDoc.data().uid;

        // 2. Fetch Profile
        const profileDoc = await db.collection('profiles').doc(userId).get();
        if (!profileDoc.exists) {
            showError('User not found');
            return;
        }

        const profile = profileDoc.data();
        if (!profile.isPublic) {
            showError('This profile is private');
            return;
        }

        // 3. Render Profile Header
        document.getElementById('userName').textContent = profile.displayName || profile.name || username;
        // User emoji/icon handling
        const emojiEl = document.getElementById('userEmoji');
        if (profile.emoji) {
            emojiEl.textContent = profile.emoji;
        } else {
            emojiEl.innerHTML = '<i data-lucide="user"></i>';
            if (window.lucide) window.lucide.createIcons();
        }
        if (profile.defaultAgency) {
            document.getElementById('userAgency').textContent = profile.defaultAgency;
        }

        // 4. Fetch Trips
        const tripsSnapshot = await db.collection('trips')
            .where('userId', '==', userId)
            .where('isPublic', '==', true)
            .limit(200)
            .get();

        const trips = [];
        tripsSnapshot.forEach(doc => trips.push(doc.data()));

        // 5. Render Stats
        renderStats(trips);

        // 6. Render Map
        initPublicMap(trips);

    } catch (error) {
        console.error('Error loading profile:', error);
        showError('Error loading profile. It might be private or not exist.');
    } // End try-catch
});

function showError(msg) {
    const container = document.querySelector('.container');
    container.innerHTML = `
        <div style="text-align: center; margin-top: 100px;">
            <div style="font-size: 3em; margin-bottom: 20px; color: var(--text-muted);"><i data-lucide="alert-circle" style="width: 48px; height: 48px;"></i></div>
            <h2></h2>
            <p><a href="/" style="color: var(--accent-primary);">Go Home</a></p>
        </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    container.querySelector('h2').textContent = msg;
}

function renderStats(trips) {
    const totalTrips = trips.length;
    const totalMinutes = trips.reduce((sum, t) => sum + (t.duration || 0), 0);
    const totalHours = Math.round(totalMinutes / 60 * 10) / 10;

    document.getElementById('totalTrips').textContent = totalTrips;
    document.getElementById('totalHours').textContent = totalHours;

    // Top Routes Logic
    const routeCounts = {};
    trips.forEach(trip => {
        const route = trip.route || 'Unknown';
        routeCounts[route] = (routeCounts[route] || 0) + 1;
    });

    const sortedRoutes = Object.entries(routeCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([route, count]) => ({ route, count }));

    const topRoutesList = document.getElementById('topRoutesList');
    if (sortedRoutes.length > 0) {
        const maxTrips = sortedRoutes[0].count;
        topRoutesList.innerHTML = sortedRoutes.map(item => `
            <div class="stat-card" style="text-align: left; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
                <div>
                    <div style="font-weight: 600; font-size: 1.1em;">${escapeHtml(item.route)}</div>
                    <div style="font-size: 0.85em; color: var(--text-secondary);">${escapeHtml(item.count)} trips</div>
                </div>
                <div style="width: 100px; height: 6px; background: var(--bg-primary); border-radius: 3px; overflow: hidden;">
                    <div style="height: 100%; width: ${(item.count / maxTrips) * 100}%; background: var(--accent-primary);"></div>
                </div>
            </div>
        `).join('');
    } else {
        topRoutesList.innerHTML = '<div class="empty-state">No trips recorded yet.</div>';
    }
}

function initPublicMap(trips) {
    // Basic Leaflet Map
    const map = L.map('publicMapContainer').setView([43.70, -79.42], 12); // Default Toronto
    // Cleaner 'No Labels' version for a premium look
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
        className: 'map-base-layer'
    }).addTo(map);

    // Transit Routes Overlay: Memomaps for colored route paths
    L.tileLayer('https://tile.memomaps.de/tilegen/{z}/{x}/{y}.png', {
        maxZoom: 18,
        opacity: 0.7,
        className: 'map-transit-layer'
    }).addTo(map);

    if (trips.length > 0 && Visuals?.renderPointHeatmap) {
        Visuals.renderPointHeatmap(trips, map);

        const points = [];
        trips.forEach(t => {
            const start = t.boardingLocation || t.boardLocation || t.startLoc;
            const end = t.exitLocation || t.endLoc;
            const startLat = start?.lat ?? start?.latitude;
            const startLng = start?.lng ?? start?.longitude;
            const endLat = end?.lat ?? end?.latitude;
            const endLng = end?.lng ?? end?.longitude;
            if (startLat != null && startLng != null) points.push([startLat, startLng]);
            if (endLat != null && endLng != null) points.push([endLat, endLng]);
        });

        if (points.length > 0) {
            map.fitBounds(points);
        }
    }
}
