import { requireAuth } from '../shared/auth-guard.js';
import { initHeader } from '../shared/header.js';
import { Trips } from '../trips.js';
import { TripController } from '../trips/TripController.js';
import { MapEngine } from '../map-engine.js';

function refreshIcons() {
    if (window.lucide) {
        lucide.createIcons();
    } else {
        setTimeout(() => { if (window.lucide) lucide.createIcons(); }, 100);
    }
}

async function init() {
    const { user, isAdmin } = await requireAuth();
    initHeader({ isAdmin, currentPage: 'map' });

    Trips.init();
    Trips._readyPromise.then(() => {
        MapEngine.init(TripController.allTrips || []);
        setTimeout(() => { if (MapEngine.map) MapEngine.map.invalidateSize(); }, 100);
        refreshIcons();
    });

    refreshIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
