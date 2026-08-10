import { requireAuth } from '../shared/auth-guard.js';
import { initHeader } from '../shared/header.js';
import { db } from '../firebase.js';
import { MapEngine } from '../map-engine.js';
import { PredictionEngine } from '../predict.js';

console.log("map.js: Module script loaded");

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
            PredictionEngine.stopsLibrary = stopsSnap.docs.map(doc => doc.data());
            console.log(`Map: Loaded ${PredictionEngine.stopsLibrary.length} stops.`);
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
