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

        agencySelect?.addEventListener('change', (e) => {
            this.updateSetting('defaultAgency', e.target.value);
        });

        betaPredictions?.addEventListener('change', (e) => {
            this.updateSetting('betaFeatures', {
                ...this.data?.betaFeatures,
                predictions: e.target.checked
            });
        });
    },

    /**
     * Load user data and phone number mappings.
     */
    async load(user) {
        if (!user) return;
        
        try {
            const [profileDoc, phoneSnap] = await Promise.all([
                db.collection('profiles').doc(user.uid).get(),
                db.collection('phoneNumbers').where('userId', '==', user.uid).limit(1).get()
            ]);

            this.data = profileDoc.exists ? profileDoc.data() : { isPremium: false };
            this.phone = !phoneSnap.empty ? phoneSnap.docs[0].id : null;

            this.syncUI(user.email);
        } catch (err) {
            console.error('Profile load error:', err);
        }
    },

    /**
     * Update UI elements with current profile state.
     */
    syncUI(email) {
        const emailEl = document.getElementById('settings-email');
        const phoneEl = document.getElementById('settings-phone');
        const agencyEl = document.getElementById('settings-agency');
        const betaEl = document.getElementById('settings-beta-predictions');

        if (emailEl) emailEl.textContent = email;
        if (phoneEl) phoneEl.textContent = this.phone || 'Not linked';
        
        if (agencyEl && this.data?.defaultAgency) {
            agencyEl.value = this.data.defaultAgency;
        }

        if (betaEl && this.data?.betaFeatures) {
            betaEl.checked = !!this.data.betaFeatures.predictions;
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
    }
};
