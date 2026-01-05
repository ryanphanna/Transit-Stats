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

// --- DEV: AUTH BYPASS FOR UI VERIFICATION ---
// Mimic a user so we can see the internal UI
setTimeout(() => {
    console.log('🔓 Dev Bypass: Forcing App Show');
    currentUser = { uid: 'dev-preview', email: 'dev@preview.com' };
    showApp();
    // Populate some dummy data for visuals
    document.getElementById('statsTotalTrips').innerText = '124';
    document.getElementById('statsUniqueRoutes').innerText = '8';
    document.getElementById('statsTotalTime').innerText = '42.5';
    document.getElementById('statsUniqueStops').innerText = '15';

    // Mock Top Routes content to verify grid
    const topRoutesHTML = `
                <div style="display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid var(--border-light);">
                    <span>🚌 504 King</span>
                    <strong>45 trips</strong>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 10px;">
                    <span>🚌 501 Queen</span>
                    <strong>22 trips</strong>
                </div>
            `;
    document.getElementById('topRoutesList').innerHTML = topRoutesHTML;
    document.getElementById('topStopsList').innerHTML = topRoutesHTML.replace(/504 King/g, 'King St W').replace(/501 Queen/g, 'Queen St E');

}, 1000);
// --------------------------------------------

let currentUser = null;
let activeTrip = null;
let currentStatsView = '30days';
let logoutModeActive = false;
let statsInitialized = false;
let map = null;
let mapMode = 'boarding';
let mapInitialized = false;

// DOM Elements
const authSection = document.getElementById('authSection');
const appContent = document.getElementById('appContent');
const profileSection = document.getElementById('profileSection');
const statsSection = document.getElementById('statsSection');
const mapsSection = document.getElementById('mapsSection');
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



// Authentication State Management
auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    try {
        if (user) {
            // Check if user is in the allowedUsers whitelist
            const allowedUsersRef = db.collection('allowedUsers');
            const querySnapshot = await allowedUsersRef.where('email', '==', user.email).get();

            if (querySnapshot.empty) {
                await auth.signOut();
                alert('Access denied. This app is invite-only.');
                return;
            }

            console.log('✅ User authenticated:', user.email);
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
    profileSection.style.display = 'block';
    startSection.style.display = 'none';
    updateTripIndicator();
    updateProfileStats();
    loadProfileTrips();
}

function showStats() {
    hideAllSections();
    statsSection.style.display = 'block';
    startSection.style.display = 'none';
    updateTripIndicator();

    if (!statsInitialized) {
        initializeStatsToggle();
        statsInitialized = true;
    }

    updateStatsSection();
    // loadCommunityData(); // Removed per user request
}

function showMaps() {
    hideAllSections();
    mapsSection.style.display = 'block';
    startSection.style.display = 'none';
    updateTripIndicator();

    if (!mapInitialized) {
        initializeMap();
    } else {
        loadMapData();
    }
}

function hideAllSections() {
    profileSection.style.display = 'none';
    statsSection.style.display = 'none';
    mapsSection.style.display = 'none';
}

function goHome() {
    hideAllSections();
    if (activeTrip) {
        showActiveSection();
    } else {
        showStartSection();
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
            locations.push([trip.boardingLocation.lat, trip.boardingLocation.lon]);
        }
        if (trip.exitLocation) {
            locations.push([trip.exitLocation.lat, trip.exitLocation.lon]);
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
                    lon: trip.boardingLocation.lon,
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
                    lon: trip.exitLocation.lon,
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
            const boardingMarker = L.marker([trip.boardingLocation.lat, trip.boardingLocation.lon])
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
            const alightingMarker = L.marker([trip.exitLocation.lat, trip.exitLocation.lon])
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

function setMapMode(mode) {
    mapMode = mode;

    document.getElementById('boardingToggle').className = mode === 'boarding' ? 'toggle-btn active' : 'toggle-btn';
    document.getElementById('alightingToggle').className = mode === 'alighting' ? 'toggle-btn active' : 'toggle-btn';
    document.getElementById('markersToggle').className = mode === 'markers' ? 'toggle-btn active' : 'toggle-btn';

    document.getElementById('mapLegend').style.display = (mode === 'boarding' || mode === 'alighting') ? 'flex' : 'none';

    if (mapInitialized) {
        loadMapData();
    }
}

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
    if (!logoutModeActive) {
        connectionStatus.textContent = 'Log Out';
        connectionStatus.classList.add('logout-mode');
        logoutModeActive = true;

        setTimeout(() => {
            if (logoutModeActive) {
                connectionStatus.textContent = '🟢 Connected';
                connectionStatus.classList.remove('logout-mode');
                logoutModeActive = false;
            }
        }, 3000);
    } else {
        signOut();
    }
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
            alert('Profile saved!');
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
            // loadCommunityData();
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
            // loadCommunityData();
        }
    });
}

function exportTripsToCSV() {
    if (!currentUser) {
        alert('Please sign in to export your trips.');
        return;
    }

    const exportBtn = document.getElementById('exportCsvBtn');
    const originalContent = exportBtn.innerHTML;
    exportBtn.innerHTML = '<span style="font-size: 1em;">⏳</span> Exporting...';
    exportBtn.disabled = true;

    let query = db.collection('trips').where('userId', '==', currentUser.uid);

    if (currentStatsView === '30days') {
        const dateFilter = new Date();
        dateFilter.setDate(dateFilter.getDate() - 30);
        query = query.where('startTime', '>=', firebase.firestore.Timestamp.fromDate(dateFilter));
    }

    query.orderBy('startTime', 'desc').get()
        .then((snapshot) => {
            const trips = [];
            snapshot.forEach((doc) => {
                trips.push(doc.data());
            });

            if (trips.length === 0) {
                alert('No trips to export.');
                exportBtn.innerHTML = originalContent;
                exportBtn.disabled = false;
                return;
            }

            // CSV header
            const headers = ['Date', 'Route', 'Start Stop', 'End Stop', 'Duration (min)', 'Start Time', 'End Time'];

            // Convert trips to CSV rows
            const rows = trips.map(trip => {
                const startDate = trip.startTime?.toDate ? trip.startTime.toDate() : new Date(trip.startTime);
                const endDate = trip.endTime?.toDate ? trip.endTime.toDate() : (trip.endTime ? new Date(trip.endTime) : null);

                const dateStr = startDate.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
                const startTimeStr = startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                const endTimeStr = endDate ? endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';

                return [
                    dateStr,
                    escapeCsvField(trip.route || ''),
                    escapeCsvField(trip.startStop || ''),
                    escapeCsvField(trip.endStop || ''),
                    trip.duration || '',
                    startTimeStr,
                    endTimeStr
                ];
            });

            // Build CSV content
            const csvContent = [
                headers.join(','),
                ...rows.map(row => row.join(','))
            ].join('\n');

            // Create and download file
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const today = new Date().toISOString().split('T')[0];
            const filename = `transit-trips-${today}.csv`;

            // Use standard download pattern that works on mobile Safari
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            exportBtn.innerHTML = originalContent;
            exportBtn.disabled = false;
        })
        .catch((error) => {
            console.error('Error exporting trips:', error);
            alert('Error exporting trips. Please try again.');
            exportBtn.innerHTML = originalContent;
            exportBtn.disabled = false;
        });
}

function escapeCsvField(field) {
    if (field === null || field === undefined) return '';
    const str = String(field);
    // Escape fields containing commas, quotes, or newlines
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
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
                if (t.startStop) stops.add(t.startStop);
                if (t.endStop) stops.add(t.endStop);
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
                    if (t.startStop) stops.add(t.startStop);
                    if (t.endStop) stops.add(t.endStop);
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

    console.log('🔍 Loading profile trips for user:', currentUser.uid);

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
        return `
                    <div class="trip-item" data-trip-id="${trip.id}">
                        <div class="delete-overlay">Delete</div>
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div><strong>${trip.route || 'Unknown Route'}</strong>${agencyDisplay}${sourceBadge}</div>
                            ${verifiedBadge}
                        </div>
                        <div>${trip.startStopName || trip.startStop || trip.startStopCode || 'Unknown'} → ${trip.endStopName || trip.endStop || trip.endStopCode || 'Unknown'}</div>
                        <div>${trip.duration || 0} min • ${startTime.toLocaleDateString()}</div>
                    </div>
                `;
    }).join('');

    profileTripsList.innerHTML = tripsHtml;

    profileTripsList.querySelectorAll('.trip-item').forEach(item => {
        const tripId = item.getAttribute('data-trip-id');
        addSwipeToDelete(item, false, tripId);
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
        .slice(0, 5);

    const topRoutesHtml = sortedRoutes.length > 0 ?
        sortedRoutes.map(([route, count], index) =>
            `<div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid var(--border-light);">
                        <span>${index + 1}. ${route}</span>
                        <span style="color: var(--accent-primary); font-weight: 600;">${count} trips</span>
                    </div>`
        ).join('') :
        '<div style="color: var(--text-muted); font-style: italic;">No trips yet</div>';

    document.getElementById('topRoutesList').innerHTML = topRoutesHtml;
}

function generateTopStops(trips) {
    const stopCounts = {};
    trips.forEach(trip => {
        const startStop = trip.startStop || 'Unknown';
        const endStop = trip.endStop || 'Unknown';
        stopCounts[startStop] = (stopCounts[startStop] || 0) + 1;
        stopCounts[endStop] = (stopCounts[endStop] || 0) + 1;
    });

    const sortedStops = Object.entries(stopCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

    const topStopsHtml = sortedStops.length > 0 ?
        sortedStops.map(([stop, count], index) =>
            `<div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid var(--border-light);">
                        <span>${index + 1}. ${stop}</span>
                        <span style="color: var(--accent-primary); font-weight: 600;">${count} uses</span>
                    </div>`
        ).join('') :
        '<div style="color: var(--text-muted); font-style: italic;">No trips yet</div>';

    document.getElementById('topStopsList').innerHTML = topStopsHtml;
}

function loadCommunityData() {
    const dateFilter = new Date();
    if (currentStatsView === '30days') {
        dateFilter.setDate(dateFilter.getDate() - 30);
    } else {
        dateFilter.setFullYear(dateFilter.getFullYear() - 10);
    }

    db.collection('trips')
        .where('startTime', '>=', firebase.firestore.Timestamp.fromDate(dateFilter))
        .get()
        .then((snapshot) => {
            const allTrips = [];
            const userTrips = [];

            snapshot.forEach((doc) => {
                const trip = doc.data();
                allTrips.push(trip);
                if (trip.userId === currentUser.uid) {
                    userTrips.push(trip);
                }
            });

            const totalUsers = new Set(allTrips.map(t => t.userId)).size;
            const userRank = calculateUserRank(userTrips.length, allTrips);
            const avgTripsPerUser = totalUsers > 0 ? Math.round(allTrips.length / totalUsers * 10) / 10 : 0;

            const timeLabel = currentStatsView === '30days' ? '30 days' : 'all time';

            const communityHtml = `
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                            <div style="text-align: center; padding: 15px; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border-color);">
                                <div style="font-size: 1.8em; font-weight: bold; color: var(--accent-primary);">${userTrips.length}</div>
                                <div style="font-size: 0.9em; color: var(--text-secondary);">Your trips (${timeLabel})</div>
                            </div>
                            <div style="text-align: center; padding: 15px; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border-color);">
                                <div style="font-size: 1.8em; font-weight: bold; color: var(--accent-primary);">#${userRank}</div>
                                <div style="font-size: 0.9em; color: var(--text-secondary);">Your rank</div>
                            </div>
                            <div style="text-align: center; padding: 15px; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border-color);">
                                <div style="font-size: 1.8em; font-weight: bold; color: var(--accent-primary);">${totalUsers}</div>
                                <div style="font-size: 0.9em; color: var(--text-secondary);">Total users</div>
                            </div>
                            <div style="text-align: center; padding: 15px; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border-color);">
                                <div style="font-size: 1.8em; font-weight: bold; color: var(--accent-primary);">${avgTripsPerUser}</div>
                                <div style="font-size: 0.9em; color: var(--text-secondary);">Avg trips/user</div>
                            </div>
                        </div>
                    `;

            document.getElementById('communityStats').innerHTML = communityHtml;
        })
        .catch((error) => {
            console.error('Error loading community data:', error);
            document.getElementById('communityStats').innerHTML = '<div style="color: var(--text-muted); font-style: italic;">Unable to load community data</div>';
        });
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

function startFromTemplate(route, startStop) {
    stopInput.value = startStop;
    routeInput.value = route;
    updateStartButton();

    stopInput.style.background = '#e8f5e8';
    routeInput.style.background = '#e8f5e8';

    setTimeout(() => {
        stopInput.style.background = '';
        routeInput.style.background = '';
    }, 500);

    startBtn.focus();
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
        .catch((error) => {
            if (error.code === 'auth/user-not-found') {
                // Auto-create account if user doesn't exist
                auth.createUserWithEmailAndPassword(email, password)
                    .then(() => {
                        console.log('✅ Account created successfully');
                    })
                    .catch((createError) => {
                        showAuthError(getAuthErrorMessage(createError.code));
                        signInBtn.disabled = false;
                        signInBtn.textContent = 'Sign In';
                    });
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
magicLinkBtn.addEventListener('click', () => {
    const email = emailInput.value.trim();

    const actionCodeSettings = {
        url: 'https://ryanphanna.github.io/Transit-Stats/',
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

// Initialize app on authentication
function initializeApp() {
    loadTemplates();
    checkActiveTrip();
    loadLastTrip();
    loadTrips();
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
                    stopInput.value = lastTrip.startStop;
                    routeInput.value = lastTrip.route;
                    updateStartButton();

                    stopInput.style.background = '#e8f5e8';
                    routeInput.style.background = '#e8f5e8';

                    setTimeout(() => {
                        stopInput.style.background = '';
                        routeInput.style.background = '';
                    }, 500);

                    startBtn.focus();
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
    const recentTripsSection = document.getElementById('recentTripsSection');
    const recentTripsList = document.getElementById('recentTripsList');

    db.collection('trips')
        .where('userId', '==', currentUser.uid)
        .where('endStop', '!=', null)
        .orderBy('endTime', 'desc')
        .limit(5)
        .get()
        .then((snapshot) => {
            if (!snapshot.empty) {
                recentTripsSection.style.display = 'block';
                recentTripsList.innerHTML = '';

                snapshot.forEach((doc) => {
                    const trip = doc.data();
                    const endTime = trip.endTime ? trip.endTime.toDate() : new Date();
                    const dateStr = endTime.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric'
                    });
                    const duration = trip.duration || 0;

                    const startStop = trip.startStopName || trip.startStop || trip.startStopCode || 'Unknown';
                    const endStop = trip.endStopName || trip.endStop || trip.endStopCode || 'Unknown';
                    const agencyDisplay = trip.agency ? ` • ${trip.agency}` : '';
                    const verifiedBadge = trip.source === 'sms'
                        ? (trip.verified
                            ? '<span class="verified-badge verified">✓</span>'
                            : '<span class="verified-badge unverified">?</span>')
                        : '';

                    const tripDiv = document.createElement('div');
                    tripDiv.className = 'trip-item';
                    tripDiv.innerHTML = `
                                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                    <div>
                                        <div style="font-weight: 600; color: var(--text-primary);">${trip.route}<span class="agency-badge">${agencyDisplay}</span></div>
                                        <div style="font-size: 0.9em; color: var(--text-secondary);">${startStop} → ${endStop}</div>
                                    </div>
                                    <div style="text-align: right;">
                                        <div style="font-size: 0.85em; color: var(--text-muted);">${dateStr} ${verifiedBadge}</div>
                                        <div style="font-size: 0.85em; color: var(--text-secondary);">${duration} min</div>
                                    </div>
                                </div>
                            `;
                    recentTripsList.appendChild(tripDiv);
                });
            } else {
                recentTripsSection.style.display = 'none';
            }
        })
        .catch((error) => {
            console.error('Error loading trips:', error);
            recentTripsSection.style.display = 'none';
        });
}

// Load unverified SMS trips for review (Real-time Inbox)
function loadUnverifiedTrips() {
    const reviewTripsSection = document.getElementById('reviewTripsSection');
    const reviewTripsList = document.getElementById('reviewTripsList');
    const unverifiedCount = document.getElementById('unverifiedCount');

    // Use onSnapshot for real-time updates when new SMS trips arrive
    db.collection('trips')
        .where('userId', '==', currentUser.uid)
        .where('verified', '==', false)
        .where('source', '==', 'sms')
        .orderBy('startTime', 'desc')
        .limit(10)
        .onSnapshot((snapshot) => {
            if (!snapshot.empty) {
                reviewTripsSection.style.display = 'block';
                unverifiedCount.textContent = `${snapshot.size} new match${snapshot.size === 1 ? '' : 'es'}`;
                reviewTripsList.innerHTML = '';

                snapshot.forEach((doc) => {
                    const trip = { id: doc.id, ...doc.data() };
                    const startTime = trip.startTime ? trip.startTime.toDate() : new Date();
                    // Relative time (e.g., "5 mins ago")
                    const timeDiff = Math.floor((new Date() - startTime) / 60000);
                    let timeStr = timeDiff < 1 ? 'Just now' : `${timeDiff} mins ago`;
                    if (timeDiff > 60) timeStr = startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    const startStop = trip.startStopCode || trip.startStopName || trip.startStop || 'Unknown';
                    const endStop = trip.endStopCode || trip.endStopName || trip.endStop || 'In Progress';
                    const agency = trip.agency || 'TTC';

                    const tripDiv = document.createElement('div');
                    tripDiv.className = 'trip-item review-inbox-item';
                    tripDiv.innerHTML = `
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <span style="font-size: 1.2em;">💬</span>
                                        <span class="badge badge-warning">Needs Verification</span>
                                    </div>
                                    <div style="font-size: 0.85em; color: var(--text-muted);">${timeStr}</div>
                                </div>
                                
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div>
                                        <div style="font-weight: 600; font-size: 1.1em; color: var(--text-primary); margin-bottom: 2px;">
                                            ${trip.route} <span style="font-weight: 400; color: var(--text-secondary);">• ${agency}</span>
                                        </div>
                                        <div style="font-size: 0.9em; color: var(--text-secondary);">
                                            ${startStop} <span style="color: var(--accent-primary);">➜</span> ${endStop}
                                        </div>
                                    </div>
                                    <button class="btn btn-primary btn-verify-pulse" style="padding: 8px 16px; font-size: 0.95em;">
                                        Verify Stop 📍
                                    </button>
                                </div>
                            `;

                    tripDiv.querySelector('.btn-verify-pulse').addEventListener('click', (e) => {
                        e.stopPropagation();
                        openAddStopModal(trip);
                    });

                    reviewTripsList.appendChild(tripDiv);
                });
            } else {
                reviewTripsSection.style.display = 'none';
            }
        }, (error) => {
            console.error('Error listening to unverified trips:', error);
            reviewTripsSection.style.display = 'none';
        });
}

// Open modal to add a stop
function openAddStopModal(trip) {
    const modal = document.getElementById('addStopModal');
    const stopCodeInput = document.getElementById('addStopCode');
    const stopNameInput = document.getElementById('addStopName');
    const agencySelect = document.getElementById('addStopAgency');
    const tripIdInput = document.getElementById('addStopTripId');
    const latInput = document.getElementById('addStopLat');
    const lngInput = document.getElementById('addStopLng');

    // Pre-fill with trip data
    tripIdInput.value = trip.id;
    stopCodeInput.value = trip.startStopCode || '';
    stopNameInput.value = trip.startStopName || trip.startStop || '';
    agencySelect.value = trip.agency || 'TTC';
    latInput.value = '';
    lngInput.value = '';

    // If trip has boarding location, use it
    if (trip.boardingLocation && trip.boardingLocation.lat) {
        latInput.value = trip.boardingLocation.lat;
        lngInput.value = trip.boardingLocation.lng;
    }

    modal.style.display = 'block';
}

// Close add stop modal
document.getElementById('cancelStopBtn').addEventListener('click', () => {
    document.getElementById('addStopModal').style.display = 'none';
});

// Use current location for stop
document.getElementById('useCurrentLocationBtn').addEventListener('click', () => {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                document.getElementById('addStopLat').value = position.coords.latitude.toFixed(6);
                document.getElementById('addStopLng').value = position.coords.longitude.toFixed(6);
            },
            (error) => {
                console.error('Error getting location:', error);
                alert('Could not get your location. Please enter coordinates manually.');
            }
        );
    } else {
        alert('Geolocation not supported by your browser.');
    }
});

// Save stop and verify trip
document.getElementById('saveStopBtn').addEventListener('click', async () => {
    const tripId = document.getElementById('addStopTripId').value;
    const stopCode = document.getElementById('addStopCode').value.trim() || null;
    const stopName = document.getElementById('addStopName').value.trim();
    const agency = document.getElementById('addStopAgency').value;
    const lat = parseFloat(document.getElementById('addStopLat').value);
    const lng = parseFloat(document.getElementById('addStopLng').value);

    if (!stopName && !stopCode) {
        alert('Please enter a stop name or code.');
        return;
    }
    if (isNaN(lat) || isNaN(lng)) {
        alert('Please enter valid coordinates.');
        return;
    }

    const saveBtn = document.getElementById('saveStopBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
        // Add stop to database
        const stopData = {
            stopCode: stopCode,
            stopName: stopName,
            lat: lat,
            lng: lng,
            agency: agency,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: currentUser.uid
        };

        await db.collection('stops').add(stopData);

        // Update trip as verified with location
        await db.collection('trips').doc(tripId).update({
            verified: true,
            boardingLocation: { lat: lat, lng: lng }
        });

        document.getElementById('addStopModal').style.display = 'none';
        saveBtn.disabled = false;
        saveBtn.textContent = 'Add Stop & Verify Trip';

        // Reload unverified trips
        loadUnverifiedTrips();
        loadTrips();
    } catch (error) {
        console.error('Error saving stop:', error);
        alert('Error saving stop. Please try again.');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Add Stop & Verify Trip';
    }
});

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
                showStartSection();
                updateActiveTripBanner();
            }
        })
        .catch((error) => {
            console.error('Error checking active trip:', error);
            showStartSection();
        });
}

function showStartSection() {
    startSection.style.display = 'block';
    activeSection.style.display = 'none';
}

function showActiveSection() {
    startSection.style.display = 'none';
    activeSection.style.display = 'block';

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
startBtn.addEventListener('click', () => {
    const stop = stopInput.value.trim();
    const route = routeInput.value.trim();

    if (!stop || !route) {
        alert('Please enter both stop and route');
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
        const tripData = {
            userId: currentUser.uid,
            route: route,
            startStop: stop,
            endStop: null,
            startTime: firebase.firestore.Timestamp.now(),
            boardingLocation: location
        };

        db.collection('trips').add(tripData)
            .then((docRef) => {
                activeTrip = { id: docRef.id, ...tripData };
                stopInput.value = '';
                routeInput.value = '';
                startBtn.disabled = false;
                startBtn.textContent = 'Board Vehicle';
                showActiveSection();
                updateActiveTripBanner();
                trackRouteStopUsage(route, stop);
            })
            .catch((error) => {
                console.error('Error starting trip:', error);

                // Provide specific error messages
                let errorMessage = 'Error starting trip. ';

                if (error.code === 'permission-denied') {
                    errorMessage += 'You do not have permission to save trips. Please check your account settings.';
                } else if (error.code === 'unavailable') {
                    errorMessage += 'Cannot connect to the server. Please check your internet connection and try again.';
                } else if (error.code === 'unauthenticated') {
                    errorMessage += 'You must be signed in. Please refresh the page and try again.';
                } else if (error.message && error.message.includes('quota')) {
                    errorMessage += 'Storage quota exceeded. Please contact support.';
                } else if (error.message) {
                    errorMessage += error.message;
                } else {
                    errorMessage += 'Please try again.';
                }

                alert(errorMessage);
                startBtn.disabled = false;
                startBtn.textContent = 'Board Vehicle';
            });
    });
});

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

        const updateData = {
            endStop: exitStop,
            endTime: firebase.firestore.Timestamp.now(),
            exitLocation: location,
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
        locationStatus.textContent = '📍 Getting location...';

        navigator.geolocation.getCurrentPosition(
            (position) => {
                locationStatus.textContent = '📍 Location enabled';
                callback({
                    lat: position.coords.latitude,
                    lon: position.coords.longitude
                });
            },
            (error) => {
                console.log('Location error:', error.message);
                locationStatus.textContent = '📍 Location unavailable';
                callback(null);
            },
            { timeout: 10000, maximumAge: 60000 }
        );
    } else {
        locationStatus.textContent = '📍 Location not supported';
        callback(null);
    }
}

function updateConnectionStatus(isConnected) {
    if (isConnected) {
        authStatus.textContent = currentUser ? currentUser.email : '';
        connectionStatus.textContent = '🟢 Connected';
        connectionStatus.style.cursor = 'pointer';
        connectionStatus.onclick = toggleLogoutMode;
    } else {
        authStatus.textContent = '';
        connectionStatus.textContent = '🔴 Sign in required';
        connectionStatus.style.cursor = 'default';
        connectionStatus.onclick = null;
    }
}

function toggleLogoutMode() {
    logoutModeActive = !logoutModeActive;

    if (logoutModeActive) {
        connectionStatus.textContent = '⚠️ Tap again to logout';
        connectionStatus.style.background = 'var(--error)';
        connectionStatus.style.color = 'white';

        setTimeout(() => {
            if (logoutModeActive) {
                logoutModeActive = false;
                connectionStatus.textContent = '🟢 Connected';
                connectionStatus.style.background = '';
                connectionStatus.style.color = '';
            }
        }, 3000);
    } else {
        auth.signOut();
    }
}

function updateStreakStatus() {
    db.collection('trips')
        .where('userId', '==', currentUser.uid)
        .where('endStop', '!=', null)
        .orderBy('endStop')
        .orderBy('endTime', 'desc')
        .get()
        .then((snapshot) => {
            const trips = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            const streaks = calculateStreaks(trips);

            if (streaks.current > 0) {
                streakStatus.style.display = 'block';
                streakStatus.textContent = `🔥 ${streaks.current} day streak!`;
            } else {
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
