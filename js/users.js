import { db } from './firebase.js';
import { Utils } from './utils.js';
import { UI } from './ui-utils.js';

/**
 * TransitStats - Users Admin Module
 * Manage user profiles and premium status.
 */
export const Users = {
    profiles: [],
    phoneMap: {},

    async init() {
        const list = document.getElementById('users-list');
        if (list) {
            list.innerHTML = '<div class="loading-state">Loading users...</div>';
            list.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-action="toggle-premium"]');
                if (btn) this.togglePremium(btn.dataset.userId, btn.dataset.isPremium === 'true');
            });
        }
        await this.load();
        this.render();
    },

    async load() {
        try {
            const [profilesSnap, phonesSnap] = await Promise.all([
                db.collection('profiles').get(),
                db.collection('phoneNumbers').get(),
            ]);

            this.phoneMap = {};
            phonesSnap.docs.forEach(doc => {
                const data = doc.data();
                if (data.userId) this.phoneMap[data.userId] = doc.id;
            });

            this.profiles = profilesSnap.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                phone: this.phoneMap[doc.id] || null,
            }));

            this.profiles.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
        } catch (err) {
            console.error('Users load error:', err);
            UI.showNotification('Failed to load users.');
        }
    },

    render() {
        const list = document.getElementById('users-list');
        if (!list) return;

        if (this.profiles.length === 0) {
            list.innerHTML = '<div class="loading-state">No users found.</div>';
            return;
        }

        const premiumCount = this.profiles.filter(u => u.isPremium).length;
        const counter = document.getElementById('users-count');
        if (counter) counter.textContent = `${premiumCount} premium / ${this.profiles.length} total`;

        list.innerHTML = this.profiles.map(u => {
            const name = Utils.hide(u.displayName || u.email?.split('@')[0] || 'Unknown');
            const email = Utils.hide(u.email || '—');
            const phone = u.phone ? Utils.hide(u.phone) : '<span style="color:var(--text-muted)">No phone</span>';
            const badge = u.isPremium
                ? '<span class="badge" style="background:var(--success);color:#fff;margin-left:6px">Premium</span>'
                : '<span class="badge" style="background:var(--bg-tertiary);color:var(--text-muted);margin-left:6px">Free</span>';
            const btnLabel = u.isPremium ? 'Revoke' : 'Grant Premium';
            const btnClass = u.isPremium ? 'btn btn-sm btn-danger-outline' : 'btn btn-sm btn-primary';

            return `
                <div class="inbox-item">
                    <div class="inbox-item-content">
                        <span class="inbox-item-name">${name}${badge}</span>
                        <span class="inbox-item-meta">${email} &middot; ${phone}</span>
                    </div>
                    <div class="inbox-actions">
                        <button class="${btnClass}" data-action="toggle-premium" data-user-id="${u.id}" data-is-premium="${!!u.isPremium}">${btnLabel}</button>
                    </div>
                </div>
            `;
        }).join('');
    },

    async togglePremium(userId, currentValue) {
        try {
            await db.collection('profiles').doc(userId).update({ isPremium: !currentValue });
            const profile = this.profiles.find(p => p.id === userId);
            if (profile) profile.isPremium = !currentValue;
            this.render();
            UI.showNotification(`Premium ${!currentValue ? 'granted' : 'revoked'}.`);
        } catch (err) {
            UI.showNotification('Update failed: ' + err.message);
        }
    },
};
