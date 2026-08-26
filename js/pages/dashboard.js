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
import { displayAgencyName, getConfiguredAgency } from '../profile-fields.js';
import { MapEngine } from '../map-engine.js';
import { TripController } from '../trips/TripController.js';
import { loadAtlasStops } from '../atlas-stops.js';
import { renderAtlasCard, setAtlasDisplayName } from '../shared/atlas-card.js';

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
    const profile = window.currentUserProfile || {};
    const defaultAgency = getConfiguredAgency(profile);
    const optionsByValue = new Map((Profile.agencyOptions || []).map(option => [option.value, option]));
    if (defaultAgency && !optionsByValue.has(defaultAgency)) {
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

        const url = `${window.location.origin}/user/${encodeURIComponent(username)}`;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `${Profile.getDisplayName() || 'My'} TransitStats map`,
                    url,
                });
                return;
            } catch (error) {
                if (error?.name === 'AbortError') return;
            }
        }

        try {
            if (!navigator.clipboard?.writeText) return;
            await navigator.clipboard.writeText(url);
            UI.showNotification('Map link copied to clipboard.', 'success');
        } catch {
            // Sharing is optional; avoid surfacing a generic failure toast.
        }
    });
}

function closeAllModals() {
    document.getElementById('modal-backdrop')?.classList.add('hidden');
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

async function loadDashboardAtlasStops() {
    // Let the map show immediately, then improve its markers with Atlas data.
    const initialRender = MapEngine.releaseInitialView();
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
    renderAtlasCard();
    const { user, isAdmin } = await requireAuth();
    ModalManager.init();

    if (window.L) {
        MapEngine.init([], null, { deferInitialView: true });
    }

    await Profile.load(user);
    await Profile.loadAgencies(user);
    const profileHref = Profile.data?.isPublic && Profile.data?.username
        ? `/user/${encodeURIComponent(Profile.data.username)}`
        : '';
    initHeader({ isAdmin, currentPage: 'dashboard', profileHref });
    setupShareMap();

    const displayName = Profile.getDisplayName(user)?.trim() || 'Traveler';
    setAtlasDisplayName(displayName);

    setupTripAgencyAutocomplete();
    setupTripEditListeners();

    // Edit trip modal backdrop close
    document.getElementById('modal-backdrop')?.addEventListener('click', closeAllModals);
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', closeAllModals);
    });

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
