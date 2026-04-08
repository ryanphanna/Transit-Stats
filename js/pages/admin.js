import { requireAuth } from '../shared/auth-guard.js';
import { initHeader } from '../shared/header.js';
import { Admin } from '../admin.js';
import { Trips } from '../trips.js';
import { RouteTracker } from '../route-tracker.js';
import { Utils } from '../utils.js';
import { UI } from '../ui-utils.js';

window.Admin = Admin;
window.Utils = Utils;
window.Trips = Trips;

function refreshIcons() {
    if (window.lucide) {
        lucide.createIcons();
    } else {
        setTimeout(() => { if (window.lucide) lucide.createIcons(); }, 100);
    }
}

function closeAllModals() {
    document.getElementById('modal-backdrop')?.classList.add('hidden');
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

function setupModalListeners() {
    document.getElementById('modal-backdrop')?.addEventListener('click', closeAllModals);
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', closeAllModals);
    });
}

function setupRouteTracker() {
    document.getElementById('routeTrackerAgency')?.addEventListener('change', (e) => {
        RouteTracker.setAgency(e.target.value);
    });
}

async function init() {
    const { user, isAdmin } = await requireAuth({ adminOnly: true });
    initHeader({ isAdmin, currentPage: 'admin' });

    setupModalListeners();
    setupRouteTracker();

    await Admin.init();

    await Trips.init();
    await Trips._readyPromise;
    
    // Now that trips are loaded, reload admin data
    await Admin.loadAll();

    RouteTracker.init();

    refreshIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
