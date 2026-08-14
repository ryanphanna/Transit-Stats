import { requireAuth } from '../shared/auth-guard.js';
import { initHeader } from '../shared/header.js';
import { refreshIcons } from '../shared/icons.js';
import { ModalManager } from '../shared/modal-engine.js';
import { Trips } from '../trips.js';
import { Stats } from '../stats.js';
import { RouteTracker } from '../route-tracker.js';
import { Admin } from '../admin.js';
import { Profile } from '../profile.js';
import { PredictionEngine } from '../predict.js';
import { Utils } from '../utils.js';
import { UI } from '../ui-utils.js';
import { db } from '../firebase.js';
import { createAgencyAutocomplete } from '../agency-autocomplete.js';
import { displayAgencyName } from '../profile.js';
import { MapEngine } from '../map-engine.js';
import { TripController } from '../trips/TripController.js';
import { loadAtlasStops } from '../atlas-stops.js';

window.Trips = Trips;
window.Utils = Utils;
window.RouteTracker = RouteTracker;
window.refreshIcons = refreshIcons;

// --- Trip Edit Modal ---
const tripEdit = {
    id: document.getElementById('edit-trip-id'),
    route: document.getElementById('edit-route'),
    startStop: document.getElementById('edit-start-stop'),
    endStop: document.getElementById('edit-end-stop'),
    direction: document.getElementById('edit-direction'),
    directionOther: document.getElementById('edit-direction-other'),
    vehicle: document.getElementById('edit-vehicle'),
    agency: document.getElementById('edit-agency'),
    btnSave: document.getElementById('btn-save-edit'),
    btnDelete: document.getElementById('btn-delete-trip')
};

let tripAgencyAutocomplete = null;

function setupTripAgencyAutocomplete() {
    const defaultAgency = window.currentUserProfile?.defaultAgency || 'TTC';
    const optionsByValue = new Map((Profile.agencyOptions || []).map(option => [option.value, option]));
    if (!optionsByValue.has(defaultAgency)) {
        optionsByValue.set(defaultAgency, { value: defaultAgency, label: displayAgencyName(defaultAgency) });
    }
    tripAgencyAutocomplete = createAgencyAutocomplete({
        input: tripEdit.agency,
        options: [...optionsByValue.values()],
    });
    window.TripAgencyAutocomplete = tripAgencyAutocomplete;
}

function setupTripEditListeners() {
    tripEdit.direction?.addEventListener('change', () => {
        const isOther = tripEdit.direction.value === '__other__';
        tripEdit.directionOther?.classList.toggle('hidden', !isOther);
        if (!isOther && tripEdit.directionOther) tripEdit.directionOther.value = '';
        if (isOther) tripEdit.directionOther?.focus();
    });

    tripEdit.btnSave?.addEventListener('click', async () => {
        const id = tripEdit.id.value;
        const data = {
            route: tripEdit.route.value.trim(),
            startStop: tripEdit.startStop.value.trim(),
            endStop: tripEdit.endStop.value.trim(),
            direction: tripEdit.direction.value === '__other__'
                ? tripEdit.directionOther.value.trim()
                : tripEdit.direction.value.trim(),
            vehicle: tripEdit.vehicle.value.trim(),
            agency: tripAgencyAutocomplete?.getValue() || tripEdit.agency.value.trim()
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

function setupShareMap() {
    const shareButton = document.getElementById('atlas-share-map');
    if (!shareButton) return;

    shareButton.addEventListener('click', async () => {
        const username = Profile.data?.username;
        if (!username || !Profile.data?.isPublic) {
            UI.showNotification(username ? 'Turn on your public profile first.' : 'Set up your public identity first.');
            window.location.href = '/settings#public-profile-settings';
            return;
        }

        const url = `${window.location.origin}/public?user=${encodeURIComponent(username)}`;
        try {
            if (navigator.share) {
                await navigator.share({
                    title: `${Profile.getDisplayName() || 'My'} TransitStats map`,
                    url,
                });
                return;
            }
            await navigator.clipboard.writeText(url);
            UI.showNotification('Map link copied to clipboard.', 'success');
        } catch (error) {
            if (error?.name !== 'AbortError') UI.showNotification('Could not share your map.');
        }
    });
}

function closeAllModals() {
    document.getElementById('modal-backdrop')?.classList.add('hidden');
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

async function loadDashboardAtlasStops() {
    // Release the first view with coordinates already stored on the trips.
    // Atlas enrichment can then improve unresolved points without blocking the
    // first useful map frame.
    const initialRender = MapEngine.releaseInitialView();
    document.querySelector('.dashboard-atlas-hero')?.classList.remove('is-loading');
    document.getElementById('dashboard-map-loading')?.remove();
    await initialRender;

    const agencies = [...new Set((TripController.allTrips || [])
        .map(trip => String(trip.agency || '').trim())
        .filter(Boolean))];
    if (agencies.length === 0) {
        return;
    }

    try {
        const atlasStops = await loadAtlasStops(agencies);
        await MapEngine.setStopSources({
            atlasStops,
            firestoreStops: PredictionEngine.stopsLibrary || [],
        });
    } catch (error) {
        console.warn('Dashboard: Atlas stop data unavailable', error);
    }
}

async function init() {
    const { user, isAdmin } = await requireAuth();
    initHeader({ isAdmin, currentPage: 'dashboard' });
    ModalManager.init();

    await Profile.load(user);
    await Profile.loadAgencies(user);
    setupShareMap();

    const profileName = document.getElementById('profile-name');
    if (profileName) profileName.textContent = Profile.getDisplayName(user) || 'Traveler';

    setupTripAgencyAutocomplete();
    setupTripEditListeners();

    // Edit trip modal backdrop close
    document.getElementById('modal-backdrop')?.addEventListener('click', closeAllModals);
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', closeAllModals);
    });

    if (window.L) {
        MapEngine.init([], null, { deferInitialView: true });
    }

    const tripsInitPromise = Trips.init();
    Promise.all([Trips._readyPromise, tripsInitPromise]).then(() => {
        Stats.init();
        loadDashboardAtlasStops();
        refreshIcons();
    });

    refreshIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
