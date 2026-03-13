
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

        // If trips are already cached, compute stats client-side (no Firestore read needed)
        if (window.Trips && window.Trips.allCompletedTrips) {
            const allTrips = window.Trips.allCompletedTrips;
            let trips = allTrips;

            if (this.currentStatsView === '30days') {
                const cutoff = new Date();
                cutoff.setDate(cutoff.getDate() - 30);
                trips = allTrips.filter(t => {
                    if (!t.startTime) return false;
                    const d = t.startTime.toDate ? t.startTime.toDate() : new Date(t.startTime);
                    return d >= cutoff;
                });
            }

            this._renderStatsFromTrips(trips);
            return;
        }

        // Fallback: query Firestore (e.g. stats toggled before trips have loaded)
        let query = db.collection('trips').where('userId', '==', window.currentUser.uid);

        if (this.currentStatsView === '30days') {
            const dateFilter = new Date();
            dateFilter.setDate(dateFilter.getDate() - 30);
            query = query.where('startTime', '>=', Timestamp.fromDate(dateFilter));
        }

        query.get()
            .then((snapshot) => {
                const trips = snapshot.docs.map(doc => doc.data());
                this._renderStatsFromTrips(trips);
            })
            .catch((error) => {
                console.error('Error updating stats:', error);
            });
    },

    _renderStatsFromTrips: function (trips) {
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
        this.generateInsights(trips);
        this.generateTimeOfDayStats(trips);
    },

    updateProfileStats: function () {
        if (!window.currentUser) {
            return;
        }

        // Throttle updates to avoid freezing during initial load sync
        // Throttle updates to avoid freezing during initial load sync
        if (this._updateTimeout) {
            clearTimeout(this._updateTimeout);
        }
        this._updateTimeout = setTimeout(() => {
            this._runProfileStatsUpdate();
            this._updateTimeout = null;
        }, 1000); // Increased throttle to 1s
    },

    _runProfileStatsUpdate: function () {
        if (!window.currentUser) return;

        // Prefer the already-loaded trip data from Trips module to avoid extra Firestore reads
        if (window.Trips && window.Trips.allCompletedTrips && window.Trips.allCompletedTrips.length >= 0) {
            console.log('Stats: Reusing cached trip data for profile metrics.');
            this._computeProfileStats(window.Trips.allCompletedTrips);
            return;
        }

        db.collection('trips')
            .where('userId', '==', window.currentUser.uid)
            .get()
            .then((snapshot) => {
                const trips = snapshot.docs.map(doc => doc.data());
                this._computeProfileStats(trips);
            })
            .catch(err => {
                console.error('Stats: updateProfileStats error:', err);
            });
    },

    _computeProfileStats: function (trips) {
        const streakData = this.calculateStreaks(trips);

        const profileStreak = document.getElementById('profileCurrentStreak');
        const profileBest = document.getElementById('profileBestStreak');
        if (profileStreak) profileStreak.textContent = streakData.current;
        if (profileBest) profileBest.textContent = streakData.best;

        // Also update the profile agency/status text while we're here
        const displayAgency = document.getElementById('displayAgency');
        if (displayAgency && window.currentUserProfile) {
            displayAgency.textContent = window.currentUserProfile.defaultAgency || 'TTC';
        } else if (displayAgency && trips.length > 0) {
            displayAgency.textContent = 'Active Traveler';
        }

        this.calculateFounderStats(trips);
    },

    _updateTimeout: null,

    calculateStreaks: function (trips) {
        if (!trips || trips.length === 0) return { current: 0, best: 0 };

        const tripDates = new Set();
        trips.forEach(trip => {
            // Use startTime or endTime as a fallback to ensure we capture all active days
            const rawDate = trip.startTime || trip.endTime;
            if (!rawDate) return;

            let date;
            if (rawDate.toDate) {
                date = rawDate.toDate();
            } else {
                date = new Date(rawDate);
            }

            // Skip invalid dates
            if (isNaN(date.getTime())) return;

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

        // Check if the streak is still active (trip today or yesterday)
        const latestTripTs = sortedTimestamps[0];
        let isStreakActive = (latestTripTs === todayTs || latestTripTs === yesterdayTs);

        let currentStreak = 0;
        let bestStreak = 0;

        // Calculate Best Streak
        if (sortedTimestamps.length > 0) {
            let tempStreak = 1;
            bestStreak = 1;

            for (let i = 0; i < sortedTimestamps.length - 1; i++) {
                const diffTime = sortedTimestamps[i] - sortedTimestamps[i + 1];
                const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays === 1) {
                    tempStreak++;
                } else if (diffDays > 1) {
                    bestStreak = Math.max(bestStreak, tempStreak);
                    tempStreak = 1;
                }
            }
            bestStreak = Math.max(bestStreak, tempStreak);
        }

        // Calculate Current Streak
        if (isStreakActive) {
            currentStreak = 1;
            for (let i = 0; i < sortedTimestamps.length - 1; i++) {
                const diffTime = sortedTimestamps[i] - sortedTimestamps[i + 1];
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
                <div class="mastery-row">
                    <div class="mastery-header">
                        <div class="mastery-route">${this._getRouteIcon(item.route)} ${item.route}</div>
                        <div class="mastery-count">${item.count} trips</div>
                    </div>
                    <div class="mastery-bar-bg">
                        <div class="mastery-bar-fill" style="width: 0%;" data-width="${(item.count / maxTrips) * 100}%"></div>
                    </div>
                </div>
            `).join('');

            // Trigge bar animation
            setTimeout(() => {
                const bars = topRoutesList.querySelectorAll('.mastery-bar-fill');
                bars.forEach(bar => {
                    bar.style.width = bar.getAttribute('data-width');
                });
            }, 100);
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
                <div class="mastery-row">
                    <div class="mastery-header">
                        <div class="mastery-route" style="font-weight: 700; font-size: 1.0em;">📍 ${item.stop}</div>
                        <div class="mastery-count">${item.count} visits</div>
                    </div>
                    <div class="mastery-bar-bg">
                        <div class="mastery-bar-fill" style="width: 0%;" data-width="${(item.count / maxVisits) * 100}%"></div>
                    </div>
                </div>
            `).join('');

            // Trigger bar animation
            setTimeout(() => {
                const bars = topStopsList.querySelectorAll('.mastery-bar-fill');
                bars.forEach(bar => {
                    bar.style.width = bar.getAttribute('data-width');
                    bar.style.opacity = '0.8';
                });
            }, 100);
        } else {
            topStopsList.innerHTML = '<div class="empty-state">No stops yet</div>';
        }
    },

    generateInsights: function (trips) {
        const corridors = {};
        
        trips.forEach(trip => {
            if (!trip.duration) return;
            const route = trip.route || 'Unknown';
            const start = (trip.startStopName || trip.startStop || '').trim();
            const end = (trip.endStopName || trip.endStop || '').trim();
            
            if (!start || !end || start === end) return;
            
            // Group by [Route] Start → End
            const key = `[${route}] ${start} → ${end}`;
            if (!corridors[key]) {
                corridors[key] = {
                    key: key,
                    route: route,
                    start: start,
                    end: end,
                    durations: []
                };
            }
            corridors[key].durations.push(trip.duration);
        });

        const highlightList = Object.values(corridors)
            .filter(c => c.durations.length >= 2)
            .map(c => {
                const avg = Math.round(c.durations.reduce((a, b) => a + b, 0) / c.durations.length);
                const min = Math.min(...c.durations);
                const max = Math.max(...c.durations);
                return { ...c, avg, min, max, count: c.durations.length };
            })
            .sort((a, b) => b.count - a.count)
            .slice(0, 3);

        const container = document.getElementById('commuteHighlights');
        if (!container) return;

        if (highlightList.length > 0) {
            container.innerHTML = highlightList.map(c => `
                <div class="commute-row" style="margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px;">
                    <div style="font-weight: 800; font-size: 0.85em; margin-bottom: 8px; color: var(--text-primary); display: flex; justify-content: space-between; align-items: baseline; gap: 8px;">
                        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${c.key}</span>
                        <span style="color: var(--accent-electric); opacity: 0.8; flex-shrink: 0;">${c.count}x</span>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
                        <div class="mini-stat">
                            <div style="font-size: 1.1em; font-weight: 800;">${c.avg}m</div>
                            <div style="font-size: 0.7em; color: var(--text-muted); font-weight: 700;">AVG</div>
                        </div>
                        <div class="mini-stat">
                            <div style="font-size: 1.1em; font-weight: 800; color: #10b981;">${c.min}m</div>
                            <div style="font-size: 0.7em; color: var(--text-muted); font-weight: 700;">FAST</div>
                        </div>
                        <div class="mini-stat" style="opacity: 0.6;">
                            <div style="font-size: 1.1em; font-weight: 800;">${c.max}m</div>
                            <div style="font-size: 0.7em; color: var(--text-muted); font-weight: 700;">SLOW</div>
                        </div>
                    </div>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<div class="empty-state">Commute more to unlock insights</div>';
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
                        <div class="time-bar-fill" style="width: 0%;" data-width="${percentage}%"></div>
                    </div>
                    <div class="time-count">${count}</div>
                </div>
            `;
        }
        container.innerHTML = html;

        // Trigger bar animation
        setTimeout(() => {
            const bars = container.querySelectorAll('.time-bar-fill');
            bars.forEach(bar => {
                bar.style.width = bar.getAttribute('data-width');
            });
        }, 100);
    },

    _getRouteIcon: function (route) {
        if (!route) return '📍';
        const r = route.toLowerCase();
        if (r.includes('line 1') || r === '1') return '🟡';
        if (r.includes('line 2') || r === '2') return '🟢';
        if (r.includes('line 3') || r === '3') return '🔵';
        if (r.includes('line 4') || r === '4') return '🟣';
        if (r.includes('go') || r.includes('train')) return '🚆';
        if (r.match(/^[0-9]{3}/)) return '🚌'; // Streetcar or 3-digit bus
        if (r.includes('50') || r.includes('51')) return '🚋'; // Toronto Streetcars
        return '🚌';
    }
};

// Global exports for legacy compatibility
window.Stats = Stats;
window.updateProfileStats = Stats.updateProfileStats.bind(Stats);
window.updateStatsSection = Stats.updateStatsSection.bind(Stats);
window.initializeStatsToggle = Stats.initializeStatsToggle.bind(Stats);
