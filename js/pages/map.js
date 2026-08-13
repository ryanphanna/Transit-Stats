import { requireAuth } from '../shared/auth-guard.js';
import { initHeader } from '../shared/header.js';
import { db } from '../firebase.js';
import { MapEngine } from '../map-engine.js';
import { ATLAS_AGENCY_SLUGS, loadAtlasStops } from '../atlas-stops.js';

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
        const { user, isAdmin } = await requireAuth();
        console.log("Map: Auth resolved", user.email);
        initHeader({ isAdmin, currentPage: 'map' });

        // Initialize Leaflet before any Firestore or Atlas reads. The map is
        // interactive immediately while the stop library and trip stream load.
        console.log("Map: Initializing MapEngine");
        let normalizedStops = [];
        let atlasStops = [];
        MapEngine.setStopSources({ atlasStops, firestoreStops: normalizedStops });
        MapEngine.init([]);
        setTimeout(() => { if (MapEngine.map) MapEngine.map.invalidateSize(); }, 150);
        // The map itself is ready now. Stop data continues loading in the
        // background and must never prevent the shared header from being used.
        setMapLoading(null);

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

        db.collection('trips')
            .where('userId', '==', user.uid)
            .orderBy('startTime', 'desc')
            .onSnapshot(snap => {
                const trips = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                MapEngine.updateTrips(trips);
                setMapLoading(null);
                const agencies = [...new Set(trips.map(trip => trip.agency || 'TTC'))]
                    .filter(agency => ATLAS_AGENCY_SLUGS[agency]);
                loadMissingAtlasStops(agencies).catch(error => {
                    console.warn('Map: Atlas stop loading failed', error);
                    setMapLoading(null);
                });
            }, err => {
                console.error('Map trips stream error:', err);
                setMapLoading('Could not load your trips.');
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
