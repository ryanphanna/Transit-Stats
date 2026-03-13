export const Visuals = {
    heatmapLayer: null,

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

        if (markers.length === 0) return;

        if (typeof L === 'undefined') {
            console.error('Leaflet is not loaded');
            return;
        }

        this.heatmapLayer = L.layerGroup();

        markers.forEach(m => {
            let color = m.type === 'boarding' ? '#ff4b4b' : '#4b7bff';

            L.circleMarker([m.lat, m.lng], {
                radius: 6,
                fillColor: color,
                fillOpacity: 0.3,
                color: null,
                weight: 0,
                interactive: false
            }).addTo(this.heatmapLayer);
        });

        this.heatmapLayer.addTo(map);
        console.log(`🔥 Visuals: Rendered ${markers.length} points.`);
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
