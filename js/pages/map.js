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

        let firestoreStops = [];
        try {
            console.log("Map: Loading stops...");
            const stopsSnap = await db.collection('stops').get();
            firestoreStops = stopsSnap.docs.map(doc => doc.data());
            MapEngine.setStopSources({ firestoreStops });
            console.log(`Map: Loaded ${firestoreStops.length} Firestore stops.`);
        } catch (err) {
            console.error("Map: Failed to load stops library:", err);
        }

        // Initialize Leaflet immediately with empty data
        console.log("Map: Initializing MapEngine");
        MapEngine.init([]);
        setTimeout(() => { if (MapEngine.map) MapEngine.map.invalidateSize(); }, 150);

        if (window.lucide) lucide.createIcons();

        // Stream trips live — update map as data arrives
        let atlasLoadStarted = false;
        db.collection('trips')
            .where('userId', '==', user.uid)
            .orderBy('startTime', 'desc')
            .onSnapshot(snap => {
                const trips = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                MapEngine.updateTrips(trips);
                const agencies = [...new Set(trips.map(trip => trip.agency || 'TTC'))]
                    .filter(agency => ATLAS_AGENCY_SLUGS[agency]);
                if (!atlasLoadStarted && agencies.length > 0) {
                    atlasLoadStarted = true;
                    loadAtlasStops(agencies)
                        .then(atlasStops => MapEngine.setStopSources({ atlasStops, firestoreStops }))
                        .catch(err => console.warn('Map: Atlas stops unavailable; using Firestore stops', err));
                }
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
