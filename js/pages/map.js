import { requireAuth } from '../shared/auth-guard.js';
import { initHeader } from '../shared/header.js';
import { db } from '../firebase.js';
import { MapEngine } from '../map-engine.js';
import { PredictionEngine } from '../predict.js';
import { ATLAS_AGENCY_SLUGS, loadAtlasStops } from '../atlas-stops.js';

console.log("map.js: Module script loaded");

let firestoreStops = [];
let atlasStops = [];
const loadedAtlasAgencies = new Set();

async function loadAtlasFallbacks(trips) {
    const agencies = [...new Set(trips.map(trip => trip.agency || 'TTC'))]
        .filter(agency => ATLAS_AGENCY_SLUGS[agency] && !loadedAtlasAgencies.has(agency));
    if (agencies.length === 0) return;

    agencies.forEach(agency => loadedAtlasAgencies.add(agency));
    const newStops = await loadAtlasStops(agencies);
    atlasStops = [...atlasStops, ...newStops];
    PredictionEngine.stopsLibrary = [...atlasStops, ...firestoreStops];
    MapEngine.refreshStopLookup();
    console.log(`Map: Loaded ${newStops.length} Atlas fallback stops.`);
}

async function init() {
    try {
        console.log("Map: Init started");
        const { user, isAdmin } = await requireAuth();
        console.log("Map: Auth resolved", user.email);
        initHeader({ isAdmin, currentPage: 'map' });

        // Load stops library so MapEngine can resolve coordinates
        try {
            console.log("Map: Loading stops...");
            const stopsSnap = await db.collection('stops').get();
            firestoreStops = stopsSnap.docs.map(doc => doc.data());
            PredictionEngine.stopsLibrary = firestoreStops;
            console.log(`Map: Loaded ${firestoreStops.length} Transit Stats stops.`);
        } catch (err) {
            console.error("Map: Failed to load stops library:", err);
        }

        // Initialize Leaflet immediately with empty data
        console.log("Map: Initializing MapEngine");
        MapEngine.init([]);
        setTimeout(() => { if (MapEngine.map) MapEngine.map.invalidateSize(); }, 150);

        if (window.lucide) lucide.createIcons();

        // Stream trips live — update map as data arrives
        db.collection('trips')
            .where('userId', '==', user.uid)
            .orderBy('startTime', 'desc')
            .onSnapshot(snap => {
                const trips = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                MapEngine.updateTrips(trips);
                loadAtlasFallbacks(trips).catch(err => console.warn('Map: Atlas fallback unavailable:', err));
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
