
import { db, Timestamp } from './firebase.js';

/**
 * Stats Module - Handles all statistics and analytics logic
 */
export const Stats = {
    currentStatsView: '30days',
    statsInitialized: false,

    init: function () {
        this.initializeStatsToggle();
        this.updateProfileStats();
        this.updateStatsSection();
    },

    initializeStatsToggle: function () {
        const toggle30 = document.getElementById('statsToggle30');
        const toggleAll = document.getElementById('statsToggleAll');

        if (!toggle30 || !toggleAll) return;

        toggle30.addEventListener('click', () => {
            if (this.currentStatsView !== '30days') {
                this.currentStatsView = '30days';
                toggle30.classList.add('active');
                toggleAll.classList.remove('active');
                this.updateStatsSection();
            }
        });

        toggleAll.addEventListener('click', () => {
            if (this.currentStatsView !== 'alltime') {
                this.currentStatsView = 'alltime';
                toggleAll.classList.add('active');
                toggle30.classList.remove('active');
                this.updateStatsSection();
            }
        });
    },

    updateStatsSection: function () {
        if (!window.currentUser) return;

        let query = db.collection('trips').where('userId', '==', window.currentUser.uid);

        if (this.currentStatsView === '30days') {
            const dateFilter = new Date();
            dateFilter.setDate(dateFilter.getDate() - 30);
            query = query.where('startTime', '>=', Timestamp.fromDate(dateFilter));
        }

        query.get()
            .then((snapshot) => {
                const trips = [];
                snapshot.forEach((doc) => {
                    trips.push(doc.data());
                });

                const totalTrips = trips.length;
                const uniqueRoutes = new Set(trips.map(t => t.route)).size;
                const totalMinutes = trips.reduce((sum, t) => sum + (t.duration || 0), 0);
                const totalHours = Math.round(totalMinutes / 60 * 10) / 10;

                const stops = new Set();
                trips.forEach(t => {
                    const startStop = t.startStopName || t.startStop || t.startStopCode;
                    const endStop = t.endStopName || t.endStop || t.endStopCode;
                    if (startStop) stops.add(startStop);
                    if (endStop) stops.add(endStop);
                });
                const uniqueStops = stops.size;

                const elTotal = document.getElementById('statsTotalTrips');
                if (elTotal) elTotal.textContent = totalTrips;

                const elRoutes = document.getElementById('statsUniqueRoutes');
                if (elRoutes) elRoutes.textContent = uniqueRoutes;

                const elTime = document.getElementById('statsTotalTime');
                if (elTime) elTime.textContent = totalHours;

                const elStops = document.getElementById('statsUniqueStops');
                if (elStops) elStops.textContent = uniqueStops;

                this.generateTopRoutes(trips);
                this.generateTopStops(trips);
                this.generateTimeOfDayStats(trips);
            })
            .catch((error) => {
                console.error('Error updating stats:', error);
            });
    },

    updateProfileStats: function () {
        if (!window.currentUser) {
            console.warn('Stats: updateProfileStats called but no user logged in.');
            return;
        }

        console.log(`Stats: Fetching trips for user ${window.currentUser.uid}...`);

        db.collection('trips')
            .where('userId', '==', window.currentUser.uid)
            .get()
            .then((snapshot) => {
                console.log(`Stats: Found ${snapshot.size} trips (Snapshot size).`);
                const trips = [];
                snapshot.forEach((doc) => {
                    trips.push(doc.data());
                });

                const streakData = this.calculateStreaks(trips);

                const profileStreak = document.getElementById('profileCurrentStreak');
                const profileBest = document.getElementById('profileBestStreak');
                if (profileStreak) profileStreak.textContent = streakData.current;
                if (profileBest) profileBest.textContent = streakData.best;

                this.calculateFounderStats(trips);
            })
            .catch(err => {
                console.error('Stats: updateProfileStats error:', err);
            });
    },

    calculateStreaks: function (trips) {
        if (trips.length === 0) return { current: 0, best: 0 };

        const tripDates = new Set();
        trips.forEach(trip => {
            let date;
            if (trip.startTime?.toDate) {
                date = trip.startTime.toDate();
            } else if (trip.startTime) {
                date = new Date(trip.startTime);
            } else {
                return;
            }

            const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            tripDates.add(normalized.getTime());
        });

        const sortedTimestamps = Array.from(tripDates).sort((a, b) => b - a);

        if (sortedTimestamps.length === 0) return { current: 0, best: 0 };

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTs = today.getTime();

        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayTs = yesterday.getTime();

        const latestTripTs = sortedTimestamps[0];
        let isStreakActive = (latestTripTs === todayTs || latestTripTs === yesterdayTs);

        let currentStreak = 0;
        let tempStreak = 1;
        let bestStreak = 1;

        for (let i = 0; i < sortedTimestamps.length - 1; i++) {
            const current = sortedTimestamps[i];
            const next = sortedTimestamps[i + 1];

            const diffTime = current - next;
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays === 1) {
                tempStreak++;
            } else if (diffDays > 1) {
                bestStreak = Math.max(bestStreak, tempStreak);
                tempStreak = 1;
            }
        }
        bestStreak = Math.max(bestStreak, tempStreak);

        if (isStreakActive) {
            currentStreak = 1;
            for (let i = 0; i < sortedTimestamps.length - 1; i++) {
                const current = sortedTimestamps[i];
                const next = sortedTimestamps[i + 1];
                const diffTime = current - next;
                const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays === 1) {
                    currentStreak++;
                } else {
                    break;
                }
            }
        }

        return { current: currentStreak, best: bestStreak };
    },

    calculateFounderStats: function (trips) {
        const routesEl = document.getElementById('profileFounderRoutes');
        const stopsEl = document.getElementById('profileFounderStops');
        if (routesEl) routesEl.textContent = '0';
        if (stopsEl) stopsEl.textContent = '0';
    },

    generateTopRoutes: function (trips) {
        const routeCounts = {};
        trips.forEach(trip => {
            const route = trip.route || 'Unknown';
            routeCounts[route] = (routeCounts[route] || 0) + 1;
        });

        const sortedRoutes = Object.entries(routeCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([route, count]) => ({ route, count }));

        const topRoutesList = document.getElementById('topRoutesList');
        if (!topRoutesList) return;

        if (sortedRoutes.length > 0) {
            const maxTrips = sortedRoutes[0].count;
            topRoutesList.innerHTML = sortedRoutes.map(item => `
                <div class="mastery-card">
                    <div class="mastery-header">
                        <div class="mastery-route">${item.route}</div>
                        <div class="mastery-count">${item.count} trips</div>
                    </div>
                    <div class="mastery-bar-bg">
                        <div class="mastery-bar-fill" style="width: ${(item.count / maxTrips) * 100}%"></div>
                    </div>
                </div>
            `).join('');
        } else {
            topRoutesList.innerHTML = '<div class="empty-state">No routes yet</div>';
        }
    },

    generateTopStops: function (trips) {
        const stopCounts = {};
        trips.forEach(trip => {
            const startStop = trip.startStopName || trip.startStop || trip.startStopCode;
            const endStop = trip.endStopName || trip.endStop || trip.endStopCode;
            if (startStop) stopCounts[startStop] = (stopCounts[startStop] || 0) + 1;
            if (endStop) stopCounts[endStop] = (stopCounts[endStop] || 0) + 1;
        });

        const sortedStops = Object.entries(stopCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([stop, count]) => ({ stop, count }));

        const topStopsList = document.getElementById('topStopsList');
        if (!topStopsList) return;

        if (sortedStops.length > 0) {
            const maxVisits = sortedStops[0].count;
            topStopsList.innerHTML = sortedStops.map(item => `
                <div class="mastery-card">
                    <div class="mastery-header">
                        <div class="mastery-route" style="font-weight: 500; font-size: 0.95em;">${item.stop}</div>
                        <div class="mastery-count">${item.count}</div>
                    </div>
                    <div class="mastery-bar-bg">
                        <div class="mastery-bar-fill" style="width: ${(item.count / maxVisits) * 100}%; opacity: 0.7;"></div>
                    </div>
                </div>
            `).join('');
        } else {
            topStopsList.innerHTML = '<div class="empty-state">No stops yet</div>';
        }
    },

    generateTimeOfDayStats: function (trips) {
        const buckets = {
            'Morning': 0,
            'Day': 0,
            'Evening': 0,
            'Night': 0
        };

        trips.forEach(trip => {
            let date;
            if (trip.startTime?.toDate) {
                date = trip.startTime.toDate();
            } else if (trip.startTime) {
                date = new Date(trip.startTime);
            } else {
                return;
            }

            const hour = date.getHours();
            if (hour >= 5 && hour < 11) buckets['Morning']++;
            else if (hour >= 11 && hour < 17) buckets['Day']++;
            else if (hour >= 17 && hour < 21) buckets['Evening']++;
            else buckets['Night']++;
        });

        const maxCount = Math.max(...Object.values(buckets));
        const container = document.getElementById('timeOfDayChart');
        if (!container) return;

        if (maxCount === 0) {
            container.innerHTML = '<div class="empty-state">No trips yet</div>';
            return;
        }

        let html = '';
        for (const [key, count] of Object.entries(buckets)) {
            const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
            html += `
                <div class="time-bar-row">
                    <div class="time-label">${key}</div>
                    <div class="time-bar-bg">
                        <div class="time-bar-fill" style="width: ${percentage}%"></div>
                    </div>
                    <div class="time-count">${count}</div>
                </div>
            `;
        }
        container.innerHTML = html;
    }
};

// Global exports for legacy compatibility
window.Stats = Stats;
window.updateProfileStats = Stats.updateProfileStats.bind(Stats);
window.updateStatsSection = Stats.updateStatsSection.bind(Stats);
window.initializeStatsToggle = Stats.initializeStatsToggle.bind(Stats);
