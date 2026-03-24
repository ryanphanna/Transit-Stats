/**
 * TransitStats V2 Stats Module
 * Pure logic for processing trip data into dashboard metrics.
 */
export const Stats = {
    /**
     * Compute all dashboard metrics from a list of trips.
     */
    computeMetrics(trips, filterDays = null) {
        if (!trips || trips.length === 0) {
            return {
                trips: 0,
                routes: 0,
                hours: 0,
                stops: 0,
                topRoutes: [],
                topStops: []
            };
        }

        const filtered = filterDays 
            ? this.filterRecent(trips, filterDays) 
            : trips;

        const routeCounts = {};
        const stopCounts = {};
        let totalMinutes = 0;

        filtered.forEach(t => {
            // Count Route
            if (t.route) {
                routeCounts[t.route] = (routeCounts[t.route] || 0) + 1;
            }

            // Count Stops — intentionally union of boarding + exiting stops.
            // The "Stops" metric represents every distinct physical stop the user has
            // ever touched, regardless of role. Once all stops are normalized to
            // canonical names via the stop library, duplicate entries within a single
            // trip (e.g. a stop that is both a start and an end across different trips)
            // will be naturally deduplicated by the shared key in stopCounts.
            const start = t.startStopName || t.startStop || t.startStopCode;
            const end = t.endStopName || t.endStop || t.endStopCode;
            if (start) stopCounts[start] = (stopCounts[start] || 0) + 1;
            if (end) stopCounts[end] = (stopCounts[end] || 0) + 1;

            // Compute Duration
            totalMinutes += (t.duration || 0);
        });

        return {
            trips: filtered.length,
            routes: Object.keys(routeCounts).length,
            hours: Math.round((totalMinutes / 60) * 10) / 10,
            stops: Object.keys(stopCounts).length,
            topRoutes: this.getTopItems(routeCounts, 5),
            topStops: this.getTopItems(stopCounts, 5)
        };
    },

    filterRecent(trips, days) {
        const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
        return trips.filter(t => {
            const time = t.startTime?.toDate ? t.startTime.toDate().getTime() : new Date(t.startTime).getTime();
            return time >= cutoff;
        });
    },

    getTopItems(countsObj, limit) {
        return Object.entries(countsObj)
            .sort(([, a], [, b]) => b - a)
            .slice(0, limit)
            .map(([name, count]) => ({ name, count }));
    },

    calculateStreaks(trips) {
        if (!trips || trips.length === 0) return { current: 0, best: 0 };

        const dayTimestamps = new Set();
        trips.forEach(t => {
            const date = t.startTime?.toDate ? t.startTime.toDate() : new Date(t.startTime);
            if (isNaN(date.getTime())) return;
            const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
            dayTimestamps.add(normalized);
        });

        const sorted = Array.from(dayTimestamps).sort((a, b) => b - a);
        if (sorted.length === 0) return { current: 0, best: 0 };

        // Best Streak
        let best = 1;
        let temp = 1;
        for (let i = 0; i < sorted.length - 1; i++) {
            const diffDays = Math.round((sorted[i] - sorted[i+1]) / (24 * 60 * 60 * 1000));
            if (diffDays === 1) {
                temp++;
            } else {
                best = Math.max(best, temp);
                temp = 1;
            }
        }
        best = Math.max(best, temp);

        // Current Streak
        const today = new Date();
        today.setHours(0,0,0,0);
        const todayTs = today.getTime();
        const yesterdayTs = todayTs - (24 * 60 * 60 * 1000);
        
        const latest = sorted[0];
        let current = 0;
        if (latest === todayTs || latest === yesterdayTs) {
            current = 1;
            for (let i = 0; i < sorted.length - 1; i++) {
                const diffDays = Math.round((sorted[i] - sorted[i+1]) / (24 * 60 * 60 * 1000));
                if (diffDays === 1) current++;
                else break;
            }
        }

        return { current, best };
    },

    /**
     * Group trips by time of day buckets.
     */
    computePeakTimes(trips) {
        const buckets = { 'Morning': 0, 'Day': 0, 'Evening': 0, 'Night': 0 };
        trips.forEach(t => {
            const date = t.startTime?.toDate ? t.startTime.toDate() : new Date(t.startTime);
            const hour = date.getHours();
            if (hour >= 5 && hour < 11) buckets['Morning']++;
            else if (hour >= 11 && hour < 17) buckets['Day']++;
            else if (hour >= 17 && hour < 21) buckets['Evening']++;
            else buckets['Night']++;
        });
        return buckets;
    },

    /**
     * Find frequently traveled corridors with speed insights.
     */
    computeHighlights(trips) {
        const corridors = {};
        trips.forEach(t => {
            const start = (t.startStopName || t.startStop || '').trim();
            const end = (t.endStopName || t.endStop || '').trim();
            if (!start || !end || start === end || !t.duration) return;

            const key = `[${t.route}] ${start} → ${end}`;
            if (!corridors[key]) {
                corridors[key] = { name: key, durations: [] };
            }
            corridors[key].durations.push(t.duration);
        });

        return Object.values(corridors)
            .filter(c => c.durations.length >= 2)
            .map(c => {
                const sum = c.durations.reduce((a, b) => a + b, 0);
                return {
                    name: c.name,
                    count: c.durations.length,
                    avg: Math.round(sum / c.durations.length),
                    min: Math.min(...c.durations),
                    max: Math.max(...c.durations),
                    durations: [...c.durations].reverse() // oldest → newest
                };
            })
            .sort((a, b) => b.count - a.count)
            .slice(0, 3);
    },
    
    /**
     * Compute trips per day for the last N weeks to fit a GitHub-style grid.
     */
    computeActivityHeatmap(trips, weeks = 22) {
        const data = {};
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Fill last 154 days (22 weeks * 7 days)
        for (let i = 0; i < weeks * 7; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            const key = d.toISOString().split('T')[0];
            data[key] = 0;
        }

        trips.forEach(t => {
            const date = t.startTime?.toDate ? t.startTime.toDate() : new Date(t.startTime);
            if (isNaN(date.getTime())) return;
            const key = date.toISOString().split('T')[0];
            if (data[key] !== undefined) {
                data[key]++;
            }
        });

        // Return sorted by date ASC
        return Object.entries(data)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, count]) => ({ date, count }));
    },
    
    /**
     * Compute trips per day for the last N days.
     */
    computeSparkline(trips, days = 28) {
        const counts = Array(days).fill(0);
        const today = new Date();
        today.setHours(0,0,0,0);
        const todayTs = today.getTime();

        trips.forEach(t => {
            const date = t.startTime?.toDate ? t.startTime.toDate() : new Date(t.startTime);
            if (isNaN(date.getTime())) return;
            const norm = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
            const diffDays = Math.round((todayTs - norm) / (24 * 60 * 60 * 1000));
            if (diffDays >= 0 && diffDays < days) {
                counts[(days - 1) - diffDays]++;
            }
        });
        return counts;
    }
};
