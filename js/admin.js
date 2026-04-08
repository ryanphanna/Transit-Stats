import { db } from './firebase.js';
import { Utils } from './utils.js';
import { UI } from './ui-utils.js';
import { ModalManager } from './shared/modal-engine.js';

// Modular Logic Engines
import { GTFSEngine } from './admin/GTFSEngine.js';
import { AdminTriage } from './admin/AdminTriage.js';
import { AdminLibrary } from './admin/AdminLibrary.js';

/**
 * TransitStats V2 - Admin Data Manager (Refactored View Controller)
 */
export const Admin = {
    filters: {
        libSearch: '',
        libAgency: 'All',
        inboxSearch: ''
    },

    async init() {
        console.log('Admin: Initializing...');
        ModalManager.init();
        this.setupListeners();
        await this.loadAll();
    },

    setupListeners() {
        const bind = (id, prop) => {
            document.getElementById(id)?.addEventListener('input', (e) => {
                this.filters[prop] = e.target.value;
                this.render();
            });
        };

        bind('lib-search', 'libSearch');
        bind('lib-agency', 'libAgency');
        bind('inbox-search', 'inboxSearch');

        // Stop Form
        document.getElementById('btn-new-stop')?.addEventListener('click', () => this.openStopForm('create'));
        document.getElementById('btn-save-stop')?.addEventListener('click', () => this.handleSaveStop());
        document.getElementById('btn-delete-stop')?.addEventListener('click', () => this.handleDeleteStop());

        // GTFS
        document.getElementById('gtfsFileInput')?.addEventListener('change', () => this.handleGTFSPreview());
        document.getElementById('gtfsImportBtn')?.addEventListener('click', () => this.handleGTFSImport());
        document.getElementById('gtfsAgencySelect')?.addEventListener('change', () => this.loadRouteLibrary());

        // Event Delegation for dynamic lists
        this._setupDelegation();
    },

    _setupDelegation() {
        document.getElementById('consolidation-list')?.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-action="consolidate"]');
            if (btn) {
                await AdminTriage.mergeGroup(Number(btn.dataset.index));
                this.render();
            }
        });

        document.getElementById('lib-list')?.addEventListener('click', (e) => {
            const card = e.target.closest('[data-action="open-stop"]');
            if (card) this.openStopForm('edit', card.dataset.stopId);
        });

        document.getElementById('inbox-list')?.addEventListener('click', async (e) => {
            const el = e.target.closest('[data-action]');
            if (!el) return;
            
            const action = el.dataset.action;
            if (action === 'accept-all') {
                await AdminTriage.bulkAcceptSuggestions();
                await this.loadAll();
            } else if (action === 'accept-suggestion') {
                await AdminLibrary.linkAlias(el.dataset.stopId, el.dataset.name);
                await this.loadAll();
            } else if (action === 'open-link-modal') {
                this.openLinkModal(el.dataset.name);
            }
        });

        document.getElementById('link-search-results')?.addEventListener('click', async (e) => {
            const row = e.target.closest('[data-action="link-to-stop"]');
            if (row) {
                const rawName = document.getElementById('link-target-string').textContent;
                await AdminLibrary.linkAlias(row.dataset.stopId, rawName);
                ModalManager.closeAll();
                await this.loadAll();
            }
        });

        document.getElementById('routeLibraryList')?.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-action="delete-route"]');
            if (btn && confirm('Remove this route from the library?')) {
                await AdminLibrary.deleteRoute(btn.dataset.routeId);
                this.loadRouteLibrary();
            }
        });
    },

    async loadAll() {
        await Promise.all([
            AdminLibrary.loadStops(),
            AdminTriage.loadInbox(AdminLibrary.stops),
            AdminTriage.loadConsolidation(),
            this.loadRouteLibrary()
        ]);
        this.render();
    },

    async loadRouteLibrary() {
        const agency = document.getElementById('gtfsAgencySelect')?.value || 'TTC';
        await AdminLibrary.loadRoutes(agency);
        this.renderRouteLibrary();
    },

    // --- Core Rendering ---
    render() {
        this.renderLibrary();
        this.renderInbox();
        this.renderConsolidation();
    },

    renderLibrary() {
        const list = document.getElementById('lib-list');
        if (!list) return;

        const filtered = AdminLibrary.stops.filter(s => {
            const matchesSearch = s.name.toLowerCase().includes(this.filters.libSearch.toLowerCase()) || (s.code && s.code.includes(this.filters.libSearch));
            const matchesAgency = this.filters.libAgency === 'All' || s.agency === this.filters.libAgency;
            return matchesSearch && matchesAgency;
        });

        list.innerHTML = filtered.length ? filtered.map(s => this._stopCardHtml(s)).join('') : '<div class="loading-state">No stops found.</div>';
    },

    _stopCardHtml(s) {
        return `
            <div class="stop-card" data-action="open-stop" data-stop-id="${UI.escapeHtml(s.id)}" style="cursor:pointer;">
                <div class="stop-card-name">${Utils.hide(s.name)}</div>
                <div class="stop-card-meta">
                    <span class="text-accent">#${Utils.hide(s.code) || '---'}</span>
                    <span>${Utils.hide(s.agency) || 'Other'}</span>
                </div>
                ${s.aliases?.length ? `<div class="alias-list">${s.aliases.map(a => `<span class="alias-pill">${Utils.hide(a)}</span>`).join('')}</div>` : ''}
            </div>
        `;
    },

    renderInbox() {
        const list = document.getElementById('inbox-list');
        const countEl = document.getElementById('inbox-count');
        if (!list) return;

        const filtered = AdminTriage.inbox.filter(i => i.name.toLowerCase().includes(this.filters.inboxSearch.toLowerCase()));
        if (countEl) countEl.textContent = filtered.length;

        if (!filtered.length) {
            list.innerHTML = '<div class="loading-state">Inbox is empty.</div>';
            return;
        }

        const suggs = filtered.filter(i => i.suggestion);
        const bulkBtn = suggs.length > 1 ? `<button class="btn btn-outline full-width btn-sm mb-3" data-action="accept-all">Accept all ${suggs.length} suggestions</button>` : '';

        list.innerHTML = bulkBtn + filtered.map(i => `
            <div class="inbox-item">
                <div class="inbox-item-content">
                    <span class="inbox-item-name"><span class="badge-count">${i.count}</span>${Utils.hide(i.name)}</span>
                    <span class="inbox-item-meta">${i.routes.slice(0, 3).map(r => Utils.hide(r)).join(', ')}${i.routes.length > 3 ? '...' : ''}</span>
                    ${i.suggestion ? `<div class="mt-2 text-success" style="font-size: 0.7rem;">→ ${Utils.hide(i.suggestion.stop.name)} (${i.suggestion.score}%)</div>` : ''}
                </div>
                <div class="inbox-actions">
                    ${i.suggestion ? `<button class="btn btn-sm btn-outline" data-action="accept-suggestion" data-name="${UI.escapeHtml(i.name)}" data-stop-id="${UI.escapeHtml(i.suggestion.stop.id)}">Accept</button>` : ''}
                    <button class="btn btn-primary btn-sm" data-action="open-link-modal" data-name="${UI.escapeHtml(i.name)}">Link</button>
                </div>
            </div>
        `).join('');
    },

    renderConsolidation() {
        const list = document.getElementById('consolidation-list');
        const countEl = document.getElementById('consolidation-count');
        if (!list) return;

        if (countEl) countEl.textContent = AdminTriage.consolidation.length || '';

        if (!AdminTriage.consolidation.length) {
            list.innerHTML = '<div class="loading-state">No variants found.</div>';
            return;
        }

        list.innerHTML = AdminTriage.consolidation.map((item, i) => `
            <div class="inbox-item">
                <div class="inbox-item-content">
                    <span class="inbox-item-name"><span class="badge-count">${item.allVariants.length}</span>${Utils.hide(item.canonical)}</span>
                    <span class="inbox-item-meta">Route ${Utils.hide(item.route)} ${Utils.hide(item.direction)} &middot; ${item.field === 'startStopName' ? 'boarding' : 'exit'}</span>
                    <div class="mt-1 text-muted" style="font-size: 0.7rem;">${item.others.map(v => Utils.hide(v)).join(' &middot; ')}</div>
                </div>
                <div class="inbox-actions">
                    <button class="btn btn-primary btn-sm" data-action="consolidate" data-index="${i}">Merge</button>
                </div>
            </div>
        `).join('');
    },

    renderRouteLibrary() {
        const container = document.getElementById('routeLibraryList');
        const countEl = document.getElementById('routeLibraryCount');
        if (!container) return;

        if (countEl) countEl.textContent = `${AdminLibrary.routes.length} routes`;
        
        container.innerHTML = AdminLibrary.routes.length ? AdminLibrary.routes.map(r => `
            <div class="stop-card" style="padding: 10px 14px;">
                <div class="stop-card-header flex-between">
                    <h4 class="m-0">${UI.escapeHtml(r.routeShortName)}</h4>
                    <button class="btn-icon-muted" data-action="delete-route" data-route-id="${UI.escapeHtml(r.id)}"><i data-lucide="x"></i></button>
                </div>
                ${r.routeLongName ? `<div class="stop-meta">${UI.escapeHtml(r.routeLongName)}</div>` : ''}
            </div>
        `).join('') : '<div class="empty-state">No routes for this agency.</div>';

        if (window.lucide) lucide.createIcons();
    },

    // --- Handlers ---
    openStopForm(mode, id = null) {
        document.getElementById('stop-form-id').value = id || '';
        const stop = id ? AdminLibrary.stops.find(s => s.id === id) : null;

        document.getElementById('stop-form-title').textContent = stop ? 'Edit Stop' : 'Create New Stop';
        document.getElementById('stop-form-name').value = stop?.name || '';
        document.getElementById('stop-form-code').value = stop?.code || '';
        document.getElementById('stop-form-agency').value = stop?.agency || 'TTC';
        
        const deleteBtn = document.getElementById('btn-delete-stop');
        if (deleteBtn) stop ? deleteBtn.classList.remove('hidden') : deleteBtn.classList.add('hidden');

        ModalManager.open('modal-stop-form');
    },

    async handleSaveStop() {
        const data = {
            id: document.getElementById('stop-form-id').value,
            name: document.getElementById('stop-form-name').value.trim(),
            code: document.getElementById('stop-form-code').value.trim(),
            agency: document.getElementById('stop-form-agency').value
        };
        if (!data.name) return UI.showNotification('Name required.');

        await AdminLibrary.saveStop(data);
        ModalManager.closeAll();
        this.loadAll();
    },

    async handleDeleteStop() {
        const id = document.getElementById('stop-form-id').value;
        if (id && confirm('Are you sure you want to delete this stop?')) {
            await AdminLibrary.deleteStop(id);
            ModalManager.closeAll();
            this.loadAll();
        }
    },

    handleGTFSPreview() {
        const file = document.getElementById('gtfsFileInput').files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const routes = GTFSEngine.parseRoutes(e.target.result);
            const preview = document.getElementById('gtfsPreviewText');
            const agency = document.getElementById('gtfsAgencySelect').value;
            
            if (preview) {
                preview.textContent = 'Found ';
                const rBold = document.createElement('strong');
                rBold.textContent = routes.length;
                preview.appendChild(rBold);
                preview.appendChild(document.createTextNode(' routes for '));
                const aBold = document.createElement('strong');
                aBold.textContent = agency;
                preview.appendChild(aBold);
                preview.appendChild(document.createTextNode('.'));
            }
            
            document.getElementById('gtfsPreview').style.display = 'block';
            document.getElementById('gtfsImportBtn').disabled = false;
        };
        reader.readAsText(file);
    },

    async handleGTFSImport() {
        const agency = document.getElementById('gtfsAgencySelect').value;
        UI.showLoading(document.getElementById('gtfsImportBtn'), 'Importing...');
        
        await GTFSEngine.runImport(agency, () => {
            this.loadRouteLibrary();
            document.getElementById('gtfsPreview').style.display = 'none';
            document.getElementById('gtfsFileInput').value = '';
        });

        UI.hideLoading(document.getElementById('gtfsImportBtn'));
    },

    openLinkModal(name) {
        document.getElementById('link-target-string').textContent = name;
        const results = document.getElementById('link-search-results');
        const input = document.getElementById('link-search-stop');
        input.value = '';
        results.classList.add('hidden');

        input.oninput = (e) => {
            const q = e.target.value.toLowerCase();
            if (q.length < 2) return results.classList.add('hidden');

            const matches = AdminLibrary.stops.filter(s => s.name.toLowerCase().includes(q) || (s.code && s.code.includes(q))).slice(0, 5);
            results.innerHTML = matches.length ? matches.map(m => `
                <div class="compact-row" style="cursor:pointer;" data-action="link-to-stop" data-stop-id="${UI.escapeHtml(m.id)}">
                    <span class="row-label">${Utils.hide(m.name)}</span>
                    <span class="row-value">${Utils.hide(m.agency)}</span>
                </div>
            `).join('') : '<div class="loading-state">No matching stops</div>';
            results.classList.remove('hidden');
        };

        ModalManager.open('modal-link-stop');
    }
};

window.Admin = Admin;

let _deleteRouteArmed = null;
let _deleteRouteTimer = null;

window.deleteRoute = async function (routeId) {
    if (_deleteRouteArmed !== routeId) {
        if (_deleteRouteTimer) clearTimeout(_deleteRouteTimer);
        _deleteRouteArmed = routeId;
        _deleteRouteTimer = setTimeout(() => { _deleteRouteArmed = null; }, 3000);
        UI.showNotification('Tap again to confirm delete.');
        return;
    }
    clearTimeout(_deleteRouteTimer);
    _deleteRouteArmed = null;
    try {
        await db.collection('routes').doc(routeId).delete();
        await loadRouteLibrary();
    } catch (err) {
        UI.showNotification('Failed to delete route: ' + err.message);
    }
};

document.getElementById('routeLibraryList')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="delete-route"]');
    if (btn) deleteRoute(btn.dataset.routeId);
});

// ─── GTFS Stop→Route Mapping Import ──────────────────────────────────────────

let _gtfsTripsMap = null; // Map<trip_id, routeShortName>

/**
 * Parse trips.txt CSV, building a Map from trip_id → routeShortName.
 * Needs the routes already in Firestore to resolve route_id → routeShortName.
 */
window.loadGtfsTrips = async function () {
    const fileInput = document.getElementById('gtfsTripsFileInput');
    const statusEl = document.getElementById('gtfsStopRouteStatus');
    const step2 = document.getElementById('gtfsStopTimesSection');

    _gtfsTripsMap = null;
    if (step2) step2.style.display = 'none';
    if (!fileInput.files[0]) return;

    statusEl.textContent = 'Parsing trips.txt...';

    const agency = document.getElementById('gtfsStopRouteAgencySelect').value;

    // Load routes from Firestore to build route_id → routeShortName map
    const routesSnap = await db.collection('routes').where('agency', '==', agency).get();
    if (routesSnap.empty) {
        statusEl.textContent = 'No routes found for this agency — import routes.txt first.';
        return;
    }
    const routeIdToShortName = new Map();
    routesSnap.docs.forEach(doc => {
        const d = doc.data();
        if (d.gtfsRouteId && d.routeShortName) routeIdToShortName.set(d.gtfsRouteId, d.routeShortName);
    });

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const lines = e.target.result.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
            if (lines.length < 2) { statusEl.textContent = 'trips.txt appears empty.'; return; }

            const header = parseGtfsCsvLine(lines[0]);
            const tripIdIdx = header.indexOf('trip_id');
            const routeIdIdx = header.indexOf('route_id');
            if (tripIdIdx === -1 || routeIdIdx === -1) {
                statusEl.textContent = 'trips.txt missing trip_id or route_id column.';
                return;
            }

            const map = new Map();
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                // Fast split — trip_id and route_id are never quoted
                const parts = line.split(',');
                const tripId = (parts[tripIdIdx] || '').trim();
                const routeId = (parts[routeIdIdx] || '').trim();
                const shortName = routeIdToShortName.get(routeId);
                if (tripId && shortName) map.set(tripId, shortName);
            }

            _gtfsTripsMap = map;
            statusEl.textContent = `Loaded ${map.size.toLocaleString()} trips. Now upload stop_times.txt.`;
            if (step2) step2.style.display = 'grid';
        } catch (err) {
            statusEl.textContent = 'Parse error: ' + err.message;
        }
    };
    reader.readAsText(fileInput.files[0]);
};

/**
 * Stream stop_times.txt to build stop_id → Set<routeShortName>, then write to Firestore stopRoutes.
 */
window.importGtfsStopTimes = async function () {
    const fileInput = document.getElementById('gtfsStopTimesFileInput');
    const btn = document.getElementById('gtfsStopTimesImportBtn');
    const statusEl = document.getElementById('gtfsStopRouteStatus');

    if (!_gtfsTripsMap) { statusEl.textContent = 'Load trips.txt first.'; return; }
    if (!fileInput.files[0]) { statusEl.textContent = 'Select a stop_times.txt file.'; return; }

    btn.disabled = true;
    btn.textContent = 'Processing...';
    statusEl.textContent = 'Reading stop_times.txt...';

    const agency = document.getElementById('gtfsStopRouteAgencySelect').value;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const text = e.target.result;
            const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

            const header = parseGtfsCsvLine(lines[0]);
            const tripIdIdx = header.indexOf('trip_id');
            const stopIdIdx = header.indexOf('stop_id');
            if (tripIdIdx === -1 || stopIdIdx === -1) {
                throw new Error('stop_times.txt missing trip_id or stop_id column');
            }

            const stopRoutes = new Map(); // stopId → Set<routeShortName>
            const total = lines.length - 1;

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                if (!line || line.charCodeAt(0) === 13) continue; // skip empty/CR-only
                // Fast split — trip_id and stop_id are never quoted in GTFS
                const parts = line.split(',');
                const tripId = (parts[tripIdIdx] || '').trim();
                const stopId = (parts[stopIdIdx] || '').trim();
                const routeShortName = _gtfsTripsMap.get(tripId);
                if (routeShortName && stopId) {
                    if (!stopRoutes.has(stopId)) stopRoutes.set(stopId, new Set());
                    stopRoutes.get(stopId).add(routeShortName);
                }

                // Yield to browser every 100k rows to avoid UI freeze
                if (i % 100000 === 0) {
                    statusEl.textContent = `Processing... ${Math.round(i / total * 100)}% (${stopRoutes.size.toLocaleString()} stops mapped)`;
                    await new Promise(r => setTimeout(r, 0));
                }
            }

            statusEl.textContent = `Writing ${stopRoutes.size.toLocaleString()} stop mappings to Firestore...`;

            const BATCH_SIZE = 400;
            const entries = Array.from(stopRoutes.entries());
            let written = 0;

            for (let i = 0; i < entries.length; i += BATCH_SIZE) {
                const batch = db.batch();
                entries.slice(i, i + BATCH_SIZE).forEach(([stopId, routeSet]) => {
                    const safeId = `${agency}_${stopId}`.replace(/[^a-zA-Z0-9_\-]/g, '_');
                    batch.set(db.collection('stopRoutes').doc(safeId), {
                        agency,
                        stopId,
                        routes: Array.from(routeSet),
                    });
                });
                await batch.commit();
                written += Math.min(BATCH_SIZE, entries.length - i);
                statusEl.textContent = `Writing... ${Math.round(written / entries.length * 100)}%`;
            }

            const countEl = document.getElementById('gtfsStopRouteCount');
            if (countEl) countEl.textContent = `${stopRoutes.size.toLocaleString()} stops mapped`;
            statusEl.textContent = `Done. Mapped ${stopRoutes.size.toLocaleString()} stops across ${agency}.`;
            btn.textContent = 'Import Stop→Routes';
            btn.disabled = false;
            _gtfsTripsMap = null;
            fileInput.value = '';
            document.getElementById('gtfsTripsFileInput').value = '';
            document.getElementById('gtfsStopTimesSection').style.display = 'none';
        } catch (err) {
            console.error('Stop→Route import error:', err);
            statusEl.textContent = 'Error: ' + err.message;
            btn.textContent = 'Import Stop→Routes';
            btn.disabled = false;
        }
    };
    reader.readAsText(fileInput.files[0]);
};

// Reload route library when agency selector changes
const _gtfsAgencySelect = document.getElementById('gtfsAgencySelect');
if (_gtfsAgencySelect) {
    _gtfsAgencySelect.addEventListener('change', () => {
        gtfsParsedRoutes = [];
        document.getElementById('gtfsImportBtn').disabled = true;
        document.getElementById('gtfsPreview').style.display = 'none';
        const fileInput = document.getElementById('gtfsFileInput');
        if (fileInput) fileInput.value = '';
        loadRouteLibrary();
    });

}
