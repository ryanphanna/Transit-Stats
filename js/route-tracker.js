
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
    compact: false,
    routesCache: {},    // agency -> routes[]
    init: function ({ compact = false } = {}) {
        this.compact = compact;
        // Show every agency represented in the user's trips by default.
        this.currentAgency = 'all';

        const select = document.getElementById('routeTrackerAgency');
        if (select) select.value = this.currentAgency;

        this._loadAndRender();
    },

    setAgency: function (agency) {
        this.currentAgency = agency || 'all';
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
            if (this.currentAgency === 'all') {
                const agencies = this._getObservedAgencies();
                const coverage = (await Promise.all(agencies.map(async agency => ({
                    agency,
                    routes: await this._getRoutes(agency),
                })))).map(item => ({
                    ...item,
                    riddenSet: this._getRiddenSet(item.agency, item.routes),
                })).filter(item => item.routes.length > 0);

                if (coverage.length === 0) {
                    container.innerHTML = '<div class="empty-state">No route coverage is available yet.</div>';
                    return;
                }
                this._renderAll(container, coverage);
                return;
            }

            const routes = await this._getRoutes(this.currentAgency);

            if (routes.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        No routes available for ${UI.escapeHtml(this.currentAgency)} yet.
                    </div>`;
                return;
            }

            const riddenSet = this._getRiddenSet(this.currentAgency, routes);
            this._render(container, routes, riddenSet);
        } catch (err) {
            console.error('RouteTracker error:', err);
            container.innerHTML = '<div class="empty-state">Error loading routes.</div>';
        }
    },

    _getObservedAgencies: function () {
        const agencies = new Set((TripController.allTrips || [])
            .map(trip => trip.agency || 'TTC')
            .filter(Boolean));
        if (agencies.size === 0) agencies.add(window.currentUserProfile?.defaultAgency || 'TTC');
        return [...agencies];
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

    _getRiddenSet: function (agency, routes) {
        if (!TripController.allTrips) return new Set();

        // Atlas is the source of truth for the routes we display. Trip logs
        // often contain branches or service variants (e.g. 510a/510b) that
        // should count toward the base Atlas route (510), not create extra
        // routes in the tracker.
        const atlasRouteKeys = new Set(
            (routes || []).map(route => this._normalizeRoute(route.routeShortName))
        );

        return new Set(
            TripController.allTrips
                .filter(t => (t.agency || 'TTC') === agency && t.route)
                .map(t => this._matchRouteToAtlas(t.route, atlasRouteKeys))
                .filter(Boolean)
        );
    },

    _matchRouteToAtlas: function (value, atlasRouteKeys) {
        const normalized = this._normalizeRoute(value);
        if (!normalized) return null;
        if (atlasRouteKeys.has(normalized)) return normalized;

        // Branches, shuttles, and short-turn labels generally begin with the
        // base numeric route: 510a, 510b shuttle, 506 bus b, etc. Only accept
        // the fallback when Atlas actually contains that numeric base route.
        const numericBase = normalized.match(/^(\d+)/)?.[1];
        return numericBase && atlasRouteKeys.has(numericBase) ? numericBase : null;
    },

    _normalizeRoute: function (value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/^(route|line)\s+/i, '');
    },

    _coverage: function (agency, routes, riddenSet) {
        const normalize = r => this._normalizeRoute(r.routeShortName);
        const ridden = routes.filter(r => riddenSet.has(normalize(r)));
        const total = routes.length;
        const riddenCount = ridden.length;
        const missingCount = Math.max(total - riddenCount, 0);
        const pct = total > 0 ? Math.round((riddenCount / total) * 100) : 0;

        return { agency, routes, ridden, total, riddenCount, missingCount, pct };
    },

    _render: function (container, routes, riddenSet) {
        const coverage = this._coverage(this.currentAgency, routes, riddenSet);

        if (this.compact) {
            container.innerHTML = `
                <div class="rt-compact-summary">
                    <div class="rt-compact-stat">
                        <strong>${coverage.riddenCount} of ${coverage.total}</strong>
                        <span>${UI.escapeHtml(coverage.agency)} routes ridden</span>
                    </div>
                    <div class="rt-compact-stat rt-compact-stat-highlight">
                        <strong>${coverage.pct}%</strong>
                        <span>Atlas coverage</span>
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="rt-summary">
                <div class="rt-summary-stat">
                    <strong>${coverage.riddenCount}</strong>
                    <span>Routes ridden</span>
                </div>
                <div class="rt-summary-stat">
                    <strong>${coverage.missingCount}</strong>
                    <span>Still to explore</span>
                </div>
                <div class="rt-summary-stat rt-summary-stat-highlight">
                    <strong>${coverage.pct}%</strong>
                    <span>Atlas coverage</span>
                </div>
            </div>

            <div class="rt-progress" aria-label="${coverage.pct}% of Atlas routes ridden">
                <div class="rt-progress-label">
                    <span>Coverage</span>
                    <strong>${coverage.riddenCount} of ${coverage.total}</strong>
                </div>
                <div class="mastery-bar-bg">
                    <div class="mastery-bar-fill" style="width: ${coverage.pct}%;"></div>
                </div>
            </div>

            <div class="rt-list-heading">
                <span>Routes you’ve ridden</span>
                <span>${coverage.riddenCount}</span>
            </div>

            <div id="rtRouteList" class="rt-route-list">
                ${this._renderList(coverage.ridden, true)}
            </div>
        `;
    },

    _renderAll: function (container, coverageItems) {
        if (this.compact) {
            const total = coverageItems.reduce((sum, item) => sum + item.routes.length, 0);
            const ridden = coverageItems.reduce((sum, item) => sum + item.riddenSet.size, 0);
            const pct = total > 0 ? Math.round((ridden / total) * 100) : 0;
            container.innerHTML = `
                <div class="rt-compact-summary">
                    <div class="rt-compact-stat"><strong>${ridden} of ${total}</strong><span>routes ridden across ${coverageItems.length} agencies</span></div>
                    <div class="rt-compact-stat rt-compact-stat-highlight"><strong>${pct}%</strong><span>Atlas coverage</span></div>
                </div>`;
            return;
        }

        const cards = coverageItems.map(item => {
            const coverage = this._coverage(item.agency, item.routes, item.riddenSet);
            return `
                <section class="rt-agency-section">
                    <div class="rt-list-heading"><strong>${UI.escapeHtml(coverage.agency)}</strong><span>${coverage.riddenCount} of ${coverage.total} ridden</span></div>
                    <div class="rt-progress" aria-label="${coverage.pct}% of Atlas routes ridden">
                        <div class="rt-progress-label"><span>Coverage</span><strong>${coverage.pct}%</strong></div>
                        <div class="mastery-bar-bg"><div class="mastery-bar-fill" style="width: ${coverage.pct}%;"></div></div>
                    </div>
                    <div class="rt-route-list">${this._renderList(coverage.ridden, true)}</div>
                </section>`;
        }).join('');
        container.innerHTML = `<div class="rt-agency-grid">${cards}</div>`;
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
