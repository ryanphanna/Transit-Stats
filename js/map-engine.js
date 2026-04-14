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
    _stopLookup: new Map(),
    _hasIndexedStops: false,
    _lastRenderedCount: 0,
    _isFirstLoad: true,

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

        this.layers.transit = null;

        // Marker Cluster Group - much faster for large datasets
        if (window.L.markerClusterGroup) {
            this.layers.markers = L.markerClusterGroup({
                showCoverageOnHover: false,
                maxClusterRadius: 40,
                spiderfyOnMaxZoom: true
            }).addTo(this.map);
        } else {
            this.layers.markers = L.layerGroup().addTo(this.map);
        }
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

    /**
     * Build an O(1) lookup Map for stop locations from the stopsLibrary.
     * Dramatically improves performance over linear searching.
     */
    _rebuildStopIndex() {
        if (!PredictionEngine.stopsLibrary || PredictionEngine.stopsLibrary.length === 0) return;
        
        console.log(`MapEngine: Reindexing ${PredictionEngine.stopsLibrary.length} stops...`);
        this._stopLookup.clear();
        
        PredictionEngine.stopsLibrary.forEach(stop => {
            if (!stop.lat || (!stop.lng && !stop.lon)) return;
            const loc = { lat: stop.lat, lng: stop.lng || stop.lon };
            
            // Index by canonical name
            const canon = PredictionEngine._canonicalizeStop(stop.name);
            if (canon) this._stopLookup.set(canon, loc);
            
            // Index by aliases
            if (stop.aliases) {
                stop.aliases.forEach(alias => {
                    const cAlias = PredictionEngine._canonicalizeStop(alias);
                    if (cAlias) this._stopLookup.set(cAlias, loc);
                });
            }

            // Index by code
            if (stop.code) {
                const cCode = PredictionEngine._canonicalizeStop(stop.code);
                if (cCode) this._stopLookup.set(cCode, loc);
            }
        });

        this._hasIndexedStops = true;
    },

    _getStopLocation(stopName) {
        if (!stopName) return null;
        
        // Ensure index is ready
        if (!this._hasIndexedStops || this._stopLookup.size === 0) {
            this._rebuildStopIndex();
        }

        const canon = PredictionEngine._canonicalizeStop(stopName);
        return this._stopLookup.get(canon) || null;
    },

    renderMarkers() {
        if (!this.map || !this.layers.markers) return;

        // Clear existing
        this.layers.markers.clearLayers();

        // Always check if we need to rebuild the index (e.g. library finished loading)
        const currentLibSize = PredictionEngine.stopsLibrary?.length || 0;
        if (currentLibSize > 0 && !this._hasIndexedStops) {
            this._rebuildStopIndex();
        }

        const points = [];
        const isBoth = this.filter === 'both';
        const showBoarding = this.filter === 'boarding' || isBoth;
        const showExiting = this.filter === 'exiting' || isBoth;

        this.trips.forEach(trip => {
            // Process Boarding
            if (showBoarding) {
                let bLoc = trip.boardingLocation;
                if (!bLoc || isNaN(bLoc.lat)) {
                    bLoc = this._getStopLocation(trip.startStopName || trip.startStop);
                }
                if (bLoc && !isNaN(bLoc.lat)) {
                    points.push({
                        lat: bLoc.lat,
                        lng: bLoc.lng,
                        type: 'boarding',
                        label: `Boarded ${trip.route} at ${trip.startStopName || trip.startStop}`
                    });
                }
            }

            // Process Exiting
            if (showExiting) {
                let eLoc = trip.exitLocation;
                if (!eLoc || isNaN(eLoc.lat)) {
                    eLoc = this._getStopLocation(trip.endStopName || trip.endStop);
                }
                if (eLoc && !isNaN(eLoc.lat)) {
                    points.push({
                        lat: eLoc.lat,
                        lng: eLoc.lng,
                        type: 'exiting',
                        label: `Exited ${trip.route} at ${trip.endStopName || trip.endStop}`
                    });
                }
            }
        });

        // Batch add markers for performance
        const markers = [];
        points.forEach(p => {
            const color = p.type === 'boarding' ? '#4f46e5' : '#10b981';
            const marker = L.circleMarker([p.lat, p.lng], {
                radius: 6,
                fillColor: color,
                color: '#fff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            }).bindPopup(p.label);
            markers.push(marker);
        });

        if (markers.length > 0) {
            this.layers.markers.addLayers(markers);
        }

        // Fit bounds only on first load or when filters change
        if (points.length > 0 && this._isFirstLoad) {
            try {
                const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
                this.map.fitBounds(bounds, { padding: [60, 60], animate: false });
                this._isFirstLoad = false;
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
