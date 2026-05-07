export const Visuals = {
    heatmapLayer: null,

    /**
     * Renders a high-intensity heatmap using Leaflet.heat
     * @param {Array} trips - Array of trip objects
     * @param {Object} map - Leaflet map instance
     */
    renderHeatmap: function (trips, map) {
        if (!map) return;
        if (typeof L.heatLayer === 'undefined') {
            console.warn('Leaflet.heat not loaded, falling back to point heatmap');
            return this.renderPointHeatmap(trips, map);
        }

        if (this.heatmapLayer) {
            map.removeLayer(this.heatmapLayer);
        }

        const points = [];
        trips.forEach(trip => {
            const bLoc = trip.boardingLocation || trip.boardLocation;
            if (bLoc && bLoc.lat) {
                points.push([bLoc.lat, bLoc.lng, 0.8]); // intensity
            }

            if (trip.exitLocation && trip.exitLocation.lat) {
                points.push([trip.exitLocation.lat, trip.exitLocation.lng, 0.5]);
            }
        });

        if (points.length === 0) return;

        this.heatmapLayer = L.heatLayer(points, {
            radius: 25,
            blur: 15,
            maxZoom: 17,
            gradient: {
                0.4: 'blue',
                0.6: 'cyan',
                0.7: 'lime',
                0.8: 'yellow',
                1.0: 'red'
            }
        }).addTo(map);
    },

    /**
     * Renders a Point Heatmap (Legacy/Fallback)
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
