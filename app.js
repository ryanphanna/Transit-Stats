console.log('🚀 TransitStats Loading...');

const firebaseConfig = {
    apiKey: "AIzaSyBgY37b_aUorxdEW6DnocFoo8ekbTTFpao",
    authDomain: "transitstats-21ba4.firebaseapp.com",
    projectId: "transitstats-21ba4",
    storageBucket: "transitstats-21ba4.firebasestorage.app",
    messagingSenderId: "756203797723",
    appId: "1:756203797723:web:2e5aab94a6de20cf06a0fe"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
console.log('✅ Firebase initialized successfully!');



let currentUser = null;
let activeTrip = null;
let currentStatsView = '30days';
let logoutModeActive = false;
let statsInitialized = false;
let map = null;
let mapMode = 'boarding';
let mapFilter = 'boarding';
let mapInitialized = false;
let markerClusterGroup = null;
let mapTripsData = [];

// Infinite scroll state for recent trips
let allCompletedTrips = [];
let displayedTripsCount = 0;
const TRIPS_PER_BATCH = 15;
let tripsObserver = null;

// Stops library for verified name lookup
let stopsLibrary = [];

// DOM Elements
const authSection = document.getElementById('authSection');
const appContent = document.getElementById('appContent');
const profileSection = document.getElementById('profileSection');
const statsSection = document.getElementById('statsSection');
const mapPage = document.getElementById('mapPage');
const dashboardGrid = document.querySelector('.dashboard-grid');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const continueBtn = document.getElementById('continueBtn');
const magicLinkBtn = document.getElementById('magicLinkBtn');
const passwordBtn = document.getElementById('passwordBtn');
const signInBtn = document.getElementById('signInBtn');
const authStatus = document.getElementById('authStatus');
const userInfo = document.getElementById('userInfo');
const profileBtn = document.getElementById('profileBtn');
const statsBtn = document.getElementById('statsBtn');
const mapsBtn = document.getElementById('mapsBtn');
const settingsBtn = document.getElementById('settingsBtn');
let currentEmoji = '🚌';
const stopInput = document.getElementById('stopInput');
const routeInput = document.getElementById('routeInput');
const startBtn = document.getElementById('startBtn');
const startSection = document.getElementById('startSection');
const activeSection = document.getElementById('activeSection');
const currentTripDiv = document.getElementById('currentTrip');
const endBtn = document.getElementById('endBtn');
const endModal = document.getElementById('endModal');
const exitInput = document.getElementById('exitInput');
const saveBtn = document.getElementById('saveBtn');
const cancelBtn = document.getElementById('cancelBtn');
const tripsList = document.getElementById('tripsList');
const tripCount = document.getElementById('tripCount');
const streakStatus = document.getElementById('streakStatus');
const locationStatus = document.getElementById('locationStatus');
const connectionStatus = document.getElementById('connectionStatus');
const activeTripBanner = document.getElementById('activeTripBanner');
const bannersContainer = document.getElementById('bannersContainer');
const repeatLastTripBtn = document.getElementById('repeatLastTripBtn');
const repeatLastTripSection = document.getElementById('repeatLastTripSection');

// Load saved theme on page load
function loadSavedTheme() {
    const savedTheme = localStorage.getItem('theme');
    const themeLightBtn = document.getElementById('themeLightBtn');
    const themeDarkBtn = document.getElementById('themeDarkBtn');

    if (savedTheme === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
        updateThemeButtons('dark');
    } else {
        updateThemeButtons('light');
    }
}

function setTheme(theme) {
    if (theme === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
    } else {
        document.body.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
    }
    updateThemeButtons(theme);
}

function updateThemeButtons(theme) {
    const themeLightBtn = document.getElementById('themeLightBtn');
    const themeDarkBtn = document.getElementById('themeDarkBtn');

    if (themeLightBtn && themeDarkBtn) {
        if (theme === 'dark') {
            themeDarkBtn.style.background = 'var(--accent-primary)';
            themeDarkBtn.style.borderColor = 'var(--accent-primary)';
            themeDarkBtn.style.color = 'white';

            themeLightBtn.style.background = 'transparent';
            themeLightBtn.style.borderColor = 'var(--border-color)';
            themeLightBtn.style.color = 'var(--text-secondary)';
        } else {
            themeLightBtn.style.background = 'var(--accent-primary)';
            themeLightBtn.style.borderColor = 'var(--accent-primary)';
            themeLightBtn.style.color = 'white';

            themeDarkBtn.style.background = 'transparent';
            themeDarkBtn.style.borderColor = 'var(--border-color)';
            themeDarkBtn.style.color = 'var(--text-secondary)';
        }
    }
}

// Settings Modal Functions
function openSettings() {
    const settingsModal = document.getElementById('settingsModal');
    settingsModal.style.display = 'block';

    // Populate current values
    loadUserProfile(); // Refreshes inputs with current data
}

function closeSettings() {
    document.getElementById('settingsModal').style.display = 'none';
}

function saveSettings() {
    saveProfile();
    closeSettings();
}

// Security: HTML sanitization to prevent XSS
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Input validation for trip data
function validateTripData(data) {
    const errors = [];

    if (data.route && data.route.length > 50) {
        errors.push('Route name must be less than 50 characters');
    }
    if (data.direction && data.direction.length > 50) {
        errors.push('Direction must be less than 50 characters');
    }
    if (data.notes && data.notes.length > 500) {
        errors.push('Notes must be less than 500 characters');
    }

    return errors;
}

// Authentication State Management
auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    try {
        if (user) {
            // Check if user is in the allowedUsers whitelist
            const allowedUsersRef = db.collection('allowedUsers');
            const querySnapshot = await allowedUsersRef.where('email', '==', user.email.toLowerCase()).get();

            if (querySnapshot.empty) {
                await auth.signOut();
                alert('Access denied. This app is invite-only.');
                return;
            }

            console.log('✅ User authenticated');
            updateConnectionStatus(true);
            showApp();
        } else {
            console.log('❌ No user authenticated');
            updateConnectionStatus(false);
            showAuth();
        }
    } catch (error) {
        console.error('Error in auth state change:', error);
        // If there's an error checking whitelist but user is authenticated,
        // show the auth screen and let them try again
        updateConnectionStatus(false);
        showAuth();
    }
});

function showAuth() {
    authSection.style.display = 'block';
    appContent.style.display = 'none';
    userInfo.style.display = 'none';
    updateConnectionStatus(false);
}

function showApp() {
    authSection.style.display = 'none';
    appContent.style.display = 'block';
    userInfo.style.display = 'block';
    updateConnectionStatus(true);
    loadUserProfile();
    initializeApp();
}

// Profile Management
function loadUserProfile() {
    db.collection('profiles').doc(currentUser.uid).get()
        .then((doc) => {
            if (doc.exists) {
                const profile = doc.data();
                const emoji = profile.emoji || '🚌';

                // Update Display
                const displayAvatar = document.getElementById('displayAvatar');
                const displayName = document.getElementById('displayName');
                const displayAgency = document.getElementById('displayAgency');

                if (displayAvatar) displayAvatar.textContent = emoji;
                if (displayName) displayName.textContent = profile.name || 'Traveler';
                if (displayAgency) displayAgency.textContent = profile.defaultAgency || 'TTC';

                // Ensure the "Identity Card" always shows something
                if (displayName && !profile.name) displayName.classList.add('placeholder-text');

                // Update Settings Inputs
                const settingsAvatar = document.getElementById('settingsAvatar');
                const nameInput = document.getElementById('nameInput');
                const agencySelect = document.getElementById('defaultAgencySelect');

                if (settingsAvatar) settingsAvatar.textContent = emoji;
                if (nameInput) nameInput.value = profile.name || '';
                if (agencySelect) agencySelect.value = profile.defaultAgency || 'TTC';

                if (profile.emoji) {
                    document.getElementById('emojiSelector').style.display = 'none';
                    document.getElementById('shuffleEmojiBtn').style.display = 'block';
                    currentEmoji = emoji;
                }
            }
        })
        .catch((error) => {
            console.log('Profile load error (using defaults):', error.message);
        });
}

function showProfile() {
    hideAllSections();
    dashboardGrid.style.display = 'grid'; // Restore dashboard if returning from Map
    profileSection.style.display = 'block';
    startSection.style.display = 'none';
    updateTripIndicator();
    updateProfileStats();
    loadProfileTrips();
}

function showStats() {
    hideAllSections();
    dashboardGrid.style.display = 'grid'; // Restore dashboard if returning from Map
    statsSection.style.display = 'block';
    startSection.style.display = 'none';
    updateTripIndicator();

    if (!statsInitialized) {
        initializeStatsToggle();
        statsInitialized = true;
    }

    updateStatsSection();
}

function showMaps() {
    // Hide dashboard, show map page
    dashboardGrid.style.display = 'none';
    mapPage.style.display = 'flex';

    // Update nav button states
    updateNavState('map');

    if (!mapInitialized) {
        initializeFullMap();
    } else {
        loadFullMapData();
    }
}

function hideAllSections() {
    profileSection.style.display = 'none';
    statsSection.style.display = 'none';
    mapPage.style.display = 'none';
}

function goHome() {
    // Show dashboard, hide map page
    mapPage.style.display = 'none';
    dashboardGrid.style.display = 'grid';

    // Update nav button states
    updateNavState('home');

    if (activeTrip) {
        showActiveSection();
    } else {
        showStartSection();
    }
}

function updateNavState(active) {
    // Remove active state from all nav buttons
    const navBtns = document.querySelectorAll('.header-btn:not(.primary-action)');
    navBtns.forEach(btn => btn.classList.remove('nav-active'));

    // Add active state to current
    if (active === 'map') {
        document.getElementById('mapsBtn')?.classList.add('nav-active');
    }
}

// Maps functionality - Clean Datawrapper Style
function initializeMap() {
    if (!currentUser) return;

    loadMapData();
    mapInitialized = true;
}

function loadMapData() {
    if (!currentUser) return;

    db.collection('trips')
        .where('userId', '==', currentUser.uid)
        .get()
        .then((snapshot) => {
            const trips = [];
            snapshot.forEach((doc) => {
                const trip = doc.data();
                if (trip.boardingLocation || trip.exitLocation) {
                    trips.push(trip);
                }
            });

            const totalTrips = trips.length;
            const progressBar = document.getElementById('heatmapProgress');
            const progressFill = document.getElementById('progressFill');
            const progressCount = document.getElementById('progressCount');
            const progressText = document.getElementById('progressText');

            if (totalTrips === 0) {
                progressBar.style.display = 'block';
                progressFill.style.width = '0%';
                progressCount.textContent = '0 / 50 trips with GPS';
                progressText.textContent = '🗺️ Start taking trips with GPS to unlock your heatmap!';

                document.getElementById('mapContainer').innerHTML = `
                            <div style="text-align: center;">
                                <div style="font-size: 2em; margin-bottom: 10px;">🗺️</div>
                                <div>Take your first trip to get started!</div>
                            </div>
                        `;
                return;
            }

            const progress = Math.min((totalTrips / 50) * 100, 100);
            progressFill.style.width = `${progress}%`;
            progressCount.textContent = `${totalTrips} / 50 trips with GPS`;

            if (totalTrips < 50) {
                progressBar.style.display = 'block';
                if (totalTrips < 10) {
                    progressText.textContent = '🗺️ Keep taking trips to unlock your heatmap!';
                } else if (totalTrips < 25) {
                    progressText.textContent = '🗺️ Great progress! More trips = better heatmap!';
                } else {
                    progressText.textContent = '🗺️ Almost there! Heatmap unlocking soon!';
                }

                if (mapMode === 'markers') {
                    createMap(trips);
                    updateMapStats(trips);
                } else {
                    document.getElementById('mapContainer').innerHTML = `
                                <div style="text-align: center;">
                                    <div style="font-size: 2em; margin-bottom: 10px;">🗺️</div>
                                    <div style="margin-top: 15px;">
                                        <button class="btn" style="background: var(--accent-primary); color: white; padding: 10px 20px; font-size: 0.9em;" onclick="setMapMode('markers');">
                                            View individual trips (${totalTrips} available)
                                        </button>
                                    </div>
                                </div>
                            `;
                }
            } else {
                progressBar.style.display = 'none';
                createMap(trips);
                updateMapStats(trips);
            }
        })
        .catch((error) => {
            console.error('Error loading map data:', error);
            document.getElementById('mapContainer').innerHTML = `
                        <div style="text-align: center;">
                            <div style="font-size: 2em; margin-bottom: 10px;">❌</div>
                            <div>Error loading map data</div>
                        </div>
                    `;
            document.getElementById('heatmapProgress').style.display = 'none';
        });
}

function createMap(trips) {
    document.getElementById('mapContainer').innerHTML = '';

    const locations = [];
    trips.forEach(trip => {
        if (trip.boardingLocation) {
            locations.push([trip.boardingLocation.lat, trip.boardingLocation.lng || trip.boardingLocation.lon]);
        }
        if (trip.exitLocation) {
            locations.push([trip.exitLocation.lat, trip.exitLocation.lng || trip.exitLocation.lon]);
        }
    });

    if (locations.length === 0) return;

    const lats = locations.map(loc => loc[0]);
    const lons = locations.map(loc => loc[1]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    const avgLat = (minLat + maxLat) / 2;
    const avgLon = (minLon + maxLon) / 2;

    map = L.map('mapContainer').setView([avgLat, avgLon], 12);

    // Use clean CartoDB Light tiles for minimal Datawrapper style
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CartoDB',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    if (mapMode === 'boarding' || mapMode === 'alighting') {
        createHeatmap(trips, mapMode);
    } else {
        createMarkers(trips);
    }

    if (locations.length > 1) {
        const bounds = L.latLngBounds(locations);
        map.fitBounds(bounds, { padding: [20, 20] });
    } else if (locations.length === 1) {
        map.setView(locations[0], 15);
    }
}

function createHeatmap(trips, mode) {
    const stopCounts = {};

    trips.forEach(trip => {
        if (mode === 'boarding' && trip.boardingLocation && trip.startStop) {
            const key = trip.startStop;
            if (!stopCounts[key]) {
                stopCounts[key] = {
                    name: trip.startStop,
                    lat: trip.boardingLocation.lat,
                    lon: trip.boardingLocation.lng || trip.boardingLocation.lon,
                    count: 0
                };
            }
            stopCounts[key].count++;
        } else if (mode === 'alighting' && trip.exitLocation && trip.endStop) {
            const key = trip.endStop;
            if (!stopCounts[key]) {
                stopCounts[key] = {
                    name: trip.endStop,
                    lat: trip.exitLocation.lat,
                    lon: trip.exitLocation.lng || trip.exitLocation.lon,
                    count: 0
                };
            }
            stopCounts[key].count++;
        }
    });

    const significantStops = Object.values(stopCounts)
        .filter(stop => stop.count >= 5)
        .sort((a, b) => b.count - a.count);

    if (significantStops.length === 0) {
        if (map) {
            map.eachLayer((layer) => {
                if (!layer._url) {
                    map.removeLayer(layer);
                }
            });
        }

        const modeText = mode === 'boarding' ? 'boarding locations' : 'alighting locations';
        document.getElementById('mapContainer').innerHTML = `
                    <div style="text-align: center;">
                        <div style="font-size: 2em; margin-bottom: 10px;">🗺️</div>
                        <div>No repeated ${modeText} found</div>
                        <div style="font-size: 0.9em; color: var(--text-muted); margin-top: 10px;">Use the same stop 5+ times to see it on the heatmap</div>
                    </div>
                `;
        return;
    }

    const maxUsage = significantStops[0].count;

    // Clean data visualization colors - subtle blues
    significantStops.forEach((stop, index) => {
        const percentage = (stop.count / maxUsage) * 100;
        let color, description;

        if (percentage >= 50) {
            color = '#1e3a8a'; // Dark blue - Home base
            description = 'Home Base';
        } else if (percentage >= 25) {
            color = '#3b82f6'; // Medium blue - Regular  
            description = 'Regular';
        } else if (percentage >= 10) {
            color = '#60a5fa'; // Light blue - Occasional
            description = 'Occasional';
        } else {
            color = '#93c5fd'; // Very light blue - Rare
            description = 'Rare';
        }

        const radius = 12 + (percentage / 100) * 18;

        const circle = L.circle([stop.lat, stop.lon], {
            color: color,
            fillColor: color,
            fillOpacity: 0.7,
            weight: 2,
            radius: radius * 20
        }).addTo(map);

        const modeText = mode === 'boarding' ? 'boardings' : 'alightings';
        circle.bindPopup(`
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 4px;">
                        <strong style="font-size: 14px;">${stop.name}</strong><br>
                        <span style="color: #666; font-size: 12px;">${description} (${Math.round(percentage)}% of max)</span><br>
                        <span style="color: #666; font-size: 12px;">${stop.count} ${modeText} • Rank #${index + 1}</span>
                    </div>
                `);
    });
}

function createMarkers(trips) {
    trips.forEach((trip, index) => {
        if (trip.boardingLocation) {
            const boardingMarker = L.marker([trip.boardingLocation.lat, trip.boardingLocation.lng || trip.boardingLocation.lon])
                .addTo(map);

            boardingMarker.bindPopup(`
                        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 4px;">
                            <strong style="font-size: 14px;">🚌 Boarding</strong><br>
                            <span style="color: #666; font-size: 12px;">Stop: ${trip.startStop}</span><br>
                            <span style="color: #666; font-size: 12px;">Route: ${trip.route}</span><br>
                            <span style="color: #666; font-size: 12px;">Time: ${trip.startTime?.toDate ? trip.startTime.toDate().toLocaleString() : 'Unknown'}</span>
                        </div>
                    `);
        }

        if (trip.exitLocation) {
            const alightingMarker = L.marker([trip.exitLocation.lat, trip.exitLocation.lng || trip.exitLocation.lon])
                .addTo(map);

            alightingMarker.bindPopup(`
                        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 4px;">
                            <strong style="font-size: 14px;">🚏 Alighting</strong><br>
                            <span style="color: #666; font-size: 12px;">Stop: ${trip.endStop}</span><br>
                            <span style="color: #666; font-size: 12px;">Route: ${trip.route}</span><br>
                            <span style="color: #666; font-size: 12px;">Duration: ${trip.duration || 0} minutes</span>
                        </div>
                    `);
        }
    });
}

// Old setMapMode function removed - replaced by setMapFilter for dedicated map page

function updateMapStats(trips) {
    const locatedTrips = trips.filter(t => t.boardingLocation || t.exitLocation);
    const bothLocations = trips.filter(t => t.boardingLocation && t.exitLocation);

    const statsHtml = `
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
                    <div style="text-align: center;">
                        <div style="font-size: 1.5em; font-weight: bold; color: var(--accent-primary);">${locatedTrips.length}</div>
                        <div style="font-size: 0.9em; color: var(--text-secondary);">Trips with GPS</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 1.5em; font-weight: bold; color: var(--accent-primary);">${bothLocations.length}</div>
                        <div style="font-size: 0.9em; color: var(--text-secondary);">Complete journeys</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 1.5em; font-weight: bold; color: var(--accent-primary);">${Math.round((locatedTrips.length / trips.length) * 100)}%</div>
                        <div style="font-size: 0.9em; color: var(--text-secondary);">GPS coverage</div>
                    </div>
                </div>
            `;

    document.getElementById('mapStatsContent').innerHTML = statsHtml;
    document.getElementById('mapStats').style.display = 'block';
}

// ========================================
// DEDICATED MAP PAGE FUNCTIONS
// ========================================

function initializeFullMap() {
    if (!currentUser) return;
    loadFullMapData();
    mapInitialized = true;
}

function loadFullMapData() {
    if (!currentUser) return;

    db.collection('trips')
        .where('userId', '==', currentUser.uid)
        .get()
        .then((snapshot) => {
            const trips = [];
            let totalTrips = 0;

            snapshot.forEach((doc) => {
                totalTrips++;
                const trip = doc.data();
                if (trip.boardingLocation || trip.exitLocation) {
                    trips.push(trip);
                }
            });

            mapTripsData = trips;
            createFullMap(trips, totalTrips);
        })
        .catch((error) => {
            console.error('Error loading map data:', error);
        });
}

function createFullMap(trips, totalTrips) {
    const container = document.getElementById('fullMapContainer');
    container.innerHTML = '';

    // Aggregate locations by stop name
    const stopMap = new Map();
    let totalLocations = 0;

    trips.forEach(trip => {
        if ((mapFilter === 'boarding' || mapFilter === 'both') && trip.boardingLocation) {
            const stopName = trip.startStopName || trip.startStop || trip.startStopCode || 'Unknown';
            const key = `boarding-${stopName}`;
            totalLocations++;

            if (stopMap.has(key)) {
                const existing = stopMap.get(key);
                existing.count++;
                existing.routes.add(trip.route);
            } else {
                stopMap.set(key, {
                    lat: trip.boardingLocation.lat,
                    lon: trip.boardingLocation.lng || trip.boardingLocation.lon,
                    type: 'boarding',
                    stop: stopName,
                    count: 1,
                    routes: new Set([trip.route])
                });
            }
        }
        if ((mapFilter === 'exiting' || mapFilter === 'both') && trip.exitLocation) {
            const stopName = trip.endStopName || trip.endStop || trip.endStopCode || 'Unknown';
            const key = `exiting-${stopName}`;
            totalLocations++;

            if (stopMap.has(key)) {
                const existing = stopMap.get(key);
                existing.count++;
                existing.routes.add(trip.route);
            } else {
                stopMap.set(key, {
                    lat: trip.exitLocation.lat,
                    lon: trip.exitLocation.lng || trip.exitLocation.lon,
                    type: 'exiting',
                    stop: stopName,
                    count: 1,
                    routes: new Set([trip.route])
                });
            }
        }
    });

    const locations = Array.from(stopMap.values());

    if (locations.length === 0) {
        container.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary);">
                <div style="font-size: 3em; margin-bottom: 15px;">🗺️</div>
                <div style="font-size: 1.1em; margin-bottom: 8px;">No location data yet</div>
                <div style="font-size: 0.9em; opacity: 0.7;">Take trips with GPS enabled to see them on the map</div>
            </div>
        `;
        updateFullMapStats(0, 0, 0, totalTrips);
        return;
    }

    // Calculate bounds
    const lats = locations.map(loc => loc.lat);
    const lons = locations.map(loc => loc.lon);
    const avgLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const avgLon = (Math.min(...lons) + Math.max(...lons)) / 2;

    // Create map
    if (map) {
        map.remove();
    }

    map = L.map('fullMapContainer', {
        zoomControl: true
    }).setView([avgLat, avgLon], 12);

    // Add tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CartoDB',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    // Add markers for each unique stop
    locations.forEach(loc => {
        const isBoarding = loc.type === 'boarding';
        const routesList = Array.from(loc.routes).join(', ');

        const icon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: ${isBoarding ? '#3b82f6' : '#10b981'};
                border: 2px solid white;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            "></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6]
        });

        const marker = L.marker([loc.lat, loc.lon], { icon: icon });

        const tripText = loc.count === 1 ? 'trip' : 'trips';
        const popupContent = isBoarding
            ? `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                <strong style="color: #3b82f6;">🚌 ${loc.stop}</strong><br>
                <span style="color: #666;">${loc.count} ${tripText} boarded</span><br>
                <span style="color: #888; font-size: 0.9em;">Routes: ${routesList}</span>
               </div>`
            : `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                <strong style="color: #10b981;">🚏 ${loc.stop}</strong><br>
                <span style="color: #666;">${loc.count} ${tripText} exited</span><br>
                <span style="color: #888; font-size: 0.9em;">Routes: ${routesList}</span>
               </div>`;

        marker.bindPopup(popupContent);
        marker.addTo(map);
    });

    // Fit bounds
    if (locations.length > 1) {
        const bounds = L.latLngBounds(locations.map(l => [l.lat, l.lon]));
        map.fitBounds(bounds, { padding: [30, 30] });
    } else {
        map.setView([locations[0].lat, locations[0].lon], 15);
    }

    // Update stats
    updateFullMapStats(trips.length, locations.length, totalLocations, totalTrips);
}

function updateFullMapStats(tripCount, stopCount, locationCount, totalTrips) {
    document.getElementById('mapTripCount').textContent = `${tripCount} trips`;
    document.getElementById('mapLocationCount').textContent = `${stopCount} stops`;

    const coverage = totalTrips > 0 ? Math.round((locationCount / totalTrips) * 100) : 0;
    document.getElementById('mapCoverage').textContent = `${coverage}% GPS coverage`;
}

function setMapFilter(filter) {
    mapFilter = filter;

    // Update button states
    document.getElementById('filterBoarding').className = filter === 'boarding' ? 'filter-btn active' : 'filter-btn';
    document.getElementById('filterExiting').className = filter === 'exiting' ? 'filter-btn active' : 'filter-btn';
    document.getElementById('filterBoth').className = filter === 'both' ? 'filter-btn active' : 'filter-btn';

    // Reload map with new filter
    if (mapTripsData.length > 0) {
        createFullMap(mapTripsData, mapTripsData.length);
    }
}

function locateUser() {
    const btn = document.getElementById('locateBtn');
    btn.classList.add('locating');

    if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser');
        btn.classList.remove('locating');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;

            if (map) {
                map.setView([latitude, longitude], 15);

                // Add a temporary marker for current location
                const currentLocMarker = L.circleMarker([latitude, longitude], {
                    radius: 8,
                    fillColor: '#ef4444',
                    color: 'white',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                }).addTo(map);

                currentLocMarker.bindPopup('📍 You are here').openPopup();

                // Remove marker after 10 seconds
                setTimeout(() => {
                    map.removeLayer(currentLocMarker);
                }, 10000);
            }

            btn.classList.remove('locating');
        },
        (error) => {
            console.error('Geolocation error:', error);
            alert('Unable to get your location');
            btn.classList.remove('locating');
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000
        }
    );
}

function updateTripIndicator() {
    const streakVisible = streakStatus.style.display === 'block';

    if (activeTrip) {
        activeTripBanner.innerHTML = `🚌 Currently riding ${activeTrip.route} • Tap to view`;
        activeTripBanner.style.display = 'block';

        if (streakVisible) {
            bannersContainer.className = 'banner-container';
            const currentText = streakStatus.textContent;
            if (currentText && currentText.includes('Keep it going!')) {
                streakStatus.textContent = currentText.replace(' Keep it going!', '').replace(' You\'re a transit champion!', '');
            }
        } else {
            bannersContainer.className = 'banner-container full-width';
        }
    } else {
        activeTripBanner.style.display = 'none';
        bannersContainer.className = 'banner-container full-width';

        if (streakVisible) {
            loadTrips();
        }
    }
}

function toggleLogout() {
    // Connection status footer has been removed - function kept for compatibility
}

function selectEmoji(emoji) {
    document.querySelectorAll('.emoji-btn').forEach(btn => btn.classList.remove('selected'));
    event.target.classList.add('selected');
    document.getElementById('settingsAvatar').textContent = emoji;
}

function shuffleEmoji() {
    const emojis = ['🚌', '🚇', '🚊', '🚋', '🚞', '🚝', '🚄', '✈️'];
    const currentEmoji = document.getElementById('settingsAvatar').textContent;
    let newEmoji;
    do {
        newEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    } while (newEmoji === currentEmoji);

    document.getElementById('settingsAvatar').textContent = newEmoji;
}

function saveProfile() {
    const name = document.getElementById('nameInput').value.trim();
    const emoji = document.getElementById('settingsAvatar').textContent;
    const defaultAgency = document.getElementById('defaultAgencySelect').value;

    if (!name) {
        alert('Please enter your name');
        return;
    }

    const profileData = {
        name: name,
        emoji: emoji,
        defaultAgency: defaultAgency,
        userId: currentUser.uid,
        updatedAt: firebase.firestore.Timestamp.now()
    };

    db.collection('profiles').doc(currentUser.uid).set(profileData)
        .then(() => {
            loadUserProfile(); // Refresh display
            closeSettings();
        })
        .catch((error) => {
            console.error('Error saving profile:', error);
            alert('Error saving profile. Please try again.');
        });
}

function signOut() {
    auth.signOut();
}

// Stats Management
function initializeStatsToggle() {
    const toggle30 = document.getElementById('statsToggle30');
    const toggleAll = document.getElementById('statsToggleAll');

    toggle30.addEventListener('click', () => {
        if (currentStatsView !== '30days') {
            currentStatsView = '30days';
            toggle30.style.background = 'var(--accent-primary)';
            toggle30.style.color = 'white';
            toggleAll.style.background = 'transparent';
            toggleAll.style.color = 'var(--text-secondary)';
            updateStatsSection();

        }
    });

    toggleAll.addEventListener('click', () => {
        if (currentStatsView !== 'alltime') {
            currentStatsView = 'alltime';
            toggleAll.style.background = 'var(--accent-primary)';
            toggleAll.style.color = 'white';
            toggle30.style.background = 'transparent';
            toggle30.style.color = 'var(--text-secondary)';
            updateStatsSection();

        }
    });
}





function updateStatsSection() {
    if (!currentUser) return;

    const now = new Date();
    let query = db.collection('trips').where('userId', '==', currentUser.uid);

    if (currentStatsView === '30days') {
        const dateFilter = new Date();
        dateFilter.setDate(dateFilter.getDate() - 30);
        console.log('Filtering trips after:', dateFilter);
        query = query.where('startTime', '>=', firebase.firestore.Timestamp.fromDate(dateFilter));
    }

    query.get()
        .then((snapshot) => {
            console.log(`Found ${snapshot.size} trips for ${currentStatsView}`);

            const trips = [];
            snapshot.forEach((doc) => {
                const trip = doc.data();
                trips.push(trip);

                if (trips.length <= 3) {
                    const tripDate = trip.startTime?.toDate ? trip.startTime.toDate() : new Date(trip.startTime);
                    console.log(`Trip on ${tripDate.toLocaleDateString()}: ${trip.route}`);
                }
            });

            const totalTrips = trips.length;
            const uniqueRoutes = new Set(trips.map(t => t.route)).size;
            const totalMinutes = trips.reduce((sum, t) => sum + (t.duration || 0), 0);
            const totalHours = Math.round(totalMinutes / 60 * 10) / 10;

            const stops = new Set();
            trips.forEach(t => {
                const startStop = t.startStopName || t.startStop || t.startStopCode;
                const endStop = t.endStopName || t.endStop || t.endStopCode;
                if (startStop) stops.add(startStop);
                if (endStop) stops.add(endStop);
            });
            const uniqueStops = stops.size;

            document.getElementById('statsTotalTrips').textContent = totalTrips;
            document.getElementById('statsUniqueRoutes').textContent = uniqueRoutes;
            document.getElementById('statsTotalTime').textContent = totalHours;
            document.getElementById('statsUniqueStops').textContent = uniqueStops;

            generateTopRoutes(trips);
            generateTopStops(trips);
        })
        .catch((error) => {
            console.error('Error updating stats:', error);
            db.collection('trips').where('userId', '==', currentUser.uid).get().then((snapshot) => {
                const trips = [];
                snapshot.forEach((doc) => {
                    const trip = doc.data();
                    if (currentStatsView === '30days') {
                        const tripDate = trip.startTime?.toDate ? trip.startTime.toDate() : new Date(trip.startTime);
                        const thirtyDaysAgo = new Date();
                        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                        if (tripDate >= thirtyDaysAgo) {
                            trips.push(trip);
                        }
                    } else {
                        trips.push(trip);
                    }
                });

                const totalTrips = trips.length;
                const uniqueRoutes = new Set(trips.map(t => t.route)).size;
                const totalMinutes = trips.reduce((sum, t) => sum + (t.duration || 0), 0);
                const totalHours = Math.round(totalMinutes / 60 * 10) / 10;

                const stops = new Set();
                trips.forEach(t => {
                    const startStop = t.startStopName || t.startStop || t.startStopCode;
                    const endStop = t.endStopName || t.endStop || t.endStopCode;
                    if (startStop) stops.add(startStop);
                    if (endStop) stops.add(endStop);
                });
                const uniqueStops = stops.size;

                document.getElementById('statsTotalTrips').textContent = totalTrips;
                document.getElementById('statsUniqueRoutes').textContent = uniqueRoutes;
                document.getElementById('statsTotalTime').textContent = totalHours;
                document.getElementById('statsUniqueStops').textContent = uniqueStops;

                generateTopRoutes(trips);
                generateTopStops(trips);
            });
        });
}

function updateProfileStats() {
    if (!currentUser) return;

    db.collection('trips')
        .where('userId', '==', currentUser.uid)
        .get()
        .then((snapshot) => {
            const trips = [];
            snapshot.forEach((doc) => {
                trips.push(doc.data());
            });

            const streakData = calculateStreaks(trips);
            document.getElementById('profileCurrentStreak').textContent = streakData.current;
            document.getElementById('profileBestStreak').textContent = streakData.best;

            calculateFounderStats(trips);
        });
}

// FIXED: Profile trips loading with proper debugging
function loadProfileTrips() {
    if (!currentUser) return;

    console.log('🔍 Loading profile trips');

    // Simplified query without orderBy to avoid index issues
    db.collection('trips')
        .where('userId', '==', currentUser.uid)
        .get()
        .then((snapshot) => {
            console.log('📊 Total trips found:', snapshot.size);

            if (snapshot.size === 0) {
                console.log('❌ No trips found for user');
                displayProfileTrips([]);
                return;
            }

            // Convert to array and sort in JavaScript
            const trips = [];
            snapshot.forEach((doc) => {
                const trip = doc.data();
                let startTime;
                if (trip.startTime?.toDate) {
                    startTime = trip.startTime.toDate();
                } else if (trip.startTime) {
                    startTime = new Date(trip.startTime);
                } else {
                    startTime = new Date();
                }

                trips.push({
                    id: doc.id,
                    ...trip,
                    sortableStartTime: startTime
                });
            });

            // Sort by startTime descending (newest first)
            trips.sort((a, b) => b.sortableStartTime - a.sortableStartTime);

            // Take only first 20
            const recentTrips = trips.slice(0, 20);

            console.log('✅ Displaying', recentTrips.length, 'recent trips');
            displayProfileTrips(recentTrips);
        })
        .catch((error) => {
            console.error('❌ Error loading profile trips:', error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);

            displayProfileTrips([]);
        });
}

function displayProfileTrips(trips) {
    const profileTripsList = document.getElementById('profileTripsList');

    if (trips.length === 0) {
        profileTripsList.innerHTML = '<div class="empty-state">No trips yet. Start your first trip!</div>';
        return;
    }

    const tripsHtml = trips.map(trip => {
        let startTime;
        if (trip.startTime?.toDate) {
            startTime = trip.startTime.toDate();
        } else if (trip.startTime) {
            startTime = new Date(trip.startTime);
        } else {
            startTime = new Date();
        }

        const agencyDisplay = trip.agency ? `<span class="agency-badge"> • ${trip.agency}</span>` : '';
        const verifiedBadge = trip.source === 'sms'
            ? (trip.verified
                ? '<span class="verified-badge verified">✓ Verified</span>'
                : '<span class="verified-badge unverified">? Unverified</span>')
            : '';
        const sourceBadge = trip.source === 'sms' ? '<span class="source-badge">SMS</span>' : '';
        const notesDisplay = trip.notes ? `<div style="font-size: 0.85em; color: var(--text-muted); margin-top: 5px; font-style: italic;">📝 ${trip.notes}</div>` : '';
        return `
                    <div class="trip-item" data-trip-id="${trip.id}">
                        <div class="delete-overlay">Delete</div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div><strong>${trip.route || 'Unknown Route'}</strong>${agencyDisplay}${sourceBadge}</div>
                            ${verifiedBadge}
                        </div>
                        <div>${trip.startStopName || trip.startStop || trip.startStopCode || 'Unknown'} → ${trip.endStopName || trip.endStop || trip.endStopCode || 'Unknown'}</div>
                        ${notesDisplay}
                        <div>${trip.duration || 0} min • ${startTime.toLocaleDateString()}</div>
                    </div>
                `;
    }).join('');

    profileTripsList.innerHTML = tripsHtml;

    profileTripsList.querySelectorAll('.trip-item').forEach(item => {
        const tripId = item.getAttribute('data-trip-id');
        addSwipeToDelete(item, false, tripId);
        // Add click to edit (only if not swiping)
        item.style.cursor = 'pointer';
        item.addEventListener('click', (e) => {
            // Don't open edit if swiping or clicking delete overlay
            if (item.classList.contains('swiped') || e.target.classList.contains('delete-overlay')) return;
            openEditTripModal(tripId);
        });
    });
}

function calculateFounderStats(trips) {
    document.getElementById('profileFounderRoutes').textContent = '0';
    document.getElementById('profileFounderStops').textContent = '0';
}

function generateTopRoutes(trips) {
    const routeCounts = {};
    trips.forEach(trip => {
        const route = trip.route || 'Unknown';
        routeCounts[route] = (routeCounts[route] || 0) + 1;
    });

    const sortedRoutes = Object.entries(routeCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([route, count]) => ({ route, count })); // Convert to array of objects

    const topRoutesList = document.getElementById('topRoutesList');

    if (sortedRoutes.length > 0) {
        // Calculate max for progress bars
        const maxTrips = sortedRoutes[0].count;

        topRoutesList.innerHTML = sortedRoutes.map(item => `
            <div class="mastery-card">
                <div class="mastery-header">
                    <div class="mastery-route">${item.route}</div>
                    <div class="mastery-count">${item.count} trips</div>
                </div>
                <div class="mastery-bar-bg">
                    <div class="mastery-bar-fill" style="width: ${(item.count / maxTrips) * 100}%"></div>
                </div>
            </div>
        `).join('');
    } else {
        topRoutesList.innerHTML = '<div class="empty-state">No routes yet</div>';
    }
}

function generateTopStops(trips) {
    const stopCounts = {};
    trips.forEach(trip => {
        // Use verified names to properly aggregate stops with aliases
        const rawStartStop = trip.startStopName || trip.startStop || trip.startStopCode;
        const rawEndStop = trip.endStopName || trip.endStop || trip.endStopCode;
        const startStop = resolveVerifiedStopName(rawStartStop, trip.agency) || rawStartStop || 'Unknown';
        const endStop = resolveVerifiedStopName(rawEndStop, trip.agency) || rawEndStop || 'Unknown';
        stopCounts[startStop] = (stopCounts[startStop] || 0) + 1;
        stopCounts[endStop] = (stopCounts[endStop] || 0) + 1;
    });

    const sortedStops = Object.entries(stopCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([stop, count]) => ({ stop, count })); // Convert to array of objects

    const topStopsList = document.getElementById('topStopsList');

    if (sortedStops.length > 0) {
        // Calculate max
        const maxVisits = sortedStops[0].count;

        topStopsList.innerHTML = sortedStops.map(item => `
            <div class="mastery-card">
                <div class="mastery-header">
                    <div class="mastery-route" style="font-weight: 500; font-size: 0.95em;">${item.stop}</div>
                    <div class="mastery-count">${item.count}</div>
                </div>
                <div class="mastery-bar-bg">
                    <div class="mastery-bar-fill" style="width: ${(item.count / maxVisits) * 100}%; opacity: 0.7;"></div>
                </div>
            </div>
        `).join('');
    } else {
        topStopsList.innerHTML = '<div class="empty-state">No stops yet</div>';
    }
}

function calculateUserRank(userTripCount, allTrips) {
    const userCounts = {};
    allTrips.forEach(trip => {
        userCounts[trip.userId] = (userCounts[trip.userId] || 0) + 1;
    });

    const sortedCounts = Object.values(userCounts).sort((a, b) => b - a);
    const rank = sortedCounts.findIndex(count => count <= userTripCount) + 1;
    return rank || sortedCounts.length + 1;
}

function calculateStreaks(trips) {
    if (trips.length === 0) return { current: 0, best: 0 };

    const sortedTrips = trips.sort((a, b) => {
        const dateA = a.startTime?.toDate ? a.startTime.toDate() : new Date(a.startTime);
        const dateB = b.startTime?.toDate ? b.startTime.toDate() : new Date(b.startTime);
        return dateB - dateA;
    });

    const tripDays = new Set();
    sortedTrips.forEach(trip => {
        const date = trip.startTime?.toDate ? trip.startTime.toDate() : new Date(trip.startTime);
        const dayString = date.toDateString();
        tripDays.add(dayString);
    });

    const uniqueDays = Array.from(tripDays).sort((a, b) => new Date(b) - new Date(a));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayString = today.toDateString();

    if (uniqueDays.length === 1 && uniqueDays[0] === todayString) {
        return { current: 0, best: 0 };
    }

    let currentStreak = 0;
    let bestStreak = 0;
    let tempStreak = 0;

    for (let i = 0; i < uniqueDays.length; i++) {
        const currentDay = new Date(uniqueDays[i]);
        currentDay.setHours(0, 0, 0, 0);

        if (i === 0) {
            const diffDays = Math.floor((today - currentDay) / (1000 * 60 * 60 * 24));
            if (diffDays <= 1) {
                currentStreak = 1;
                tempStreak = 1;
            }
        } else {
            const prevDay = new Date(uniqueDays[i - 1]);
            prevDay.setHours(0, 0, 0, 0);
            const diffDays = Math.floor((prevDay - currentDay) / (1000 * 60 * 60 * 24));

            if (diffDays === 1) {
                tempStreak++;
                if (i === 0 || currentStreak > 0) {
                    currentStreak = tempStreak;
                }
            } else {
                bestStreak = Math.max(bestStreak, tempStreak);
                tempStreak = 1;
                if (currentStreak > 0 && i > 0) {
                    currentStreak = 0;
                }
            }
        }
    }

    bestStreak = Math.max(bestStreak, tempStreak, currentStreak);
    return { current: currentStreak, best: bestStreak };
}

// Template Management
function loadTemplates() {
    if (!currentUser) return;

    db.collection('templates')
        .where('userId', '==', currentUser.uid)
        .orderBy('createdAt', 'desc')
        .get()
        .then((snapshot) => {
            const templates = [];
            snapshot.forEach((doc) => {
                templates.push({ id: doc.id, ...doc.data() });
            });

            displayTemplates(templates);
            displayProfileTemplates(templates);
        })
        .catch((error) => {
            console.error('Error loading templates:', error);
            displayTemplates([]);
            displayProfileTemplates([]);
        });
}

function displayTemplates(templates) {
    const templatesSection = document.getElementById('templatesSection');
    const templatesList = document.getElementById('templatesList');

    if (templates.length === 0) {
        templatesSection.style.display = 'none';
        return;
    }

    templatesSection.style.display = 'block';

    const templatesHtml = templates.slice(0, 3).map(template => `
                <div class="template-card" onclick="startFromTemplate('${template.route}', '${template.startStop}')">
                    <span class="template-icon">⭐</span>
                    <div class="route-name">${template.route}</div>
                    <div class="stop-name">From ${template.startStop}</div>
                </div>
            `).join('');

    templatesList.innerHTML = templatesHtml;
}

function displayProfileTemplates(templates) {
    const profileTemplatesList = document.getElementById('profileTemplatesList');

    if (templates.length === 0) {
        profileTemplatesList.innerHTML = '<div class="empty-state">No saved templates yet</div>';
        return;
    }

    const templatesHtml = templates.map(template => `
                <div class="trip-item" data-template-id="${template.id}">
                    <div class="delete-overlay">Delete</div>
                    <div><strong>${template.route}</strong></div>
                    <div>From ${template.startStop}</div>
                    <div style="font-size: 0.9em; color: var(--text-secondary);">⭐ Quick start template</div>
                </div>
            `).join('');

    profileTemplatesList.innerHTML = templatesHtml;

    profileTemplatesList.querySelectorAll('.trip-item').forEach(item => {
        const templateId = item.getAttribute('data-template-id');
        addSwipeToDelete(item, true, templateId);
    });
}


// -- Log Trip Modal Logic --

function openLogTripModal() {
    const modal = document.getElementById('logTripModal');
    modal.style.display = 'block';

    // Clear inputs if not editing
    if (!activeTrip) {
        document.getElementById('routeInput').value = '';
        document.getElementById('stopInput').value = '';
    }

    document.getElementById('routeInput').focus();
    renderQuickTemplates();
}

function closeLogTripModal() {
    document.getElementById('logTripModal').style.display = 'none';
}

// ============================================================================
// EDIT TRIP MODAL
// ============================================================================

function openEditTripModal(tripId) {
    const modal = document.getElementById('editTripModal');

    // Fetch trip data
    db.collection('trips').doc(tripId).get()
        .then(doc => {
            if (!doc.exists) {
                alert('Trip not found');
                return;
            }

            const trip = doc.data();

            // Populate fields
            document.getElementById('editTripId').value = tripId;
            document.getElementById('editRouteInput').value = trip.route || '';
            document.getElementById('editDirectionInput').value = trip.direction || '';
            document.getElementById('editStartStopInput').value = trip.startStopName || trip.startStopCode || trip.startStop || '';
            document.getElementById('editEndStopInput').value = trip.endStopName || trip.endStopCode || trip.endStop || '';
            document.getElementById('editAgencySelect').value = trip.agency || 'TTC';
            document.getElementById('editNotesInput').value = trip.notes || '';

            modal.style.display = 'block';
        })
        .catch(error => {
            console.error('Error loading trip:', error);
            alert('Error loading trip data');
        });
}

function closeEditTripModal() {
    document.getElementById('editTripModal').style.display = 'none';
}

function saveEditedTrip() {
    const tripId = document.getElementById('editTripId').value;
    const route = document.getElementById('editRouteInput').value.trim();
    const direction = document.getElementById('editDirectionInput').value.trim();
    const startStop = document.getElementById('editStartStopInput').value.trim();
    const endStop = document.getElementById('editEndStopInput').value.trim();
    const agency = document.getElementById('editAgencySelect').value;
    const notes = document.getElementById('editNotesInput').value.trim();

    if (!route) {
        alert('Route is required');
        return;
    }

    // Determine if stops are codes (all digits) or names
    const isStartStopCode = /^\d+$/.test(startStop);
    const isEndStopCode = /^\d+$/.test(endStop);

    const updateData = {
        route: route,
        direction: direction || null,
        agency: agency,
        notes: notes || null,
        // Update stop fields based on whether input is a code or name
        startStopCode: isStartStopCode ? startStop : null,
        startStopName: isStartStopCode ? null : startStop,
        endStopCode: isEndStopCode ? endStop : null,
        endStopName: isEndStopCode ? null : endStop,
        // Mark as unverified since user manually edited
        verified: false
    };

    db.collection('trips').doc(tripId).update(updateData)
        .then(() => {
            closeEditTripModal();
            loadTrips(); // Refresh the trip list
            alert('Trip updated successfully');
        })
        .catch(error => {
            console.error('Error updating trip:', error);
            alert('Error saving changes: ' + error.message);
        });
}

function deleteTrip() {
    const tripId = document.getElementById('editTripId').value;

    if (!confirm('Are you sure you want to delete this trip? This cannot be undone.')) {
        return;
    }

    db.collection('trips').doc(tripId).delete()
        .then(() => {
            closeEditTripModal();
            loadTrips(); // Refresh the trip list
            alert('Trip deleted');
        })
        .catch(error => {
            console.error('Error deleting trip:', error);
            alert('Error deleting trip: ' + error.message);
        });
}

function renderQuickTemplates() {
    const container = document.getElementById('quickTemplates');
    if (!currentUser) return;

    db.collection('templates')
        .where('userId', '==', currentUser.uid)
        .orderBy('useCount', 'desc')
        .limit(5)
        .get()
        .then(snapshot => {
            if (snapshot.empty) {
                container.style.display = 'none';
                return;
            }
            container.style.display = 'flex';
            container.innerHTML = snapshot.docs.map(doc => {
                const t = doc.data();
                return `<div class="template-chip" onclick="useQuickTemplate('${t.route}', '${t.startStop}')">
                    ${t.route} • ${t.startStop}
                </div>`;
            }).join('');
        });
}

function useQuickTemplate(route, stop) {
    document.getElementById('routeInput').value = route;
    document.getElementById('stopInput').value = stop;
    updateStartButton();
}


function startNewTrip() {
    const stopInput = document.getElementById('stopInput');
    const routeInput = document.getElementById('routeInput');
    const directionInputEl = document.getElementById('directionInput');
    const startBtn = document.getElementById('startBtn');

    const stop = stopInput.value.trim();
    const route = routeInput.value.trim();
    const direction = directionInputEl ? directionInputEl.value.trim() : '';

    stopInput.style.background = '';
    routeInput.style.background = '';

    if (!stop || !route) {
        if (!stop) stopInput.style.background = 'rgba(255, 0, 0, 0.1)';
        if (!route) routeInput.style.background = 'rgba(255, 0, 0, 0.1)';
        setTimeout(() => {
            stopInput.style.background = '';
            routeInput.style.background = '';
        }, 500);
        return;
    }

    // Check if user is authenticated
    if (!currentUser) {
        alert('You must be signed in to start a trip. Please refresh the page and try again.');
        return;
    }

    startBtn.disabled = true;
    startBtn.textContent = 'Starting...';

    getCurrentLocation((location) => {
        // Parse stop input to extract code and/or name
        const parsedStop = parseStopInput(stop);

        // Try to look up the stop in our verified stops library (with direction for disambiguation)
        const matchedStop = lookupStopInLibrary(parsedStop.stopCode, parsedStop.stopName, null, direction);

        const tripData = {
            userId: currentUser.uid,
            route: route,
            direction: direction || null,
            startStop: stop, // Keep raw input for backwards compatibility
            startStopCode: matchedStop ? matchedStop.code : parsedStop.stopCode,
            startStopName: matchedStop ? matchedStop.name : parsedStop.stopName,
            verifiedStopId: matchedStop ? matchedStop.id : null,
            verified: !!matchedStop,
            endStop: null,
            startTime: firebase.firestore.Timestamp.now(),
            boardingLocation: matchedStop && matchedStop.lat ? { lat: matchedStop.lat, lng: matchedStop.lng } : location
        };

        db.collection('trips').add(tripData)
            .then((docRef) => {
                activeTrip = { id: docRef.id, ...tripData };
                stopInput.value = '';
                routeInput.value = '';
                if (directionInputEl) directionInputEl.value = '';
                startBtn.disabled = false;
                startBtn.textContent = 'Board Vehicle';

                closeLogTripModal(); // Close modal on success
                showActiveSection();
                updateActiveTripBanner();
                trackRouteStopUsage(route, stop);
            })
            .catch((error) => {
                console.error('Error starting trip:', error);
                alert('Error starting trip: ' + error.message);
                startBtn.disabled = false;
                startBtn.textContent = 'Board Vehicle';
            });
    });
}

function startFromTemplate(route, startStop) {
    document.getElementById('routeInput').value = route;
    document.getElementById('stopInput').value = startStop;
    openLogTripModal();
    // setTimeout(() => startNewTrip(), 100); // Optional: auto-start? Let's verify first.
}


function deleteTemplate(templateId) {
    if (confirm('Delete this template?')) {
        db.collection('templates').doc(templateId).delete()
            .then(() => {
                loadTemplates();
            })
            .catch((error) => {
                console.error('Error deleting template:', error);
                alert('Error deleting template');
            });
    }
}

function scrollToTemplates() {
    setTimeout(() => {
        const templatesSection = document.getElementById('templatesManagement');
        if (templatesSection) {
            templatesSection.scrollIntoView({ behavior: 'smooth' });
        }
    }, 100);
}

function goToActiveTrip() {
    hideAllSections();
    showActiveSection();
}

function deleteTrip(tripId) {
    if (confirm('Are you sure you want to delete this trip?')) {
        db.collection('trips').doc(tripId).delete()
            .then(() => {
                alert('Trip deleted');
                loadTrips();
                loadProfileTrips();
                updateProfileStats();
            })
            .catch((error) => {
                console.error('Error deleting trip:', error);
                alert('Error deleting trip');
            });
    }
}

// Authentication Event Handlers
continueBtn.addEventListener('click', () => {
    const email = emailInput.value.trim();
    if (!email) {
        alert('Please enter your email');
        return;
    }

    document.getElementById('emailDisplay').textContent = email;
    document.getElementById('emailStep').style.display = 'none';
    document.getElementById('authMethodStep').style.display = 'block';
});

emailInput.addEventListener('input', () => {
    const email = emailInput.value.trim();
    continueBtn.disabled = !email || !email.includes('@');
});

emailInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !continueBtn.disabled) {
        continueBtn.click();
    }
});

function goBackToEmail() {
    document.getElementById('emailStep').style.display = 'block';
    document.getElementById('authMethodStep').style.display = 'none';
    document.getElementById('passwordGroup').style.display = 'none';
    document.getElementById('authButtons').style.display = 'flex';
    document.getElementById('signInBtn').style.display = 'none';
    emailInput.value = '';
    passwordInput.value = '';
}

// Password authentication handler
passwordBtn.addEventListener('click', () => {
    document.getElementById('passwordGroup').style.display = 'block';
    document.getElementById('authButtons').style.display = 'none';
    document.getElementById('signInBtn').style.display = 'block';
    passwordInput.focus();
});

// Sign in with password
signInBtn.addEventListener('click', () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!password) {
        showAuthError('Please enter your password');
        return;
    }

    signInBtn.disabled = true;
    signInBtn.textContent = 'Signing in...';
    hideAuthError();

    auth.signInWithEmailAndPassword(email, password)
        .then(() => {
            console.log('✅ Signed in successfully');
        })
        .catch(async (error) => {
            if (error.code === 'auth/user-not-found') {
                // Check whitelist before creating account
                try {
                    const allowedUsersRef = db.collection('allowedUsers');
                    const querySnapshot = await allowedUsersRef.where('email', '==', email.toLowerCase()).get();

                    if (querySnapshot.empty) {
                        showAuthError('This app is invite-only. Please contact the administrator for access.');
                        signInBtn.disabled = false;
                        signInBtn.textContent = 'Sign In';
                        return;
                    }

                    // User is whitelisted, create account
                    auth.createUserWithEmailAndPassword(email, password)
                        .then(() => {
                            console.log('✅ Account created successfully');
                        })
                        .catch((createError) => {
                            showAuthError(getAuthErrorMessage(createError.code));
                            signInBtn.disabled = false;
                            signInBtn.textContent = 'Sign In';
                        });
                } catch (whitelistError) {
                    console.error('Error checking whitelist:', whitelistError);
                    showAuthError('Unable to verify access. Please try again.');
                    signInBtn.disabled = false;
                    signInBtn.textContent = 'Sign In';
                }
            } else {
                showAuthError(getAuthErrorMessage(error.code));
                signInBtn.disabled = false;
                signInBtn.textContent = 'Sign In';
            }
        });
});

// Helper function to get user-friendly error messages
function getAuthErrorMessage(errorCode) {
    switch (errorCode) {
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            return 'Incorrect password. Try again or use magic link.';
        case 'auth/user-not-found':
            return 'No account found with this email.';
        case 'auth/too-many-requests':
            return 'Too many failed attempts. Please try again later.';
        case 'auth/weak-password':
            return 'Password is too weak. Please use at least 6 characters.';
        case 'auth/email-already-in-use':
            return 'An account with this email already exists.';
        case 'auth/invalid-email':
            return 'Please enter a valid email address.';
        default:
            return 'An error occurred. Please try again.';
    }
}

// Helper function to show auth error message
function showAuthError(message) {
    const authStatus = document.getElementById('authStatus');
    authStatus.textContent = message;
    authStatus.style.display = 'block';
    authStatus.style.color = '#ff4444';
    authStatus.style.background = 'rgba(255, 68, 68, 0.1)';
    authStatus.style.padding = '10px';
    authStatus.style.borderRadius = '8px';
    authStatus.style.marginTop = '15px';
}

// Helper function to hide auth error message
function hideAuthError() {
    const authStatus = document.getElementById('authStatus');
    authStatus.style.display = 'none';
}

// Helper function to show success message
function showAuthSuccess(message) {
    const authStatus = document.getElementById('authStatus');
    authStatus.textContent = message;
    authStatus.style.display = 'block';
    authStatus.style.color = '#44bb44';
    authStatus.style.background = 'rgba(68, 187, 68, 0.1)';
    authStatus.style.padding = '10px';
    authStatus.style.borderRadius = '8px';
    authStatus.style.marginTop = '15px';
}

// Password reset function
function sendPasswordReset() {
    const email = emailInput.value.trim();

    if (!email) {
        showAuthError('Please enter your email address first.');
        return;
    }

    auth.sendPasswordResetEmail(email)
        .then(() => {
            showAuthSuccess('Password reset email sent! Check your inbox.');
        })
        .catch((error) => {
            showAuthError('Error sending reset email: ' + error.message);
        });
}

// Magic link handler
magicLinkBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();

    // Check whitelist before sending magic link
    try {
        const allowedUsersRef = db.collection('allowedUsers');
        const querySnapshot = await allowedUsersRef.where('email', '==', email.toLowerCase()).get();

        if (querySnapshot.empty) {
            showAuthError('This app is invite-only. Please contact the administrator for access.');
            return;
        }

        const actionCodeSettings = {
            url: window.location.origin + window.location.pathname,
            handleCodeInApp: true
        };

        auth.sendSignInLinkToEmail(email, actionCodeSettings)
            .then(() => {
                window.localStorage.setItem('emailForSignIn', email);
                alert('Magic link sent! Check your email.');
                goBackToEmail();
            })
            .catch((error) => {
                alert('Error sending magic link: ' + error.message);
            });
    } catch (whitelistError) {
        console.error('Error checking whitelist:', whitelistError);
        showAuthError('Unable to verify access. Please try again.');
    }
});

// Check for magic link on page load
if (auth.isSignInWithEmailLink(window.location.href)) {
    let email = window.localStorage.getItem('emailForSignIn');
    if (!email) {
        email = window.prompt('Please provide your email for confirmation');
    }

    if (email) {
        auth.signInWithEmailLink(email, window.location.href)
            .then((result) => {
                window.localStorage.removeItem('emailForSignIn');
                window.history.replaceState({}, document.title, window.location.pathname);
                console.log('✅ Magic link sign-in successful:', result.user.email);
                // The onAuthStateChanged callback should handle showing the app,
                // but we ensure the UI is in a good state
                currentUser = result.user;
            })
            .catch((error) => {
                console.error('Error signing in with email link:', error);
                window.history.replaceState({}, document.title, window.location.pathname);
                // Show error to user instead of silently failing
                if (error.code === 'auth/invalid-action-code') {
                    alert('This magic link has expired or already been used. Please request a new one.');
                } else if (error.code === 'auth/invalid-email') {
                    alert('Invalid email address. Please try again.');
                } else {
                    alert('Error signing in: ' + error.message);
                }
                showAuth();
                updateConnectionStatus(false);
            });
    } else {
        // User cancelled the email prompt
        window.history.replaceState({}, document.title, window.location.pathname);
        showAuth();
        updateConnectionStatus(false);
    }
}

// Password input enter key
passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        signInBtn.click();
    }
});

// Load stops library for verified name lookup
async function loadStopsLibrary() {
    try {
        const snapshot = await db.collection('stops').get();
        stopsLibrary = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`✅ Loaded ${stopsLibrary.length} stops for name resolution`);
    } catch (error) {
        console.error('Error loading stops library:', error);
        stopsLibrary = [];
    }
}

// Resolve a stop name/code to its verified canonical name
function resolveVerifiedStopName(stopValue, agency) {
    if (!stopValue || !stopsLibrary.length) return null;

    const lowerValue = stopValue.toLowerCase().trim();

    for (const stop of stopsLibrary) {
        // Skip if agency doesn't match (when agency is provided)
        if (agency && stop.agency && stop.agency !== agency) continue;

        // Check exact code match
        if (stop.code && stop.code === stopValue) {
            return stop.name;
        }

        // Check exact name match (already the canonical name)
        if (stop.name && stop.name.toLowerCase() === lowerValue) {
            return stop.name;
        }

        // Check aliases
        if (stop.aliases && Array.isArray(stop.aliases)) {
            if (stop.aliases.some(alias => alias.toLowerCase() === lowerValue)) {
                return stop.name;
            }
        }
    }

    return null; // No match found
}

/**
 * Parse stop input that may contain both name and code
 * Handles formats like:
 * - "Spadina & Nassau 19932" (name followed by code)
 * - "19932 Spadina & Nassau" (code followed by name)
 * - "19932" (just code)
 * - "Spadina & Nassau" (just name)
 * @param {string} input - Raw stop input
 * @returns {object} { stopCode: string|null, stopName: string|null, raw: string }
 */
function parseStopInput(input) {
    if (!input) return { stopCode: null, stopName: null, raw: '' };

    const trimmed = input.trim();

    // Check if entire input is just a stop code (all digits)
    if (/^\d+$/.test(trimmed)) {
        return { stopCode: trimmed, stopName: null, raw: trimmed };
    }

    // Check for code at the end: "Spadina & Nassau 19932"
    const codeAtEndMatch = trimmed.match(/^(.+?)\s+(\d{4,6})$/);
    if (codeAtEndMatch) {
        return {
            stopCode: codeAtEndMatch[2],
            stopName: codeAtEndMatch[1].trim(),
            raw: trimmed
        };
    }

    // Check for code at the start: "19932 Spadina & Nassau"
    const codeAtStartMatch = trimmed.match(/^(\d{4,6})\s+(.+)$/);
    if (codeAtStartMatch) {
        return {
            stopCode: codeAtStartMatch[1],
            stopName: codeAtStartMatch[2].trim(),
            raw: trimmed
        };
    }

    // No code found, treat as name only
    return { stopCode: null, stopName: trimmed, raw: trimmed };
}

/**
 * Normalize direction string for comparison
 * @param {string|null} direction - Raw direction input
 * @returns {string|null} Normalized direction or null
 */
function normalizeDirection(direction) {
    if (!direction) return null;
    const upper = direction.toUpperCase().trim();

    // Cardinal directions
    if (['N', 'NB', 'NORTH', 'NORTHBOUND'].includes(upper)) return 'North';
    if (['S', 'SB', 'SOUTH', 'SOUTHBOUND'].includes(upper)) return 'South';
    if (['E', 'EB', 'EAST', 'EASTBOUND'].includes(upper)) return 'East';
    if (['W', 'WB', 'WEST', 'WESTBOUND'].includes(upper)) return 'West';

    // Other directions
    if (['CW', 'CLOCKWISE'].includes(upper)) return 'Clockwise';
    if (['CCW', 'COUNTERCLOCKWISE', 'ANTICLOCKWISE'].includes(upper)) return 'Counterclockwise';
    if (['IB', 'IN', 'INBOUND'].includes(upper)) return 'Inbound';
    if (['OB', 'OUT', 'OUTBOUND'].includes(upper)) return 'Outbound';

    // Return title case if not recognized
    return direction.trim();
}

/**
 * Look up a stop in the stops library by code or name
 * @param {string|null} stopCode - Stop code to look up
 * @param {string|null} stopName - Stop name to look up
 * @param {string|null} agency - Agency to filter by (optional)
 * @param {string|null} direction - Direction to filter by (optional)
 * @returns {object|null} Full stop object or null if not found
 */
function lookupStopInLibrary(stopCode, stopName, agency = null, direction = null) {
    if (!stopsLibrary.length) return null;
    if (!stopCode && !stopName) return null;

    const normalizedDir = normalizeDirection(direction);

    for (const stop of stopsLibrary) {
        // Filter by agency if provided
        if (agency && stop.agency && stop.agency !== agency) continue;

        // Check code match first (most reliable - code is unique)
        if (stopCode && stop.code === stopCode) {
            return stop;
        }
    }

    // If no code match, try name matching with direction consideration
    if (stopName) {
        const lowerName = stopName.toLowerCase();
        let nameMatches = [];

        for (const stop of stopsLibrary) {
            if (agency && stop.agency && stop.agency !== agency) continue;

            let isNameMatch = false;

            // Exact name match
            if (stop.name && stop.name.toLowerCase() === lowerName) {
                isNameMatch = true;
            }

            // Alias match
            if (!isNameMatch && stop.aliases && Array.isArray(stop.aliases)) {
                if (stop.aliases.some(alias => alias.toLowerCase() === lowerName)) {
                    isNameMatch = true;
                }
            }

            if (isNameMatch) {
                nameMatches.push(stop);
            }
        }

        // If we have matches, filter by direction if provided
        if (nameMatches.length > 0) {
            if (normalizedDir) {
                // Try to find a stop with matching direction
                const dirMatch = nameMatches.find(stop =>
                    stop.direction && normalizeDirection(stop.direction) === normalizedDir
                );
                if (dirMatch) return dirMatch;

                // If no direction match, prefer stops without direction (stations)
                const noDir = nameMatches.find(stop => !stop.direction);
                if (noDir) return noDir;
            }

            // Return first match if no direction filtering needed/possible
            return nameMatches[0];
        }
    }

    return null;
}

// Initialize app on authentication
function initializeApp() {
    loadStopsLibrary(); // Load stops for verified name resolution
    loadTemplates();
    checkActiveTrip();
    loadLastTrip();
    loadTrips();

    // Dashboard Data Initialization
    updateProfileStats();
    updateStatsSection();

    if (!statsInitialized) {
        initializeStatsToggle();
        statsInitialized = true;
    }

    // Map will initialize when user clicks Map nav button

    // loadUnverifiedTrips(); // Moved to Admin Panel
}

function loadLastTrip() {
    db.collection('trips')
        .where('userId', '==', currentUser.uid)
        .where('endStop', '!=', null)
        .orderBy('endTime', 'desc')
        .limit(1)
        .get()
        .then((snapshot) => {
            if (!snapshot.empty) {
                const lastTrip = snapshot.docs[0].data();
                repeatLastTripSection.style.display = 'block';
                repeatLastTripBtn.onclick = () => {
                    document.getElementById('stopInput').value = lastTrip.startStop;
                    document.getElementById('routeInput').value = lastTrip.route;

                    openLogTripModal(); // Open the modal so user can see/confirm

                    // Highlight effect
                    const stopInput = document.getElementById('stopInput');
                    const routeInput = document.getElementById('routeInput');
                    stopInput.style.background = '#e8f5e8';
                    routeInput.style.background = '#e8f5e8';

                    setTimeout(() => {
                        stopInput.style.background = '';
                        routeInput.style.background = '';
                    }, 500);

                    document.getElementById('startBtn').focus();
                    showNotification(`Ready to board ${lastTrip.route} from ${lastTrip.startStop}`);
                };
            } else {
                repeatLastTripSection.style.display = 'none';
            }
        })
        .catch((error) => {
            console.error('Error loading last trip:', error);
            repeatLastTripSection.style.display = 'none';
        });
}

function loadTrips() {
    const recentTripsList = document.getElementById('recentTripsList');

    // Reset infinite scroll state
    allCompletedTrips = [];
    displayedTripsCount = 0;

    // Clean up previous observer
    if (tripsObserver) {
        tripsObserver.disconnect();
        tripsObserver = null;
    }

    // Simplified query without orderBy to avoid Firestore index issues
    db.collection('trips')
        .where('userId', '==', currentUser.uid)
        .get()
        .then((snapshot) => {
            // Filter to completed trips (with endStop, endStopCode, or endStopName) and sort in JS
            allCompletedTrips = snapshot.docs
                .filter(doc => {
                    const data = doc.data();
                    return data.endStop != null || data.endStopCode != null || data.endStopName != null || data.discarded === true;
                })
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .sort((a, b) => {
                    const aTime = a.endTime?.toDate ? a.endTime.toDate() : new Date(a.endTime || 0);
                    const bTime = b.endTime?.toDate ? b.endTime.toDate() : new Date(b.endTime || 0);
                    return bTime - aTime;
                });

            if (allCompletedTrips.length > 0) {
                recentTripsList.innerHTML = '';

                // Display initial batch
                displayMoreTrips();

                // Set up infinite scroll observer
                setupTripsInfiniteScroll();

                // Load heatmap data for visuals
                loadTripsForHeatmap();

            } else {
                recentTripsList.innerHTML = '<div class="empty-state"><span>🚌</span><p>Take your first trip to get started!</p></div>';
            }
        })
        .catch((error) => {
            console.error('Error loading trips:', error);
            recentTripsList.innerHTML = '<div class="empty-state"><span>⚠️</span><p>Error loading trips</p></div>';
        });
}

function renderTripItem(trip) {
    const endTime = trip.endTime?.toDate ? trip.endTime.toDate() : new Date();
    const dateStr = endTime.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
    });
    const duration = trip.duration || 0;

    // Try to resolve verified names from stops library (by code or alias)
    const rawStartStop = trip.startStopName || trip.startStop || trip.startStopCode;
    const rawEndStop = trip.endStopName || trip.endStop || trip.endStopCode;
    const startStop = resolveVerifiedStopName(rawStartStop, trip.agency) || rawStartStop || 'Unknown';
    const endStop = resolveVerifiedStopName(rawEndStop, trip.agency) || rawEndStop || 'Unknown';
    const agencyDisplay = trip.agency ? ` • ${trip.agency}` : '';
    let verifiedBadge = '';

    if (trip.discarded) {
        verifiedBadge = '<span class="verified-badge" style="background: #fee2e2; color: #dc2626;">🚫 Discarded</span>';
    } else if (trip.source === 'sms') {
        verifiedBadge = trip.verified
            ? '<span class="verified-badge verified">✓</span>'
            : '<span class="verified-badge unverified">?</span>';
    }

    const notesDisplay = trip.notes ? `<div style="font-size: 0.85em; color: var(--text-muted); margin-top: 4px; padding-top: 4px; border-top: 1px dotted var(--border-light);">📝 ${escapeHtml(trip.notes)}</div>` : '';

    let tagsDisplay = '';
    if (trip.tags && Array.isArray(trip.tags) && trip.tags.length > 0) {
        tagsDisplay = '<div style="margin-top: 4px; display: flex; gap: 4px; flex-wrap: wrap;">';
        trip.tags.forEach(tag => {
            // Check for negative sentiment keywords to style them differently (optional), typically tags like "crowded" or "delayed"
            const isNegative = ['crowded', 'late', 'delayed', 'slow', 'packed'].some(k => tag.toLowerCase().includes(k));
            const style = isNegative
                ? 'background: #fee2e2; color: #dc2626; border: 1px solid #fecaca;'
                : 'background: var(--bg-secondary); color: var(--text-secondary); border: 1px solid var(--border-light);';

            tagsDisplay += `<span style="font-size: 0.75em; padding: 1px 6px; border-radius: 12px; ${style}">${escapeHtml(tag)}</span>`;
        });
        tagsDisplay += '</div>';
    }

    const tripDiv = document.createElement('div');
    tripDiv.className = 'trip-item';
    tripDiv.style.cursor = 'pointer';
    tripDiv.onclick = () => openEditTripModal(trip.id);
    tripDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div style="flex: 1;">
                <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(trip.route)}<span class="agency-badge">${escapeHtml(agencyDisplay)}</span></div>
                <div style="font-size: 0.9em; color: var(--text-secondary);">${escapeHtml(startStop)} → ${escapeHtml(endStop)}</div>
                ${tagsDisplay}
            </div>
            <div style="text-align: right;">
                <div style="font-size: 0.85em; color: var(--text-muted);">${dateStr} ${verifiedBadge}</div>
                <div style="font-size: 0.85em; color: var(--text-secondary);">${duration} min</div>
            </div>
            <div style="margin-left: 10px; color: var(--text-muted); font-size: 0.9em;">✏️</div>
        </div>
        ${notesDisplay}
    `;
    return tripDiv;
}

function displayMoreTrips() {
    const recentTripsList = document.getElementById('recentTripsList');
    const nextBatch = allCompletedTrips.slice(displayedTripsCount, displayedTripsCount + TRIPS_PER_BATCH);

    nextBatch.forEach(trip => {
        recentTripsList.appendChild(renderTripItem(trip));
    });

    displayedTripsCount += nextBatch.length;

    // Update or add the scroll sentinel
    updateScrollSentinel();
}

function updateScrollSentinel() {
    const recentTripsList = document.getElementById('recentTripsList');
    let sentinel = document.getElementById('tripsSentinel');

    // Remove existing sentinel
    if (sentinel) {
        sentinel.remove();
    }

    // Add new sentinel if there are more trips to load
    if (displayedTripsCount < allCompletedTrips.length) {
        sentinel = document.createElement('div');
        sentinel.id = 'tripsSentinel';
        sentinel.style.cssText = 'padding: 15px; text-align: center; color: var(--text-muted); font-size: 0.9em;';
        sentinel.innerHTML = '<span class="loading-spinner"></span> Loading more trips...';
        recentTripsList.appendChild(sentinel);
    } else if (displayedTripsCount > TRIPS_PER_BATCH) {
        // Show end message only if we've scrolled past the first batch
        const endMsg = document.createElement('div');
        endMsg.style.cssText = 'padding: 15px; text-align: center; color: var(--text-muted); font-size: 0.85em;';
        endMsg.textContent = `All ${allCompletedTrips.length} trips loaded`;
        recentTripsList.appendChild(endMsg);
    }
}

function setupTripsInfiniteScroll() {
    const sentinel = document.getElementById('tripsSentinel');
    if (!sentinel) return;

    tripsObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && displayedTripsCount < allCompletedTrips.length) {
                displayMoreTrips();

                // Re-observe the new sentinel if more trips remain
                const newSentinel = document.getElementById('tripsSentinel');
                if (newSentinel && tripsObserver) {
                    tripsObserver.observe(newSentinel);
                }
            }
        });
    }, {
        rootMargin: '100px' // Start loading before user reaches the bottom
    });

    tripsObserver.observe(sentinel);
}

function loadTripsForHeatmap() {
    // Separate query to get more data for the visuals without clogging the feed logic
    db.collection('trips')
        .where('userId', '==', currentUser.uid)
        .where('verified', '==', true) // Only map verified trips
        .limit(200) // Decent sample size for personal heatmap
        .get()
        .then(snapshot => {
            const trips = snapshot.docs.map(doc => doc.data());
            if (window.Visuals && window.map) {
                window.Visuals.renderPointHeatmap(trips, window.map);
            }
        })
        .catch(err => console.log('Error loading heatmap data:', err));
}











function checkActiveTrip() {
    db.collection('trips')
        .where('userId', '==', currentUser.uid)
        .where('endStop', '==', null)
        .limit(1)
        .get()
        .then((snapshot) => {
            if (!snapshot.empty) {
                const doc = snapshot.docs[0];
                activeTrip = { id: doc.id, ...doc.data() };
                showActiveSection();
                updateActiveTripBanner();
            } else {
                activeTrip = null;
                showStartSection(); // Ensures UI resets
                updateActiveTripBanner();
            }
        })
        .catch((error) => {
            console.error('Error checking active trip:', error);
            // showStartSection(); // No longer needed as form is in modal
        });
}

function showStartSection() {
    // startSection.style.display = 'block'; // Removed, form is in modal
    activeSection.style.display = 'none';
    document.getElementById('logTripBtn').style.display = 'flex'; // Show + button
}

function showActiveSection() {
    // startSection.style.display = 'none';
    activeSection.style.display = 'block';

    // Optional: Hide + button when trip is active if we want to force focus
    // document.getElementById('logTripBtn').style.display = 'none'; 

    if (activeTrip) {
        const startTime = activeTrip.startTime.toDate();
        const now = new Date();
        const elapsed = Math.floor((now - startTime) / 1000 / 60);

        currentTripDiv.innerHTML = `
                    <div class="current-trip-info">
                        <div style="font-size: 1.2em; margin-bottom: 5px;">${activeTrip.route}</div>
                        <div style="color: var(--text-secondary);">From ${activeTrip.startStop}</div>
                        <div style="color: var(--text-secondary); font-size: 0.9em; margin-top: 5px;">
                            ${elapsed} minute${elapsed !== 1 ? 's' : ''} ago
                        </div>
                    </div>
                `;
    }
}

function updateActiveTripBanner() {
    if (activeTrip) {
        activeTripBanner.style.display = 'block';
        activeTripBanner.onclick = goToActiveTrip;
    } else {
        activeTripBanner.style.display = 'none';
    }
}

function updateStartButton() {
    const stop = stopInput.value.trim();
    const route = routeInput.value.trim();
    startBtn.disabled = !stop || !route;
}



// Input validation for start trip
stopInput.addEventListener('input', updateStartButton);
routeInput.addEventListener('input', updateStartButton);

// Start trip handler
startBtn.addEventListener('click', startNewTrip);

// End trip button
endBtn.addEventListener('click', () => {
    endModal.style.display = 'block';
    exitInput.focus();
});

// Cancel end trip
cancelBtn.addEventListener('click', () => {
    endModal.style.display = 'none';
    exitInput.value = '';
    document.getElementById('saveAsTemplate').checked = false;
});

// Save trip (end trip)
saveBtn.addEventListener('click', () => {
    const exitStop = exitInput.value.trim();

    if (!exitStop) {
        alert('Please enter exit stop');
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    getCurrentLocation((location) => {
        const startTime = activeTrip.startTime.toDate();
        const endTime = new Date();
        const duration = Math.floor((endTime - startTime) / 1000 / 60);

        // Parse end stop input to extract code and/or name
        const parsedEndStop = parseStopInput(exitStop);

        // Try to look up the stop in our verified stops library
        const matchedEndStop = lookupStopInLibrary(parsedEndStop.stopCode, parsedEndStop.stopName);

        const updateData = {
            endStop: exitStop, // Keep raw input for backwards compatibility
            endStopCode: matchedEndStop ? matchedEndStop.code : parsedEndStop.stopCode,
            endStopName: matchedEndStop ? matchedEndStop.name : parsedEndStop.stopName,
            verifiedEndId: matchedEndStop ? matchedEndStop.id : null,
            endTime: firebase.firestore.Timestamp.now(),
            exitLocation: matchedEndStop && matchedEndStop.lat ? { lat: matchedEndStop.lat, lng: matchedEndStop.lng } : location,
            duration: duration
        };

        db.collection('trips').doc(activeTrip.id).update(updateData)
            .then(() => {
                const shouldSaveTemplate = document.getElementById('saveAsTemplate').checked;

                if (shouldSaveTemplate) {
                    saveAsTemplate(activeTrip.route, activeTrip.startStop);
                }

                activeTrip = null;
                exitInput.value = '';
                document.getElementById('saveAsTemplate').checked = false;
                endModal.style.display = 'none';
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save';
                showStartSection();
                updateActiveTripBanner();
                loadTemplates();
                updateStreakStatus();
                loadTrips();
                loadLastTrip();
            })
            .catch((error) => {
                console.error('Error ending trip:', error);
                alert('Error ending trip. Please try again.');
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save';
            });
    });
});

// Cancel active trip
document.getElementById('cancelTrip').addEventListener('click', () => {
    if (confirm('Are you sure you want to cancel this trip?')) {
        db.collection('trips').doc(activeTrip.id).delete()
            .then(() => {
                activeTrip = null;
                showStartSection();
                updateActiveTripBanner();
            })
            .catch((error) => {
                console.error('Error canceling trip:', error);
                alert('Error canceling trip');
            });
    }
});

function saveAsTemplate(route, startStop) {
    db.collection('templates').add({
        userId: currentUser.uid,
        route: route,
        startStop: startStop,
        createdAt: firebase.firestore.Timestamp.now()
    }).catch((error) => {
        console.error('Error saving template:', error);
    });
}

function trackRouteStopUsage(route, startStop) {
    // Track usage for auto-save templates
    const key = `${route}|${startStop}`;
    const usageKey = 'routeStopUsage_' + currentUser.uid;

    let usage = JSON.parse(localStorage.getItem(usageKey) || '{}');
    usage[key] = (usage[key] || 0) + 1;
    localStorage.setItem(usageKey, JSON.stringify(usage));

    // Auto-save after 3+ uses
    if (usage[key] === 3) {
        checkAndAutoSaveTemplate(route, startStop);
    }
}

function checkAndAutoSaveTemplate(route, startStop) {
    // Check if template already exists
    db.collection('templates')
        .where('userId', '==', currentUser.uid)
        .where('route', '==', route)
        .where('startStop', '==', startStop)
        .get()
        .then((snapshot) => {
            if (snapshot.empty) {
                saveAsTemplate(route, startStop);
                showNotification(`Template saved: ${route} from ${startStop}`);
                loadTemplates();
            }
        })
        .catch((error) => {
            console.error('Error checking template:', error);
        });
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
                position: fixed;
                top: 70px;
                left: 50%;
                transform: translateX(-50%);
                background: var(--success);
                color: white;
                padding: 12px 24px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 10000;
                animation: slideDown 0.3s ease;
            `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideUp 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function getCurrentLocation(callback) {
    if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                callback({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                });
            },
            (error) => {
                console.log('Location error:', error.message);
                callback(null);
            },
            { timeout: 10000, maximumAge: 60000 }
        );
    } else {
        callback(null);
    }
}

function updateConnectionStatus(isConnected) {
    // Connection status footer has been removed - function kept for compatibility
}

function toggleLogoutMode() {
    // Connection status footer has been removed - function kept for compatibility
}

function updateStreakStatus() {
    db.collection('trips')
        .where('userId', '==', currentUser.uid)
        .orderBy('endTime', 'desc')
        .get()
        .then((snapshot) => {
            // Filter to completed trips (with endStop, endStopCode, or endStopName) in JS to avoid Firestore index issues
            const trips = snapshot.docs
                .filter(doc => {
                    const data = doc.data();
                    return data.endStop != null || data.endStopCode != null || data.endStopName != null;
                })
                .map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));

            const streaks = calculateStreaks(trips);

            if (streaks.current > 0) {
                streakStatus.style.display = 'block';
                streakStatus.textContent = `🔥 ${streaks.current} day streak!`;
            } else if (trips.length === 0) {
                // Only show "take your first trip" if user has no trips at all
                streakStatus.style.display = 'block';
                streakStatus.textContent = '⚡ Take your first trip to start tracking!';
            } else {
                // User has trips but no current streak - hide the banner
                streakStatus.style.display = 'none';
            }
        })
        .catch((error) => {
            console.error('Error updating streak:', error);
        });
}

function addSwipeToDelete(element, isTemplate, id) {
    let startX = 0;
    let currentX = 0;
    let isSwiping = false;

    // Add click handler to the existing delete overlay
    const overlay = element.querySelector('.delete-overlay');
    if (overlay) {
        overlay.style.cursor = 'pointer';
        overlay.onclick = () => {
            if (isTemplate) {
                deleteTemplate(id);
            } else {
                deleteTrip(id);
            }
        };
    }

    element.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        isSwiping = true;
    });

    element.addEventListener('touchmove', (e) => {
        if (!isSwiping) return;
        currentX = e.touches[0].clientX;
        const diff = startX - currentX;

        if (diff > 0) {
            element.style.transform = `translateX(-${Math.min(diff, 80)}px)`;
        }
    });

    element.addEventListener('touchend', () => {
        const diff = startX - currentX;

        if (diff > 80) {
            element.style.transform = 'translateX(-80px)';
        } else {
            element.style.transform = 'translateX(0)';
        }

        isSwiping = false;
    });
}

// Load saved theme on startup
loadSavedTheme();

console.log('✅ TransitStats Ready!');
