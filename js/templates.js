
import { db, Timestamp } from './firebase.js';

/**
 * Templates Module - Handles all template-related functionality
 *
 * Single source of truth: load() fetches once from Firestore, caches in
 * this._cache, and populates all views. renderQuick() reads from the cache
 * rather than firing its own Firestore query.
 */
export const Templates = {
    _cache: null,

    init: function () {
        this.load();
    },

    load: function () {
        if (!window.currentUser) return;

        db.collection('templates')
            .where('userId', '==', window.currentUser.uid)
            .orderBy('createdAt', 'desc')
            .get()
            .then((snapshot) => {
                const templates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                this._cache = templates;
                this.displayHome(templates);
                this.displayProfile(templates);
                this._renderQuickFromCache(templates);
            })
            .catch((error) => {
                console.error('Error loading templates:', error);
            });
    },

    save: function (route, startStop) {
        if (!window.currentUser) return;

        db.collection('templates').add({
            userId: window.currentUser.uid,
            route,
            startStop,
            createdAt: Timestamp.now()
        })
            .then(() => this.load())
            .catch(err => console.error('Error saving template:', err));
    },

    displayHome: function (templates) {
        const templatesSection = document.getElementById('templatesSection');
        const templatesList = document.getElementById('templatesList');
        if (!templatesSection || !templatesList) return;

        if (templates.length === 0) {
            templatesSection.style.display = 'none';
            return;
        }

        templatesSection.style.display = 'block';
        templatesList.innerHTML = templates.slice(0, 3).map(t => `
            <div class="template-card" onclick="Trips.startFromTemplate('${t.route}', '${t.startStop}')">
                <div class="template-icon" style="margin-bottom: 12px; color: var(--accent-electric);">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path>
                    </svg>
                </div>
                <div class="route-name" style="font-weight: 700; font-size: 1.1em; color: var(--text-primary); margin-bottom: 4px;">${t.route}</div>
                <div class="stop-name" style="font-size: 0.9em; color: var(--text-secondary);">From ${t.startStop}</div>
            </div>
        `).join('');
    },

    displayProfile: function (templates) {
        const profileTemplatesList = document.getElementById('profileTemplatesList');
        if (!profileTemplatesList) return;

        if (templates.length === 0) {
            profileTemplatesList.innerHTML = '<div class="empty-state">No saved templates yet</div>';
            return;
        }

        profileTemplatesList.innerHTML = templates.map(t => `
            <div class="trip-item" data-template-id="${t.id}">
                <div class="delete-overlay">Delete</div>
                <div><strong>${t.route}</strong></div>
                <div>From ${t.startStop}</div>
                <div style="font-size: 0.9em; color: var(--text-secondary); display: flex; align-items: center; gap: 6px; margin-top: 4px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path>
                    </svg>
                    <span>Quick start template</span>
                </div>
            </div>
        `).join('');

        profileTemplatesList.querySelectorAll('.trip-item').forEach(item => {
            const templateId = item.getAttribute('data-template-id');
            if (window.addSwipeToDelete) {
                window.addSwipeToDelete(item, true, templateId);
            }
        });
    },

    /**
     * Render quick-access chips in the log trip modal.
     * Uses the cache populated by load() — no extra Firestore read.
     */
    renderQuick: function () {
        if (!window.currentUser) return;
        if (this._cache !== null) {
            this._renderQuickFromCache(this._cache);
        } else {
            this.load(); // will call _renderQuickFromCache on completion
        }
    },

    _renderQuickFromCache: function (templates) {
        const container = document.getElementById('quickTemplates');
        if (!container) return;

        if (!templates || templates.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'flex';
        container.innerHTML = templates.slice(0, 5).map(t =>
            `<div class="template-chip" onclick="Trips.useQuickTemplate('${t.route}', '${t.startStop}')">
                ${t.route} • ${t.startStop}
            </div>`
        ).join('');
    },

    delete: function (templateId) {
        if (confirm('Delete this template?')) {
            db.collection('templates').doc(templateId).delete()
                .then(() => {
                    this._cache = null; // invalidate cache
                    this.load();
                });
        }
    }
};

// Global exports
window.Templates = Templates;
window.loadTemplates = Templates.load.bind(Templates);
window.deleteTemplate = Templates.delete.bind(Templates);
