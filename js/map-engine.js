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

    init(initialTrips = []) {
        this.trips = initialTrips;
        if (this.map) return;

        console.log("MapEngine: Initializing...");
        
        // Default to Toronto
        const center = [43.6532, -79.3832];
        
        this.map = L.map('main-map', {
            zoomControl: false,
            attributionControl: false
        }).setView(center, 13);

        // Add Zoom Control to Bottom Right
        L.control.zoom({ position: 'bottomright' }).addTo(this.map);

        this.setupLayers();
        this.renderMarkers();
        this.setupControls();
    },

    setupLayers() {
        // Base Layer (CartoDB Positron - Light/Dark based on theme)
        const isDark = document.body.classList.contains('dark');
        const tileUrl = isDark 
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

        this.layers.base = L.tileLayer(tileUrl, {
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(this.map);

        // Transit Overlay (Memomaps)
        this.layers.transit = L.tileLayer('https://tile.memomaps.de/tilegen/{z}/{x}/{y}.png', {
            maxZoom: 18,
            opacity: 0.6
        }).addTo(this.map);

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
        if (this.map) this.renderMarkers();
    },

    renderMarkers() {
        if (!this.map || !this.layers.markers) return;
        this.layers.markers.clearLayers();

        const points = [];

        this.trips.forEach(trip => {
            // Process Boarding
            if ((this.filter === 'boarding' || this.filter === 'both') && trip.boardingLocation) {
                points.push({
                    lat: trip.boardingLocation.lat,
                    lng: trip.boardingLocation.lng || trip.boardingLocation.lon,
                    type: 'boarding',
                    label: `Boarded ${trip.route} at ${trip.startStopName || trip.startStop}`
                });
            }

            // Process Exiting
            if ((this.filter === 'exiting' || this.filter === 'both') && trip.exitLocation) {
                points.push({
                    lat: trip.exitLocation.lat,
                    lng: trip.exitLocation.lng || trip.exitLocation.lon,
                    type: 'exiting',
                    label: `Exited ${trip.route} at ${trip.endStopName || trip.endStop}`
                });
            }
        });

        points.forEach(p => {
            const color = p.type === 'boarding' ? '#4f46e5' : '#10b981';
            L.circleMarker([p.lat, p.lng], {
                radius: 6,
                fillColor: color,
                color: '#fff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(this.layers.markers).bindPopup(p.label);
        });

        // Fit bounds if markers exist
        if (points.length > 0) {
            const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
            this.map.fitBounds(bounds, { padding: [40, 40] });
        }
    },

    locateUser() {
        if (!navigator.geolocation) return alert("Geolocation not supported");

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
            alert("Could not get location: " + err.message);
        });
    }
};
