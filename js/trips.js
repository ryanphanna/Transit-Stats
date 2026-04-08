import { db } from './firebase.js';
import { TripController } from './trips/TripController.js';
import { TripFeed } from './trips/TripFeed.js';
import { TripStatsView } from './trips/TripStatsView.js';
import { PredictionView } from './trips/PredictionView.js';
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
        try {
            const snap = await db.collection('stops').get();
            PredictionEngine.stopsLibrary = snap.docs.map(doc => doc.data());
            this.sync(TripController.allTrips, TripController.activeTrip);
            MapEngine.renderMarkers(); 
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

        // Render Intelligence
        PredictionView.render(active, trips);

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
            agency: document.getElementById('edit-agency')
        };

        if (form.id) form.id.value = trip.id;
        if (form.route) form.route.value = trip.route || '';
        if (form.start) form.start.value = trip.startStopName || trip.startStop || '';
        if (form.end) form.end.value = trip.endStopName || trip.endStop || '';
        if (form.dir) form.dir.value = trip.direction || '';
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
