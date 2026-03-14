import { auth } from './firebase.js';
import { Auth } from './auth.js';
import { Trips } from './trips.js';
import { MapEngine } from './map-engine.js';
import { Admin } from './admin.js';

/**
 * TransitStats V2 - Main Entry Point
 * Handles routing, UI state, and global view management.
 */

// --- Global State ---
const State = {
    user: null,
    isAdmin: false,
    currentView: 'auth',
    theme: 'light'
};

// --- DOM Cache ---
let DOM = {};

function initDOM() {
    DOM = {
        views: {
            auth: document.getElementById('view-auth'),
            dashboard: document.getElementById('view-dashboard'),
            map: document.getElementById('view-map'),
            admin: document.getElementById('view-admin')
        },
        header: {
            container: document.getElementById('site-header'),
            navHome: document.getElementById('nav-home'),
            navAdmin: document.getElementById('nav-admin'),
            navInsights: document.getElementById('nav-insights'),
            navMap: document.getElementById('nav-map'),
            navSettings: document.getElementById('nav-settings')
        },
        modals: {
            backdrop: document.getElementById('modal-backdrop'),
            settings: document.getElementById('modal-settings'),
            linkStop: document.getElementById('modal-link-stop'),
            stopForm: document.getElementById('modal-stop-form'),
            divvy: document.getElementById('modal-divvy')
        },
        auth: {
            emailInput: document.getElementById('auth-email'),
            btnContinue: document.getElementById('btn-auth-continue'),
            emailStep: document.getElementById('auth-email-step'),
            passwordStep: document.getElementById('auth-password-step'),
            displayEmail: document.getElementById('auth-display-email'),
            btnBack: document.getElementById('btn-auth-back'),
            btnMagic: document.getElementById('btn-auth-magic'),
            btnUsePassword: document.getElementById('btn-auth-use-password'),
            passwordInputGroup: document.getElementById('auth-password-input-group'),
            passwordInput: document.getElementById('auth-password'),
            btnSignIn: document.getElementById('btn-auth-signin'),
            btnForgot: document.getElementById('btn-auth-forgot'),
            statusMsg: document.getElementById('auth-status')
        }
    };
}

// --- Initialization ---
async function init() {
    console.log('TransitStats V2 Booting...');
    
    initDOM();

    // Check for magic link sign-in before setting up observers
    try {
        await Auth.completeMagicLinkSignIn();
    } catch (err) {
        showAuthError('Magic link failed: ' + err.message);
    }

    setupEventListeners();
    setupAuthObserver();
}

// --- Event Binding ---
function setupEventListeners() {
    if (!DOM.auth.btnContinue) {
        console.error("Critical: Could not find btn-auth-continue");
        return;
    }

    // 1. Navigation
    DOM.header.navHome?.addEventListener('click', () => switchView('dashboard'));
    DOM.header.navMap?.addEventListener('click', () => switchView('map'));
    DOM.header.navAdmin?.addEventListener('click', () => switchView('admin'));
    DOM.header.navInsights?.addEventListener('click', () => {
        switchView('dashboard');
        // Small delay to ensure view is visible before scrolling
        setTimeout(() => {
            document.getElementById('commute-highlights')?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    });
    DOM.header.navSettings?.addEventListener('click', openSettings);
    
    // 2. Auth Flow (Step 1: Email)
    const validateEmail = () => {
        const val = DOM.auth.emailInput.value.trim();
        DOM.auth.btnContinue.disabled = !val.includes('@');
    };

    DOM.auth.emailInput.addEventListener('input', validateEmail);
    DOM.auth.emailInput.addEventListener('change', validateEmail);
    DOM.auth.emailInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !DOM.auth.btnContinue.disabled) {
            DOM.auth.btnContinue.click();
        }
    });

    DOM.auth.btnContinue.addEventListener('click', () => {
        const email = DOM.auth.emailInput.value.trim();
        if (email) {
            DOM.auth.displayEmail.textContent = email;
            DOM.auth.emailStep.classList.add('hidden');
            DOM.auth.passwordStep.classList.remove('hidden');
        }
    });

    DOM.auth.btnBack.addEventListener('click', () => {
        DOM.auth.passwordStep.classList.add('hidden');
        DOM.auth.emailStep.classList.remove('hidden');
        DOM.auth.passwordInputGroup.classList.add('hidden');
        document.getElementById('auth-login-options').classList.remove('hidden');
        DOM.auth.statusMsg.classList.add('hidden');
    });

    // 3. Auth Flow (Step 2: Method selection)
    DOM.auth.btnUsePassword.addEventListener('click', () => {
        document.getElementById('auth-login-options').classList.add('hidden');
        DOM.auth.passwordInputGroup.classList.remove('hidden');
        DOM.auth.passwordInput.focus();
    });

    DOM.auth.btnMagic.addEventListener('click', async () => {
        const email = DOM.auth.emailInput.value.trim();
        try {
            DOM.auth.btnMagic.disabled = true;
            DOM.auth.btnMagic.textContent = 'Sending...';
            await Auth.sendMagicLink(email);
            showAuthSuccess('Magic link sent! Check your inbox.');
        } catch (err) {
            showAuthError('Failed to send: ' + err.message);
            DOM.auth.btnMagic.disabled = false;
            DOM.auth.btnMagic.textContent = 'Send Magic Link';
        }
    });

    // 4. Firebase Authentication
    DOM.auth.btnSignIn.addEventListener('click', async () => {
        const email = DOM.auth.emailInput.value.trim();
        const pwd = DOM.auth.passwordInput.value;
        if (!email || !pwd) return;

        try {
            DOM.auth.btnSignIn.disabled = true;
            DOM.auth.btnSignIn.textContent = 'Logging in...';
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
