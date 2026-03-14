import { db } from './firebase.js';
import { Stats } from './stats.js';
import { MapEngine } from './map-engine.js';

/**
 * TransitStats V2 Trips Module
 */
export const Trips = {
    allTrips: [],
    activeTrip: null,
    statsRange: 30,
    unsubscribe: null,

    init() {
        this.setupToggles();
        this.listen();
    },

    setupToggles() {
        const t30 = document.getElementById('toggle-stats-30');
        const tAll = document.getElementById('toggle-stats-all');
        if (!t30 || !tAll) return;

        t30.addEventListener('click', () => {
            this.statsRange = 30;
            t30.classList.add('active');
            tAll.classList.remove('active');
            this.renderStats();
        });

        tAll.addEventListener('click', () => {
            this.statsRange = null;
            tAll.classList.add('active');
            t30.classList.remove('active');
            this.renderStats();
        });
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
                
                // Update Map
                MapEngine.updateTrips(this.allTrips);
            }, err => {
                console.error("Trips error:", err);
            });
    },

    async update(id, data) {
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
        
        const startStop = trip.startStopName || trip.startStop || 'Unknown';
        const endStop = trip.endStopName || trip.endStop || '...';

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

        // Top Lists
        this.renderList('top-routes-list', metrics.topRoutes);
        this.renderList('top-stops-list', metrics.topStops);

        // Advanced Analytics
        const highlights = Stats.computeHighlights(this.allTrips);
        this.renderHighlights(highlights);

        const peakTimes = Stats.computePeakTimes(this.allTrips);
        this.renderPeakTimes(peakTimes);
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
        const container = document.getElementById('commute-highlights');
        if (!container) return;

        if (!highlights.length) {
            container.innerHTML = '<div class="loading-state">Not enough data for insights.</div>';
            return;
        }

        container.innerHTML = highlights.map(c => `
            <div class="insight-row mb-3">
                <div class="insight-title">${c.name} <span class="badge">${c.count}x</span></div>
                <div class="insight-grid">
                    <div class="insight-item"><strong>${c.avg}m</strong><span>AVG</span></div>
                    <div class="insight-item success"><strong>${c.min}m</strong><span>FAST</span></div>
                    <div class="insight-item muted"><strong>${c.max}m</strong><span>SLOW</span></div>
                </div>
            </div>
        `).join('');
    },

    renderPeakTimes(buckets) {
        const container = document.getElementById('time-of-day-chart');
        if (!container) return;

        const max = Math.max(...Object.values(buckets));
        if (max === 0) {
            container.innerHTML = '<div class="loading-state">No data</div>';
            return;
        }

        container.innerHTML = Object.entries(buckets).map(([key, count]) => {
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
    },

    renderStreaks() {
        const streaks = Stats.calculateStreaks(this.allTrips);
        const cur = document.getElementById('stat-current-streak');
        const best = document.getElementById('stat-best-streak');
        if (cur) cur.textContent = streaks.current;
        if (best) best.textContent = streaks.best;
    }
};
