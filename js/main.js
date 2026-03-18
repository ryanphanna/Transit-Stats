import { db, auth } from './firebase.js';
import { Utils } from './utils.js';
import { Auth } from './auth.js';
import { Trips } from './trips.js';
import { Admin } from './admin.js';
import { Stats } from './stats.js';
import { MapEngine } from './map-engine.js';
import { PredictionEngine } from './predict.js';
import { RouteTracker } from './route-tracker.js';

// Expose to window for legacy onclick handlers and inter-module access
window.Auth = Auth;
window.Trips = Trips;
window.Admin = Admin;
window.Stats = Stats;
window.MapEngine = MapEngine;
window.Utils = Utils;

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
}

function initDOM() {
    DOM.header = {
        container: document.querySelector('.header'),
        navAdmin: document.getElementById('nav-admin'),
        navInsights: document.getElementById('nav-insights'),
        navSettings: document.getElementById('nav-settings')
    };

    DOM.modals = {
        backdrop: document.getElementById('modal-backdrop'),
        settings: document.getElementById('modal-settings')
    };

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

    // Defer Stats, Map, and RouteTracker until Trips has its first snapshot, so they
    // don’t compete with the initial read and can use Trips.allCompletedTrips directly.
    Trips._readyPromise.then(() => {
        Stats.init();
        MapEngine.init();
        RouteTracker.init();
    });

    DOM.views = {
        auth: document.getElementById('view-auth'),
        dashboard: document.getElementById('view-dashboard'),
        map: document.getElementById('view-map'),
        admin: document.getElementById('view-admin'),
        insights: document.getElementById('view-insights')
    };
}

function setupEventListeners() {
    // 1. Navigation
    document.querySelector('.logo').addEventListener('click', () => switchView('dashboard'));
    DOM.header.navAdmin?.addEventListener('click', () => switchView('admin'));
    DOM.header.navInsights?.addEventListener('click', () => switchView('insights'));
    DOM.header.navSettings?.addEventListener('click', openSettings);
    document.getElementById('nav-map')?.addEventListener('click', () => switchView('map'));

    // 2. Dash Shortcuts
    document.getElementById('dash-nav-map')?.addEventListener('click', () => switchView('map'));
    document.getElementById('dash-nav-insights')?.addEventListener('click', () => switchView('insights'));
    
    // 3. Stats Toggles (handled in Trips module now, but we check IDs)
    // 4. Auth — Step 1: email entry
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

    // Step 2: magic link
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

    // Step 2: show password input
    DOM.auth.btnUsePassword.addEventListener('click', () => {
        DOM.auth.loginOptions.classList.add('hidden');
        DOM.auth.passwordInputGroup.classList.remove('hidden');
        DOM.auth.passwordInput.focus();
    });

    // Step 2: sign in with password
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

    // 5. Trip Management
    document.getElementById('btn-save-edit')?.addEventListener('click', async () => {
        const id = document.getElementById('edit-trip-id').value;
        const data = {
            route: document.getElementById('edit-route').value.trim(),
            startStop: document.getElementById('edit-start-stop').value.trim(),
            endStop: document.getElementById('edit-end-stop').value.trim(),
            direction: document.getElementById('edit-direction').value.trim(),
            agency: document.getElementById('edit-agency').value
        };

        if (!data.route) return alert("Route is required.");

        const btn = document.getElementById('btn-save-edit');
        btn.disabled = true;
        btn.textContent = 'Saving...';
        try {
            await Trips.update(id, data);
            closeAllModals();
        } catch (err) {
            alert("Update failed: " + err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Save Changes';
        }
    });

    document.getElementById('btn-delete-trip')?.addEventListener('click', async () => {
        const id = document.getElementById('edit-trip-id').value;
        if (!confirm("Are you sure you want to delete this trip?")) return;

        const btn = document.getElementById('btn-delete-trip');
        btn.disabled = true;
        btn.textContent = 'Deleting...';
        try {
            await Trips.delete(id);
            closeAllModals();
        } catch (err) {
            alert("Delete failed: " + err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Delete Trip';
        }
    });

    // 6. Settings / Logout
    document.getElementById('btn-logout')?.addEventListener('click', () => {
        Auth.signOut();
        closeSettings();
    });

    document.getElementById('btn-close-settings')?.addEventListener('click', closeSettings);
    
    // Global Close Support
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', closeAllModals);
    });
    DOM.modals.backdrop?.addEventListener('click', closeAllModals);
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
}

// --- Theme Management ---
function setTheme(theme) {
    State.theme = theme;
    localStorage.setItem('ts_theme', theme);
    document.body.classList.toggle('dark', theme === 'dark');
    
    // Update toggle buttons
    const btnLight = document.getElementById('theme-light');
    const btnDark = document.getElementById('theme-dark');
    if (btnLight && btnDark) {
        btnLight.classList.toggle('active', theme === 'light');
        btnDark.classList.toggle('active', theme === 'dark');
    }

    // Update Map if active
    if (MapEngine.map) {
        MapEngine.setupLayers();
    }
}

// Bind Theme Buttons
document.getElementById('theme-light')?.addEventListener('click', () => setTheme('light'));
document.getElementById('theme-dark')?.addEventListener('click', () => setTheme('dark'));

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
            const profileName = document.getElementById('profile-name');
            if (profileName) profileName.textContent = user.displayName || user.email.split('@')[0];
            
            switchView('dashboard');
            
            // Initialize Trips
            Trips.init();

            // Pre-init Admin if needed
            if (State.isAdmin) Admin.loadAll();
        } else {
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

// Boot
document.addEventListener('DOMContentLoaded', init);
