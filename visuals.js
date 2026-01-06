
// Visuals Engine for TransitStats
// Handles heatmap rendering and other map visualizations

const Visuals = {
    heatmapLayer: null,

    /**
     * Renders a Point Heatmap of boarding and alighting locations
     * @param {Array} trips - Array of trip objects
     * @param {Object} map - Leaflet map instance
     */
    renderPointHeatmap: function (trips, map) {
        if (this.heatmapLayer) {
            map.removeLayer(this.heatmapLayer);
        }

        const markers = [];

        // Process trips to find verified coordinates
        trips.forEach(trip => {
            // 1. Boarding Location (Red)
            if (trip.boardingLocation && trip.boardingLocation.lat) {
                markers.push({
                    lat: trip.boardingLocation.lat,
                    lng: trip.boardingLocation.lng,
                    type: 'boarding',
                    count: 1 // Simple weighting for now
                });
            }

            // 2. Alighting Location (Blue)
            // We need to check if we have verified end stop data. 
            // Often stored as 'exitLocation' or we might look up the stop ID.
            // For now, let's assume if there's an 'exitLocation' property (from previous verify steps)
            // If not, we skip.
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
        if (this.heatmapLayer) {
            map.removeLayer(this.heatmapLayer);
            this.heatmapLayer = null;
        }
    }
};

// Expose globally
window.Visuals = Visuals;
