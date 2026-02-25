
import { db, Timestamp } from './firebase.js';

/**
 * Templates Module - Handles all template-related functionality
 */
export const Templates = {
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
                const templates = [];
                snapshot.forEach((doc) => {
                    templates.push({ id: doc.id, ...doc.data() });
                });

                this.displayHome(templates);
                this.displayProfile(templates);
            })
            .catch((error) => {
                console.error('Error loading templates:', error);
            });
    },

    save: function (route, startStop) {
        if (!window.currentUser) return;

        const templateData = {
            userId: window.currentUser.uid,
            route: route,
            startStop: startStop,
            createdAt: Timestamp.now()
        };

        db.collection('templates').add(templateData)
            .then(() => {
                console.log('Template saved');
                this.load();
            })
            .catch(err => {
                console.error('Error saving template:', err);
            });
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

        const templatesHtml = templates.slice(0, 3).map(template => `
            <div class="template-card" onclick="Trips.startFromTemplate('${template.route}', '${template.startStop}')">
                <span class="template-icon">⭐</span>
                <div class="route-name">${template.route}</div>
                <div class="stop-name">From ${template.startStop}</div>
            </div>
        `).join('');

        templatesList.innerHTML = templatesHtml;
    },

    displayProfile: function (templates) {
        const profileTemplatesList = document.getElementById('profileTemplatesList');
        if (!profileTemplatesList) return;

        if (templates.length === 0) {
            profileTemplatesList.innerHTML = '<div class="empty-state">No saved templates yet</div>';
            return;
        }

        const templatesHtml = templates.map(template => `
            <div class="trip-item" data-template-id="${template.id}">
                <div class="delete-overlay">Delete</div>
                <div><strong>${template.route}</strong></div>
                <div>From ${template.startStop}</div>
                <div style="font-size: 0.9em; color: var(--text-secondary);">⭐ Quick start template</div>
            </div>
        `).join('');

        profileTemplatesList.innerHTML = templatesHtml;

        profileTemplatesList.querySelectorAll('.trip-item').forEach(item => {
            const templateId = item.getAttribute('data-template-id');
            if (window.addSwipeToDelete) {
                window.addSwipeToDelete(item, true, templateId);
            }
        });
    },

    renderQuick: function () {
        const container = document.getElementById('quickTemplates');
        if (!container || !window.currentUser) return;

        db.collection('templates')
            .where('userId', '==', window.currentUser.uid)
            .limit(5)
            .get()
            .then(snapshot => {
                if (snapshot.empty) {
                    container.style.display = 'none';
                    return;
                }
                container.style.display = 'flex';
                container.innerHTML = snapshot.docs.map(doc => {
                    const t = doc.data();
                    return `<div class="template-chip" onclick="Trips.useQuickTemplate('${t.route}', '${t.startStop}')">
                        ${t.route} • ${t.startStop}
                    </div>`;
                }).join('');
            });
    },

    delete: function (templateId) {
        if (confirm('Delete this template?')) {
            db.collection('templates').doc(templateId).delete()
                .then(() => {
                    this.load();
                });
        }
    }
};

// Global exports
window.Templates = Templates;
window.loadTemplates = Templates.load.bind(Templates);
window.deleteTemplate = Templates.delete.bind(Templates);
