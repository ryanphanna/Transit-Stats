
import { db, auth } from './firebase.js';

/**
 * Trips Comparison Module
 * Groups trips by corridor (start/end stop pair) and visualizes performance
 */
export const TripsComparison = {
    allTrips: [],
    corridors: {},

    init: function() {
        auth.onAuthStateChanged(user => {
            if (!user) {
                window.location.href = 'index.html';
                return;
            }
            this.load(user.uid);
        });
    },

    load: async function(userId) {
        try {
            const snapshot = await db.collection('trips')
                .where('userId', '==', userId)
                .orderBy('startTime', 'desc')
                .get();

            this.allTrips = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(t => (t.duration && (t.startStopName || t.startStop) && (t.endStopName || t.endStop)));

            this.processCorridors();
            this.renderCorridorGrid();
        } catch (error) {
            console.error('Error loading trips for comparison:', error);
        }
    },

    processCorridors: function() {
        this.corridors = {};

        this.allTrips.forEach(trip => {
            const start = (trip.startStopName || trip.startStop).trim();
            const end = (trip.endStopName || trip.endStop).trim();
            const key = `${start} → ${end}`;

            if (!this.corridors[key]) {
                this.corridors[key] = {
                    key: key,
                    start: start,
                    end: end,
                    trips: [],
                    durations: [],
                    avg: 0,
                    min: Infinity,
                    max: 0,
                    lastTrip: null
                };
            }

            const duration = trip.duration;
            this.corridors[key].trips.push(trip);
            this.corridors[key].durations.push(duration);
            this.corridors[key].min = Math.min(this.corridors[key].min, duration);
            this.corridors[key].max = Math.max(this.corridors[key].max, duration);
            
            if (!this.corridors[key].lastTrip) {
                this.corridors[key].lastTrip = trip;
            }
        });

        // Finalize stats (reverse durations so they are chronological for sparkline)
        Object.values(this.corridors).forEach(c => {
            c.avg = Math.round(c.durations.reduce((a, b) => a + b, 0) / c.durations.length);
            c.durations.reverse(); 
        });
    },

    renderCorridorGrid: function() {
        const grid = document.getElementById('corridorGrid');
        if (!grid) return;

        const corridorList = Object.values(this.corridors)
            .sort((a, b) => b.trips.length - a.trips.length);

        if (corridorList.length === 0) {
            grid.innerHTML = '<div class="empty-state">No trips with start and end stops found yet.</div>';
            return;
        }

        grid.innerHTML = corridorList.map(c => `
            <div class="corridor-card" onclick="TripsComparison.showDetail('${c.key}')">
                <div class="corridor-header">
                    <div class="corridor-title">${c.key}</div>
                    <div class="corridor-meta">${c.trips.length} trips</div>
                </div>
                <div class="corridor-stats">
                    <div class="corridor-stat">
                        <span class="stat-value">${c.avg}m</span>
                        <span class="stat-label">Avg</span>
                    </div>
                    <div class="corridor-stat">
                        <span class="stat-value">${c.min}m</span>
                        <span class="stat-label">Fast</span>
                    </div>
                </div>
                <div class="sparkline-container">
                    ${this.generateSparkline(c.durations)}
                </div>
            </div>
        `).join('');
    },

    generateSparkline: function(durations, width = 260, height = 40) {
        if (durations.length < 2) return '';

        const min = Math.min(...durations);
        const max = Math.max(...durations);
        const range = (max - min) || 1;
        
        const points = durations.map((d, i) => {
            const x = (i / (durations.length - 1)) * width;
            const y = height - ((d - min) / range) * (height - 4) - 2;
            return `${x},${y}`;
        });

        return `
            <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="width: 100%; height: 100%;">
                <path class="sparkline-path" d="M ${points.join(' L ')}" />
            </svg>
        `;
    },

    showDetail: function(key) {
        const c = this.corridors[key];
        if (!c) return;

        document.getElementById('gridView').style.display = 'none';
        const detailView = document.getElementById('detailView');
        detailView.style.display = 'block';

        document.getElementById('detailTitle').textContent = key;
        document.getElementById('statAvg').textContent = `${c.avg} min`;
        document.getElementById('statMin').textContent = `${c.min} min`;
        document.getElementById('statMax').textContent = `${c.max} min`;
        document.getElementById('statCount').textContent = c.trips.length;

        const chart = document.getElementById('detailChart');
        chart.innerHTML = this.generateSparkline(c.durations, 800, 100);

        const recentList = document.getElementById('corridorRecentTrips');
        recentList.innerHTML = c.trips.slice(0, 5).map(t => {
            const date = t.startTime?.toDate ? t.startTime.toDate().toLocaleDateString() : '—';
            return `
                <div class="trip-item">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-weight: 700;">${t.route}</div>
                            <div style="font-size: 0.8em; color: var(--text-secondary);">${date}</div>
                        </div>
                        <div style="font-weight: 600;">${t.duration} min</div>
                    </div>
                </div>
            `;
        }).join('');
    },

    closeDetail: function() {
        document.getElementById('detailView').style.display = 'none';
        document.getElementById('gridView').style.display = 'block';
    }
};

window.TripsComparison = TripsComparison;
TripsComparison.init();
