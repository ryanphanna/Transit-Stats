
import { db } from './firebase.js';
import { UI } from './ui-utils.js';

/**
 * Route Tracker Module
 * Shows per-agency route completion based on imported GTFS routes and user trips.
 */
export const RouteTracker = {
    currentAgency: null,
    routesCache: {},    // agency -> routes[]
    currentView: 'unridden',

    init: function () {
        // Default to user's profile agency, fall back to TTC
        const profileAgency = window.Profile?.currentProfile?.defaultAgency;
        this.currentAgency = profileAgency || 'TTC';

        const select = document.getElementById('routeTrackerAgency');
        if (select) select.value = this.currentAgency;

        this._loadAndRender();
    },

    setAgency: function (agency) {
        this.currentAgency = agency;
        this.currentView = 'unridden';
        this._loadAndRender();
    },

    /** Called by main.js whenever trips reload so the tracker stays in sync */
    refresh: function () {
        if (this.currentAgency) this._loadAndRender();
    },

    _loadAndRender: async function () {
        const container = document.getElementById('routeTrackerContent');
        if (!container || !window.currentUser) return;

        container.innerHTML = '<div class="loading">Loading routes...</div>';

        try {
            const routes = await this._getRoutes(this.currentAgency);

            if (routes.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        No routes imported for ${UI.escapeHtml(this.currentAgency)} yet.<br>
                        <span style="font-size:0.85em; color: var(--text-muted);">
                            An admin can import them via Data Manager.
                        </span>
                    </div>`;
                return;
            }

            const riddenSet = this._getRiddenSet(this.currentAgency);
            this._render(container, routes, riddenSet);
        } catch (err) {
            console.error('RouteTracker error:', err);
            container.innerHTML = '<div class="empty-state">Error loading routes.</div>';
        }
    },

    _getRoutes: async function (agency) {
        if (this.routesCache[agency]) return this.routesCache[agency];

        const snapshot = await db.collection('routes').where('agency', '==', agency).get();
        const routes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        routes.sort((a, b) => {
            const aNum = parseInt(a.routeShortName, 10);
            const bNum = parseInt(b.routeShortName, 10);
            if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
            return String(a.routeShortName).localeCompare(String(b.routeShortName));
        });

        this.routesCache[agency] = routes;
        return routes;
    },

    _getRiddenSet: function (agency) {
        if (!window.Trips?.allCompletedTrips) return new Set();
        return new Set(
            window.Trips.allCompletedTrips
                .filter(t => t.agency === agency && t.route)
                .map(t => String(t.route).trim().toLowerCase())
        );
    },

    _render: function (container, routes, riddenSet) {
        const normalize = r => String(r.routeShortName).trim().toLowerCase();
        const ridden = routes.filter(r => riddenSet.has(normalize(r)));
        const unridden = routes.filter(r => !riddenSet.has(normalize(r)));
        const total = routes.length;
        const riddenCount = ridden.length;
        const pct = total > 0 ? Math.round((riddenCount / total) * 100) : 0;

        const showUnridden = this.currentView !== 'ridden';
        const listHtml = this._renderList(showUnridden ? unridden : ridden, !showUnridden);

        container.innerHTML = `
            <div style="margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
                    <span style="font-size: 0.85em; color: var(--text-muted); font-weight: 600;">${riddenCount} of ${total} routes</span>
                    <span style="font-size: 1.4em; font-weight: 800; color: var(--accent-electric);">${pct}%</span>
                </div>
                <div class="mastery-bar-bg">
                    <div class="mastery-bar-fill" style="width: 0%;" data-width="${pct}%"></div>
                </div>
            </div>

            <div style="display: flex; gap: 6px; margin-bottom: 14px; background: var(--bg-tertiary); padding: 4px; border-radius: 8px;">
                <button id="rtBtnUnridden" class="toggle-btn rt-toggle ${showUnridden ? 'active' : ''}" style="flex: 1; padding: 4px 8px; border: none; border-radius: 6px; font-size: 0.8em; font-weight: 700; cursor: pointer; background: ${showUnridden ? 'var(--bg-primary)' : 'transparent'};">
                    Missing (${unridden.length})
                </button>
                <button id="rtBtnRidden" class="toggle-btn rt-toggle ${!showUnridden ? 'active' : ''}" style="flex: 1; padding: 4px 8px; border: none; border-radius: 6px; font-size: 0.8em; font-weight: 700; cursor: pointer; background: ${!showUnridden ? 'var(--bg-primary)' : 'transparent'};">
                    Ridden (${ridden.length})
                </button>
            </div>

            <div id="rtRouteList" class="rt-route-list">
                ${listHtml}
            </div>
        `;

        // Animate progress bar
        setTimeout(() => {
            const bar = container.querySelector('.mastery-bar-fill');
            if (bar) bar.style.width = bar.getAttribute('data-width');
        }, 100);

        // Toggle handlers
        container.querySelector('#rtBtnUnridden').addEventListener('click', () => {
            this.currentView = 'unridden';
            container.querySelector('#rtBtnUnridden').style.background = 'var(--bg-primary)';
            container.querySelector('#rtBtnRidden').style.background = 'transparent';
            container.querySelector('#rtBtnUnridden').classList.add('active');
            container.querySelector('#rtBtnRidden').classList.remove('active');
            container.querySelector('#rtRouteList').innerHTML = this._renderList(unridden, false);
        });

        container.querySelector('#rtBtnRidden').addEventListener('click', () => {
            this.currentView = 'ridden';
            container.querySelector('#rtBtnRidden').style.background = 'var(--bg-primary)';
            container.querySelector('#rtBtnUnridden').style.background = 'transparent';
            container.querySelector('#rtBtnRidden').classList.add('active');
            container.querySelector('#rtBtnUnridden').classList.remove('active');
            container.querySelector('#rtRouteList').innerHTML = this._renderList(ridden, true);
        });
    },

    _renderList: function (routes, isRidden) {
        if (routes.length === 0) {
            return `<div class="empty-state">${isRidden ? 'No ridden routes yet.' : '🎉 All routes ridden!'}</div>`;
        }
        return routes.map(r => `
            <div class="rt-route-item">
                <span class="rt-route-badge">${UI.escapeHtml(String(r.routeShortName))}</span>
                <span class="rt-route-name">${UI.escapeHtml(r.routeLongName || '')}</span>
                ${isRidden ? '<span class="rt-route-check">✓</span>' : ''}
            </div>
        `).join('');
    },
};

window.RouteTracker = RouteTracker;
window.setRouteTrackerAgency = (agency) => RouteTracker.setAgency(agency);
