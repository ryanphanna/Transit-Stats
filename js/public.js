// Public Profile Logic

// Firebase Config (Matches app.js)
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

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
            showError('This profile is private 🔒');
            return;
        }

        // 3. Render Profile Header
        document.getElementById('userName').textContent = profile.name || username;
        document.getElementById('userEmoji').textContent = profile.emoji || '👤';
        if (profile.defaultAgency) {
            document.getElementById('userAgency').textContent = profile.defaultAgency;
        }

        // 4. Fetch Trips
        const tripsSnapshot = await db.collection('trips')
            .where('userId', '==', userId)
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
    document.querySelector('.container').innerHTML = `
        <div style="text-align: center; margin-top: 100px;">
            <div style="font-size: 3em; margin-bottom: 20px;">😕</div>
            <h2>${msg}</h2>
            <p><a href="/" style="color: var(--accent-primary);">Go Home</a></p>
        </div>
    `;
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
                    <div style="font-weight: 600; font-size: 1.1em;">${item.route}</div>
                    <div style="font-size: 0.85em; color: var(--text-secondary);">${item.count} trips</div>
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
    L.tileLayer('https://{s}.tile.memomaps.de/tilegen/{z}/{x}/{y}.png', {
        maxZoom: 18,
        opacity: 0.7,
        className: 'map-transit-layer'
    }).addTo(map);

    if (trips.length > 0 && Visuals && Visuals.renderHeatmap) {
        Visuals.renderPointHeatmap(trips, map);

        // Fit bounds logic from visuals.js usually handles this, 
        // but let's ensure we fit to the points found
        const points = [];
        trips.forEach(t => {
            if (t.startLoc) points.push([t.startLoc.latitude, t.startLoc.longitude]);
            if (t.endLoc) points.push([t.endLoc.latitude, t.endLoc.longitude]);
        });

        if (points.length > 0) {
            map.fitBounds(points);
        }
    }
}
