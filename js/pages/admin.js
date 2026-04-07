import { requireAuth } from '../shared/auth-guard.js';
import { initHeader } from '../shared/header.js';
import { Admin } from '../admin.js';
import { Trips } from '../trips.js';
import { RouteTracker } from '../route-tracker.js';
import { Utils } from '../utils.js';
import { UI } from '../ui-utils.js';

window.Admin = Admin;
window.Utils = Utils;

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

    Admin.init();
    Admin.loadAll();

    Trips.init();
    Trips._readyPromise.then(() => {
        RouteTracker.init();
        refreshIcons();
    });

    refreshIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
