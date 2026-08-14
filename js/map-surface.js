import { addMapZoomControl, installPopupZoomGuard } from './map-presentation.js';

export function createMapSurface({ containerId, center, zoom = 13, tileTheme = 'light_all' }) {
    const map = L.map(containerId, {
        zoomControl: false,
        attributionControl: false,
        preferCanvas: true,
    }).setView(center, zoom);

    addMapZoomControl(map);
    installPopupZoomGuard(map);

    const base = L.tileLayer(`https://{s}.basemaps.cartocdn.com/${tileTheme}/{z}/{x}/{y}{r}.png`, {
        maxZoom: 19,
        attribution: '© <a href="https://carto.com/">CARTO</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    const renderer = L.canvas({ padding: 0.5 });
    const markers = L.layerGroup().addTo(map);

    return { map, base, renderer, markers };
}
