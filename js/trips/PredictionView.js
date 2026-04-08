import { PredictionEngine } from '../predict.js';

/**
 * PredictionView - Manages the 'Intelligence' UI for anticipating next trips.
 */
export const PredictionView = {
    render(activeTrip, allTrips) {
        const card = document.getElementById('prediction-card');
        const content = document.getElementById('prediction-content');
        if (!card || !content) return;

        // Hide prediction deck if not an administrator
        if (!window.isAdmin) {
            card.style.display = 'none';
            return;
        }

        if (activeTrip) {
            this._renderActivePrediction(card, content, activeTrip, allTrips);
        } else {
            this._renderPassivePrediction(card, content, allTrips);
        }
    },

    _renderActivePrediction(card, content, activeTrip, allTrips) {
        const p = PredictionEngine.guessEndStop(allTrips, {
            route: activeTrip.route,
            startStopName: activeTrip.startStop,
            direction: activeTrip.direction,
            time: activeTrip.startTime?.toDate ? activeTrip.startTime.toDate() : new Date(activeTrip.startTime)
        });

        card.querySelector('.prediction-label').textContent = "Active Telemetry Prediction";
        card.classList.add('trip-active-card');
        card.style.display = 'block';

        if (p) {
            const arrival = p.avgDuration ? `ETA: ~${p.avgDuration} min` : 'Intercept Time Unknown';
            content.innerHTML = `
                <div class="prediction-main">
                    <div class="prediction-route">Terminating: ${p.stop}</div>
                    <div class="prediction-stop text-secondary">${arrival} • Confidence Interval: ${p.confidence}%</div>
                </div>
                <div class="prediction-stats">
                     <div class="stat-indicator active"></div>
                </div>
            `;
        } else {
            content.innerHTML = `
                <div class="prediction-main">
                    <div class="prediction-route">Unmapped Vector</div>
                    <div class="prediction-stop text-muted">No historical matches found for this route segment.</div>
                </div>
            `;
        }
    },

    _renderPassivePrediction(card, content, allTrips) {
        const p = PredictionEngine.guess(allTrips, {
            time: new Date()
        });

        card.querySelector('.prediction-label').textContent = "Anticipated Deployment";
        card.classList.remove('trip-active-card');

        if (p && p.confidence > 25) {
            card.style.display = 'block';
            content.innerHTML = `
                <div class="prediction-main">
                    <div class="prediction-route">${p.route} ${p.direction || ''}</div>
                    <div class="prediction-stop">Expected deployment from ${p.stop}</div>
                </div>
                <div class="prediction-stats">
                    <span class="prediction-confidence font-mono">${p.confidence}%</span>
                    <span class="prediction-confidence-label">Signal</span>
                </div>
            `;
        } else {
            card.style.display = 'none';
        }
    }
};
