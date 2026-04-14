import { requireAuth } from '../shared/auth-guard.js';
import { initHeader } from '../shared/header.js';
import { ModalManager } from '../shared/modal-engine.js';
import { Trips } from '../trips.js';
import { Stats } from '../stats.js';
import { Admin } from '../admin.js';
import { Profile } from '../profile.js';
import { PredictionEngine } from '../predict.js';
import { Utils } from '../utils.js';
import { UI } from '../ui-utils.js';
import { db } from '../firebase.js';

window.Trips = Trips;
window.Utils = Utils;
window.refreshIcons = refreshIcons;

function refreshIcons() {
    if (window.lucide) {
        lucide.createIcons();
    } else {
        setTimeout(() => { if (window.lucide) lucide.createIcons(); }, 100);
    }
}

// --- Trip Edit Modal ---
const tripEdit = {
    id: document.getElementById('edit-trip-id'),
    route: document.getElementById('edit-route'),
    startStop: document.getElementById('edit-start-stop'),
    endStop: document.getElementById('edit-end-stop'),
    direction: document.getElementById('edit-direction'),
    agency: document.getElementById('edit-agency'),
    btnSave: document.getElementById('btn-save-edit'),
    btnDelete: document.getElementById('btn-delete-trip')
};

function setupTripEditListeners() {
    tripEdit.btnSave?.addEventListener('click', async () => {
        const id = tripEdit.id.value;
        const data = {
            route: tripEdit.route.value.trim(),
            startStop: tripEdit.startStop.value.trim(),
            endStop: tripEdit.endStop.value.trim(),
            direction: tripEdit.direction.value.trim(),
            agency: tripEdit.agency.value
        };
        if (!data.route) return UI.showNotification('Route number or name is required.');
        tripEdit.btnSave.disabled = true;
        tripEdit.btnSave.textContent = 'Saving...';
        try {
            await Trips.update(id, data);
            closeAllModals();
        } catch (err) {
            UI.showNotification('Update failed: ' + err.message);
        } finally {
            tripEdit.btnSave.disabled = false;
            tripEdit.btnSave.textContent = 'Save Changes';
        }
    });

    let _deleteArmed = false;
    let _deleteArmTimer = null;

    tripEdit.btnDelete?.addEventListener('click', async () => {
        const id = tripEdit.id.value;
        if (!_deleteArmed) {
            _deleteArmed = true;
            tripEdit.btnDelete.textContent = 'Tap again to confirm';
            tripEdit.btnDelete.classList.add('btn-danger');
            _deleteArmTimer = setTimeout(() => {
                _deleteArmed = false;
                tripEdit.btnDelete.textContent = 'Delete Trip';
                tripEdit.btnDelete.classList.remove('btn-danger');
            }, 3000);
            return;
        }
        clearTimeout(_deleteArmTimer);
        _deleteArmed = false;
        tripEdit.btnDelete.disabled = true;
        tripEdit.btnDelete.textContent = 'Deleting...';
        try {
            await Trips.delete(id);
            closeAllModals();
        } catch (err) {
            UI.showNotification('Delete failed: ' + err.message);
        } finally {
            tripEdit.btnDelete.disabled = false;
            tripEdit.btnDelete.textContent = 'Delete Trip';
            tripEdit.btnDelete.classList.remove('btn-danger');
        }
    });
}

function closeAllModals() {
    document.getElementById('modal-backdrop')?.classList.add('hidden');
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

function setupStatsToggle() {
    document.getElementById('toggle-stats-30-insights')?.addEventListener('click', () => {
        document.getElementById('toggle-stats-30-insights').classList.add('active');
        document.getElementById('toggle-stats-all-insights').classList.remove('active');
        Stats.showPeriod('30d');
    });
    document.getElementById('toggle-stats-all-insights')?.addEventListener('click', () => {
        document.getElementById('toggle-stats-all-insights').classList.add('active');
        document.getElementById('toggle-stats-30-insights').classList.remove('active');
        Stats.showPeriod('all');
    });
}

async function init() {
    const { user, isAdmin } = await requireAuth();
    initHeader({ isAdmin, currentPage: 'dashboard' });
    ModalManager.init();

    await Profile.load(user);

    const profileName = document.getElementById('profile-name');
    if (profileName) profileName.textContent = user.displayName || user.email.split('@')[0];

    setupTripEditListeners();
    setupStatsToggle();

    // Edit trip modal backdrop close
    document.getElementById('modal-backdrop')?.addEventListener('click', closeAllModals);
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', closeAllModals);
    });

    Trips.init();
    Trips._readyPromise.then(() => {
        Stats.init();
        refreshIcons();
    });

    refreshIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
