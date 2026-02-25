
// Visuals Engine for TransitStats
// Handles heatmap rendering and other map visualizations

export const Visuals = {
    heatmapLayer: null,

    /**
     * Renders a Point Heatmap of boarding and alighting locations
     * @param {Array} trips - Array of trip objects
     * @param {Object} map - Leaflet map instance
     */
    renderPointHeatmap: function (trips, map) {
        if (!map) return;

        if (this.heatmapLayer) {
            map.removeLayer(this.heatmapLayer);
        }

        const markers = [];

        // Process trips to find verified coordinates
        trips.forEach(trip => {
            // 1. Boarding Location (Red)
            const bLoc = trip.boardingLocation || trip.boardLocation;
            if (bLoc && bLoc.lat) {
                markers.push({
                    lat: bLoc.lat,
                    lng: bLoc.lng,
                    type: 'boarding',
                    count: 1 // Simple weighting for now
                });
            }

            // 2. Alighting Location (Blue)
            if (trip.exitLocation && trip.exitLocation.lat) {
                markers.push({
                    lat: trip.exitLocation.lat,
                    lng: trip.exitLocation.lng,
                    type: 'alighting',
                    count: 1
                });
            }
        });

        if (markers.length === 0) return;

        if (typeof L === 'undefined') {
            console.error('Leaflet is not loaded');
            return;
        }

        // Create a LayerGroup for the visualization
        this.heatmapLayer = L.layerGroup();

        markers.forEach(m => {
            const color = m.type === 'boarding' ? '#ff4b4b' : '#4b7bff';

            // Use simple CircleMarkers with opacity to create a "density" effect
            L.circleMarker([m.lat, m.lng], {
                radius: 6, // Small dot
                fillColor: color,
                fillOpacity: 0.3, // Low opacity allows stacking to show density
                color: null, // No border
                weight: 0,
                interactive: false // Don't block clicks
            }).addTo(this.heatmapLayer);
        });

        this.heatmapLayer.addTo(map);
        console.log(`🔥 Visuals: Rendered ${markers.length} heatmap points.`);
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

// Expose globally for legacy support
window.Visuals = Visuals;
