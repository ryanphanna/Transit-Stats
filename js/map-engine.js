import { UI } from './ui-utils.js';
import { PredictionEngine } from './predict.js';

/**
 * TransitStats V2 Map Engine
 * Handles Leaflet integration and geospatial visualization of trip data.
 */
export const MapEngine = {
    map: null,
    trips: [],
    filter: 'boarding', // 'boarding', 'exiting', 'both'
    layers: {
        base: null,
        transit: null,
        markers: null
    },

    init(initialTrips = []) {
        this.trips = initialTrips;
        if (this.map) return;

        const container = document.getElementById('main-map');
        if (!container) {
            console.error("MapEngine: main-map container not found.");
            return;
        }

        // Avoid Leaflet error if container already initialized
        if (container._leaflet_id) return;

        console.log("MapEngine: Initializing...");
        
        // Default to Toronto
        const center = [43.6532, -79.3832];
        
        try {
            this.map = L.map('main-map', {
                zoomControl: false,
                attributionControl: false
            }).setView(center, 13);

            // Add Zoom Control to Bottom Right
            L.control.zoom({ position: 'bottomright' }).addTo(this.map);

            this.setupLayers();
            this.renderMarkers();
            this.setupControls();
        } catch (err) {
            console.error("MapEngine: Failed to initialize Leaflet:", err);
        }
    },

    setupLayers() {
        // Base Layer (CartoDB Positron - Light/Dark based on theme)
        const isDark = document.body.classList.contains('dark');
        const tileUrl = isDark 
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

        this.layers.base = L.tileLayer(tileUrl, {
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(this.map);

        // Transit Overlay (Memomaps)
        this.layers.transit = L.tileLayer('https://tile.memomaps.de/tilegen/{z}/{x}/{y}.png', {
            maxZoom: 18,
            opacity: 0.6
        }).addTo(this.map);

        this.layers.markers = L.layerGroup().addTo(this.map);
    },

    setupControls() {
        const pills = document.querySelectorAll('.map-controls .pill');
        pills.forEach(pill => {
            pill.addEventListener('click', () => {
                pills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                this.filter = pill.dataset.filter;
                this.renderMarkers();
            });
        });

        const btnLocate = document.getElementById('btn-locate');
        if (btnLocate) {
            btnLocate.addEventListener('click', () => this.locateUser());
        }
    },

    updateTrips(newTrips) {
        this.trips = newTrips;
        if (this.map) this.renderMarkers();
    },

    _getStopLocation(stopName) {
        if (!stopName) return null;
        // Search in PredictionEngine's library
        const stop = PredictionEngine.stopsLibrary.find(s => 
            PredictionEngine._stopMatch(s.name, stopName)
        );
        
        if (stop && stop.lat && (stop.lng || stop.lon)) {
            return {
                lat: stop.lat,
                lng: stop.lng || stop.lon
            };
        }
        return null;
    },

    renderMarkers() {
        if (!this.map || !this.layers.markers) return;
        this.layers.markers.clearLayers();

        const points = [];

        this.trips.forEach(trip => {
            // Process Boarding
            let bLoc = trip.boardingLocation;
            if (!bLoc || isNaN(bLoc.lat)) {
                bLoc = this._getStopLocation(trip.startStopName || trip.startStop);
            }

            if ((this.filter === 'boarding' || this.filter === 'both') && bLoc) {
                points.push({
                    lat: bLoc.lat,
                    lng: bLoc.lng,
                    type: 'boarding',
                    label: `Boarded ${trip.route} at ${trip.startStopName || trip.startStop}`
                });
            }

            // Process Exiting
            let eLoc = trip.exitLocation;
            if (!eLoc || isNaN(eLoc.lat)) {
                eLoc = this._getStopLocation(trip.endStopName || trip.endStop);
            }

            if ((this.filter === 'exiting' || this.filter === 'both') && eLoc) {
                points.push({
                    lat: eLoc.lat,
                    lng: eLoc.lng,
                    type: 'exiting',
                    label: `Exited ${trip.route} at ${trip.endStopName || trip.endStop}`
                });
            }
        });

        points.forEach(p => {
            if (isNaN(p.lat) || isNaN(p.lng)) return;
            const color = p.type === 'boarding' ? '#4f46e5' : '#10b981';
            L.circleMarker([p.lat, p.lng], {
                radius: 6,
                fillColor: color,
                color: '#fff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(this.layers.markers).bindPopup(p.label);
        });

        // Fit bounds if markers exist
        const validPoints = points.filter(p => !isNaN(p.lat) && !isNaN(p.lng));
        if (validPoints.length > 0) {
            try {
                const bounds = L.latLngBounds(validPoints.map(p => [p.lat, p.lng]));
                this.map.fitBounds(bounds, { padding: [40, 40] });
            } catch (err) {
                console.warn("MapEngine: Fit bounds failed", err);
            }
        }
    },

    locateUser() {
        if (!navigator.geolocation) {
            UI.showNotification("Geolocation not supported by this browser.");
            return;
        }

        navigator.geolocation.getCurrentPosition(pos => {
            const { latitude, longitude } = pos.coords;
            this.map.setView([latitude, longitude], 15);

            L.circleMarker([latitude, longitude], {
                radius: 10,
                fillColor: '#ef4444',
                color: '#fff',
                weight: 3,
                opacity: 1,
                fillOpacity: 0.5
            }).addTo(this.map).bindPopup("You are here").openPopup();
        }, err => {
            UI.showNotification("Could not get location: " + err.message);
        });
    }
};
