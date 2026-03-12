
// Visuals Engine for TransitStats
// Handles heatmap rendering and other map visualizations
import { Importer } from './importer.js';

export const Visuals = {
    heatmapLayer: null,
    showImportedData: true, // Default to true if they've imported it

    /**
     * Renders a Point Heatmap of boarding and alighting locations
     * @param {Array} trips - Array of trip objects from Firestore
     * @param {Object} map - Leaflet map instance
     */
    renderPointHeatmap: function (trips, map) {
        if (!map) return;

        if (this.heatmapLayer) {
            map.removeLayer(this.heatmapLayer);
        }

        const markers = [];

        // 1. Process CLOUD trips to find verified coordinates
        trips.forEach(trip => {
            const bLoc = trip.boardingLocation || trip.boardLocation;
            if (bLoc && bLoc.lat) {
                markers.push({ lat: bLoc.lat, lng: bLoc.lng, type: 'boarding' });
            }

            if (trip.exitLocation && trip.exitLocation.lat) {
                markers.push({ lat: trip.exitLocation.lat, lng: trip.exitLocation.lng, type: 'alighting' });
            }
        });

        // 2. Process LOCAL taps if enabled
        if (this.showImportedData && window.Importer) {
            const localTaps = Importer.getLocalTaps();
            localTaps.forEach(tap => {
                // Try to resolve location to coordinates using Trips module if available
                if (window.Trips && window.Trips.lookupStopInLibrary) {
                    const stop = window.Trips.lookupStopInLibrary(null, tap.location);
                    if (stop && stop.lat) {
                        markers.push({
                            lat: stop.lat,
                            lng: stop.lng,
                            type: 'imported',
                            agency: tap.agency
                        });
                    }
                }
            });
        }

        if (markers.length === 0) return;

        if (typeof L === 'undefined') {
            console.error('Leaflet is not loaded');
            return;
        }

        this.heatmapLayer = L.layerGroup();

        markers.forEach(m => {
            let color = m.type === 'boarding' ? '#ff4b4b' : '#4b7bff';
            if (m.type === 'imported') color = '#fbbf24'; // Amber for imported data to distinguish

            L.circleMarker([m.lat, m.lng], {
                radius: m.type === 'imported' ? 5 : 6,
                fillColor: color,
                fillOpacity: 0.3,
                color: null,
                weight: 0,
                interactive: false
            }).addTo(this.heatmapLayer);
        });

        this.heatmapLayer.addTo(map);
        console.log(`🔥 Visuals: Rendered ${markers.length} points (${markers.filter(m => m.type === 'imported').length} imported).`);
    },

    /**
     * Toggles visibility of imported data and re-renders
     */
    toggleImportedData: function (visible, trips, map) {
        this.showImportedData = visible;
        this.renderPointHeatmap(trips, map);
    },

    /**
     * Clears all visualizations
     */
    clear: function (map) {
        if (map && this.heatmapLayer) {
            map.removeLayer(this.heatmapLayer);
            this.heatmapLayer = null;
        }
    }
};

window.Visuals = Visuals;
