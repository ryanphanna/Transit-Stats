import { requireAuth } from '../shared/auth-guard.js';
import { initHeader } from '../shared/header.js';
import { Trips } from '../trips.js';
import { MapEngine } from '../map-engine.js';

function refreshIcons() {
    if (window.lucide) {
        lucide.createIcons();
    } else {
        setTimeout(() => { if (window.lucide) lucide.createIcons(); }, 100);
    }
}

function setupMapControls() {
    // Filter pills
    document.querySelectorAll('.filter-pills .pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.filter-pills .pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            MapEngine.setFilter(pill.dataset.filter);
        });
    });

    // Locate button
    document.getElementById('btn-locate')?.addEventListener('click', () => {
        navigator.geolocation.getCurrentPosition(
            (pos) => MapEngine.map?.setView([pos.coords.latitude, pos.coords.longitude], 15),
            () => {}
        );
    });
}

async function init() {
    const { user, isAdmin } = await requireAuth();
    initHeader({ isAdmin, currentPage: 'map' });

    setupMapControls();

    Trips.init();
    Trips._readyPromise.then(() => {
        MapEngine.init(Trips.allTrips);
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
