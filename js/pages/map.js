import { requireAuth } from '../shared/auth-guard.js';
import { initHeader } from '../shared/header.js';
import { db } from '../firebase.js';
import { MapEngine } from '../map-engine.js';
import { loadAtlasStops } from '../atlas-stops.js';

console.log("map.js: Module script loaded");

function setMapLoading(message) {
    const loading = document.getElementById('map-loading');
    if (!loading) return;
    loading.textContent = message || '';
    loading.hidden = !message;
}

async function init() {
    try {
        console.log("Map: Init started");
        // Render navigation before auth, Firestore, and GTFS work so the user
        // can leave Stops immediately instead of waiting for map startup.
        initHeader({ currentPage: 'map' });
        const { user } = await requireAuth();
        console.log("Map: Auth resolved", user.email);

        // Initialize Leaflet before any Firestore or Atlas reads. The map is
        // interactive immediately while the stop library and trip stream load.
        console.log("Map: Initializing MapEngine");
        let normalizedStops = [];
        let atlasStops = [];
        let canonicalTrips = [];
        let prestoActivities = [];
        MapEngine.setStopSources({ atlasStops, firestoreStops: normalizedStops });
        MapEngine.init([], null, { deferInitialView: true });
        setTimeout(() => { if (MapEngine.map) MapEngine.map.invalidateSize(); }, 150);

        if (window.lucide) lucide.createIcons();

        // Do not hold map initialization hostage to the normalized-stop read.
        db.collection('stops').get().then(stopsSnapshot => {
                normalizedStops = stopsSnapshot.docs.map(doc => doc.data());
                MapEngine.setStopSources({ atlasStops, firestoreStops: normalizedStops });
        }).catch(error => {
            console.warn('Map: normalized stop aliases unavailable', error);
        });

        // Stream trips live — update map as data arrives
        const loadedAtlasAgencies = new Set();
        const loadingAtlasAgencies = new Set();
        const loadMissingAtlasStops = async agencies => {
            const missing = agencies.filter(agency =>
                !loadedAtlasAgencies.has(agency) && !loadingAtlasAgencies.has(agency)
            );
            if (missing.length === 0) return;
            missing.forEach(agency => loadingAtlasAgencies.add(agency));
            try {
                const loadedStops = await loadAtlasStops(missing);
                atlasStops = [...atlasStops, ...loadedStops];
                missing.forEach(agency => {
                    loadedAtlasAgencies.add(agency);
                    loadingAtlasAgencies.delete(agency);
                });
                MapEngine.setStopSources({ atlasStops, firestoreStops: normalizedStops });
                setMapLoading(null);
            } catch (err) {
                missing.forEach(agency => loadingAtlasAgencies.delete(agency));
                console.warn('Map: Atlas stops unavailable', err);
                setMapLoading(null);
            }
        };

        const refreshMapActivities = () => {
            const trips = [...canonicalTrips, ...prestoActivities];
            MapEngine.updateTrips(trips);
            const agencies = [...new Set(trips.map(trip => trip.agency || 'TTC'))];
            return loadMissingAtlasStops(agencies)
                .catch(error => {
                    console.warn('Map: Atlas stop loading failed', error);
                })
                .then(() => MapEngine.releaseInitialView())
                .then(() => setMapLoading(null));
        };

        db.collection('trips')
            .where('userId', '==', user.uid)
            .orderBy('startTime', 'desc')
            .onSnapshot(snap => {
                canonicalTrips = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                refreshMapActivities();
            }, err => {
                console.error('Map trips stream error:', err);
                setMapLoading('Could not load your trips.');
            });

        db.collection('prestoTransactions')
            .where('userId', '==', user.uid)
            .onSnapshot(snap => {
                prestoActivities = snap.docs
                    .map(doc => ({ id: `presto:${doc.id}`, ...doc.data() }))
                    .filter(record => record.type === 'fare_payment' && (record.locationLabel || record.location))
                    .map(record => ({
                        ...record,
                        source: 'presto',
                        startStopName: record.locationLabel || record.location,
                    }));
                refreshMapActivities();
            }, err => {
                console.warn('Map PRESTO activity stream error:', err);
            });
        
        console.log("Map: Init completed successfully");
    } catch (err) {
        console.error("Map: Critical initialization failure:", err);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
