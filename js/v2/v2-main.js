import { auth, db } from '../firebase.js';
import { MapEngine } from '../map-engine.js';
import { PredictionEngine } from '../predict.js';
import { TripController } from '../trips/TripController.js';

/**
 * TransitStats V2 — Profile Map (Minimalist)
 * A read-only, map-centric view of a user's transit history.
 * Logged-out users see a map of their city via IP geolocation + a sign-in CTA.
 */
const V2 = {
    state: {
        userId: null,
        trips: []
    },

    async init() {
        const params = new URLSearchParams(window.location.search);
        this.state.userId = params.get('u');

        if (this.state.userId) {
            this.setupDataStreams();
        } else {
            auth.onAuthStateChanged(async (user) => {
                if (user) {
                    this.state.userId = user.uid;
                    this.setupDataStreams();
                } else {
                    this.showGuestMap();
                }
            });
        }
    },

    async showGuestMap() {
        // Default to Toronto; try IP geolocation silently
        let center = [43.6532, -79.3832];
        let zoom = 13;
        try {
            const res = await fetch('https://ipapi.co/json/');
            if (res.ok) {
                const geo = await res.json();
                if (geo.latitude && geo.longitude) {
                    center = [geo.latitude, geo.longitude];
                }
            }
        } catch {
            // Non-fatal — Toronto fallback
        }

        MapEngine.init([], center);
        if (MapEngine.map) {
            // Double-invalidate: once immediately, once after paint, to cover any fixed-layout measurement lag
            MapEngine.map.invalidateSize({ animate: false });
            requestAnimationFrame(() => {
                if (MapEngine.map) MapEngine.map.invalidateSize({ animate: false });
            });
        }

        // Inject sign-in overlay
        const overlay = document.createElement('div');
        overlay.id = 'v2-guest-overlay';
        overlay.innerHTML = `
            <div class="v2-guest-card">
                <div class="v2-guest-logo">TransitStats</div>
                <p>Track every ride. See your city.</p>
                <a href="/index.html" class="v2-guest-btn">Sign in</a>
            </div>
        `;
        document.getElementById('app-root').appendChild(overlay);
    },

    async setupDataStreams() {
        // 1. Initialize Map immediately so Leaflet measures the container at full size
        MapEngine.init([]);
        MapEngine.map?.invalidateSize({ animate: false });
        requestAnimationFrame(() => { MapEngine.map?.invalidateSize({ animate: false }); });

        // 2. Load Stops Library in parallel with trip stream setup
        db.collection('stops').get()
            .then(snap => {
                PredictionEngine.stopsLibrary = snap.docs.map(doc => doc.data());
                MapEngine.renderMarkers();
            })
            .catch(err => console.error("V2: Failed to load stops library:", err));

        // 3. Listen to Trips
        TripController.listen(this.state.userId, (trips) => {
            this.state.trips = trips;
            MapEngine.updateTrips(this.state.trips);
        });
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => V2.init());
} else {
    V2.init();
}
