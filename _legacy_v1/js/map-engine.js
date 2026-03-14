
import { db } from './firebase.js';

// TransitStats Map Engine Module
export const MapEngine = {
    map: null,
    mapTripsData: [],
    mapFilter: 'boarding',
    mapLayers: [],

    init: function (isPublic = false) {
        if (!isPublic && !window.currentUser) return;

        if (isPublic) {
            this.createPublicMap();
        } else {
            this.loadData();
        }
    },

    createPublicMap: function () {
        // Default to Toronto coordinates
        const toronto = [43.6532, -79.3832];

        // Attempt silent IP-based geolocation
        const fetchWithTimeout = (url, timeout = 1000) => {
            return Promise.race([
                fetch(url).then(res => res.json()),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout))
            ]);
        };

        fetchWithTimeout('https://ipapi.co/json/')
            .then(data => {
                if (data && data.latitude && data.longitude) {
                    console.log(`📍 Silent location detected: ${data.city}, ${data.region}`);
                    this.createFullMap([], 0, [data.latitude, data.longitude]);
                } else {
                    this.createFullMap([], 0, toronto);
                }
            })
            .catch(err => {
                console.warn('Geolocation fetch failed or timed out, falling back to Toronto:', err.message);
                this.createFullMap([], 0, toronto);
            });
    },

    loadData: function () {
        if (!window.currentUser) return;

        // Prefer the cached trip data from Trips module to avoid an extra Firestore read.
        // Trips.allCompletedTrips is populated by the real-time snapshot listener.
        if (window.Trips && window.Trips.allCompletedTrips && window.Trips.allCompletedTrips.length > 0) {
            console.log('MapEngine: Reusing cached trip data.');
            const allTrips = window.Trips.allCompletedTrips;
            const trips = allTrips.filter(t => t.boardingLocation || t.exitLocation);
            this.mapTripsData = trips;
            this.createFullMap(trips, allTrips.length);
            return;
        }

        // Fallback: query Firestore (e.g. if map is opened before trips snapshot fires)
        console.log('MapEngine: Querying Firestore for trip data (fallback).');
        db.collection('trips')
            .where('userId', '==', window.currentUser.uid)
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

                this.mapTripsData = trips;
                this.createFullMap(trips, totalTrips);
            })
            .catch((error) => {
                console.error('Error loading map data:', error);
            });
    },

    createFullMap: function (trips, totalTrips, center) {
        const container = document.getElementById('fullMapContainer');
        if (!container) return;

        // Clear existing layers if any
        if (this.mapLayers) {
            this.mapLayers.forEach(l => {
                if (this.map && this.map.hasLayer(l)) this.map.removeLayer(l);
            });
        }
        this.mapLayers = [];

        // Aggregate locations by stop name
        const stopMap = new Map();
        let totalLocations = 0;

        trips.forEach(trip => {
            if ((this.mapFilter === 'boarding' || this.mapFilter === 'both') && trip.boardingLocation) {
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
            if ((this.mapFilter === 'exiting' || this.mapFilter === 'both') && trip.exitLocation) {
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

        // Only show the "No data" placeholder if we're not specifically trying to show a base map (like on the login screen)
        if (locations.length === 0 && !center) {
            container.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary);">
                    <div style="font-size: 1.1em; margin-bottom: 8px; font-weight: 600;">No location data yet</div>
                    <div style="font-size: 0.9em; opacity: 0.7;">Take trips with GPS enabled to see them on the map</div>
                </div>
            `;
            this.updateStats(0, 0, 0, totalTrips);
            return;
        }

        // Initialize or update existing map
        if (this.map) {
            if (center) {
                this.map.setView(center, 13);
            } else if (locations.length > 0) {
                const validLats = locations.map(l => l.lat).filter(l => !isNaN(l));
                const validLons = locations.map(l => l.lon).filter(l => !isNaN(l));
                
                if (validLats.length > 0) {
                    const avgLat = (Math.min(...validLats) + Math.max(...validLats)) / 2;
                    const avgLon = (Math.min(...validLons) + Math.max(...validLons)) / 2;
                    if (!isNaN(avgLat) && !isNaN(avgLon)) { // Ensure calculated center is valid
                        this.map.setView([avgLat, avgLon], 13);
                    }
                }
            }
        } else {
            if (typeof L === 'undefined') {
                console.error('Leaflet is not loaded');
                return;
            }

            const initialCenter = center || [43.6532, -79.3832]; // Default to Toronto if no center and no locations
            this.map = L.map('fullMapContainer', {
                zoomControl: false,
                doubleClickZoom: !center,
                scrollWheelZoom: !center,
                dragging: !center,
                touchZoom: !center,
                tap: !center,
                attributionControl: false
            }).setView(initialCenter, 13);

            if (!center) {
                L.control.zoom({ position: 'bottomright' }).addTo(this.map);
            }
        }

        // Clear existing markers and layers before adding new ones
        this.map.eachLayer(layer => {
            if (layer !== this.baseLayer && layer !== this.transitLayer) {
                this.map.removeLayer(layer);
            }
        });

        const isDark = document.body.getAttribute('data-theme') === 'dark';
        const baseTileUrl = isDark
            ? 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'
            : 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png';

        // Base Layer: Cleaner 'No Labels' version for a more premium look
        this.baseLayer = L.tileLayer(baseTileUrl, {
            subdomains: 'abcd',
            maxZoom: 19,
            className: isDark ? 'map-base-layer-dark' : 'map-base-layer'
        }).addTo(this.map);

        // Transit Routes Overlay: Shows actual colored lines (Subway, Train, etc) 
        // unlike the infrastructure-focused OpenRailwayMap
        this.transitLayer = L.tileLayer('https://tile.memomaps.de/tilegen/{z}/{x}/{y}.png', {
            maxZoom: 18,
            attribution: 'Map &copy; [memomaps.de](https://memomaps.de/); Transit data &copy; [OpenStreetMap](https://www.openstreetmap.org/copyright)',
            className: 'map-transit-layer',
            opacity: isDark ? 0.8 : 0.7  // Higher opacity for visibility
        }).addTo(this.map);

        // Add markers
        locations.forEach(loc => {
            const isBoarding = loc.type === 'boarding';
            const color = isBoarding ? 'var(--accent-electric)' : 'var(--text-muted)';

            L.circleMarker([loc.lat, loc.lon], {
                radius: isBoarding ? 8 : 6,
                fillColor: isBoarding ? '#FFFFFF' : color, // White center for boarding
                fillOpacity: isBoarding ? 1 : 0.6,
                color: color,
                weight: isBoarding ? 4 : 2,
                className: `map-marker-${loc.type}`,
                bubblingMouseEvents: true
            }).addTo(this.map).bindPopup(loc.name);
        });

        // DRAW SPIDER LINES (Limited to prevent UI hang)
        const spiderLayer = L.layerGroup();
        const MAX_SPIDER_LINES = 150;
        let lineCount = 0;

        for (const trip of trips) {
            if (trip.boardingLocation && trip.exitLocation) {
                L.polyline([
                    [trip.boardingLocation.lat, trip.boardingLocation.lng],
                    [trip.exitLocation.lat, trip.exitLocation.lng]
                ], {
                    color: '#6366f1',
                    weight: 1.2,
                    opacity: 0.08,
                    smoothFactor: 2.0,
                    dashArray: '4, 4',
                    interactive: false
                }).addTo(spiderLayer);
                
                lineCount++;
                if (lineCount >= MAX_SPIDER_LINES) break;
            }
        }
        spiderLayer.addTo(this.map);
        this.mapLayers.push(spiderLayer);

        if (locations.length > 1) {
            const bounds = L.latLngBounds(locations.map(l => [l.lat, l.lon]));
            this.map.fitBounds(bounds, { padding: [30, 30], animate: false });
        }

        this.updateStats(trips.length, locations.length, totalLocations, totalTrips);

        // TRIGGER HEATMAP RENDERING (Deferred to prevent thread lock)
        if (window.Visuals) {
            setTimeout(() => {
                Visuals.renderPointHeatmap(trips, this.map);
            }, 100);
        }
    },

    updateStats: function (tripCount, stopCount, locationCount, totalTrips) {
        const tripCountEl = document.getElementById('mapTripCount');
        const locCountEl = document.getElementById('mapLocationCount');
        const coverageEl = document.getElementById('mapCoverage');

        if (tripCountEl) tripCountEl.textContent = `${tripCount} trips`;
        if (locCountEl) locCountEl.textContent = `${stopCount} stops`;

        if (coverageEl) {
            const coverage = totalTrips > 0 ? Math.round((locationCount / totalTrips) * 100) : 0;
            coverageEl.textContent = `${coverage}% GPS coverage`;
        }
    },

    setFilter: function (filter) {
        this.mapFilter = filter;

        const boardingBtn = document.getElementById('filterBoarding');
        const exitingBtn = document.getElementById('filterExiting');
        const bothBtn = document.getElementById('filterBoth');

        if (boardingBtn) boardingBtn.className = filter === 'boarding' ? 'filter-btn active' : 'filter-btn';
        if (exitingBtn) exitingBtn.className = filter === 'exiting' ? 'filter-btn active' : 'filter-btn';
        if (bothBtn) bothBtn.className = filter === 'both' ? 'filter-btn active' : 'filter-btn';

        if (this.mapTripsData.length > 0) {
            this.createFullMap(this.mapTripsData, this.mapTripsData.length);
        }
    },

    locateUser: function () {
        const btn = document.getElementById('locateBtn');
        if (btn) btn.classList.add('locating');

        if (!navigator.geolocation) {
            alert('Geolocation is not supported by your browser');
            if (btn) btn.classList.remove('locating');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;

                if (this.map) {
                    this.map.setView([latitude, longitude], 15);
                    const currentLocMarker = L.circleMarker([latitude, longitude], {
                        radius: 8,
                        fillColor: '#ef4444',
                        color: 'white',
                        weight: 2,
                        opacity: 1,
                        fillOpacity: 0.8
                    }).addTo(this.map);

                    currentLocMarker.bindPopup('You are here').openPopup();
                    setTimeout(() => {
                        this.map.removeLayer(currentLocMarker);
                    }, 10000);
                }
                if (btn) btn.classList.remove('locating');
            },
            (error) => {
                console.error('Geolocation error:', error);
                alert('Unable to get your location');
                if (btn) btn.classList.remove('locating');
            },
        );
    },
    refresh: function () {
        if (this.mapTripsData.length > 0) {
            this.createFullMap(this.mapTripsData, this.mapTripsData.length);
        } else if (this.map && this.map.getCenter()) {
            this.createFullMap([], 0, this.map.getCenter());
        }
    }
};

// Expose to window for legacy compatibility
window.MapEngine = MapEngine;
window.initializeFullMap = MapEngine.init.bind(MapEngine);
window.setMapFilter = MapEngine.setFilter.bind(MapEngine);
window.locateUser = MapEngine.locateUser.bind(MapEngine);
window.refreshMap = MapEngine.refresh.bind(MapEngine);
