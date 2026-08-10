export const Visuals = {
    heatmapLayer: null,

    renderLocationHeatmap(points, map) {
        if (!map || points.length === 0) return;
        this.clear(map);

        const heatPoints = points.map(point => [
            point.lat,
            point.lng,
            point.type === 'boarding' ? 0.9 : 0.6
        ]);

        if (typeof L.heatLayer !== 'undefined') {
            this.heatmapLayer = L.heatLayer(heatPoints, {
                radius: 28,
                blur: 18,
                maxZoom: 17,
                gradient: {
                    0.35: '#4f46e5',
                    0.55: '#22d3ee',
                    0.72: '#34d399',
                    0.86: '#facc15',
                    1: '#ef4444'
                }
            }).addTo(map);
            return;
        }

        this.heatmapLayer = L.layerGroup();
        points.forEach(point => L.circleMarker([point.lat, point.lng], {
            radius: 10,
            fillColor: '#4f46e5',
            fillOpacity: 0.2,
            color: '#4f46e5',
            weight: 1,
            interactive: false
        }).addTo(this.heatmapLayer));
        this.heatmapLayer.addTo(map);
    },

    clear(map) {
        if (map && this.heatmapLayer) {
            map.removeLayer(this.heatmapLayer);
            this.heatmapLayer = null;
        }
    }
};

window.Visuals = Visuals;
