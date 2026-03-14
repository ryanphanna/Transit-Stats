
import { db, Timestamp } from './firebase.js';
import { UI } from './ui-utils.js';

// TransitStats Profile Module
export const Profile = {
    /**
     * Load the current user's profile from Firestore
     */
    load: function () {
        if (!window.currentUser) return;

        db.collection('profiles').doc(window.currentUser.uid).get()
            .then((doc) => {
                if (doc.exists) {
                    const profile = doc.data();
                    this.updateUI(profile);
                    window.currentUserProfile = profile;
                }
            })
            .catch((error) => {
                console.log('Profile load error (using defaults):', error.message);
            });
    },

    /**
     * Update the UI with profile data
     */
    updateUI: function (profile) {
        const emoji = profile.emoji || '🚌';

        // Update Dashboard Display
        const displayAvatar = document.getElementById('displayAvatar');
        const displayName = document.getElementById('displayName');

        if (displayAvatar) displayAvatar.textContent = emoji;
        if (displayName) displayName.textContent = profile.name || 'Traveler';

        const mapProfileAgency = document.getElementById('mapProfileAgency');
        if (mapProfileAgency) mapProfileAgency.textContent = profile.defaultAgency || 'TTC';

        // Update Settings Inputs
        const settingsAvatar = document.getElementById('settingsAvatar');
        const nameInput = document.getElementById('nameInput');
        const agencySelect = document.getElementById('defaultAgencySelect');

        if (settingsAvatar) settingsAvatar.textContent = emoji;
        if (nameInput) nameInput.value = profile.name || '';
        if (agencySelect) agencySelect.value = profile.defaultAgency || 'TTC';

        const usernameInput = document.getElementById('usernameInput');
        if (usernameInput) usernameInput.value = profile.username || '';

        const publicToggle = document.getElementById('publicProfileToggle');
        if (publicToggle) publicToggle.checked = profile.isPublic || false;

        if (profile.emoji) {
            const emojiSelector = document.getElementById('emojiSelector');
            const shuffleBtn = document.getElementById('shuffleEmojiBtn');
            if (emojiSelector) emojiSelector.style.display = 'none';
            if (shuffleBtn) shuffleBtn.style.display = 'block';
            window.currentEmoji = emoji;
        }
    },


    /**
     * Save the user profile to Firestore
     */
    save: function () {
        if (!window.currentUser) return;

        const nameInput = document.getElementById('nameInput');
        const avatarEl = document.getElementById('settingsAvatar');
        const agencySelect = document.getElementById('defaultAgencySelect');
        const usernameInput = document.getElementById('usernameInput');
        const publicToggle = document.getElementById('publicProfileToggle');

        if (!nameInput) return;

        const name = nameInput.value.trim();
        const emoji = avatarEl ? avatarEl.textContent : '🚌';
        const defaultAgency = agencySelect ? agencySelect.value : 'TTC';
        const username = usernameInput ? usernameInput.value.trim().toLowerCase() : '';
        const isPublic = publicToggle ? publicToggle.checked : false;

        if (!name) {
            UI.showNotification('Please enter your name', 'error');
            return;
        }

        const profileData = {
            name: name,
            emoji: emoji,
            defaultAgency: defaultAgency,
            userId: window.currentUser.uid,
            updatedAt: Timestamp.now(),
            isPublic: isPublic,
            username: username
        };

        db.collection('profiles').doc(window.currentUser.uid).set(profileData, { merge: true })
            .then(async () => {
                // Sync isPublic to all trips so Firestore rules don't need a profile lookup per trip
                const tripsSnap = await db.collection('trips')
                    .where('userId', '==', window.currentUser.uid)
                    .get();
                const batch = db.batch();
                tripsSnap.docs.forEach(doc => batch.update(doc.ref, { isPublic: isPublic }));
                await batch.commit();
                UI.showNotification('Profile saved successfully!', 'success');
                this.load();
                if (window.closeSettings) window.closeSettings();
            })
            .catch((error) => {
                console.error('Error saving profile:', error);
                UI.showNotification('Error saving profile', 'error');
            });
    },

    selectEmoji: function (emoji, event) {
        window.currentEmoji = emoji;
        const settingsAvatar = document.getElementById('settingsAvatar');
        if (settingsAvatar) settingsAvatar.textContent = emoji;

        // Update selection state in UI
        document.querySelectorAll('.emoji-btn').forEach(btn => btn.classList.remove('selected'));
        if (event && event.target) {
            event.target.classList.add('selected');
        }
    },

    shuffleEmoji: function () {
        const emojis = ['🚌', '🚇', '🚊', '🚋', '🚞', '🚝', '🚄', '✈️'];
        const currentEmoji = document.getElementById('settingsAvatar')?.textContent || '🚌';
        let newEmoji;
        do {
            newEmoji = emojis[Math.floor(Math.random() * emojis.length)];
        } while (newEmoji === currentEmoji);

        const settingsAvatar = document.getElementById('settingsAvatar');
        if (settingsAvatar) settingsAvatar.textContent = newEmoji;
        window.currentEmoji = newEmoji;
    },

    show: function () {
        if (window.hideAllSections) window.hideAllSections();
        const dashboardGrid = document.querySelector('.dashboard-grid') || document.getElementById('dashboardPanel');
        const profileSection = document.getElementById('profileSection');
        const startSection = document.getElementById('startSection');

        if (dashboardGrid) dashboardGrid.style.display = dashboardGrid.id === 'dashboardPanel' ? 'block' : 'grid';
        if (profileSection) profileSection.style.display = 'block';
        if (startSection) startSection.style.display = 'none';

        if (typeof window.updateTripIndicator === 'function') window.updateTripIndicator();
        this.load();

        if (profileSection) UI.fadeInSection(profileSection);
    }
};


// Expose to window
window.Profile = Profile;
window.saveProfile = Profile.save.bind(Profile);
window.loadUserProfile = Profile.load.bind(Profile);
window.selectEmoji = Profile.selectEmoji.bind(Profile);
window.shuffleEmoji = Profile.shuffleEmoji.bind(Profile);
window.showProfile = Profile.show.bind(Profile);
