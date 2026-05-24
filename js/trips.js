import { db } from './firebase.js';
import { TripController } from './trips/TripController.js';
import { TripFeed } from './trips/TripFeed.js';
import { TripStatsView } from './trips/TripStatsView.js';
import { MapEngine } from './map-engine.js';
import { PredictionEngine } from './predict.js';
import { ModalManager } from './shared/modal-engine.js';
import { UI } from './ui-utils.js';

/**
 * TransitStats Trips Orchestrator
 */
export const Trips = {
    _readyPromise: null,
    _resolveReady: null,

    async init() {
        this._readyPromise = new Promise(resolve => { this._resolveReady = resolve; });
        
        // Connect to Firestore
        if (window.currentUser) {
            TripController.listen(window.currentUser.uid, (trips, active) => {
                this.sync(trips, active);
                if (this._resolveReady) { 
                    this._resolveReady();
                    this._resolveReady = null;
                }
            });
        }

        await this.loadStopsLibrary();
    },

    async loadStopsLibrary() {
        const CACHE_KEY = 'ts_stops_library';
        const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

        try {
            // 1. Try Cache
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const { data, timestamp } = JSON.parse(cached);
                if (Date.now() - timestamp < CACHE_TTL) {
                    console.log(`Loaded ${data.length} stops from cache`);
                    PredictionEngine.stopsLibrary = data;
                    this.sync(TripController.allTrips, TripController.activeTrip);
                    MapEngine.renderMarkers();
                    return;
                }
            }

            // 2. Fallback to Network
            console.log("Fetching stops library from Firestore...");
            const snap = await db.collection('stops').get();
            const data = snap.docs.map(doc => doc.data());
            
            PredictionEngine.stopsLibrary = data;
            this.sync(TripController.allTrips, TripController.activeTrip);
            MapEngine.renderMarkers();

            // 3. Save to Cache
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                data,
                timestamp: Date.now()
            }));
        } catch (err) {
            console.error("Library sync failed:", err);
        }
    },

    /**
     * Primary Sync Loop - Re-renders all dependent views when data changes
     */
    sync(trips, active) {
        // Render Feed
        const feedContainer = document.getElementById('recent-trips-list');
        TripFeed.render(feedContainer, trips, (trip) => this.openEditModal(trip));

        // Render Analytics
        TripStatsView.render(trips);

        // Update Global Map
        MapEngine.updateTrips(trips);

        // Update Profile Status
        this.updateProfileStatus(active);
    },

    openEditModal(trip) {
        if (!trip) return;
        
        const form = {
            id: document.getElementById('edit-trip-id'),
            route: document.getElementById('edit-route'),
            start: document.getElementById('edit-start-stop'),
            end: document.getElementById('edit-end-stop'),
            dir: document.getElementById('edit-direction'),
            vehicle: document.getElementById('edit-vehicle'),
            agency: document.getElementById('edit-agency')
        };

        if (form.id) form.id.value = trip.id;
        if (form.route) form.route.value = trip.route || '';
        if (form.start) form.start.value = trip.startStopName || trip.startStop || '';
        if (form.end) form.end.value = trip.endStopName || trip.endStop || '';
        if (form.dir) form.dir.value = trip.direction || '';
        if (form.vehicle) form.vehicle.value = trip.vehicle || '';
        if (form.agency) form.agency.value = trip.agency || 'TTC';

        ModalManager.open('modal-edit-trip');
    },

    updateProfileStatus(active) {
        const el = document.getElementById('profile-status');
        if (!el) return;
        
        // Use textContent for user data, innerHTML only for the fixed indicator span
        el.innerHTML = '<span class="status-indicator"></span><span class="status-text"></span>';
        const indicator = el.querySelector('.status-indicator');
        const text = el.querySelector('.status-text');
        
        if (active) {
            indicator.classList.add('active');
            text.textContent = `Riding ${active.route}`;
        } else {
            indicator.classList.remove('active');
            text.textContent = 'Ready to ride';
        }
    },

    // Bridge methods for dashboard.js (legacy-ish support)
    async update(id, data) { return TripController.update(id, data); },
    async delete(id) { return TripController.delete(id); }
};
