import { requireAuth } from '../shared/auth-guard.js';
import { initHeader } from '../shared/header.js';
import { Trips } from '../trips.js';
import { TripController } from '../trips/TripController.js';
import { PredictionEngine } from '../predict.js';
import { MapEngine } from '../map-engine.js';
import { loadAtlasStops } from '../atlas-stops.js';
import { aggregateTripCorridors, getCorridorStyle } from '../route-heatmap.js';

const status = document.getElementById('route-heatmap-status');
const corridorLayer = L.layerGroup();

function setStatus(message) {
    if (status) status.textContent = message;
}

function renderCorridors(trips) {
    if (!MapEngine.map) return;
    const corridors = aggregateTripCorridors(MapEngine.getTripEndpointLocations(trips));
    corridorLayer.clearLayers();
    const maxCount = corridors[0]?.count || 1;
    corridors.forEach(corridor => {
        L.polyline([[corridor.start.lat, corridor.start.lng], [corridor.end.lat, corridor.end.lng]], {
            ...getCorridorStyle(corridor.count, maxCount),
            interactive: false,
        }).addTo(corridorLayer);
    });
    const completeTrips = corridors.reduce((total, corridor) => total + corridor.count, 0);
    setStatus(`${corridors.length} corridor${corridors.length === 1 ? '' : 's'} · ${completeTrips} trips with both stops`);
}

async function init() {
    MapEngine.init([], null, { deferInitialView: true });
    corridorLayer.addTo(MapEngine.map);
    const { user, isAdmin } = await requireAuth();
    initHeader({ isAdmin, currentPage: 'route-heatmap' });

    TripController.listen(user.uid, trips => {
        MapEngine.updateTrips(trips);
        renderCorridors(trips);
    });

    await Trips.loadStopsLibrary();
    const agencies = TripController.allTrips.map(trip => trip.agency).filter(Boolean);
    try {
        const atlasStops = await loadAtlasStops(agencies);
        await MapEngine.setStopSources({ atlasStops, firestoreStops: PredictionEngine.stopsLibrary || [] });
    } catch (error) {
        console.warn('Route heatmap stop enrichment failed:', error);
        await MapEngine.setStopSources({ firestoreStops: PredictionEngine.stopsLibrary || [] });
        setStatus('Using saved stop locations; some corridors may be incomplete.');
    }
    await MapEngine.releaseInitialView();
    renderCorridors(TripController.allTrips);
}

init().catch(error => {
    console.error('Route heatmap failed to load:', error);
    setStatus('The corridor map could not load. Return to your dashboard and try again.');
});
