import firebase, { db, auth } from './firebase.js';
import { UI } from './ui-utils.js';
import { Identity } from './identity.js';
import { createAgencyAutocomplete } from './agency-autocomplete.js';

const AGENCY_DISPLAY_NAMES = {
    TTC: 'Toronto Transit Commission',
    GO: 'GO Transit',
    'GO Transit': 'GO Transit',
    MiWay: 'Mississauga Transit',
    YRT: 'York Region Transit',
    'Brampton Transit': 'Brampton Transit',
    'Durham Transit': 'Durham Region Transit',
    HSR: 'Hamilton Street Railway',
    GRT: 'Grand River Transit',
    'OC Transpo': 'OC Transpo',
    STM: 'Société de transport de Montréal',
    TransLink: 'TransLink',
    'NYC MTA': 'New York City Transit',
    'LA Metro': 'Los Angeles Metro',
    LADOT: 'Los Angeles Department of Transportation',
    'Big Blue Bus': 'Santa Monica Big Blue Bus',
    BART: 'Bay Area Rapid Transit',
    Muni: 'San Francisco Municipal Transportation Agency',
    Caltrain: 'Caltrain',
    VTA: 'Santa Clara Valley Transportation Authority',
    'AC Transit': 'Alameda-Contra Costa Transit District',
    SamTrans: 'San Mateo County Transit District',
    MTS: 'San Diego Metropolitan Transit System',
    Amtrak: 'Amtrak',
    'Golden Gate Transit': 'Golden Gate Transit',
    SMART: 'Sonoma-Marin Area Rail Transit',
    'Santa Rosa CityBus': 'Santa Rosa CityBus',
    'Oakville Transit': 'Oakville Transit',
    'GTAA Terminal Link': 'GTAA Terminal Link',
    'Flagship Cruises & Events': 'Flagship Cruises & Events',
};

const BUILT_IN_AGENCY_OPTIONS = Object.entries(AGENCY_DISPLAY_NAMES)
    .map(([value, label]) => ({ value, label }));

export function displayAgencyName(value) {
    const name = String(value || '').trim();
    return AGENCY_DISPLAY_NAMES[name] || name;
}

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
        this.setupListeners();
        this.initEmojiPicker();
        this.syncAgencyOptions();
    },

    setupListeners() {
        const agencySelect = document.getElementById('settings-agency');
        const betaPredictions = document.getElementById('settings-beta-predictions');
        const publicProfile = document.getElementById('settings-public-profile');
        const themeSelect = document.getElementById('settings-theme');

        if (agencySelect) {
            this.agencyAutocomplete = createAgencyAutocomplete({
                input: agencySelect,
                options: this.agencyOptions,
                allowCustom: false,
                onCommit: value => this.updateSetting('defaultAgency', value),
                onInvalid: () => UI.showNotification('Choose an agency from the suggestions.'),
            });
        }

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

        publicProfile?.addEventListener('change', async (e) => {
            const isPublic = e.target.checked;
            await this.updateSetting('isPublic', isPublic);
            
            // Sync to all trips (Master Switch behavior)
            try {
                UI.showNotification(`Syncing ${isPublic ? 'public' : 'private'} state to all trips...`);
                const user = auth.currentUser;
                const tripsSnap = await db.collection('trips').where('userId', '==', user.uid).get();
                
                const batch = db.batch();
                tripsSnap.docs.forEach(doc => {
                    batch.update(doc.ref, { isPublic: isPublic });
                });
                await batch.commit();
                UI.showNotification('All trips updated.');
            } catch (err) {
                console.error('Trip sync failed:', err);
                UI.showNotification('Failed to sync trips: ' + err.message);
            }
        });

        themeSelect?.addEventListener('change', (e) => {
            window.TransitTheme?.apply(e.target.value);
            this.updateSetting('theme', e.target.value);
        });

        document.getElementById('btn-save-identity')?.addEventListener('click', () => {
            const slug = Identity.toSlug(this.currentTriplet);
            this.reserveUsername(slug);
        });

        // Close popover on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.emoji-slot') && !e.target.closest('.emoji-popover')) {
                document.getElementById('emoji-popover')?.classList.add('hidden');
            }
        });
    },

    initEmojiPicker() {
        const slots = document.querySelectorAll('.emoji-slot');
        const popover = document.getElementById('emoji-popover');
        const grid = popover?.querySelector('.emoji-grid');

        if (!grid) return;

        // Populate grid
        grid.innerHTML = Identity.getLibrary().map(item => `
            <div class="emoji-item" data-key="${item.key}">${item.emoji}</div>
        `).join('');

        slots.forEach(slot => {
            slot.addEventListener('click', (e) => {
                if (this.data?.username) return; // Locked if saved
                
                this.activeSlot = parseInt(e.currentTarget.dataset.index, 10);
                
                // Refresh grid states to show what is already used
                const used = new Set(this.currentTriplet);
                // The current slot's emoji is NOT "used" in terms of blocking selection
                used.delete(this.currentTriplet[this.activeSlot]);

                grid.querySelectorAll('.emoji-item').forEach(item => {
                    const isUsed = used.has(item.dataset.key);
                    item.classList.toggle('used', isUsed);
                    item.style.opacity = isUsed ? '0.3' : '1';
                    item.style.pointerEvents = isUsed ? 'none' : 'auto';
                });

                // Position popover
                const rect = e.currentTarget.getBoundingClientRect();
                popover.style.top = `${rect.bottom + window.scrollY + 5}px`;
                popover.style.left = `${rect.left + window.scrollX}px`;
                popover.classList.remove('hidden');
            });
        });

        grid.addEventListener('click', (e) => {
            const item = e.target.closest('.emoji-item');
            if (!item || item.classList.contains('used')) return;

            const key = item.dataset.key;
            this.currentTriplet[this.activeSlot] = key;
            
            // Update UI
            const slot = document.querySelector(`.emoji-slot[data-index="${this.activeSlot}"]`);
            if (slot) slot.textContent = Identity.LIBRARY[key];
            
            popover.classList.add('hidden');
            this.updateUsernameDisplay();
        });
    },

    updateUsernameDisplay() {
        const display = document.getElementById('settings-username-display');
        if (display) {
            display.textContent = `@${Identity.toSlug(this.currentTriplet)}`;
        }
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
        const defaultValue = String(this.data?.defaultAgency || '').trim();
        const options = [...optionsByValue.values()].sort((a, b) => a.label.localeCompare(b.label));

        agencyEl.disabled = false;
        agencyEl.placeholder = 'Search agencies…';
        if (this.agencyAutocomplete) {
            this.agencyAutocomplete.setOptions(options);
            this.agencyAutocomplete.setValue(defaultValue);
        } else if (defaultValue) {
            agencyEl.value = displayAgencyName(defaultValue);
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
            defaultAgency: 'TTC',
            isPremium: false,
            isAdmin: false,
            isPublic: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
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
        const publicLinkEl = document.getElementById('settings-public-link');
        const themeEl = document.getElementById('settings-theme');

        if (emailEl) emailEl.textContent = email || auth.currentUser?.email || '—';
        if (phoneEl) phoneEl.textContent = this.phone || 'Not linked';
        
        const nameEl = document.getElementById('settings-name');
        if (nameEl) nameEl.value = this.getDisplayName();

        // Update Global Header/Dashboard Name
        const profileName = document.getElementById('profile-name');
        if (profileName) {
            profileName.textContent = this.getDisplayName() || 'Traveler';
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

        // --- Identity UI ---
        const username = this.data?.username;
        if (username) {
            this.currentTriplet = username.split('_');
            const saveBtn = document.getElementById('btn-save-identity');
            if (saveBtn) saveBtn.style.display = 'none';
            const help = document.getElementById('settings-identity-help');
            if (help) help.textContent = 'This public identity cannot be changed after it is reserved.';
        }
        
        document.querySelectorAll('.emoji-slot').forEach((slot, i) => {
            const key = this.currentTriplet[i];
            slot.textContent = Identity.LIBRARY[key] || '❓';
            if (username) slot.style.cursor = 'default';
        });

        this.updateUsernameDisplay();

        if (publicLinkEl) {
            const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
            const baseUrl = isLocal ? 'https://transitstats.fyi' : window.location.origin;
            const url = username ? `${baseUrl}/public?user=${username}` : '';
            
            if (url) {
                publicLinkEl.innerHTML = `
                    <div class="public-link-box">
                        <span class="public-url">${url}</span>
                        <button id="btn-copy-public-link" class="btn btn-sm btn-ghost">Copy</button>
                    </div>
                `;
                document.getElementById('btn-copy-public-link')?.addEventListener('click', () => {
                    navigator.clipboard.writeText(url);
                    UI.showNotification('Link copied to clipboard!', 'success');
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
            window.currentUserProfile = this.data;
            
            UI.showNotification('Preference saved.');
        } catch (err) {
            console.error('Save failed:', err);
            UI.showNotification('Failed to save: ' + err.message);
        }
    },

    async reserveUsername(username) {
        const user = auth.currentUser;
        if (!user) return;

        if (this.data?.username) {
            UI.showNotification('Identity changes are not supported.');
            return;
        }

        try {
            const existing = await db.collection('usernames').doc(username).get();
            if (existing.exists) {
                UI.showNotification('This emoji combination is already taken! Try another.');
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
            window.currentUserProfile = this.data;
            this.syncUI(user.email);
            UI.showNotification('Identity reserved!');
        } catch (err) {
            console.error('Username save failed:', err);
            UI.showNotification('Failed to reserve identity: ' + err.message);
        }
    },
};
