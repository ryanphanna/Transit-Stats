
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

        container.innerHTML = '';

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

        // Calculate bounds
        const lats = locations.map(loc => loc.lat);
        const lons = locations.map(loc => loc.lon);
        const avgLat = (Math.min(...lats) + Math.max(...lats)) / 2;
        const avgLon = (Math.min(...lons) + Math.max(...lons)) / 2;

        // Create map
        if (this.map) {
            this.map.remove();
        }

        if (typeof L === 'undefined') {
            console.error('Leaflet is not loaded');
            return;
        }

        this.map = L.map('fullMapContainer', {
            zoomControl: false,
            doubleClickZoom: !center,
            scrollWheelZoom: !center,
            dragging: !center,
            touchZoom: !center,
            tap: !center,
            attributionControl: false
        }).setView(center || [avgLat, avgLon], 13);

        if (!center) {
            L.control.zoom({ position: 'bottomright' }).addTo(this.map);
        }

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

        // DRAW SPIDER LINES
        trips.forEach(trip => {
            if (trip.boardingLocation && trip.exitLocation) {
                const line = L.polyline([
                    [trip.boardingLocation.lat, trip.boardingLocation.lng],
                    [trip.exitLocation.lat, trip.exitLocation.lng]
                ], {
                    color: '#6366f1', // Electric Indigo
                    weight: 1.5,
                    opacity: 0.1,
                    smoothFactor: 1.5,
                    dashArray: '4, 4' // Dashed lines look cleaner for transit connections
                }).addTo(this.map);
                this.mapLayers.push(line);
            }
        });

        if (locations.length > 1) {
            const bounds = L.latLngBounds(locations.map(l => [l.lat, l.lon]));
            this.map.fitBounds(bounds, { padding: [30, 30] });
        }

        this.updateStats(trips.length, locations.length, totalLocations, totalTrips);

        // TRIGGER HEATMAP RENDERING (Including Local Taps)
        if (window.Visuals) {
            Visuals.renderPointHeatmap(trips, this.map);
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
