import firebase, { db, auth } from './firebase.js';
import { UI } from './ui-utils.js';

/**
 * TransitStats - Preference Management
 * Handles user profile settings, beta features, and agency preferences.
 */
export const Profile = {
    data: null,
    phone: null,

    async init() {
        this.setupListeners();
    },

    setupListeners() {
        const agencySelect = document.getElementById('settings-agency');
        const betaPredictions = document.getElementById('settings-beta-predictions');
        const publicProfile = document.getElementById('settings-public-profile');

        agencySelect?.addEventListener('change', (e) => {
            this.updateSetting('defaultAgency', e.target.value);
        });

        betaPredictions?.addEventListener('change', (e) => {
            this.updateSetting('betaFeatures', {
                ...this.data?.betaFeatures,
                predictions: e.target.checked
            });
        });

        document.getElementById('btn-save-name')?.addEventListener('click', () => {
            const name = document.getElementById('settings-name')?.value.trim();
            if (name) this.updateSetting('displayName', name);
        });

        publicProfile?.addEventListener('change', (e) => {
            this.updateSetting('isPublic', e.target.checked);
        });

        document.getElementById('btn-save-username')?.addEventListener('click', () => {
            const username = document.getElementById('settings-username')?.value.trim();
            if (username) this.reserveUsername(username);
        });
    },

    /**
     * Load user data and phone number mappings.
     */
    async load(user) {
        if (!user) return;
        
        try {
            // Check cache first to avoid redundant reads
            if (this.data && this.phone) return;

            const [profileDoc, phoneSnap] = await Promise.all([
                db.collection('profiles').doc(user.uid).get(),
                db.collection('phoneNumbers').where('userId', '==', user.uid).limit(1).get()
            ]);

            this.data = profileDoc.exists ? profileDoc.data() : { isPremium: false };
            this.phone = !phoneSnap.empty ? phoneSnap.docs[0].id : null;

            // Fallback: search by email if userId lookup failed (legacy or email-primary accounts)
            if (!this.phone && user.email) {
                const emailPhoneSnap = await db.collection('phoneNumbers')
                    .where('email', '==', user.email)
                    .limit(1)
                    .get();
                if (!emailPhoneSnap.empty) {
                    this.phone = emailPhoneSnap.docs[0].id;
                }
            }

            if (!this.data?.username) {
                const usernameSnap = await db.collection('usernames')
                    .where('uid', '==', user.uid)
                    .limit(1)
                    .get();
                if (!usernameSnap.empty) {
                    this.data = {
                        ...this.data,
                        username: usernameSnap.docs[0].id,
                    };
                }
            }

            this.syncUI(user.email);
        } catch (err) {
            console.error('Profile load error:', err);
        }
    },

    /**
     * Update UI elements with current profile state.
     */
    async syncUI(email) {
        // If we don't have data, try to load it from the current auth state
        if (!this.data && auth.currentUser) {
            await this.load(auth.currentUser);
        }

        const emailEl = document.getElementById('settings-email');
        const phoneEl = document.getElementById('settings-phone');
        const agencyEl = document.getElementById('settings-agency');
        const betaEl = document.getElementById('settings-beta-predictions');
        const publicProfileEl = document.getElementById('settings-public-profile');
        const usernameEl = document.getElementById('settings-username');
        const publicLinkEl = document.getElementById('settings-public-link');

        if (emailEl) emailEl.textContent = email || auth.currentUser?.email || '—';
        if (phoneEl) phoneEl.textContent = this.phone || 'Not linked';
        
        const nameEl = document.getElementById('settings-name');
        if (nameEl) nameEl.value = this.data?.displayName || auth.currentUser?.displayName || '';

        // Update Global Header/Dashboard Name
        const profileName = document.getElementById('profile-name');
        if (profileName) {
            profileName.textContent = this.data?.displayName || auth.currentUser?.displayName || email?.split('@')[0] || 'Traveler';
        }
        
        if (agencyEl && this.data?.defaultAgency) {
            agencyEl.value = this.data.defaultAgency;
        }

        if (betaEl && this.data?.betaFeatures) {
            betaEl.checked = !!this.data.betaFeatures.predictions;
        }

        if (publicProfileEl) {
            publicProfileEl.checked = !!this.data?.isPublic;
        }

        if (usernameEl) {
            usernameEl.value = this.data?.username || '';
            usernameEl.disabled = !!this.data?.username;
        }

        if (publicLinkEl) {
            publicLinkEl.textContent = this.data?.username
                ? `${window.location.origin}/public?user=${this.data.username}`
                : 'Reserve a username to enable sharing.';
        }
    },

    /**
     * Save a setting to Firestore and update local state.
     */
    async updateSetting(key, value) {
        const user = auth.currentUser;
        if (!user) return;

        try {
            await db.collection('profiles').doc(user.uid).set({
                [key]: value,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            // Update local state
            if (!this.data) this.data = {};
            this.data[key] = value;
            
            UI.showNotification('Preference saved.');
        } catch (err) {
            console.error('Save failed:', err);
            UI.showNotification('Failed to save: ' + err.message);
        }
    },

    async reserveUsername(rawUsername) {
        const user = auth.currentUser;
        if (!user) return;

        const username = rawUsername.trim().toLowerCase();
        if (!/^[a-z0-9_]{3,20}$/.test(username)) {
            UI.showNotification('Username must be 3-20 characters: lowercase letters, numbers, and underscores only.');
            return;
        }

        if (this.data?.username) {
            if (this.data.username === username) {
                UI.showNotification('Username already reserved.');
            } else {
                UI.showNotification('Username changes are not supported.');
            }
            return;
        }

        try {
            const existing = await db.collection('usernames').doc(username).get();
            if (existing.exists) {
                UI.showNotification('Username is already taken.');
                return;
            }

            await db.collection('usernames').doc(username).set({
                uid: user.uid,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });

            await db.collection('profiles').doc(user.uid).set({
                username,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });

            if (!this.data) this.data = {};
            this.data.username = username;
            this.syncUI(user.email);
            UI.showNotification('Username reserved.');
        } catch (err) {
            console.error('Username save failed:', err);
            UI.showNotification('Failed to reserve username: ' + err.message);
        }
    },
};
