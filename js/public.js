import { db } from './firebase.js';
import { UI } from './ui-utils.js';
import { Identity } from './identity.js';
import { Visuals } from './visuals.js';

// Public Profile Logic
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
        document.getElementById('userName').textContent = profile.displayName || profile.name || 'Traveler';
        
        const emojiEl = document.getElementById('userEmoji');
        if (profile.username) {
            emojiEl.textContent = Identity.toEmojis(profile.username);
        } else if (profile.emoji) {
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
            .limit(1000)
            .get();

        const trips = [];
        tripsSnapshot.forEach(doc => trips.push(doc.data()));

        // 5. Render Stats
        renderStats(trips);

        // 6. Render Map
        initPublicMap(trips);

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

function renderStats(trips) {
    const totalTrips = trips.length;
    const totalMinutes = trips.reduce((sum, t) => sum + (t.duration || 0), 0);
    const totalHours = Math.round(totalMinutes / 60 * 10) / 10;

    document.getElementById('totalTrips').textContent = totalTrips;
    document.getElementById('totalHours').textContent = totalHours;
}

function initPublicMap(trips) {
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

    if (trips.length > 0) {
        Visuals.renderHeatmap(trips, map);
        
        const points = [];
        trips.forEach(t => {
            const start = t.boardingLocation || t.boardLocation;
            const end = t.exitLocation;
            if (start?.lat) points.push([start.lat, start.lng]);
            if (end?.lat) points.push([end.lat, end.lng]);
        });

        if (points.length > 0) {
            map.fitBounds(points, { padding: [100, 100] });
        }
    }
}
