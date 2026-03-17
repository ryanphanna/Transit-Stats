import { db } from './firebase.js';
import { Utils } from './utils.js';

/**
 * TransitStats V2 - Admin Data Manager Module
 */
export const Admin = {
    stopsLibrary: [],
    inbox: [],
    filters: {
        libSearch: '',
        libAgency: 'All',
        inboxSearch: ''
    },

    async init() {
        console.log('Admin: Initializing...');
        this.setupListeners();
        await this.loadAll();
    },

    setupListeners() {
        // Search & Filters
        const bind = (id, key, prop) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', (e) => {
                this.filters[prop] = e.target.value;
                this.render();
            });
        };

        bind('lib-search', 'input', 'libSearch');
        bind('lib-agency', 'change', 'libAgency');
        bind('inbox-search', 'input', 'inboxSearch');

        // New Stop
        const btnNew = document.getElementById('btn-new-stop');
        if (btnNew) btnNew.addEventListener('click', () => this.openStopForm('create'));

        // Form Actions
        document.getElementById('btn-save-stop')?.addEventListener('click', () => this.saveStop());
        document.getElementById('btn-delete-stop')?.addEventListener('click', () => this.deleteStop());
    },

    async loadAll() {
        await Promise.all([
            this.loadLibrary(),
            this.loadInbox()
        ]);
        this.render();
    },

    async loadLibrary() {
        try {
            const snap = await db.collection('stops').orderBy('name').get();
            this.stopsLibrary = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`Admin: Loaded ${this.stopsLibrary.length} stops.`);
        } catch (err) {
            console.error('Library load error:', err);
        }
    },

    async loadInbox() {
        try {
            // Scan trips for unlinked stop strings. Use the existing Trips cache if available to save reads.
            const tripsToScan = window.Trips?.allTrips?.length ? 
                                window.Trips.allTrips : 
                                [];

            if (!tripsToScan.length) {
                 const snap = await db.collection('trips')
                    .where('userId', '==', window.currentUser.uid)
                    .orderBy('startTime', 'desc')
                    .limit(500)
                    .get();
                 snap.docs.forEach(doc => tripsToScan.push(doc.data()));
            }

            const rawStops = {}; // string -> { count, routes: Set }

            tripsToScan.forEach(trip => {
                const process = (val, route) => {
                    if (!val) return;
                    const norm = Utils.normalizeIntersectionStop(val);
                    // Skip if linked
                    if (this.isLinked(norm)) return;

                    if (!rawStops[norm]) rawStops[norm] = { count: 0, routes: new Set() };
                    rawStops[norm].count++;
                    if (route) rawStops[norm].routes.add(route);
                };

                process(trip.startStopName || trip.startStop || trip.startStopCode, trip.route);
                process(trip.endStopName || trip.endStop || trip.endStopCode, trip.route);
            });

            this.inbox = Object.entries(rawStops).map(([name, data]) => ({
                name,
                count: data.count,
                routes: Array.from(data.routes),
                suggestion: this.suggestStop(name)
            })).sort((a, b) => b.count - a.count);

            const counter = document.getElementById('inbox-count');
            if (counter) counter.textContent = this.inbox.length;

        } catch (err) {
            console.error('Inbox load error:', err);
        }
    },

    isLinked(name) {
        const norm = name.toLowerCase();
        return this.stopsLibrary.some(s => 
            s.name.toLowerCase() === norm || 
            (s.aliases && s.aliases.some(a => a.toLowerCase() === norm)) ||
            (s.code && s.code.toLowerCase() === norm)
        );
    },

    suggestStop(rawName) {
        // Simplified fuzzy match: 
        // 1. Exact match (case insensitive)
        // 2. Starts with / Contains
        // 3. Normalized string match
        const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const target = norm(rawName);
        if (!target) return null;

        let best = null;
        let bestScore = 0;

        for (const stop of this.stopsLibrary) {
            const candidates = [stop.name, ...(stop.aliases || [])];
            for (const cand of candidates) {
                const cNorm = norm(cand);
                let score = 0;
                if (target === cNorm) score = 100;
                else if (cNorm.includes(target) || target.includes(cNorm)) {
                    score = Math.floor((Math.min(target.length, cNorm.length) / Math.max(target.length, cNorm.length)) * 80);
                }

                if (score > bestScore) {
                    bestScore = score;
                    best = stop;
                }
            }
            if (bestScore === 100) break;
        }

        return bestScore >= 60 ? { stop: best, score: bestScore } : null;
    },

    render() {
        this.renderLibrary();
        this.renderInbox();
    },

    renderLibrary() {
        const list = document.getElementById('lib-list');
        if (!list) return;

        let filtered = this.stopsLibrary.filter(s => {
            const matchesSearch = s.name.toLowerCase().includes(this.filters.libSearch.toLowerCase()) ||
                                 (s.code && s.code.includes(this.filters.libSearch));
            const matchesAgency = this.filters.libAgency === 'All' || s.agency === this.filters.libAgency;
            return matchesSearch && matchesAgency;
        });

        if (filtered.length === 0) {
            list.innerHTML = '<div class="loading-state">No stops found.</div>';
            return;
        }

        list.innerHTML = filtered.map(s => `
            <div class="stop-card" onclick="window.Admin.openStopForm('edit', '${s.id}')">
                <div class="stop-card-name">${s.name}</div>
                <div class="stop-card-meta">
                    <span class="text-accent">#${s.code || '---'}</span>
                    <span>${s.agency || 'Other'}</span>
                </div>
                ${s.aliases?.length ? `
                    <div class="alias-list">
                        ${s.aliases.map(a => `<span class="alias-pill">${a}</span>`).join('')}
                    </div>
                ` : ''}
            </div>
        `).join('');
    },

    renderInbox() {
        const list = document.getElementById('inbox-list');
        if (!list) return;

        let filtered = this.inbox.filter(i => i.name.toLowerCase().includes(this.filters.inboxSearch.toLowerCase()));

        if (filtered.length === 0) {
            list.innerHTML = '<div class="loading-state">Inbox is empty.</div>';
            return;
        }

        list.innerHTML = filtered.map(i => `
            <div class="inbox-item">
                <div class="inbox-item-content">
                    <span class="inbox-item-name"><span class="badge-count">${i.count}</span>${i.name}</span>
                    <span class="inbox-item-meta">${i.routes.slice(0, 3).join(', ')}${i.routes.length > 3 ? '...' : ''}</span>
                    ${i.suggestion ? `
                        <div class="mt-2" style="font-size: 0.7rem; color: var(--success);">
                            Suggest: ${i.suggestion.stop.name} (${i.suggestion.score}%)
                        </div>
                    ` : ''}
                </div>
                <div class="inbox-actions">
                    <button class="btn btn-primary btn-sm" onclick="window.Admin.openLinkModal('${Utils.hide(i.name)}')">Link</button>
                </div>
            </div>
        `).join('');
    },

    // --- Modals --- (Handlers continue in next part)
    openStopForm(mode, id = null) {
        const modal = document.getElementById('modal-stop-form');
        const title = document.getElementById('stop-form-title');
        const deleteBtn = document.getElementById('btn-delete-stop');
        
        // Reset form
        document.getElementById('stop-form-id').value = id || '';
        document.getElementById('stop-form-name').value = '';
        document.getElementById('stop-form-code').value = '';
        document.getElementById('stop-form-agency').value = 'TTC';

        if (mode === 'edit') {
            const stop = this.stopsLibrary.find(s => s.id === id);
            if (stop) {
                title.textContent = 'Edit Stop';
                document.getElementById('stop-form-name').value = stop.name;
                document.getElementById('stop-form-code').value = stop.code || '';
                document.getElementById('stop-form-agency').value = stop.agency || 'TTC';
                deleteBtn.classList.remove('hidden');
            }
        } else {
            title.textContent = 'Create New Stop';
            deleteBtn.classList.add('hidden');
        }

        document.getElementById('modal-backdrop').classList.remove('hidden');
        modal.classList.remove('hidden');
    },

    openLinkModal(name) {
        document.getElementById('link-target-string').textContent = name;
        
        const results = document.getElementById('link-search-results');
        const input = document.getElementById('link-search-stop');
        input.value = '';
        results.classList.add('hidden');

        // Setup live search for linking
        input.oninput = (e) => {
            const query = e.target.value.toLowerCase();
            if (query.length < 2) {
                results.classList.add('hidden');
                return;
            }

            const matches = this.stopsLibrary.filter(s => 
                s.name.toLowerCase().includes(query) || 
                (s.code && s.code.includes(query))
            ).slice(0, 5);

            if (matches.length > 0) {
                results.innerHTML = matches.map(m => `
                    <div class="compact-row" style="cursor:pointer;" onclick="window.Admin.linkToStop('${m.id}')">
                        <span class="row-label">${m.name}</span>
                        <span class="row-value">${m.agency}</span>
                    </div>
                `).join('');
                results.classList.remove('hidden');
            } else {
                results.innerHTML = '<div class="loading-state">No matching stops</div>';
                results.classList.remove('hidden');
            }
        };

        // Show "show create stop" button action
        document.getElementById('btn-show-create-stop').onclick = () => {
            this.closeModals();
            this.openStopForm('create');
            document.getElementById('stop-form-name').value = name;
        };

        document.getElementById('modal-backdrop').classList.remove('hidden');
        document.getElementById('modal-link-stop').classList.remove('hidden');
    },

    async saveStop() {
        const id = document.getElementById('stop-form-id').value;
        const name = document.getElementById('stop-form-name').value.trim();
        const code = document.getElementById('stop-form-code').value.trim();
        const agency = document.getElementById('stop-form-agency').value;

        if (!name) return alert('Name is required');

        const data = { name, code, agency, updatedAt: new Date() };

        try {
            if (id) {
                await db.collection('stops').doc(id).update(data);
            } else {
                await db.collection('stops').add({ ...data, aliases: [], createdAt: new Date() });
            }
            this.closeModals();
            await this.loadAll();
        } catch (err) {
            alert('Save failed: ' + err.message);
        }
    },

    async deleteStop() {
        const id = document.getElementById('stop-form-id').value;
        if (!id || !confirm('Permanently delete this stop from library?')) return;

        try {
            await db.collection('stops').doc(id).delete();
            this.closeModals();
            await this.loadAll();
        } catch (err) {
            alert('Delete failed: ' + err.message);
        }
    },

    async linkToStop(stopId) {
        const rawName = document.getElementById('link-target-string').textContent;
        const stop = this.stopsLibrary.find(s => s.id === stopId);
        if (!stop) return;

        const aliases = stop.aliases || [];
        if (!aliases.includes(rawName)) {
            aliases.push(rawName);
            try {
                await db.collection('stops').doc(stopId).update({ aliases, updatedAt: new Date() });
                this.closeModals();
                await this.loadAll();
            } catch (err) {
                alert('Linking failed: ' + err.message);
            }
        } else {
            this.closeModals();
        }
    },

    closeModals() {
        document.getElementById('modal-backdrop').classList.add('hidden');
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    }
};

// Global Exposure for inline onclick handlers
window.Admin = Admin;

// --- Helpers for legacy code compatibility ---
const escapeHtml = (str) => Utils.escapeHtml ? Utils.escapeHtml(str) : str;
const escapeForJs = (str) => str.replace(/'/g, "\\'");

// ─── GTFS Route Import ────────────────────────────────────────────────────────

let gtfsParsedRoutes = [];

/**
 * Parse a GTFS routes.txt CSV file content into route objects.
 * Returns an array of { routeShortName, routeLongName, routeType, gtfsRouteId }.
 */
function parseGtfsRoutesTxt(csvText) {
    const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    if (lines.length < 2) return [];

    // Parse header (handles quoted fields)
    const header = parseGtfsCsvLine(lines[0]);
    const idx = {
        routeId: header.indexOf('route_id'),
        shortName: header.indexOf('route_short_name'),
        longName: header.indexOf('route_long_name'),
        routeType: header.indexOf('route_type'),
    };

    if (idx.shortName === -1 && idx.routeId === -1) {
        throw new Error('File does not look like a GTFS routes.txt (missing route_id or route_short_name column)');
    }

    const routes = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const fields = parseGtfsCsvLine(line);
        const shortName = idx.shortName !== -1 ? (fields[idx.shortName] || '').trim() : '';
        const longName = idx.longName !== -1 ? (fields[idx.longName] || '').trim() : '';
        const routeId = idx.routeId !== -1 ? (fields[idx.routeId] || '').trim() : '';
        const routeType = idx.routeType !== -1 ? parseInt(fields[idx.routeType] || '3', 10) : 3;

        const name = shortName || routeId;
        if (!name) continue;

        routes.push({ routeShortName: name, routeLongName: longName, routeType, gtfsRouteId: routeId });
    }
    return routes;
}

/** Minimal RFC-4180 CSV line parser */
function parseGtfsCsvLine(line) {
    const fields = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
            else if (ch === '"') { inQuotes = false; }
            else { cur += ch; }
        } else {
            if (ch === '"') { inQuotes = true; }
            else if (ch === ',') { fields.push(cur.trim()); cur = ''; }
            else { cur += ch; }
        }
    }
    fields.push(cur.trim());
    return fields;
}

/** Called when a file is selected — parses and shows a preview */
window.previewGtfsRoutes = function () {
    const fileInput = document.getElementById('gtfsFileInput');
    const preview = document.getElementById('gtfsPreview');
    const previewText = document.getElementById('gtfsPreviewText');
    const importBtn = document.getElementById('gtfsImportBtn');

    gtfsParsedRoutes = [];
    importBtn.disabled = true;
    preview.style.display = 'none';

    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            gtfsParsedRoutes = parseGtfsRoutesTxt(e.target.result);
            if (gtfsParsedRoutes.length === 0) {
                previewText.textContent = 'No routes found in file.';
                preview.style.display = 'block';
                return;
            }
            const agency = document.getElementById('gtfsAgencySelect').value;
            previewText.innerHTML = `Found <strong>${gtfsParsedRoutes.length}</strong> routes — ready to import for <strong>${escapeHtml(agency)}</strong>. Existing routes for this agency will be replaced.`;
            preview.style.display = 'block';
            importBtn.disabled = false;
        } catch (err) {
            previewText.textContent = 'Parse error: ' + err.message;
            preview.style.display = 'block';
        }
    };
    reader.readAsText(file);
};

/** Batch-write parsed routes into Firestore, replacing all routes for the agency */
window.importGtfsRoutes = async function () {
    const agency = document.getElementById('gtfsAgencySelect').value;
    const importBtn = document.getElementById('gtfsImportBtn');

    if (!gtfsParsedRoutes.length) return;

    const confirmed = confirm(
        `This will delete all existing routes for ${agency} and replace them with ${gtfsParsedRoutes.length} routes from the file. Continue?`
    );
    if (!confirmed) return;

    importBtn.disabled = true;
    importBtn.textContent = 'Importing...';

    try {
        // Delete existing routes for this agency
        const existing = await db.collection('routes').where('agency', '==', agency).get();
        const BATCH_SIZE = 400;
        for (let i = 0; i < existing.docs.length; i += BATCH_SIZE) {
            const batch = db.batch();
            existing.docs.slice(i, i + BATCH_SIZE).forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        }

        // Write new routes in batches of 400
        for (let i = 0; i < gtfsParsedRoutes.length; i += BATCH_SIZE) {
            const batch = db.batch();
            gtfsParsedRoutes.slice(i, i + BATCH_SIZE).forEach(route => {
                // Use agency + routeShortName as a stable doc ID
                const safeId = `${agency}_${route.routeShortName}`.replace(/[^a-zA-Z0-9_\-]/g, '_');
                const ref = db.collection('routes').doc(safeId);
                batch.set(ref, {
                    agency,
                    routeShortName: route.routeShortName,
                    routeLongName: route.routeLongName,
                    routeType: route.routeType,
                    gtfsRouteId: route.gtfsRouteId,
                });
            });
            await batch.commit();
        }

        importBtn.textContent = 'Import Routes';
        document.getElementById('gtfsFileInput').value = '';
        document.getElementById('gtfsPreview').style.display = 'none';
        gtfsParsedRoutes = [];

        await loadRouteLibrary();
        alert(`Successfully imported ${gtfsParsedRoutes.length || 'all'} routes for ${agency}.`);
    } catch (err) {
        console.error('GTFS import error:', err);
        importBtn.textContent = 'Import Routes';
        importBtn.disabled = false;
        alert('Import failed: ' + err.message);
    }
};

/** Load and display the route library for the selected agency */
async function loadRouteLibrary() {
    const container = document.getElementById('routeLibraryList');
    const countEl = document.getElementById('routeLibraryCount');
    if (!container) return;

    const agency = document.getElementById('gtfsAgencySelect').value;
    container.innerHTML = '<div class="loading">Loading routes...</div>';

    try {
        const snapshot = await db.collection('routes').where('agency', '==', agency).get();
        const routes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        routes.sort((a, b) => {
            const aNum = parseInt(a.routeShortName, 10);
            const bNum = parseInt(b.routeShortName, 10);
            if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
            return String(a.routeShortName).localeCompare(String(b.routeShortName));
        });

        if (countEl) countEl.textContent = routes.length ? `${routes.length} routes` : '';

        if (routes.length === 0) {
            container.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;">No routes imported for this agency yet.</div>';
            return;
        }

        container.innerHTML = routes.map(r => `
            <div class="stop-card" style="padding: 10px 14px;">
                <div class="stop-card-header" style="margin-bottom: 4px;">
                    <h4 style="font-size: 1em;">${escapeHtml(r.routeShortName)}</h4>
                    <button onclick="deleteRoute('${escapeForJs(r.id)}')"
                        style="background: none; border: none; color: var(--text-muted); font-size: 1.1em; cursor: pointer; padding: 0; line-height: 1;"
                        title="Delete route">×</button>
                </div>
                ${r.routeLongName ? `<div class="stop-meta" style="margin: 0;">${escapeHtml(r.routeLongName)}</div>` : ''}
            </div>
        `).join('');
    } catch (err) {
        console.error('Error loading route library:', err);
        container.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;">Error loading routes.</div>';
    }
}

window.deleteRoute = async function (routeId) {
    if (!confirm('Delete this route?')) return;
    try {
        await db.collection('routes').doc(routeId).delete();
        await loadRouteLibrary();
    } catch (err) {
        alert('Failed to delete route: ' + err.message);
    }
};

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
