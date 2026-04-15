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

            if (action === 'accept-trip') {
                const row = el.closest('[data-trip-id]');
                const tripId = row?.dataset.tripId;
                const role = row?.dataset.role;
                const item = AdminTriage.inbox.find(i => i.tripId === tripId && i.role === role);
                if (item) {
                    await AdminTriage.linkTrip(item, el.dataset.stopId, AdminLibrary.stops);
                    await this.loadAll();
                }
            } else if (action === 'accept-all-group') {
                const groupKey = el.dataset.groupKey;
                const stopId = el.dataset.stopId;
                const items = AdminTriage.inbox.filter(i => {
                    const iKey = `${i.rawName.toLowerCase()}||${(i.route||'').toLowerCase()}||${(i.direction||'').toLowerCase()}`;
                    return iKey === groupKey;
                });
                if (items.length && confirm(`Link all ${items.length} trips to this stop?`)) {
                    for (const item of items) {
                        await AdminTriage.linkTrip(item, stopId, AdminLibrary.stops);
                    }
                    await this.loadAll();
                }
            } else if (action === 'open-link-modal') {
                // Can come from group header (has data-trip-id/role on the button itself) or from a trip row
                const tripId = el.dataset.tripId || el.closest('[data-trip-id]')?.dataset.tripId;
                const role = el.dataset.role || el.closest('[data-trip-id]')?.dataset.role;
                const item = AdminTriage.inbox.find(i => i.tripId === tripId && i.role === role);
                if (item) this.openLinkModal(item);
            }
        });

        document.getElementById('link-search-results')?.addEventListener('click', async (e) => {
            const row = e.target.closest('[data-action="link-to-stop"]');
            if (row && this._pendingLinkItem) {
                await AdminTriage.linkTrip(this._pendingLinkItem, row.dataset.stopId, AdminLibrary.stops);
                this._pendingLinkItem = null;
                ModalManager.closeAll();
                await this.loadAll();
            }
        });

        document.getElementById('btn-show-create-stop')?.addEventListener('click', () => {
            const rawName = document.getElementById('link-target-string').textContent.trim();
            ModalManager.closeAll();
            this.openStopForm('create', null, rawName);
        });

        document.getElementById('btn-add-alias')?.addEventListener('click', () => {
            const input = document.getElementById('stop-form-alias-input');
            const val = input.value.trim();
            if (val && !this._currentAliases.includes(val)) {
                this._currentAliases.push(val);
                this._renderAliasEditor();
            }
            input.value = '';
        });

        document.getElementById('stop-form-alias-input')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('btn-add-alias').click();
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
            AdminTriage.loadConsolidation(),
            this.loadRouteLibrary()
        ]);
        await AdminTriage.loadInbox(AdminLibrary.stops);
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

        const q = this.filters.inboxSearch.toLowerCase();
        const filtered = AdminTriage.inbox.filter(i =>
            i.rawName.toLowerCase().includes(q) ||
            (i.route || '').toLowerCase().includes(q)
        );
        if (countEl) countEl.textContent = filtered.length;

        if (!filtered.length) {
            list.innerHTML = '<div class="loading-state">All stops recognized.</div>';
            return;
        }

        // Group items by normalized stop name + route + direction
        const groups = new Map();
        for (const item of filtered) {
            const key = `${item.rawName.toLowerCase()}||${(item.route||'').toLowerCase()}||${(item.direction||'').toLowerCase()}`;
            if (!groups.has(key)) groups.set(key, { name: item.rawName, route: item.route, direction: item.direction, items: [] });
            groups.get(key).items.push(item);
        }

        const chevronSvg = '<svg class="inbox-group-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';

        const groupHtml = Array.from(groups.entries()).map(([groupKey, group]) => {
            // Get the best suggestion for the group header
            const firstItem = group.items[0];
            const suggestion = AdminTriage._suggestStop(firstItem.rawName, firstItem.rawCode, AdminLibrary.stops);

            const tripRows = group.items.map(item => {
                const date = item.date?.toDate ? item.date.toDate() : new Date(item.date || 0);
                const dateStr = date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
                return `
                    <div class="inbox-item" data-trip-id="${UI.escapeHtml(item.tripId)}" data-role="${UI.escapeHtml(item.role)}">
                        <div class="inbox-item-content">
                            <span class="inbox-item-meta">${Utils.hide(item.route || '?')}${item.direction ? ' · ' + Utils.hide(item.direction) : ''} · ${item.role === 'start' ? 'boarding' : 'exit'} · ${dateStr}</span>
                        </div>
                        <div class="inbox-actions">
                            ${suggestion ? `<button class="btn btn-sm btn-outline" data-action="accept-trip" data-stop-id="${UI.escapeHtml(suggestion.stop.id)}">Accept</button>` : ''}
                            <button class="btn btn-primary btn-sm" data-action="open-link-modal" data-name="${UI.escapeHtml(item.rawName)}">Link</button>
                        </div>
                    </div>`;
            }).join('');

            const suggestionHint = suggestion ? ` <span style="opacity:0.45;font-size:0.7rem;font-weight:500;">→ ${Utils.hide(suggestion.stop.name)}</span>` : '';
            const routeHint = ` <span class="text-muted" style="margin-left: 6px; font-size: 0.75rem; font-weight: 500;">(${Utils.hide(group.route || '?')}${group.direction ? ' ' + Utils.hide(group.direction) : ''})</span>`;

            return `
                <div class="inbox-group" data-group-key="${UI.escapeHtml(groupKey)}">
                    <div class="inbox-group-header">
                        <div class="inbox-group-label">
                            ${chevronSvg}
                            <span class="inbox-group-name">${Utils.hide(group.name)}${routeHint}${suggestionHint}</span>
                            <span class="inbox-group-count">${group.items.length}</span>
                        </div>
                        <div class="inbox-actions">
                            ${suggestion ? `<button class="btn btn-sm btn-outline" data-action="accept-all-group" data-stop-id="${UI.escapeHtml(suggestion.stop.id)}" data-group-key="${UI.escapeHtml(groupKey)}">Accept All</button>` : ''}
                            <button class="btn btn-primary btn-sm" data-action="open-link-modal" data-name="${UI.escapeHtml(firstItem.rawName)}" data-trip-id="${UI.escapeHtml(firstItem.tripId)}" data-role="${UI.escapeHtml(firstItem.role)}">Link</button>
                        </div>
                    </div>
                    <div class="inbox-group-body">${tripRows}</div>
                </div>`;
        }).join('');

        list.innerHTML = groupHtml;

        // Expand/collapse toggle
        list.querySelectorAll('.inbox-group-header').forEach(header => {
            header.addEventListener('click', (e) => {
                // Don't toggle when clicking buttons
                if (e.target.closest('.inbox-actions')) return;
                header.closest('.inbox-group').classList.toggle('expanded');
            });
        });
    },

    renderConsolidation() {
        const list = document.getElementById('consolidation-list');
        const countEl = document.getElementById('consolidation-count');
        if (!list) return;

        if (countEl) countEl.textContent = AdminTriage.consolidation.length || '';

        if (!AdminTriage.consolidation.length) {
            list.innerHTML = '<div class="loading-state">No duplicates found.</div>';
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
    _currentAliases: [],
    _pendingLinkItem: null,

    openStopForm(mode, id = null, prefillName = '') {
        document.getElementById('stop-form-id').value = id || '';
        const stop = id ? AdminLibrary.stops.find(s => s.id === id) : null;

        document.getElementById('stop-form-title').textContent = stop ? 'Edit Stop' : 'Create New Stop';
        document.getElementById('stop-form-name').value = stop?.name || prefillName;
        document.getElementById('stop-form-code').value = stop?.code || '';
        document.getElementById('stop-form-agency').value = stop?.agency || 'TTC';

        this._currentAliases = [...(stop?.aliases || [])];
        this._renderAliasEditor();

        const deleteBtn = document.getElementById('btn-delete-stop');
        if (deleteBtn) stop ? deleteBtn.classList.remove('hidden') : deleteBtn.classList.add('hidden');

        ModalManager.open('modal-stop-form');
    },

    _renderAliasEditor() {
        const container = document.getElementById('stop-form-aliases');
        if (!container) return;
        container.innerHTML = this._currentAliases.length
            ? this._currentAliases.map((a, i) => `
                <span class="alias-pill">
                    ${Utils.hide(a)}
                    <button type="button" class="alias-remove" data-index="${i}" style="background:none;border:none;cursor:pointer;margin-left:4px;font-size:0.8em;">✕</button>
                </span>`).join('')
            : '<span class="text-secondary" style="font-size:0.85rem;">No aliases</span>';

        container.querySelectorAll('.alias-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                this._currentAliases.splice(Number(btn.dataset.index), 1);
                this._renderAliasEditor();
            });
        });
    },

    async handleSaveStop() {
        const data = {
            id: document.getElementById('stop-form-id').value,
            name: document.getElementById('stop-form-name').value.trim(),
            code: document.getElementById('stop-form-code').value.trim(),
            agency: document.getElementById('stop-form-agency').value,
            aliases: [...this._currentAliases],
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

    openLinkModal(item) {
        this._pendingLinkItem = item;
        document.getElementById('link-target-string').textContent =
            item.rawName + (item.direction ? ` · ${item.direction}` : '') + ` (${item.role === 'start' ? 'boarding' : 'exit'}, ${item.route || '?'})`;

        const results = document.getElementById('link-search-results');
        const input = document.getElementById('link-search-stop');
        input.value = '';
        results.classList.add('hidden');

        input.oninput = (e) => {
            const q = e.target.value.toLowerCase();
            if (q.length < 2) return results.classList.add('hidden');
            const matches = AdminLibrary.stops.filter(s =>
                s.name.toLowerCase().includes(q) || (s.code && s.code.includes(q))
            ).slice(0, 6);
            results.innerHTML = matches.length ? matches.map(m => `
                <div class="compact-row" style="cursor:pointer;" data-action="link-to-stop" data-stop-id="${UI.escapeHtml(m.id)}">
                    <span class="row-label">${Utils.hide(m.name)}</span>
                    <span class="row-value text-muted">${Utils.hide(m.agency)}${m.code ? ' #' + Utils.hide(m.code) : ''}</span>
                </div>
            `).join('') : '<div class="loading-state">No matching stops</div>';
            results.classList.remove('hidden');
        };

        ModalManager.open('modal-link-stop');
    }
};

window.Admin = Admin;


