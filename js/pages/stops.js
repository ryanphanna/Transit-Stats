import { requireAuth } from '../shared/auth-guard.js';
import { initHeader } from '../shared/header.js';
import { refreshIcons } from '../shared/icons.js';
import { Admin } from '../admin.js';
import { Trips } from '../trips.js';
import { Utils } from '../utils.js';
import { Profile } from '../profile.js';

window.Admin = Admin;
window.Utils = Utils;
window.Trips = Trips;

function closeAllModals() {
    document.getElementById('modal-backdrop')?.classList.add('hidden');
    document.querySelectorAll('.modal').forEach(modal => modal.classList.add('hidden'));
}

async function init() {
    try {
        const { user, isAdmin } = await requireAuth({ adminOnly: true });
        await Profile.load(user);
        initHeader({ isAdmin, currentPage: 'stops' });
        document.getElementById('modal-backdrop')?.addEventListener('click', closeAllModals);
        document.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', closeAllModals));
        await Admin.init();
        await Trips.init();
        await Trips._readyPromise;
        await Admin.loadAll();
        refreshIcons();
    } catch (error) {
        console.error('Stops page failed to initialize:', error);
        document.querySelectorAll('.loading-state').forEach(element => {
            element.textContent = 'This section could not load. Refresh to try again.';
            element.classList.add('admin-load-error');
        });
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
