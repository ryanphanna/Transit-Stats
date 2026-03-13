
/**
 * TransitStats Main Entry Point
 * Orchestrates module initialization and shared state
 */
import { db, auth } from './firebase.js';
import { UI } from './ui-utils.js';
import { Auth } from './auth.js';
import { Profile } from './profile.js';
import { Stats } from './stats.js';

import { Trips } from './trips.js';
import { Templates } from './templates.js';
import { MapEngine } from './map-engine.js';
import { Visuals } from './visuals.js';
import { PredictionEngine } from './predict.js';


console.log('TransitStats Loading...');

// Global Error Boundary
window.onerror = function (message, source, lineno, colno, error) {
    console.error('Captured Global Error:', message, error);
    if (window.UI) {
        UI.showNotification('Something went wrong. Please try refreshing.', 'error');
    }
    return false;
};

window.onunhandledrejection = function (event) {
    console.error('Unhandled Promise Rejection:', event.reason);
    if (window.UI) {
        UI.showNotification('Network or database error occurred.', 'error');
    }
};

// Shared Application State
window.currentUser = null;
window.activeTrip = null;
window.stopsLibrary = [];

// Initialize Modules
function initApp() {
    try {
        UI.loadSavedTheme();
        loadStopsLibrary(); // Load stops library immediately for unauthenticated usage
        Auth.init();
        setupGlobalStateHandlers();
    } catch (error) {
        console.error('CRITICAL: App Initialization Failed:', error);
        if (window.UI) {
            UI.showNotification('Failed to initialize application. Please try again later.', 'error');
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

/**
 * Global initialization called after successful authentication
 */
window.initializeApp = function () {
    // Initialize Trips and Templates immediately — these drive the main UI
    Trips.init();
    Templates.init();

    // Defer Stats and Map until Trips has its first snapshot, so they don’t
    // compete with the initial read and Stats can use Trips.allCompletedTrips directly.
    Trips._readyPromise.then(() => {
        Stats.init();
        MapEngine.init();
    });
};

/**
 * Load canonical stops for name resolution
 */
async function loadStopsLibrary() {
    try {
        const snapshot = await db.collection('stops').get();
        window.stopsLibrary = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        PredictionEngine.stopsLibrary = window.stopsLibrary;
        if (window.Trips && typeof window.Trips.rebuildStopsIndex === 'function') {
            window.Trips.rebuildStopsIndex();
        }
        console.log(`Loaded ${window.stopsLibrary.length} stops for resolution`);
    } catch (error) {
        console.error('Error loading stops library:', error);
    }
}


/**
 * Check for any active trip in progress (Real-time)
 */
let activeTripListener = null;

window.checkActiveTrip = function () {
    if (!window.currentUser) return;

    if (activeTripListener) activeTripListener();

    activeTripListener = db.collection('trips')
        .where('userId', '==', window.currentUser.uid)
        .where('endStop', '==', null)
        .limit(1)
        .onSnapshot((snapshot) => {
            if (!snapshot.empty) {
                const doc = snapshot.docs[0];
                window.activeTrip = { id: doc.id, ...doc.data() };
            } else {
                window.activeTrip = null;
            }
        }, (error) => {
            console.error('Active trip listener error:', error);
        });
};

/**
 * Clean up all listeners and shared state (called on logout)
 */
window.clearAppContext = function () {
    if (activeTripListener) {
        activeTripListener();
        activeTripListener = null;
    }
    if (window.Trips && window.Trips.tripsListener) {
        window.Trips.tripsListener();
        window.Trips.tripsListener = null;
    }
    window.currentUser = null;
    window.activeTrip = null;
    window.stopsLibrary = [];
    console.log('🧹 Application context cleared.');
};
/**
 * Setup global handlers and listeners
 */
function setupGlobalStateHandlers() {
    // Shared navigation listeners
    const navButtons = document.querySelectorAll('[data-nav]');
    navButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const screen = e.currentTarget.getAttribute('data-nav');
            navigateTo(screen);
        });
    });
}

/**
 * UI State Helpers
 */
window.hideAllSections = function () {
    const sections = ['authSection', 'appContent', 'mapPage'];
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
};

window.goHome = function () {
    hideAllSections();
    document.body.classList.remove('map-visible');
    const appContent = document.getElementById('appContent');
    if (appContent) appContent.style.display = 'block';
};

window.showMaps = function() {
    hideAllSections();
    const mapPage = document.getElementById('mapPage');
    if (mapPage) {
        mapPage.style.display = 'block';
        document.body.classList.add('map-visible');
        if (window.fullMap) {
            window.fullMap.invalidateSize();
        }
    }
};

function navigateTo(screen) {
    hideAllSections();
    const el = document.getElementById(screen);
    if (el) el.style.display = 'block';
}

// Dev Bypass logic
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    window.bypassLogin = () => {
        console.log('Bypassing Authentication...');
        window.currentUser = { uid: 'dev-user', email: 'ryan@transitstats.dev' };
        Auth.showApp();
    };
}

// saveSettings is a convenience alias for Profile.save
window.saveSettings = function () {
    if (window.Profile) window.Profile.save();
};

console.log('TransitStats Ready!');
