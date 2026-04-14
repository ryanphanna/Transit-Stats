import { Stats } from '../stats.js';
import { Utils } from '../utils.js';

/**
 * TripStatsView - Manages the visualization of transit metrics and analytics.
 */
export const TripStatsView = {
    render(trips, range = 30) {
        const metrics = Stats.computeMetrics(trips, range);

        // Update primary metric boxes
        this._updateBox('stat-trips', metrics.trips);
        this._updateBox('stat-routes', metrics.routes);
        this._updateBox('stat-hours', metrics.hours);
        this._updateBox('stat-stops', metrics.stops);

        // Update top routes/stops lists
        this._renderCompactList('top-routes-list', metrics.topRoutes);
        this._renderCompactList('top-stops-list', metrics.topStops);

        // Heatmaps & Charts
        const activityPoints = Stats.computeActivityHeatmap(trips);
        this._renderActivityGrid(activityPoints);

        const peakTimes = Stats.computePeakTimes(trips);
        this._renderPeakChart('time-of-day-chart', peakTimes);

        // Streaks
        const streaks = Stats.calculateStreaks(trips);
        this._updateBox('stat-current-streak', streaks.current);
        this._updateBox('stat-best-streak', streaks.best);

        // Commute Highlights (Insights page)
        const highlights = Stats.computeHighlights(trips);
        this._renderHighlights('commute-highlights-insights', highlights);
    },

    _updateBox(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    },

    _renderCompactList(containerId, items) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (!items.length) {
            container.innerHTML = '<div class="loading-state">Insufficient data.</div>';
            return;
        }

        container.innerHTML = items.map(item => `
            <div class="compact-row">
                <span class="row-label">${Utils.hide(item.name)}</span>
                <span class="row-value font-mono">${item.count}</span>
            </div>
        `).join('');
    },

    _renderHighlights(containerId, highlights) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (!highlights || highlights.length === 0) {
            container.innerHTML = '<div class="loading-state">Not enough data yet — need at least 2 trips on the same corridor.</div>';
            return;
        }

        container.innerHTML = highlights.map(h => `
            <div class="highlight-row">
                <div class="highlight-name">${Utils.hide(h.name)}</div>
                <div class="highlight-meta">
                    <span>${h.count} trips</span>
                    <span class="text-muted">·</span>
                    <span>avg ${h.avg} min</span>
                    <span class="text-muted">·</span>
                    <span>best ${h.min} min</span>
                </div>
            </div>
        `).join('');
    },

    _renderActivityGrid(points) {
        const container = document.getElementById('activity-grid-container');
        if (!container) return;

        container.innerHTML = '';
        for (let i = 0; i < points.length; i += 7) {
            const week = points.slice(i, i + 7);
            const col = document.createElement('div');
            col.className = 'grid-day-column';

            week.forEach(d => {
                const square = document.createElement('div');
                const heat = Math.min(d.count, 4);
                square.className = `grid-square heat-${heat}`;
                square.title = `${d.date}: ${d.count} sessions`;
                col.appendChild(square);
            });
            container.appendChild(col);
        }
    },

    _renderPeakChart(containerId, buckets) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const max = Math.max(...Object.values(buckets), 1);
        
        container.innerHTML = Object.entries(buckets).map(([key, count]) => {
            const width = (count / max) * 100;
            return `
                <div class="chart-row">
                    <span class="chart-label text-xxs">${key}</span>
                    <div class="chart-bar-bg">
                        <div class="chart-bar-fill" style="width: ${width}%"></div>
                    </div>
                    <span class="chart-value font-mono">${count}</span>
                </div>
            `;
        }).join('');
    }
};
