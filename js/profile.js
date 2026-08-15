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
const PUBLIC_PROFILE_BETA_USERNAME = 'subway-subway-subway';

function isPublicProfileBetaOwner(username) {
    return String(username || '').trim().toLowerCase().replace(/_/g, '-') === PUBLIC_PROFILE_BETA_USERNAME;
}

export function displayAgencyName(value) {
    const name = String(value || '').trim();
    return AGENCY_DISPLAY_NAMES[name] || name;
}

export function formatPhoneNumber(value) {
    const phone = String(value || '').trim();
    const digits = phone.replace(/\D/g, '');
    const nationalDigits = digits.length === 11 && digits.startsWith('1')
        ? digits.slice(1)
        : digits;

    if (nationalDigits.length === 10) {
        return `(${nationalDigits.slice(0, 3)}) ${nationalDigits.slice(3, 6)}-${nationalDigits.slice(6)}`;
    }

    return phone || 'Not linked';
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
        const agencyField = document.getElementById('settings-agency-field');
        const agencyDisplay = document.getElementById('settings-agency-display');
        const changeAgencyButton = document.getElementById('btn-change-agency');
        const betaPredictions = document.getElementById('settings-beta-predictions');
        const publicProfile = document.getElementById('settings-public-profile');
        const themeSelect = document.getElementById('settings-theme');
        const mapStopModeSelect = document.getElementById('settings-map-stop-mode');

        if (agencySelect) {
            this.agencyAutocomplete = createAgencyAutocomplete({
                input: agencySelect,
                options: this.agencyOptions,
                allowCustom: false,
                onCommit: value => this.updateAgencyPreference(value).then(() => {
                    agencyField?.classList.add('hidden');
                    agencyDisplay?.classList.remove('hidden');
                    changeAgencyButton?.classList.remove('hidden');
                    this.syncAgencyOptions();
                }),
                onInvalid: () => UI.showNotification('Choose an agency from the suggestions.'),
            });
            document.getElementById('btn-clear-agency')?.addEventListener('click', () => {
                this.agencyAutocomplete?.clear();
                agencyField?.classList.add('hidden');
                agencyDisplay?.classList.remove('hidden');
                changeAgencyButton?.classList.remove('hidden');
            });
        }

        changeAgencyButton?.addEventListener('click', () => {
            agencyField?.classList.remove('hidden');
            agencyDisplay?.classList.add('hidden');
            changeAgencyButton.classList.add('hidden');
            agencySelect?.focus();
        });

        betaPredictions?.addEventListener('change', (e) => {
            this.updateSetting('betaFeatures', {
                ...this.data?.betaFeatures,
                predictions: e.target.checked
            });
        });

        const nameInput = document.getElementById('settings-name');
        const nameDisplay = document.getElementById('settings-name-display');
        const changeNameButton = document.getElementById('btn-change-name');
        const saveNameButton = document.getElementById('btn-save-name');

        changeNameButton?.addEventListener('click', () => {
            nameInput?.classList.remove('hidden');
            nameDisplay?.classList.add('hidden');
            changeNameButton.classList.add('hidden');
            saveNameButton?.classList.remove('hidden');
            nameInput?.focus();
            nameInput?.select();
        });

        saveNameButton?.addEventListener('click', async () => {
            const name = nameInput?.value.trim();
            if (!name) return;
            await this.updateSetting('displayName', name);
            nameDisplay.textContent = name;
            nameInput.classList.add('hidden');
            nameDisplay.classList.remove('hidden');
            saveNameButton.classList.add('hidden');
            changeNameButton?.classList.remove('hidden');
        });

        publicProfile?.addEventListener('change', async (e) => {
            const isPublic = e.target.checked;
            await this.updateSetting('isPublic', isPublic);
            
            // Sync to all trips (Master Switch behavior)
            try {
                UI.showNotification(`Syncing ${isPublic ? 'public' : 'private'} state to all trips...`, 'info');
                const user = auth.currentUser;
                const tripsSnap = await db.collection('trips').where('userId', '==', user.uid).get();

                // Firestore batches are limited to 500 writes. Large histories
                // must be synced in chunks or the public switch silently fails.
                for (let start = 0; start < tripsSnap.docs.length; start += 500) {
                    const batch = db.batch();
                    tripsSnap.docs.slice(start, start + 500).forEach(doc => {
                        batch.update(doc.ref, { isPublic: isPublic });
                    });
                    await batch.commit();
                }
                UI.showNotification('All trips updated.', 'success');
            } catch (err) {
                console.error('Trip sync failed:', err);
                UI.showNotification('Failed to sync trips: ' + err.message);
            }
        });

        themeSelect?.addEventListener('change', (e) => {
            window.TransitTheme?.apply(e.target.value);
            this.updateSetting('theme', e.target.value);
        });

        mapStopModeSelect?.addEventListener('change', (e) => {
            const mode = e.target.value === 'exiting' ? 'exiting' : 'boarding';
            localStorage.setItem('transitstats-map-stop-mode', mode);
            this.updateSetting('mapStopMode', mode);
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
        const automatic = this.data?.defaultAgencyMode === 'automatic';
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
            const mode = this.data?.mapStopMode === 'exiting'
                ? 'exiting'
                : (localStorage.getItem('transitstats-map-stop-mode') === 'exiting' ? 'exiting' : 'boarding');
            mapStopModeEl.value = mode;
            localStorage.setItem('transitstats-map-stop-mode', mode);
        }

        const publicProfileBetaOwner = isPublicProfileBetaOwner(this.data?.username);
        sharingContentEl?.classList.toggle('hidden', !publicProfileBetaOwner);
        sharingComingSoonEl?.classList.toggle('hidden', publicProfileBetaOwner);
        if (!publicProfileBetaOwner) return;

        // --- Identity UI ---
        const username = this.data?.username;
        const identityRow = document.querySelector('.settings-identity-row');
        if (username) {
            identityRow?.classList.add('is-reserved');
            this.currentTriplet = username.split(/[-_]/);
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

        this.updateUsernameDisplay();

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
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
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

    async reserveUsername(username) {
        const user = auth.currentUser;
        if (!user) return;

        if (this.data?.username) {
            UI.showNotification('Identity changes are not supported.');
            return;
        }

        try {
            const legacyUsername = username.replace(/-/g, '_');
            const usernameDocs = await Promise.all(
                [...new Set([username, legacyUsername])].map(candidate => (
                    db.collection('usernames').doc(candidate).get()
                )),
            );
            if (usernameDocs.some(existing => existing.exists)) {
                UI.showNotification('That public identity is already in use. Choose another.');
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
