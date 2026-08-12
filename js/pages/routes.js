import { requireAuth } from '../shared/auth-guard.js';
import { initHeader } from '../shared/header.js';
import { refreshIcons } from '../shared/icons.js';
import { Trips } from '../trips.js';
import { RouteTracker } from '../route-tracker.js';
import { Profile } from '../profile.js';

async function init() {
    const { user, isAdmin } = await requireAuth();
    await Profile.load(user);
    window.RouteTracker = RouteTracker;
    initHeader({ isAdmin, currentPage: 'routes' });

    document.getElementById('routeTrackerAgency')?.addEventListener('change', (event) => {
        RouteTracker.setAgency(event.target.value);
    });

    await Trips.init();
    await Trips._readyPromise;
    RouteTracker.init();
    refreshIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
