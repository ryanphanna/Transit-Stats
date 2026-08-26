import { requireAuth } from '../shared/auth-guard.js';
import { initHeader } from '../shared/header.js';
import { Profile } from '../profile.js';
import { loadAdminMetrics } from '../admin-metrics.js';

async function init() {
    try {
        const { user, isAdmin } = await requireAuth({ adminOnly: true });
        await Profile.load(user);
        initHeader({ isAdmin, currentPage: 'admin' });

        await loadAdminMetrics(document.querySelector('[data-admin-metrics]'));
    } catch (error) {
        console.error('Admin page failed to initialize:', error);
        document.querySelectorAll('.loading-state').forEach(element => {
            element.textContent = 'This section could not load. Refresh to try again.';
            element.classList.add('admin-load-error');
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
