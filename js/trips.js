import { db, firestorePersistenceReady } from './firebase.js';
import { TripController } from './trips/TripController.js';
import { TripFeed } from './trips/TripFeed.js';
import { TripStatsView } from './trips/TripStatsView.js';
import { MapEngine } from './map-engine.js';
import { PredictionEngine } from './predict.js';
import { ModalManager } from './shared/modal-engine.js';
import { UI } from './ui-utils.js';
import { buildPrestoTrips } from './presto-stop-matcher.js';

/**
 * TransitStats Trips Orchestrator
 */
export const Trips = {
    _readyPromise: null,
    _resolveReady: null,
    _prestoTrips: [],

    async init() {
        this._readyPromise = new Promise(resolve => { this._resolveReady = resolve; });

        // Let Firestore finish opening its local cache before attaching the
        // trip listener, so repeat visits can render cached trips immediately.
        await firestorePersistenceReady;
        
        // Connect to Firestore
        if (window.currentUser) {
            TripController.listen(window.currentUser.uid, (trips, active) => {
                this.sync(trips, active);
                if (this._resolveReady) {
                    this._resolveReady();
                    this._resolveReady = null;
                }
            });
            this._listenPrestoTrips(window.currentUser.uid);
        }

        // Stop metadata is enrichment, not a prerequisite for showing the
        // rider's trips. Let the map render saved coordinates first and load
        // the larger fallback library in the background.
        void this.loadStopsLibrary();
    },

    // Imported PRESTO activity lives in its own collection and has no
    // duration/route/stop shape, so it's kept out of TripController's stream
    // (which the trip feed and richer metrics assume is logged trips) and
    // fed separately into the map and the summary counts in sync().
    _listenPrestoTrips(userId) {
        db.collection('prestoTransactions').where('userId', '==', userId).onSnapshot(
            snap => {
                const records = snap.docs.map(doc => doc.data());
                this._prestoTrips = buildPrestoTrips(records);
                MapEngine.updatePrestoTrips(this._prestoTrips);
                this.sync(TripController.allTrips, TripController.activeTrip);
            },
            err => console.error('PRESTO trips sync failed:', err),
        );
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
                    MapEngine.setStopSources({ firestoreStops: data });
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
            MapEngine.setStopSources({ firestoreStops: data });
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
        TripStatsView.render(trips, this._prestoTrips);

        // Update Global Map
        MapEngine.updateTrips(trips);
    },

    openEditModal(trip) {
        if (!trip) return;
        
        const form = {
            id: document.getElementById('edit-trip-id'),
            route: document.getElementById('edit-route'),
            start: document.getElementById('edit-start-stop'),
            end: document.getElementById('edit-end-stop'),
            dir: document.getElementById('edit-direction'),
            dirOther: document.getElementById('edit-direction-other'),
            vehicle: document.getElementById('edit-vehicle'),
            agency: document.getElementById('edit-agency')
        };

        if (form.id) form.id.value = trip.id;
        if (form.route) form.route.value = trip.route || '';
        if (form.start) form.start.value = trip.startStopName || trip.startStop || '';
        if (form.end) form.end.value = trip.endStopName || trip.endStop || '';
        if (form.dir) {
            const direction = trip.direction || '';
            const hasOption = [...form.dir.options].some(option => option.value === direction);
            form.dir.value = hasOption ? direction : (direction ? '__other__' : '');
            if (form.dirOther) {
                form.dirOther.value = hasOption ? '' : direction;
                form.dirOther.classList.toggle('hidden', form.dir.value !== '__other__');
            }
        }
        if (form.vehicle) form.vehicle.value = trip.vehicle || '';
        if (form.agency) {
            if (window.TripAgencyAutocomplete) {
                window.TripAgencyAutocomplete.setValue(trip.agency || 'TTC');
            } else {
                form.agency.value = trip.agency || 'TTC';
            }
        }

        ModalManager.open('modal-edit-trip');
    },

    // Bridge methods for dashboard.js (legacy-ish support)
    async update(id, data) { return TripController.update(id, data); },
    async delete(id) { return TripController.delete(id); }
};
