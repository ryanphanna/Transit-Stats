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
