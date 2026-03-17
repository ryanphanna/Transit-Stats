import { db } from './firebase.js';
import { Stats } from './stats.js';
import { MapEngine } from './map-engine.js';
import { Utils } from './utils.js';
import { PredictionEngine } from './predict.js';

/**
 * TransitStats V2 Trips Module
 */
export const Trips = {
    allTrips: [],
    activeTrip: null,
    statsRange: 30,
    unsubscribe: null,

    async init() {
        this.setupToggles();
        this.listen();
        await this.loadStopsLibrary();
    },

    async loadStopsLibrary() {
        try {
            const snap = await db.collection('stops').get();
            PredictionEngine.stopsLibrary = snap.docs.map(doc => doc.data());
            console.log(`PredictionEngine: Loaded ${PredictionEngine.stopsLibrary.length} stops.`);
            this.renderPrediction(); // Refresh prediction once stops are ready
        } catch (err) {
            console.error("Failed to load stops library for prediction:", err);
        }
    },

    setupToggles() {
        const bind = (id30, idAll, range) => {
            const t30 = document.getElementById(id30);
            const tAll = document.getElementById(idAll);
            if (!t30 || !tAll) return;

            t30.addEventListener('click', () => {
                this.statsRange = 30;
                document.querySelectorAll('.toggle-btn[id*="30"]').forEach(el => el.classList.add('active'));
                document.querySelectorAll('.toggle-btn[id*="all"]').forEach(el => el.classList.remove('active'));
                this.renderStats();
            });

            tAll.addEventListener('click', () => {
                this.statsRange = null;
                document.querySelectorAll('.toggle-btn[id*="all"]').forEach(el => el.classList.add('active'));
                document.querySelectorAll('.toggle-btn[id*="30"]').forEach(el => el.classList.remove('active'));
                this.renderStats();
            });
        };

        bind('toggle-stats-30', 'toggle-stats-all');
        bind('toggle-stats-30-insights', 'toggle-stats-all-insights');
    },

    listen() {
        if (!window.currentUser) return;
        if (this.unsubscribe) this.unsubscribe();

        console.log("Trips: Listening for updates...");
        
        this.unsubscribe = db.collection('trips')
            .where('userId', '==', window.currentUser.uid)
            .orderBy('startTime', 'desc')
            .onSnapshot(snap => {
                const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                // Separate active vs completed
                this.activeTrip = docs.find(t => !t.endTime && !t.discarded);
                this.allTrips = docs.filter(t => t.endTime || t.discarded);
                
                this.renderFeed();
                this.renderStats();
                this.renderStreaks();
                this.renderPrediction();
                
                // Update Map
                MapEngine.updateTrips(this.allTrips);
            }, err => {
                console.error("Trips error:", err);
            });
    },

    async update(id, data) {
        // Normalize stop names before saving
        if (data.startStop) data.startStop = Utils.normalizeIntersectionStop(data.startStop);
        if (data.endStop) data.endStop = Utils.normalizeIntersectionStop(data.endStop);

        return db.collection('trips').doc(id).update({
            ...data,
            updatedAt: new Date()
        });
    },

    async delete(id) {
        return db.collection('trips').doc(id).delete();
    },

    openEditModal(tripId) {
        const trip = this.allTrips.find(t => t.id === tripId);
        if (!trip) return;

        document.getElementById('edit-trip-id').value = trip.id;
        document.getElementById('edit-route').value = trip.route || '';
        document.getElementById('edit-start-stop').value = trip.startStopName || trip.startStop || '';
        document.getElementById('edit-end-stop').value = trip.endStopName || trip.endStop || '';
        document.getElementById('edit-direction').value = trip.direction || '';
        document.getElementById('edit-agency').value = trip.agency || 'TTC';

        document.getElementById('modal-backdrop').classList.remove('hidden');
        document.getElementById('modal-edit-trip').classList.remove('hidden');
    },

    renderFeed() {
        const list = document.getElementById('recent-trips-list');
        if (!list) return;

        if (this.allTrips.length === 0) {
            list.innerHTML = '<div class="loading-state">No trips found.</div>';
            return;
        }

        list.innerHTML = '';
        this.allTrips.slice(0, 20).forEach(trip => {
            const card = this.renderTripCard(trip);
            list.appendChild(card);
        });
    },

    renderTripCard(trip) {
        const card = document.createElement('div');
        card.className = 'trip-card';
        
        const startTime = trip.startTime?.toDate ? trip.startTime.toDate() : new Date(trip.startTime);
        const dateStr = startTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        const startStop = Utils.normalizeIntersectionStop(trip.startStopName || trip.startStop || trip.startStopCode) || 'Unknown';
        const endStop = Utils.normalizeIntersectionStop(trip.endStopName || trip.endStop || trip.endStopCode) || '...';

        card.innerHTML = `
            <div class="trip-info">
                <div class="trip-main">
                    <div class="trip-route-pill">${trip.route}</div>
                    <div class="trip-path">
                        <span class="stop-name">${startStop}</span>
                        <span class="path-arrow">→</span>
                        <span class="stop-name">${endStop}</span>
                    </div>
                </div>
                <button class="btn-edit-trip" title="Edit Trip">✏️</button>
            </div>
            <div class="trip-meta">
                <div class="trip-date">${dateStr}</div>
                <div class="trip-duration">${trip.duration || 0} min</div>
            </div>
        `;

        card.querySelector('.btn-edit-trip').addEventListener('click', () => {
            this.openEditModal(trip.id);
        });

        return card;
    },

    renderStats() {
        // Basic Metrics
        const metrics = Stats.computeMetrics(this.allTrips, this.statsRange);
        
        const update = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        update('stat-trips', metrics.trips);
        update('stat-routes', metrics.routes);
        update('stat-hours', metrics.hours);
        update('stat-stops', metrics.stops);

        update('stat-trips-insights', metrics.trips);
        update('stat-routes-insights', metrics.routes);
        update('stat-hours-insights', metrics.hours);
        update('stat-stops-insights', metrics.stops);

        // Top Lists
        this.renderList('top-routes-list', metrics.topRoutes);
        this.renderList('top-stops-list', metrics.topStops);
        this.renderList('top-routes-list-insights', metrics.topRoutes);
        this.renderList('top-stops-list-insights', metrics.topStops);

        // Advanced Analytics
        const highlights = Stats.computeHighlights(this.allTrips);
        this.renderHighlights(highlights);

        const peakTimes = Stats.computePeakTimes(this.allTrips);
        this.renderPeakTimes(peakTimes);

        const sparkPoints = Stats.computeSparkline(this.allTrips);
        this.renderSparkline(sparkPoints);
    },

    renderList(containerId, items) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (!items.length) {
            container.innerHTML = '<div class="loading-state">No data</div>';
            return;
        }

        container.innerHTML = items.map(item => `
            <div class="compact-row">
                <span class="row-label">${item.name}</span>
                <span class="row-value">${item.count}</span>
            </div>
        `).join('');
    },

    renderHighlights(highlights) {
        const containers = [
            document.getElementById('commute-highlights'),
            document.getElementById('commute-highlights-insights')
        ].filter(el => el != null);

        if (containers.length === 0) return;

        if (!highlights.length) {
            containers.forEach(c => c.innerHTML = '<div class="loading-state">Not enough data for insights.</div>');
            return;
        }

        const html = highlights.map(c => {
            const w = 200, h = 32;
            const min = Math.min(...c.durations);
            const max = Math.max(...c.durations);
            const range = max - min || 1;
            const pts = c.durations.map((d, i) => {
                const x = (i / (c.durations.length - 1 || 1)) * w;
                const y = h - ((d - min) / range) * (h - 4) - 2;
                return `${x},${y}`;
            });
            const polyline = `<polyline points="${pts.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`;
            return `
            <div class="insight-row mb-3">
                <div class="insight-title">${c.name} <span class="badge">${c.count}x</span></div>
                <svg class="insight-sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${polyline}</svg>
            </div>`;
        }).join('');

        containers.forEach(c => c.innerHTML = html);
    },

    renderPeakTimes(buckets) {
        const containers = [
            document.getElementById('time-of-day-chart'),
            document.getElementById('time-of-day-chart-insights')
        ].filter(el => el != null);

        if (containers.length === 0) return;

        const max = Math.max(...Object.values(buckets), 1);
        
        const html = Object.entries(buckets).map(([key, count]) => {
            const width = (count / max) * 100;
            return `
                <div class="chart-row">
                    <span class="chart-label">${key}</span>
                    <div class="chart-bar-bg">
                        <div class="chart-bar-fill" style="width: ${width}%"></div>
                    </div>
                    <span class="chart-value">${count}</span>
                </div>
            `;
        }).join('');

        containers.forEach(c => c.innerHTML = html);
    },

    renderSparkline(points) {
        const container = document.getElementById('sparkline-container');
        if (!container) return;

        const max = Math.max(...points, 1);
        const total = points.reduce((a, b) => a + b, 0);
        const avg = total / points.length;
        const avgPct = (avg / max) * 100;
        const bars = points.map((count, i) => `
            <div class="spark-bar" style="height: ${Math.max((count/max)*100, 10)}%" title="${points.length - 1 - i} days ago: ${count} trips"></div>
        `).join('');

        container.innerHTML = `
            ${bars}
            <div class="spark-avg-line" style="bottom: calc(20px + ${avgPct}%)" title="avg ${avg.toFixed(1)}/day"></div>
            <div class="spark-label">${total} trips · ${avg.toFixed(1)}/day avg</div>
        `;
    },

    renderStreaks() {
        const streaks = Stats.calculateStreaks(this.allTrips);
        const cur = document.getElementById('stat-current-streak');
        const best = document.getElementById('stat-best-streak');
        if (cur) cur.textContent = streaks.current;
        if (best) best.textContent = streaks.best;
    },

    renderPrediction() {
        const card = document.getElementById('prediction-card');
        const content = document.getElementById('prediction-content');
        if (!card || !content) return;
        if (!window.isAdmin) { card.style.display = 'none'; return; }

        if (this.activeTrip) {
            // Predict Arrival for Active Trip
            const p = PredictionEngine.guessEndStop(this.allTrips, {
                route: this.activeTrip.route,
                startStopName: this.activeTrip.startStop,
                direction: this.activeTrip.direction,
                time: this.activeTrip.startTime?.toDate ? this.activeTrip.startTime.toDate() : new Date(this.activeTrip.startTime)
            });

            card.querySelector('.prediction-label').textContent = "Active Trip Prediction";
            card.classList.add('trip-active-card');
            card.style.display = 'block';

            if (p) {
                const arrivalTime = p.avgDuration ? `~${p.avgDuration} min trip` : 'Time unknown';
                content.innerHTML = `
                    <div class="prediction-main">
                        <div class="prediction-route">Heading to ${p.stop}</div>
                        <div class="prediction-stop">${arrivalTime} • Based on history</div>
                    </div>
                    <div class="prediction-stats">
                        <span class="prediction-confidence">${p.confidence}%</span>
                        <span class="prediction-confidence-label">Confidence</span>
                    </div>
                `;
            } else {
                content.innerHTML = `
                    <div class="prediction-main">
                        <div class="prediction-route">Trip in Progress</div>
                        <div class="prediction-stop">No historical matches for this destination.</div>
                    </div>
                `;
            }
        } else {
            // Predict Next Trip
            const p = PredictionEngine.guess(this.allTrips, {
                time: new Date()
            });

            card.querySelector('.prediction-label').textContent = "Next Predicted Trip";
            card.classList.remove('trip-active-card');

            if (p && p.confidence > 20) { // Only show if we have some confidence
                card.style.display = 'block';
                content.innerHTML = `
                    <div class="prediction-main">
                        <div class="prediction-route">${p.route} ${p.direction || ''}</div>
                        <div class="prediction-stop">From ${p.stop}</div>
                    </div>
                    <div class="prediction-stats">
                        <span class="prediction-confidence">${p.confidence}%</span>
                        <span class="prediction-confidence-label">Match</span>
                    </div>
                `;
            } else {
                card.style.display = 'none';
            }
        }
    }
};
