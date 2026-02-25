
import { db } from './firebase.js';

// TransitStats Map Engine Module
export const MapEngine = {
    map: null,
    mapTripsData: [],
    mapFilter: 'boarding',
    mapLayers: [],

    init: function () {
        if (!window.currentUser) return;
        this.loadData();
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

    createFullMap: function (trips, totalTrips) {
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

        if (locations.length === 0) {
            container.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary);">
                    <div style="font-size: 3em; margin-bottom: 15px;">🗺️</div>
                    <div style="font-size: 1.1em; margin-bottom: 8px;">No location data yet</div>
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
            doubleClickZoom: true,
            scrollWheelZoom: true,
            dragging: true,
            touchZoom: true,
            tap: false
        }).setView([avgLat, avgLon], 12);

        L.control.zoom({ position: 'bottomright' }).addTo(this.map);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap © CartoDB',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(this.map);

        // Add markers
        locations.forEach(loc => {
            const isBoarding = loc.type === 'boarding';
            const icon = L.divIcon({
                className: 'custom-marker',
                html: `<div style="width: 12px; height: 12px; border-radius: 50%; background: ${isBoarding ? '#1e293b' : '#64748b'}; border: 2px solid white; box-shadow: 0 0 0 1px #1e293b; cursor: pointer;"></div>`,
                iconSize: [12, 12],
                iconAnchor: [6, 6]
            });

            const marker = L.marker([loc.lat, loc.lon], { icon: icon });
            const tripText = loc.count === 1 ? 'Trip' : 'Trips';
            const routesBadges = Array.from(loc.routes).map(r => `<span style="background: var(--bg-primary); padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700; color: var(--text-primary); border: 1px solid var(--border-color);">${r}</span>`).join(' ');

            const popupContent = `
                <div style="padding: 4px;">
                    <div style="font-weight: 800; font-size: 14px; margin-bottom: 4px; color: var(--text-primary);">${loc.stop}</div>
                    <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 8px;">${loc.count} ${tripText} ${isBoarding ? 'Boarded' : 'Exited'}</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px;">${routesBadges}</div>
                </div>`;

            marker.bindPopup(popupContent, { closeButton: false, className: 'minimal-popup' });
            marker.addTo(this.map);
            this.mapLayers.push(marker);
        });

        // DRAW SPIDER LINES
        trips.forEach(trip => {
            if (trip.boardingLocation && trip.exitLocation) {
                const line = L.polyline([
                    [trip.boardingLocation.lat, trip.boardingLocation.lng],
                    [trip.exitLocation.lat, trip.exitLocation.lng]
                ], {
                    color: '#1e293b',
                    weight: 2,
                    opacity: 0.15,
                    smoothFactor: 1
                }).addTo(this.map);
                this.mapLayers.push(line);
            }
        });

        if (locations.length > 1) {
            const bounds = L.latLngBounds(locations.map(l => [l.lat, l.lon]));
            this.map.fitBounds(bounds, { padding: [30, 30] });
        }

        this.updateStats(trips.length, locations.length, totalLocations, totalTrips);
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

                    currentLocMarker.bindPopup('📍 You are here').openPopup();
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
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
    }
};

// Expose to window for legacy compatibility
window.MapEngine = MapEngine;
window.initializeFullMap = MapEngine.init.bind(MapEngine);
window.setMapFilter = MapEngine.setFilter.bind(MapEngine);
window.locateUser = MapEngine.locateUser.bind(MapEngine);
