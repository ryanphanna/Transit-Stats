import { db, auth, serverTimestamp } from './firebase.js';
import { UI } from './ui-utils.js';
import { Identity } from './identity.js';
import { setupProfileListeners } from './profile-settings-ui.js';
import { initializeIdentityPicker, updateUsernameDisplay } from './profile-identity.js';
import {
    BUILT_IN_AGENCY_OPTIONS,
    displayAgencyName,
    formatPhoneNumber,
    getConfiguredAgency,
    getEmojiUsername,
    getMapStopMode,
    isEmojiUsername,
    isPublicProfileBetaOwner,
} from './profile-fields.js';

export { displayAgencyName, formatPhoneNumber } from './profile-fields.js';

/**
 * TransitStats - Preference Management
 * Handles user profile settings, beta features, and agency preferences.
 */
export const Profile = {
    data: null,
    phone: null,
    agencies: [],
    agencyOptions: [],
    agencyAutocomplete: null,
    currentTriplet: ['subway', 'subway', 'subway'],
    activeSlot: null,

    getDisplayName(user = auth.currentUser) {
        const displayName = this.data?.displayName || user?.displayName || '';
        const emailPrefix = user?.email?.split('@')[0] || '';
        return displayName && displayName !== emailPrefix ? displayName : '';
    },

    async init() {
        setupProfileListeners(this);
        initializeIdentityPicker(this);
        this.syncAgencyOptions();
    },

    /**
     * Load user data and phone number mappings.
     */
    async load(user) {
        if (!user) return;
        
        try {
            // Check cache first to avoid redundant reads
            if (this.data && this.phone) {
                window.currentUserProfile = this.data;
                return;
            }

            const [profileDoc, phoneSnap] = await Promise.all([
                db.collection('profiles').doc(user.uid).get(),
                db.collection('phoneNumbers').where('userId', '==', user.uid).limit(1).get()
            ]);

            if (profileDoc.exists) {
                this.data = profileDoc.data();
            } else {
                // Auto-initialize profile if it doesn't exist
                this.data = await this.ensureProfile(user);
            }

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
            window.currentUserProfile = this.data;
        } catch (err) {
            console.error('Profile load error:', err);
        }
    },

    async loadAgencies(user = auth.currentUser) {
        if (!user) return;

        try {
            const tripsSnap = await db.collection('trips').where('userId', '==', user.uid).get();
            const optionsByValue = new Map(BUILT_IN_AGENCY_OPTIONS.map(option => [option.value, option]));
            tripsSnap.docs.forEach(doc => {
                const value = String(doc.data().agency || '').trim();
                if (!value || optionsByValue.has(value)) return;
                optionsByValue.set(value, { value, label: displayAgencyName(value) });
            });
            this.agencyOptions = [...optionsByValue.values()];
            this.agencies = this.agencyOptions.map(option => option.label);
        } catch (error) {
            console.warn('Could not load agencies from trips:', error);
            this.agencies = [];
            this.agencyOptions = [];
        }

        this.syncAgencyOptions();
    },

    syncAgencyOptions() {
        const agencyEl = document.getElementById('settings-agency');
        if (!agencyEl) return;

        const optionsByValue = new Map(this.agencyOptions.map(option => [option.value, option]));
        const defaultValue = getConfiguredAgency(this.data || {});
        const options = [...optionsByValue.values()].sort((a, b) => a.label.localeCompare(b.label));
        const automatic = this.data?.defaultAgencyMode === 'automatic' || !defaultValue;
        const agencyDisplay = document.getElementById('settings-agency-display');
        const selectedAgency = options.find(option => option.value.toLowerCase() === defaultValue.toLowerCase());
        const effectiveAutomatic = automatic || !selectedAgency;

        agencyEl.disabled = false;
        agencyEl.placeholder = effectiveAutomatic ? 'Automatic' : 'Search agencies…';
        if (agencyDisplay && document.getElementById('settings-agency-field')?.classList.contains('hidden')) {
            agencyDisplay.textContent = effectiveAutomatic ? 'Automatic' : selectedAgency.label;
        }
        if (this.agencyAutocomplete) {
            this.agencyAutocomplete.setOptions(options);
            this.agencyAutocomplete.setValue(effectiveAutomatic ? '' : selectedAgency.value);
        } else if (!effectiveAutomatic) {
            agencyEl.value = selectedAgency.label;
        }
    },

    /**
     * Ensure a profile document exists for the user.
     */
    async ensureProfile(user) {
        const triplet = Identity.generate();
        const defaultData = {
            userId: user.uid,
            displayName: user.displayName || 'Traveler',
            username: Identity.toSlug(triplet), // Auto-generate themed slug
            defaultAgency: null,
            defaultAgencyMode: 'automatic',
            primaryAgency: null,
            isPremium: false,
            isAdmin: false,
            isPublic: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        try {
            await db.collection('profiles').doc(user.uid).set(defaultData, { merge: true });
            console.log('Profile initialized for', user.uid);
            return defaultData;
        } catch (err) {
            console.error('Failed to initialize profile:', err);
            return defaultData;
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
        const betaEl = document.getElementById('settings-beta-predictions');
        const publicProfileEl = document.getElementById('settings-public-profile');
        const sharingContentEl = document.getElementById('settings-sharing-content');
        const sharingComingSoonEl = document.getElementById('settings-sharing-coming-soon');
        const publicLinkEl = document.getElementById('settings-public-link');
        const themeEl = document.getElementById('settings-theme');
        const mapStopModeEl = document.getElementById('settings-map-stop-mode');

        if (emailEl) emailEl.textContent = email || auth.currentUser?.email || '—';
        if (phoneEl) phoneEl.textContent = formatPhoneNumber(this.phone);
        
        const nameEl = document.getElementById('settings-name');
        if (nameEl) nameEl.value = this.getDisplayName();
        const nameDisplayEl = document.getElementById('settings-name-display');
        if (nameDisplayEl && nameEl?.classList.contains('hidden')) {
            nameDisplayEl.textContent = this.getDisplayName() || 'Not set';
        }

        // Update Global Header/Dashboard Name
        const profileName = document.getElementById('profile-name');
        if (profileName) {
            const displayName = this.getDisplayName()?.trim() || 'Traveler';
            profileName.textContent = displayName;
            const titleTail = document.querySelector('.atlas-title-tail');
            if (titleTail) titleTail.textContent = /s$/i.test(displayName) ? '’' : '’s';
        }
        
        this.syncAgencyOptions();

        if (betaEl && this.data?.betaFeatures) {
            betaEl.checked = !!this.data.betaFeatures.predictions;
        }

        if (publicProfileEl) {
            publicProfileEl.checked = !!this.data?.isPublic;
        }

        if (themeEl) {
            const theme = this.data?.theme || window.TransitTheme?.getPreference() || 'system';
            themeEl.value = theme;
            window.TransitTheme?.apply(theme);
        }

        if (mapStopModeEl) {
            const mode = getMapStopMode(this.data || {}, localStorage.getItem('transitstats-map-stop-mode'));
            mapStopModeEl.value = mode;
            localStorage.setItem('transitstats-map-stop-mode', mode);
        }

        const username = this.data?.username;
        const emojiUsername = getEmojiUsername(this.data || {});
        const customUsername = username && !isEmojiUsername(username) ? username : '';
        const adminUsernameEl = document.getElementById('settings-admin-username');
        const customUsernameDisplayEl = document.getElementById('settings-custom-username-display');
        const customUsernameInputEl = document.getElementById('settings-custom-username');
        const customUsernameEditorEl = document.getElementById('settings-custom-username-editor');
        const changeCustomUsernameButtonEl = document.getElementById('btn-change-custom-username');
        if (adminUsernameEl) adminUsernameEl.classList.toggle('hidden', !window.isAdmin);
        if (window.isAdmin) {
            if (customUsernameDisplayEl) customUsernameDisplayEl.textContent = customUsername ? `@${customUsername}` : 'Not set';
            if (customUsernameInputEl) customUsernameInputEl.value = customUsername;
            customUsernameDisplayEl?.classList.remove('hidden');
            customUsernameEditorEl?.classList.add('hidden');
            changeCustomUsernameButtonEl?.classList.remove('hidden');
        }

        const publicProfileBetaOwner = isPublicProfileBetaOwner(this.data || {});
        sharingContentEl?.classList.toggle('hidden', !publicProfileBetaOwner);
        sharingComingSoonEl?.classList.toggle('hidden', publicProfileBetaOwner);
        if (!publicProfileBetaOwner) return;

        // --- Identity UI ---
        const identityRow = document.querySelector('.settings-identity-row');
        if (username) {
            identityRow?.classList.add('is-reserved');
            if (emojiUsername) this.currentTriplet = emojiUsername.split(/[-_]/);
            const saveBtn = document.getElementById('btn-save-identity');
            if (saveBtn) saveBtn.style.display = 'none';
            const help = document.getElementById('settings-identity-help');
            if (help) {
                help.textContent = '';
                help.classList.add('hidden');
            }
        } else {
            identityRow?.classList.remove('is-reserved');
            document.getElementById('settings-identity-help')?.classList.remove('hidden');
        }
        
        document.querySelectorAll('.emoji-slot').forEach((slot, i) => {
            const key = this.currentTriplet[i];
            slot.textContent = Identity.LIBRARY[key] || '❓';
            if (username) slot.style.cursor = 'default';
        });

        updateUsernameDisplay(this);

        if (publicLinkEl) {
            const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
            const baseUrl = isLocal ? 'https://transitstats.fyi' : window.location.origin;
            const url = username ? `${baseUrl}/user/${encodeURIComponent(username)}` : '';
            
            if (url) {
                publicLinkEl.innerHTML = '';
                const linkBox = document.createElement('div');
                linkBox.className = 'public-link-box';

                const link = document.createElement('a');
                link.className = 'public-url settings-profile-url';
                link.href = url;
                link.target = '_blank';
                link.rel = 'noopener';
                link.textContent = url;

                const shareButton = document.createElement('button');
                shareButton.id = 'btn-share-public-link';
                shareButton.className = 'btn btn-link settings-text-action';
                shareButton.textContent = navigator.share ? 'Share' : 'Copy';
                linkBox.append(link, shareButton);
                publicLinkEl.append(linkBox);

                shareButton.addEventListener('click', async () => {
                    if (navigator.share) {
                        try {
                            await navigator.share({
                                title: `${this.getDisplayName() || 'My'} TransitStats`,
                                url,
                            });
                            return;
                        } catch (error) {
                            if (error?.name === 'AbortError') return;
                        }
                    }

                    await navigator.clipboard.writeText(url);
                    UI.showNotification('Link copied.', 'success');
                });
            } else {
                publicLinkEl.textContent = 'Pick your identity to enable sharing.';
            }
        }
    },

    /**
     * Save a setting to Firestore and update local state.
     */
    async updateSetting(key, value) {
        return this.updateSettings({ [key]: value });
    },

    async updateAgencyPreference(value) {
        return this.updateSettings({
            defaultAgency: value || null,
            defaultAgencyMode: value ? 'manual' : 'automatic',
            ...(value ? {} : { primaryAgency: null }),
        });
    },

    async updateSettings(changes) {
        const user = auth.currentUser;
        if (!user) return;

        try {
            await db.collection('profiles').doc(user.uid).set({
                ...changes,
                updatedAt: serverTimestamp()
            }, { merge: true });
            
            // Update local state
            if (!this.data) this.data = {};
            Object.assign(this.data, changes);
            window.currentUserProfile = this.data;
            
            UI.showNotification('Saved.', 'success');
        } catch (err) {
            console.error('Save failed:', err);
            UI.showNotification('Failed to save: ' + err.message);
        }
    },

};
