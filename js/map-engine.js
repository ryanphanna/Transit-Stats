import { UI } from './ui-utils.js';
import { PredictionEngine } from './predict.js';
import { buildStopIndex, resolveStopLocation } from './atlas-stop-resolver.js';
import { getTripStopLabel } from './trip-display.js';

export function getMapMarkerLabel(trip = {}, side = 'boarding', resolution = null) {
    return getTripStopLabel(trip, side, resolution);
}

/**
 * TransitStats V2 Map Engine
 * Handles Leaflet integration and geospatial visualization of trip data.
 */
export const MapEngine = {
    map: null,
    trips: [],
    filter: 'both', // 'boarding', 'exiting', 'both'
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
    _stopIndex: new Map(),
    _stopSourcesReady: false,
    _usesMarkerClusters: false,
    _canvasRenderer: null,

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

            this._canvasRenderer = L.canvas({ padding: 0.5 });

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
        
        let tileUrl = 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png';
        let attribution = '© <a href="https://carto.com/">CARTO</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

        if (isV2) {
            // Minimalist Grayscale (CartoDB Positron)
            tileUrl = 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png';
            attribution = '© <a href="https://carto.com/">CARTO</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
        } else if (isDark) {
            tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png';
            attribution = '© <a href="https://carto.com/">CARTO</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
        }

        this.layers.base = L.tileLayer(tileUrl, {
            maxZoom: 19,
            attribution,
        }).addTo(this.map);

        this.layers.transit = null;

        this._usesMarkerClusters = typeof L.markerClusterGroup === 'function';
        this.layers.markers = this._usesMarkerClusters
            ? L.markerClusterGroup({
                chunkedLoading: true,
                chunkInterval: 50,
                chunkDelay: 10,
                maxClusterRadius: 45,
                removeOutsideVisibleBounds: true,
                showCoverageOnHover: false,
            })
            : L.layerGroup();
        this.layers.markers.addTo(this.map);
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

    setStopSources({ atlasStops = [], firestoreStops = [] } = {}) {
        PredictionEngine.stopsLibrary = firestoreStops;
        this._stopIndex = buildStopIndex({ atlasStops, normalizedStops: firestoreStops });
        this._stopSourcesReady = true;
        this._skipLookup.clear();
        if (this.map) this.renderMarkers();
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

    _resolveStop(trip, side) {
        if (this._stopSourcesReady) return resolveStopLocation(trip, side, this._stopIndex);

        const saved = side === 'boarding'
            ? (trip.boardingLocation || trip.boardLocation)
            : trip.exitLocation;
        if (saved && Number.isFinite(Number(saved.lat)) && Number.isFinite(Number(saved.lng ?? saved.lon))) {
            return { location: { lat: Number(saved.lat), lng: Number(saved.lng ?? saved.lon) }, source: 'saved' };
        }

        const stopName = side === 'boarding'
            ? (trip.startStopName || trip.startStop)
            : (trip.endStopName || trip.endStop);
        const location = this._getStopLocation(stopName);
        return { location, source: location ? 'firestore' : 'unresolved' };
    },

    _renderDiagnostics(stats, tripCount) {
        const container = document.getElementById('map-diagnostics');
        if (!container) return;
        const totals = ['saved', 'atlas', 'firestore', 'unresolved'].reduce((result, source) => {
            result[source] = stats.boarding[source] + stats.exiting[source];
            return result;
        }, {});
        const resolved = totals.saved + totals.atlas + totals.firestore;
        container.innerHTML = `
            <strong>Stop locations</strong>
            <span><b>${resolved}</b> matched</span>
            <span><b>${totals.atlas}</b> Atlas</span>
            <span><b>${totals.firestore}</b> Firestore fallback</span>
            <span><b>${totals.unresolved}</b> unresolved</span>
            <small>Boarding ${stats.boarding.saved + stats.boarding.atlas + stats.boarding.firestore}/${tripCount} · Exiting ${stats.exiting.saved + stats.exiting.atlas + stats.exiting.firestore}/${tripCount}</small>
        `;
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
        const resolutionStats = {
            boarding: { saved: 0, atlas: 0, firestore: 0, unresolved: 0 },
            exiting: { saved: 0, atlas: 0, firestore: 0, unresolved: 0 },
        };
        const isBoth = this.filter === 'both';
        const showBoarding = this.filter === 'boarding' || isBoth;
        const showExiting = this.filter === 'exiting' || isBoth;

        // The map represents the complete trip history. Repeated trips at the
        // same GTFS stop are collapsed into one point below.
        const limitedTrips = this.trips;

        limitedTrips.forEach(trip => {
            // Process Boarding
            const boarding = this._resolveStop(trip, 'boarding');
            resolutionStats.boarding[boarding.source] += 1;
            if (showBoarding) {
                const bLoc = boarding.location;
                if (bLoc && !isNaN(bLoc.lat)) {
                    points.push({
                        lat: bLoc.lat,
                        lng: bLoc.lng,
                        type: 'boarding',
                        label: getMapMarkerLabel(trip, 'boarding', boarding)
                    });
                }
            }

            // Process Exiting
            const exiting = this._resolveStop(trip, 'exiting');
            resolutionStats.exiting[exiting.source] += 1;
            if (showExiting) {
                const eLoc = exiting.location;
                if (eLoc && !isNaN(eLoc.lat)) {
                    points.push({
                        lat: eLoc.lat,
                        lng: eLoc.lng,
                        type: 'exiting',
                        label: getMapMarkerLabel(trip, 'exiting', exiting)
                    });
                }
            }
        });

        // Batch add markers for performance
        const markersByStop = new Map();
        const isV2 = document.body.classList.contains('v2-clean');

        points.forEach(p => {
            // A stop can have several raw labels. Keep one marker per role and
            // coordinate, then show distinct labels in one popup.
            const key = `${p.type}:${p.lat}:${p.lng}`;
            const existing = markersByStop.get(key);
            if (existing) {
                existing.labels.add(p.label);
                return;
            }

            const radius = isV2 ? 5 : 6;
            const color = isV2 ? '#a855f7' : (p.type === 'boarding' ? '#4f46e5' : '#10b981');
            markersByStop.set(key, {
                lat: p.lat,
                lng: p.lng,
                type: p.type,
                color,
                radius,
                labels: new Set([p.label]),
            });
        });

        markersByStop.forEach(point => {
            const popup = [...point.labels].map(label => UI.escapeHtml(label)).join('<br>');
            const marker = this._usesMarkerClusters
                ? L.marker([point.lat, point.lng], {
                    keyboard: false,
                    icon: L.divIcon({
                        className: `map-stop-dot map-stop-dot--${point.type}`,
                        html: '',
                        iconSize: [point.radius * 2, point.radius * 2],
                        iconAnchor: [point.radius, point.radius],
                    }),
                })
                : L.circleMarker([point.lat, point.lng], {
                    renderer: this._canvasRenderer,
                    radius: point.radius,
                    fillColor: point.color,
                    color: '#fff',
                    weight: 1.5,
                    opacity: 1,
                    fillOpacity: isV2 ? 0.9 : 0.8,
                });
            marker.bindPopup(popup);
            this.layers.markers.addLayer(marker);
        });

        this._renderDiagnostics(resolutionStats, limitedTrips.length);

        // Fit bounds only on first load or when filters change
        const validPoints = points
            .map(point => [Number(point.lat), Number(point.lng)])
            .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng)
                && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180);

        if (validPoints.length > 0 && this._isFirstLoad) {
            try {
                const bounds = L.latLngBounds(validPoints);
                const southWest = bounds.getSouthWest();
                const northEast = bounds.getNorthEast();
                const latitudeSpan = Math.abs(northEast.lat - southWest.lat);
                const longitudeSpan = Math.abs(northEast.lng - southWest.lng);

                if (latitudeSpan < 0.001 && longitudeSpan < 0.001) {
                    this.map.setView(validPoints[0], 13, { animate: false });
                } else {
                    this.map.fitBounds(bounds, { padding: [60, 60], animate: false, maxZoom: 15 });
                }
                this.map.invalidateSize({ animate: false });
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
