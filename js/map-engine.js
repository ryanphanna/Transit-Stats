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
    _skipLookup: new Set(),
    _hasIndexedStops: false,
    _lastRenderedCount: 0,
    _isFirstLoad: true,
    _renderTimer: null,
    _lastLibSize: 0,

    init(initialTrips = [], initialCenter = null) {
        console.log("MapEngine.init: Started", { tripsCount: initialTrips.length });
        this.trips = initialTrips;
        if (this.map) {
            console.log("MapEngine.init: Map already exists");
            return;
        }

        const container = document.getElementById('main-map');
        if (!container) {
            console.error("MapEngine: main-map container not found.");
            return;
        }

        // Avoid Leaflet error if container already initialized
        if (container._leaflet_id) {
            console.warn("MapEngine: Leaflet already initialized on this container");
            return;
        }

        console.log("MapEngine: Initializing Leaflet map instance...");

        const center = initialCenter || [43.6532, -79.3832];

        try {
            this.map = L.map('main-map', {
                zoomControl: false,
                attributionControl: false,
                preferCanvas: true
            }).setView(center, 13);
            console.log("MapEngine: Leaflet map instance created");

            // Add Zoom Control to Bottom Right
            L.control.zoom({ position: 'bottomright' }).addTo(this.map);

            this.setupLayers();
            this.renderMarkers();
            this.setupControls();
            console.log("MapEngine: Setup complete");
        } catch (err) {
            console.error("MapEngine: Failed to initialize Leaflet:", err);
        }
    },

    setupLayers() {
        // Base Layer
        const isV2 = document.body.classList.contains('v2-clean');
        const isDark = document.body.classList.contains('dark');
        
        let tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
        let attribution = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

        if (isV2) {
            // Minimalist Grayscale (CartoDB Positron)
            tileUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
            attribution = '© <a href="https://carto.com/">CARTO</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
        } else if (isDark) {
            tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
            attribution = '© <a href="https://carto.com/">CARTO</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
        }

        this.layers.base = L.tileLayer(tileUrl, {
            maxZoom: 19,
            attribution,
        }).addTo(this.map);

        this.layers.transit = null;

        // Use standard LayerGroup + Canvas for best stability and speed.
        // MarkerClusterGroup can be heavy on the main thread for thousands of points.
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
        if (!this.map) return;
        
        if (this._renderTimer) cancelAnimationFrame(this._renderTimer);
        this._renderTimer = requestAnimationFrame(() => {
            this.renderMarkers();
            this._renderTimer = null;
        });
    },

    /**
     * Build an O(1) lookup Map for stop locations from the stopsLibrary.
     * Dramatically improves performance over linear searching.
     */
    _rebuildStopIndex() {
        const lib = PredictionEngine.stopsLibrary;
        if (!lib || lib.length === 0) return;
        
        console.log(`MapEngine: Reindexing ${lib.length} stops...`);
        const start = performance.now();
        this._stopLookup.clear();
        
        lib.forEach(stop => {
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
        this._lastLibSize = lib.length;
        console.log(`MapEngine: Reindex complete in ${Math.round(performance.now() - start)}ms`);
    },

    _getStopLocation(stopName) {
        if (!stopName) return null;
        
        // Fast skip for known unresolvable stops
        if (this._skipLookup.has(stopName)) return null;

        // Ensure index is ready
        const currentLibSize = PredictionEngine.stopsLibrary?.length || 0;
        if (!this._hasIndexedStops || this._lastLibSize !== currentLibSize) {
            this._rebuildStopIndex();
        }

        const canon = PredictionEngine._canonicalizeStop(stopName);
        const loc = this._stopLookup.get(canon);
        
        if (!loc) {
            this._skipLookup.add(stopName);
            return null;
        }
        return loc;
    },

    renderMarkers() {
        if (!this.map || !this.layers.markers) return;

        const start = performance.now();
        // Clear existing
        this.layers.markers.clearLayers();

        // Always check if we need to rebuild the index (e.g. library finished loading)
        const currentLibSize = PredictionEngine.stopsLibrary?.length || 0;
        if (currentLibSize > 0 && (!this._hasIndexedStops || this._lastLibSize !== currentLibSize)) {
            this._rebuildStopIndex();
        }

        const points = [];
        const isBoth = this.filter === 'both';
        const showBoarding = this.filter === 'boarding' || isBoth;
        const showExiting = this.filter === 'exiting' || isBoth;

        // Safety limit: only render markers for the first 1000 trips to prevent UI freeze
        const limitedTrips = this.trips.slice(0, 1000);
        if (this.trips.length > 1000) {
            console.warn(`MapEngine: Capping render to 1000 trips (from ${this.trips.length}) for stability.`);
        }

        limitedTrips.forEach(trip => {
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
        const isV2 = document.body.classList.contains('v2-clean');

        points.forEach(p => {
            let color = p.type === 'boarding' ? '#4f46e5' : '#10b981';
            let radius = 6;
            let opacity = 0.8;

            if (isV2) {
                color = '#a855f7'; // Purple dots
                radius = 5;
                opacity = 0.9;
            }

            const marker = L.circleMarker([p.lat, p.lng], {
                radius: radius,
                fillColor: color,
                color: '#fff',
                weight: 1.5,
                opacity: 1,
                fillOpacity: opacity
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
        console.log(`MapEngine: Rendered ${points.length} markers in ${Math.round(performance.now() - start)}ms`);
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
