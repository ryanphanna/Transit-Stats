import { Utils } from '../utils.js';
import { TripController } from './TripController.js';

/**
 * TripFeed - Manages the UI rendering for the trip cards and feed.
 */
export const TripFeed = {
    _visibleCount: 20,
    _PAGE_SIZE: 20,

    render(container, trips, onEdit, reset = false) {
        if (!container) return;
        if (!trips || trips.length === 0) {
            container.innerHTML = '<div class="loading-state">No trips yet.</div>';
            return;
        }

        if (reset) this._visibleCount = this._PAGE_SIZE;

        container.innerHTML = '';
        const visible = trips.slice(0, this._visibleCount);

        visible.forEach((trip, i) => {
            container.appendChild(this._createCard(trip, onEdit));
            const next = visible[i + 1];
            if (trip.journeyId && next?.journeyId === trip.journeyId) {
                container.appendChild(this._createConnector(trip, next));
            }
        });

        if (this._visibleCount < trips.length) {
            const btn = document.createElement('button');
            btn.className = 'btn btn-outline full-width mt-3';
            btn.textContent = `Show more (${trips.length - this._visibleCount} remaining)`;
            btn.addEventListener('click', () => {
                this._visibleCount += this._PAGE_SIZE;
                this.render(container, trips, onEdit);
            });
            container.appendChild(btn);
        }

        if (window.lucide) lucide.createIcons();
    },

    _createCard(trip, onEdit) {
        const card = document.createElement('div');
        card.className = `trip-card ${trip.needs_review ? 'trip-needs-review' : ''}`;

        const startTime = trip.startTime?.toDate ? trip.startTime.toDate() : new Date(trip.startTime || Date.now());
        const dateStr = isNaN(startTime.getTime()) ? '—' : startTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        const startStop = Utils.normalizeIntersectionStop(trip.startStopName || trip.startStop) || 'Unknown Station';
        const endStop = Utils.normalizeIntersectionStop(trip.endStopName || trip.endStop) || 'Pending...';

        const dirAbbr = { Northbound: 'NB', Southbound: 'SB', Eastbound: 'EB', Westbound: 'WB', Inbound: 'IB', Outbound: 'OB' };
        const direction = trip.direction ? (dirAbbr[trip.direction] || trip.direction) : '';

        card.innerHTML = `
            ${trip.needs_review ? `
                <div class="trip-review-banner">
                    <i data-lucide="alert-triangle"></i>
                    <span>Unrecognized route — confirm validity.</span>
                    <div class="trip-review-actions">
                        <button class="btn btn-sm btn-outline btn-confirm-trip">Confirm</button>
                        <button class="btn btn-sm btn-danger-outline btn-delete-trip">Discard</button>
                    </div>
                </div>
            ` : ''}
            <div class="trip-card-body">
                <div class="trip-info">
                    <div class="trip-main">
                        <div class="trip-route-pill">${Utils.hide(trip.route)}</div>
                        <div class="trip-path">
                            <span class="stop-name">${Utils.hide(startStop)}</span>
                            <span class="path-arrow">→</span>
                            <span class="stop-name">${Utils.hide(endStop)}</span>
                        </div>
                    </div>
                    <button class="btn-edit-trip" title="Edit Parameters"><i data-lucide="edit-3"></i></button>
                </div>
                <div class="trip-meta text-right">
                    <div class="trip-date">${Utils.hide(dateStr)}</div>
                    ${direction ? `<div class="trip-direction font-bold text-xxs">${Utils.hide(direction)}</div>` : ''}
                    <div class="trip-duration text-secondary text-xs">${parseInt(trip.duration) || 0} min</div>
                    ${trip.rocketTripId ? `<div class="trip-rocket-badge text-accent" title="Rocket Instrument Sampling"><i data-lucide="microscope" class="icon-inline"></i></div>` : ''}
                </div>
            </div>
        `;

        // Interaction Handlers
        card.querySelector('.btn-edit-trip').addEventListener('click', () => onEdit(trip));

        if (trip.needs_review) {
            card.querySelector('.btn-confirm-trip').addEventListener('click', () => TripController.confirmTrip(trip.id));
            card.querySelector('.btn-delete-trip').addEventListener('click', () => {
                if (confirm('Permanently delete this trip record?')) TripController.delete(trip.id);
            });
        }

        return card;
    },

    _createConnector(later, earlier) {
        const el = document.createElement('div');
        el.className = 'journey-connector';

        let gapStr = 'Transfer';
        try {
            const lStart = later.startTime?.toDate ? later.startTime.toDate() : new Date(later.startTime);
            const eEnd = earlier.endTime?.toDate ? earlier.endTime.toDate() : new Date(earlier.endTime);
            const gapMin = Math.round((lStart - eEnd) / 60000);
            gapStr = gapMin < 1 ? '<1 min transfer' : `${gapMin} min transfer`;
        } catch (_) {}

        el.innerHTML = `
            <div class="journey-line"></div>
            <div class="journey-badge">
                <i data-lucide="link" class="icon-inline"></i>
                <span class="text-xxs">${gapStr}</span>
                <button class="btn-break-journey" title="Decouple Journey"><i data-lucide="scissors"></i></button>
            </div>
            <div class="journey-line"></div>
        `;

        el.querySelector('.btn-break-journey').addEventListener('click', () => {
            TripController.breakJourneyLink(later.id, earlier.id);
        });

        return el;
    }
};
