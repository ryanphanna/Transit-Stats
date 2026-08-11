
import { db } from './firebase.js';
import { UI } from './ui-utils.js';
import { TripController } from './trips/TripController.js';

/**
 * Route Tracker Module
 * Shows per-agency route completion based on Atlas route data and user trips.
 *
 * Route definitions load from the Atlas R2 GeoJSON (read-only consumer of the
 * weekly pipeline output), cached in IndexedDB keyed by refresh week. The
 * Firestore `routes` collection remains as a fallback for agencies Atlas
 * doesn't carry or when the fetch fails.
 */

const ATLAS_ROUTES_PROXY = import.meta.env.VITE_ATLAS_ROUTES_URL
    || (import.meta.env.DEV ? '/atlas-dev/routes' : 'https://us-central1-transitstats-21ba4.cloudfunctions.net/atlasRoutes');

// Transit Stats agency name -> Atlas slug (must match Atlas index.json).
const ATLAS_SLUGS = {
    'TTC': 'ttc',
    'OC Transpo': 'octranspo',
    'GO Transit': 'go',
    'MiWay': 'miway',
    'YRT': 'yrt',
    'Brampton Transit': 'brampton',
    'Durham Transit': 'drt',
    'HSR': 'hamilton',
};

const IDB_NAME = 'transitstats-cache';
const IDB_STORE = 'atlasRoutes';

export const RouteTracker = {
    currentAgency: null,
    routesCache: {},    // agency -> routes[]
    init: function () {
        // Default to user's profile agency, fall back to TTC
        const profileAgency = window.currentUserProfile?.defaultAgency;
        this.currentAgency = profileAgency || 'TTC';

        const select = document.getElementById('routeTrackerAgency');
        if (select) select.value = this.currentAgency;

        this._loadAndRender();
    },

    setAgency: function (agency) {
        this.currentAgency = agency;
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
                        No routes available for ${UI.escapeHtml(this.currentAgency)} yet.
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

        let routes = null;
        const slug = ATLAS_SLUGS[agency];
        if (slug) {
            const cacheKey = `${slug}-${this._weekVersion()}`;
            routes = await this._idbGet(cacheKey).catch(() => null);
            if (!routes) {
                routes = await this._fetchAtlasRoutes(slug);
                if (routes) this._idbPut(cacheKey, routes).catch(() => {});
            }
        }

        // Fallback: legacy Firestore routes collection (agency not in Atlas,
        // or the R2 fetch failed).
        if (!routes) {
            const snapshot = await db.collection('routes').where('agency', '==', agency).get();
            routes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }

        routes.sort((a, b) => {
            const aNum = parseInt(a.routeShortName, 10);
            const bNum = parseInt(b.routeShortName, 10);
            if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
            return String(a.routeShortName).localeCompare(String(b.routeShortName));
        });

        this.routesCache[agency] = routes;
        return routes;
    },

    /** Unique route metadata from Atlas; null on any failure. */
    _fetchAtlasRoutes: async function (slug) {
        try {
            const res = await fetch(`${ATLAS_ROUTES_PROXY}?agency=${encodeURIComponent(slug)}&all=true`);
            if (!res.ok) return null;
            const data = await res.json();
            return Array.isArray(data.routes) && data.routes.length > 0 ? data.routes : null;
        } catch (err) {
            console.warn('RouteTracker: Atlas fetch failed, falling back to Firestore', err);
            return null;
        }
    },

    /** Atlas refreshes Mondays 06:00 UTC — cache key is the current Monday's date. */
    _weekVersion: function () {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
        return d.toISOString().slice(0, 10);
    },

    _idbOpen: function () {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(IDB_NAME, 1);
            req.onupgradeneeded = () => {
                if (!req.result.objectStoreNames.contains(IDB_STORE)) {
                    req.result.createObjectStore(IDB_STORE);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    _idbGet: async function (key) {
        const idb = await this._idbOpen();
        try {
            return await new Promise((resolve, reject) => {
                const req = idb.transaction(IDB_STORE).objectStore(IDB_STORE).get(key);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error);
            });
        } finally {
            idb.close();
        }
    },

    _idbPut: async function (key, value) {
        const idb = await this._idbOpen();
        try {
            await new Promise((resolve, reject) => {
                const tx = idb.transaction(IDB_STORE, 'readwrite');
                const store = tx.objectStore(IDB_STORE);
                // Drop stale weeks for this slug so the store doesn't grow unbounded.
                // Key format: `${slug}-YYYY-MM-DD` — slug is everything before the date.
                const slug = key.slice(0, -11);
                const cursorReq = store.openCursor();
                cursorReq.onsuccess = () => {
                    const cursor = cursorReq.result;
                    if (cursor) {
                        if (String(cursor.key).startsWith(`${slug}-`) && cursor.key !== key) cursor.delete();
                        cursor.continue();
                    }
                };
                store.put(value, key);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        } finally {
            idb.close();
        }
    },

    _getRiddenSet: function (agency) {
        if (!TripController.allTrips) return new Set();
        return new Set(
            TripController.allTrips
                .filter(t => (t.agency || 'TTC') === agency && t.route)
                .map(t => this._normalizeRoute(t.route))
        );
    },

    _normalizeRoute: function (value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/^(route|line)\s+/i, '');
    },

    _render: function (container, routes, riddenSet) {
        const normalize = r => this._normalizeRoute(r.routeShortName);
        const ridden = routes.filter(r => riddenSet.has(normalize(r)));
        const total = routes.length;
        const riddenCount = ridden.length;
        const missingCount = Math.max(total - riddenCount, 0);
        const pct = total > 0 ? Math.round((riddenCount / total) * 100) : 0;

        container.innerHTML = `
            <div class="rt-summary">
                <div class="rt-summary-stat">
                    <strong>${riddenCount}</strong>
                    <span>Routes ridden</span>
                </div>
                <div class="rt-summary-stat">
                    <strong>${missingCount}</strong>
                    <span>Still to explore</span>
                </div>
                <div class="rt-summary-stat rt-summary-stat-highlight">
                    <strong>${pct}%</strong>
                    <span>Atlas coverage</span>
                </div>
            </div>

            <div class="rt-progress" aria-label="${pct}% of Atlas routes ridden">
                <div class="rt-progress-label">
                    <span>Coverage</span>
                    <strong>${riddenCount} of ${total}</strong>
                </div>
                <div class="mastery-bar-bg">
                    <div class="mastery-bar-fill" style="width: ${pct}%;"></div>
                </div>
            </div>

            <div class="rt-list-heading">
                <span>Routes you’ve ridden</span>
                <span>${riddenCount}</span>
            </div>

            <div id="rtRouteList" class="rt-route-list">
                ${this._renderList(ridden, true)}
            </div>
        `;
    },

    _renderList: function (routes, isRidden) {
        if (routes.length === 0) {
            return `<div class="empty-state">${isRidden ? 'No ridden routes yet.' : 'All routes ridden!'}</div>`;
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
