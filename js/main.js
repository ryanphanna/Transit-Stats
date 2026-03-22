import { db, auth } from './firebase.js';
import { Utils } from './utils.js';
import { Auth } from './auth.js';
import { Trips } from './trips.js';
import { Admin } from './admin.js';
import { Users } from './users.js';
import { Stats } from './stats.js';
import { MapEngine } from './map-engine.js';
import { PredictionEngine } from './predict.js';
import { RouteTracker } from './route-tracker.js';
import { UI } from './ui-utils.js';

// Expose to window for legacy onclick handlers and inter-module access
window.Auth = Auth;
window.Trips = Trips;
window.Admin = Admin;
window.Users = Users;
window.Stats = Stats;
window.MapEngine = MapEngine;
window.Utils = Utils;
window.refreshIcons = refreshIcons;

/**
 * TransitStats V2 - Main Entry Point
 * Handles routing, UI state, and global view management.
 */

// --- Global State ---
const State = {
    user: null,
    isAdmin: false,
    theme: 'light',
    currentView: 'dashboard'
};

const DOM = {};

async function init() {
    console.log("App booting...");
    initDOM();
    setupEventListeners();
    setupAuthObserver();
    refreshIcons();

    // Defer Stats, Map, and RouteTracker until Trips has its first snapshot, so they
    // don’t compete with the initial read and can use Trips.allCompletedTrips directly.
    Trips._readyPromise.then(() => {
        Stats.init();
        MapEngine.init();
        RouteTracker.init();
        refreshIcons();
    });
}

function initDOM() {
    initHeaderDOM();
    initAuthDOM();
    initModalDOM();
    initViewDOM();
    initTripEditDOM();
}

function initHeaderDOM() {
    DOM.header = {
        container: document.querySelector('.header'),
        navAdmin: document.getElementById('nav-admin'),
        navUsers: document.getElementById('nav-users'),
        navInsights: document.getElementById('nav-insights'),
        navSettings: document.getElementById('nav-settings'),
        navMap: document.getElementById('nav-map'),
        profileName: document.getElementById('profile-name')
    };
}

function initAuthDOM() {
    DOM.auth = {
        emailInput: document.getElementById('auth-email'),
        passwordInput: document.getElementById('auth-password'),
        btnContinue: document.getElementById('btn-auth-continue'),
        btnSignIn: document.getElementById('btn-auth-signin'),
        btnMagic: document.getElementById('btn-auth-magic'),
        btnUsePassword: document.getElementById('btn-auth-use-password'),
        btnForgot: document.getElementById('btn-auth-forgot'),
        emailStep: document.getElementById('auth-email-step'),
        passwordStep: document.getElementById('auth-password-step'),
        passwordInputGroup: document.getElementById('auth-password-input-group'),
        loginOptions: document.getElementById('auth-login-options'),
        displayEmail: document.getElementById('auth-display-email'),
        statusMsg: document.getElementById('auth-status')
    };
}

function initModalDOM() {
    DOM.modals = {
        backdrop: document.getElementById('modal-backdrop'),
        settings: document.getElementById('modal-settings'),
        btnLogout: document.getElementById('btn-logout'),
        btnCloseSettings: document.getElementById('btn-close-settings'),
        themeLight: document.getElementById('theme-light'),
        themeDark: document.getElementById('theme-dark')
    };
}

function initViewDOM() {
    DOM.views = {
        auth: document.getElementById('view-auth'),
        dashboard: document.getElementById('view-dashboard'),
        map: document.getElementById('view-map'),
        admin: document.getElementById('view-admin'),
        users: document.getElementById('view-users'),
        insights: document.getElementById('view-insights')
    };
    
    // Dashboard specific shortcuts
    DOM.dash = {
        navMap: document.getElementById('dash-nav-map'),
        navInsights: document.getElementById('dash-nav-insights')
    };
}

function initTripEditDOM() {
    DOM.tripEdit = {
        id: document.getElementById('edit-trip-id'),
        route: document.getElementById('edit-route'),
        startStop: document.getElementById('edit-start-stop'),
        endStop: document.getElementById('edit-end-stop'),
        direction: document.getElementById('edit-direction'),
        agency: document.getElementById('edit-agency'),
        btnSave: document.getElementById('btn-save-edit'),
        btnDelete: document.getElementById('btn-delete-trip')
    };
}

function setupEventListeners() {
    setupNavListeners();
    setupAuthListeners();
    setupTripEditListeners();
    setupModalListeners();
    setupThemeListeners();
}

function setupNavListeners() {
    document.querySelector('.logo').addEventListener('click', () => switchView('dashboard'));
    DOM.header.navAdmin?.addEventListener('click', () => switchView('admin'));
    DOM.header.navUsers?.addEventListener('click', () => switchView('users'));
    DOM.header.navInsights?.addEventListener('click', () => switchView('insights'));
    DOM.header.navSettings?.addEventListener('click', openSettings);
    DOM.header.navMap?.addEventListener('click', () => switchView('map'));

    // Dash Shortcuts
    DOM.dash.navMap?.addEventListener('click', () => switchView('map'));
    DOM.dash.navInsights?.addEventListener('click', () => switchView('insights'));
}

function setupAuthListeners() {
    DOM.auth.emailInput.addEventListener('input', () => {
        DOM.auth.btnContinue.disabled = !DOM.auth.emailInput.value.trim();
    });

    DOM.auth.emailInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !DOM.auth.btnContinue.disabled) DOM.auth.btnContinue.click();
    });

    DOM.auth.btnContinue.addEventListener('click', () => {
        const email = DOM.auth.emailInput.value.trim();
        if (!email) return;

        DOM.auth.displayEmail.textContent = email;
        DOM.auth.emailStep.classList.add('hidden');
        DOM.auth.passwordStep.classList.remove('hidden');
        DOM.auth.statusMsg.classList.add('hidden');
    });

    DOM.auth.btnMagic.addEventListener('click', async () => {
        const email = DOM.auth.emailInput.value.trim();
        try {
            DOM.auth.btnMagic.disabled = true;
            DOM.auth.btnMagic.textContent = 'Sending...';
            await Auth.sendMagicLink(email);
            showAuthSuccess('Magic link sent! Check your email.');
        } catch (err) {
            showAuthError(err.message);
            DOM.auth.btnMagic.disabled = false;
            DOM.auth.btnMagic.textContent = 'Send Magic Link';
        }
    });

    DOM.auth.btnUsePassword.addEventListener('click', () => {
        DOM.auth.loginOptions.classList.add('hidden');
        DOM.auth.passwordInputGroup.classList.remove('hidden');
        DOM.auth.passwordInput.focus();
    });

    DOM.auth.btnSignIn.addEventListener('click', async () => {
        const email = DOM.auth.emailInput.value.trim();
        const pwd = DOM.auth.passwordInput.value;
        if (!email || !pwd) return;

        try {
            DOM.auth.btnSignIn.disabled = true;
            DOM.auth.btnSignIn.textContent = 'Signing in...';
            DOM.auth.statusMsg.classList.add('hidden');
            await Auth.signInWithPassword(email, pwd);
        } catch (err) {
            showAuthError(Auth.getErrorMessage(err.code || err.message));
            DOM.auth.btnSignIn.disabled = false;
            DOM.auth.btnSignIn.textContent = 'Sign In';
        }
    });

    DOM.auth.passwordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') DOM.auth.btnSignIn.click();
    });

    DOM.auth.btnForgot.addEventListener('click', async () => {
        const email = DOM.auth.emailInput.value.trim();
        try {
            await Auth.sendPasswordReset(email);
            showAuthSuccess('Reset email sent!');
        } catch (err) {
            showAuthError(err.message);
        }
    });
}

function setupTripEditListeners() {
    DOM.tripEdit.btnSave?.addEventListener('click', async () => {
        const id = DOM.tripEdit.id.value;
        const data = {
            route: DOM.tripEdit.route.value.trim(),
            startStop: DOM.tripEdit.startStop.value.trim(),
            endStop: DOM.tripEdit.endStop.value.trim(),
            direction: DOM.tripEdit.direction.value.trim(),
            agency: DOM.tripEdit.agency.value
        };

        if (!data.route) return UI.showNotification("Route number or name is required.");

        DOM.tripEdit.btnSave.disabled = true;
        DOM.tripEdit.btnSave.textContent = 'Saving...';
        try {
            await Trips.update(id, data);
            closeAllModals();
        } catch (err) {
            UI.showNotification("Update failed: " + err.message);
        } finally {
            DOM.tripEdit.btnSave.disabled = false;
            DOM.tripEdit.btnSave.textContent = 'Save Changes';
        }
    });

    let _deleteArmed = false;
    let _deleteArmTimer = null;

    DOM.tripEdit.btnDelete?.addEventListener('click', async () => {
        const id = DOM.tripEdit.id.value;

        if (!_deleteArmed) {
            _deleteArmed = true;
            DOM.tripEdit.btnDelete.textContent = 'Tap again to confirm';
            DOM.tripEdit.btnDelete.classList.add('btn-danger');
            _deleteArmTimer = setTimeout(() => {
                _deleteArmed = false;
                DOM.tripEdit.btnDelete.textContent = 'Delete Trip';
                DOM.tripEdit.btnDelete.classList.remove('btn-danger');
            }, 3000);
            return;
        }

        clearTimeout(_deleteArmTimer);
        _deleteArmed = false;
        DOM.tripEdit.btnDelete.disabled = true;
        DOM.tripEdit.btnDelete.textContent = 'Deleting...';
        try {
            await Trips.delete(id);
            closeAllModals();
        } catch (err) {
            UI.showNotification("Delete failed: " + err.message);
        } finally {
            DOM.tripEdit.btnDelete.disabled = false;
            DOM.tripEdit.btnDelete.textContent = 'Delete Trip';
            DOM.tripEdit.btnDelete.classList.remove('btn-danger');
        }
    });
}

function setupModalListeners() {
    DOM.modals.btnLogout?.addEventListener('click', () => {
        Auth.signOut();
        closeSettings();
    });

    DOM.modals.btnCloseSettings?.addEventListener('click', closeSettings);
    
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', closeAllModals);
    });
    DOM.modals.backdrop?.addEventListener('click', closeAllModals);
}

function setupThemeListeners() {
    DOM.modals.themeLight?.addEventListener('click', () => setTheme('light'));
    DOM.modals.themeDark?.addEventListener('click', () => setTheme('dark'));
}

function closeAllModals() {
    DOM.modals.backdrop?.classList.add('hidden');
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

// --- View Router ---
function switchView(viewName) {
    if(!DOM.views[viewName]) return;
    State.currentView = viewName;

    Object.values(DOM.views).forEach(v => {
        v?.classList.remove('active');
        v?.classList.add('hidden');
    });

    if (viewName === 'auth') {
        DOM.header.container?.classList.add('hidden');
    } else {
        DOM.header.container?.classList.remove('hidden');
    }

    DOM.views[viewName].classList.add('active');
    DOM.views[viewName].classList.remove('hidden');

    // Handle Map Initialization
    if (viewName === 'map') {
        MapEngine.init(Trips.allTrips);
        setTimeout(() => {
            if (MapEngine.map) MapEngine.map.invalidateSize();
        }, 100);
    }

    if (viewName === 'admin') {
        Admin.init();
    }

    if (viewName === 'users') {
        Users.init();
    }

    refreshIcons();
}

// --- Theme Management ---
function setTheme(theme) {
    State.theme = theme;
    localStorage.setItem('ts_theme', theme);
    document.body.classList.toggle('dark', theme === 'dark');
    
    // Update toggle buttons
    if (DOM.modals.themeLight && DOM.modals.themeDark) {
        DOM.modals.themeLight.classList.toggle('active', theme === 'light');
        DOM.modals.themeDark.classList.toggle('active', theme === 'dark');
    }

    // Update Map if active
    if (MapEngine.map) {
        MapEngine.setupLayers();
    }
}

// Theme listeners are now moved to setupEventListeners() via setupThemeListeners()

// Load Preference
const savedTheme = localStorage.getItem('ts_theme') || 'light';
setTheme(savedTheme);

// --- Firebase State Listener ---
function setupAuthObserver() {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            console.log("Session active for:", user.email);
            window.currentUser = user; 
            
            // Whitelist Check
            const verification = await Auth.checkWhitelist(user.email);
            if (!verification.allowed) {
                console.warn("User not whitelisted.");
                Auth.signOut();
                showAuthError(verification.error);
                switchView('auth');
                return;
            }

            State.user = user;
            State.isAdmin = verification.isAdmin;
            window.isAdmin = verification.isAdmin;
            
            DOM.header.navAdmin?.classList.toggle('hidden', !State.isAdmin);
            DOM.header.navUsers?.classList.toggle('hidden', !State.isAdmin);
            if (DOM.header.profileName) DOM.header.profileName.textContent = user.displayName || user.email.split('@')[0];
            
            switchView('dashboard');
            
            // Initialize Trips
            Trips.init();

            // Pre-init Admin if needed
            if (State.isAdmin) Admin.loadAll();
        } else {
            if (Trips.unsubscribe) { Trips.unsubscribe(); Trips.unsubscribe = null; }
            State.user = null;
            State.isAdmin = false;
            window.isAdmin = false;
            window.currentUser = null;
            switchView('auth');
        }
    });
}

// --- Modals ---
function openSettings() {
    DOM.modals.backdrop?.classList.remove('hidden');
    DOM.modals.settings?.classList.remove('hidden');

    if (State.isAdmin && State.user) {
        const section = document.getElementById('prediction-accuracy-section');
        const stat = document.getElementById('prediction-accuracy-stat');
        if (section && stat) {
            section.classList.remove('hidden');
            db.collection('predictionAccuracy').doc(State.user.uid).get().then(doc => {
                if (!doc.exists) { stat.textContent = 'No predictions graded yet.'; return; }
                const d = doc.data();
                const routePct = d.total ? Math.round((d.hits / d.total) * 100) : null;
                const endPct = d.endStopTotal ? Math.round((d.endStopHits / d.endStopTotal) * 100) : null;
                const parts = [];
                if (routePct !== null) parts.push(`Route: ${routePct}% (${d.hits}/${d.total})`);
                if (endPct !== null) parts.push(`End stop: ${endPct}% (${d.endStopHits}/${d.endStopTotal})`);
                stat.textContent = parts.length ? parts.join(' · ') : 'No data yet.';
            }).catch(() => { stat.textContent = 'Could not load.'; });
        }
    }
}

function closeSettings() {
    closeAllModals();
}

// --- Helpers ---
function showAuthError(msg) {
    if (!DOM.auth.statusMsg) return;
    DOM.auth.statusMsg.textContent = msg;
    DOM.auth.statusMsg.style.color = 'var(--danger)';
    DOM.auth.statusMsg.classList.remove('hidden');
}

function showAuthSuccess(msg) {
    if (!DOM.auth.statusMsg) return;
    DOM.auth.statusMsg.textContent = msg;
    DOM.auth.statusMsg.style.color = 'var(--success)';
    DOM.auth.statusMsg.classList.remove('hidden');
}

function refreshIcons() {
    if (window.lucide) {
        lucide.createIcons();
    } else {
        // Retry shortly if it's not loaded yet
        setTimeout(() => {
            if (window.lucide) lucide.createIcons();
        }, 100);
    }
}

// Boot
document.addEventListener('DOMContentLoaded', init);

