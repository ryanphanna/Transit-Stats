
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


console.log('🚀 TransitStats Loading...');

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
document.addEventListener('DOMContentLoaded', () => {
    UI.loadSavedTheme();
    Auth.init();
    loadStopsLibrary();
    setupGlobalStateHandlers();
});

/**
 * Global initialization called after successful authentication
 */
window.initializeApp = function () {
    Trips.init();
    Templates.init();
    Stats.init();
    checkActiveTrip();
};

/**
 * Load canonical stops for name resolution
 */
async function loadStopsLibrary() {
    try {
        const snapshot = await db.collection('stops').get();
        window.stopsLibrary = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`✅ Loaded ${window.stopsLibrary.length} stops for resolution`);
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

    // Clean up existing listener if any
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
    const sections = ['profileSection', 'statsSection', 'mapPage'];
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
};

window.goHome = function () {
    hideAllSections();
    const dashboard = document.querySelector('.dashboard-grid') || document.getElementById('dashboardPanel');
    if (dashboard) dashboard.style.display = 'grid';
};

function navigateTo(screen) {
    hideAllSections();
    // Implementation for dynamic navigation if needed
}

// Dev Bypass logic
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    window.bypassLogin = () => {
        console.log('🛠️ Bypassing Authentication...');
        window.currentUser = { uid: 'dev-user', email: 'ryan@transitstats.dev' };
        Auth.showApp();
    };
}

console.log('✅ TransitStats Ready!');
