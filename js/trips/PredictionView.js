import { PredictionEngine } from '../predict.js';
import { Profile } from '../profile.js';

/**
 * PredictionView - Manages the 'Intelligence' UI for anticipating next trips.
 */
export const PredictionView = {
    render(activeTrip, allTrips) {
        const card = document.getElementById('prediction-card');
        const content = document.getElementById('prediction-content');
        if (!card || !content) return;

        // Prediction card is admin-only; admins can toggle it off in Settings
        if (!window.isAdmin) {
            card.style.display = 'none';
            return;
        }
        const betaEnabled = Profile.data?.betaFeatures?.predictions;
        if (betaEnabled === false) {
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

        card.querySelector('.prediction-label').textContent = "Trip in Progress";
        card.classList.add('trip-active-card');
        card.style.display = 'block';

        if (p) {
            const arrival = p.avgDuration ? `~${p.avgDuration} min` : 'Arrival time unknown';
            content.innerHTML = `
                <div class="prediction-main">
                    <div class="prediction-route">Ending at ${Utils.hide(p.stop)}</div>
                    <div class="prediction-stop text-secondary">${Utils.hide(arrival)} • ${p.confidence}% confidence</div>
                </div>
                <div class="prediction-stats">
                     <div class="stat-indicator active"></div>
                </div>
            `;
        } else {
            content.innerHTML = `
                <div class="prediction-main">
                    <div class="prediction-route">No prediction available</div>
                    <div class="prediction-stop text-muted">No historical matches for this route.</div>
                </div>
            `;
        }
    },

    _renderPassivePrediction(card, content, allTrips) {
        const p = PredictionEngine.guess(allTrips, {
            time: new Date()
        });

        card.querySelector('.prediction-label').textContent = "Next Trip Prediction";
        card.classList.remove('trip-active-card');

        if (p && p.confidence > 25) {
            card.style.display = 'block';
            content.innerHTML = `
                <div class="prediction-main">
                    <div class="prediction-route">${Utils.hide(p.route)} ${Utils.hide(p.direction || '')}</div>
                    <div class="prediction-stop">From ${Utils.hide(p.stop)}</div>
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
