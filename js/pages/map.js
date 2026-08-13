import { requireAuth } from '../shared/auth-guard.js';
import { initHeader } from '../shared/header.js';
import { db } from '../firebase.js';
import { MapEngine } from '../map-engine.js';
import { ATLAS_AGENCY_SLUGS, loadAtlasStops } from '../atlas-stops.js';

console.log("map.js: Module script loaded");

async function init() {
    try {
        console.log("Map: Init started");
        const { user, isAdmin } = await requireAuth();
        console.log("Map: Auth resolved", user.email);
        initHeader({ isAdmin, currentPage: 'map' });

        // Initialize Leaflet immediately with empty data
        console.log("Map: Initializing MapEngine");
        let normalizedStops = [];
        try {
            const stopsSnapshot = await db.collection('stops').get();
            normalizedStops = stopsSnapshot.docs.map(doc => doc.data());
        } catch (error) {
            console.warn('Map: normalized stop aliases unavailable', error);
        }
        MapEngine.setStopSources({ atlasStops: [], firestoreStops: normalizedStops });
        MapEngine.init([]);
        setTimeout(() => { if (MapEngine.map) MapEngine.map.invalidateSize(); }, 150);

        if (window.lucide) lucide.createIcons();

        // Stream trips live — update map as data arrives
        const loadedAtlasAgencies = new Set();
        const loadingAtlasAgencies = new Set();
        let atlasStops = [];
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
            } catch (err) {
                missing.forEach(agency => loadingAtlasAgencies.delete(agency));
                console.warn('Map: Atlas stops unavailable', err);
            }
        };

        db.collection('trips')
            .where('userId', '==', user.uid)
            .orderBy('startTime', 'desc')
            .onSnapshot(snap => {
                const trips = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                MapEngine.updateTrips(trips);
                const agencies = [...new Set(trips.map(trip => trip.agency || 'TTC'))]
                    .filter(agency => ATLAS_AGENCY_SLUGS[agency]);
                loadMissingAtlasStops(agencies);
            }, err => {
                console.error('Map trips stream error:', err);
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
