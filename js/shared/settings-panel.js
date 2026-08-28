import { auth } from '../firebase.js';
import { Auth } from '../auth.js';
import { Profile } from '../profile.js';
import { UI } from '../ui-utils.js';
import { ModalManager } from './modal-engine.js';
import { refreshIcons } from './icons.js';

const TABS = [
    { id: 'account', label: 'Account' },
    { id: 'map', label: 'Map preferences' },
    { id: 'profile', label: 'Profile' },
    { id: 'sharing', label: 'Sharing' },
];

let injected = false;
let initialized = false;

function panelMarkup() {
    return `
        <div id="modal-settings" class="modal modal-settings hidden">
            <div class="modal-header">
                <h2>Settings</h2>
                <button class="btn-close" data-close-modal><i data-lucide="x"></i></button>
            </div>
            <div class="settings-panel-body">
                <nav class="settings-panel-nav">
                    ${TABS.map((tab, index) => `
                        <button type="button" class="settings-panel-tab ${index === 0 ? 'active' : ''}" data-settings-tab="${tab.id}">${tab.label}</button>
                    `).join('')}
                </nav>
                <div class="settings-panel-content">
                    <div class="settings-panel-pane active" data-settings-pane="account">
                        <div class="settings-card premium-card">
                            <div class="settings-row">
                                <div class="settings-label-group">
                                    <span class="settings-main-label">Email</span>
                                    <span id="settings-email" class="settings-main-label settings-account-value text-xs">—</span>
                                </div>
                            </div>
                            <div class="settings-row settings-password-row">
                                <div class="settings-label-group">
                                    <span class="settings-main-label">Password</span>
                                    <div class="settings-password-value-row">
                                        <span class="settings-sub-label settings-password-mask" aria-label="Password managed through email">••••••••</span>
                                        <button id="btn-reset-password" class="btn btn-link settings-text-action">Reset password</button>
                                    </div>
                                </div>
                            </div>
                            <div class="settings-row">
                                <div class="settings-label-group">
                                    <span class="settings-main-label">Phone</span>
                                    <span id="settings-phone" class="settings-main-label settings-account-value text-xs">Loading...</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="settings-panel-pane" data-settings-pane="map">
                        <div class="settings-card premium-card">
                            <div class="settings-row">
                                <div class="settings-label-group">
                                    <span class="settings-main-label">Primary agency</span>
                                    <div class="settings-agency-value-row">
                                        <span id="settings-agency-display" class="settings-main-label settings-account-value">Automatic</span>
                                        <button id="btn-change-agency" class="btn btn-link settings-text-action" title="Change primary agency">Change</button>
                                    </div>
                                </div>
                                <div id="settings-agency-field" class="settings-agency-field hidden">
                                    <input type="search" id="settings-agency" class="minimal-input settings-agency-input" autocomplete="off" placeholder="Automatic" aria-label="Primary agency">
                                    <button type="button" id="btn-clear-agency" class="btn btn-sm btn-ghost settings-agency-clear" title="Use automatic detection" aria-label="Use automatic detection">Auto</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div id="public-profile-settings" class="settings-panel-pane" data-settings-pane="profile">
                        <div class="settings-card premium-card">
                            <div class="settings-row">
                                <div class="settings-label-group">
                                    <span class="settings-main-label">Display name</span>
                                    <div class="settings-name-value-row">
                                        <span id="settings-name-display" class="settings-main-label settings-account-value">Not set</span>
                                        <input type="text" id="settings-name" class="minimal-input hidden" placeholder="Enter name...">
                                        <button id="btn-change-name" class="btn btn-link settings-text-action" title="Change display name">Change</button>
                                        <button id="btn-save-name" class="btn btn-link settings-text-action hidden" title="Save name">Save</button>
                                    </div>
                                </div>
                            </div>
                            <div class="settings-row">
                                <div class="settings-label-group">
                                    <span class="settings-main-label">Map stops</span>
                                    <span class="settings-sub-label">Choose boarding or exiting stops</span>
                                </div>
                                <select id="settings-map-stop-mode" class="minimal-select" aria-label="Map stops">
                                    <option value="boarding">Boarding</option>
                                    <option value="exiting">Exiting</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div id="sharing-settings" class="settings-panel-pane" data-settings-pane="sharing">
                        <div class="settings-card premium-card">
                            <div id="settings-admin-username" class="settings-row settings-admin-username-row hidden">
                                <div class="settings-label-group">
                                    <span class="settings-main-label">Custom username</span>
                                    <div class="settings-custom-username-value-row">
                                        <span id="settings-custom-username-display" class="settings-main-label settings-account-value">Not set</span>
                                        <button id="btn-change-custom-username" class="btn btn-link settings-text-action">Change</button>
                                    </div>
                                </div>
                                <div id="settings-custom-username-editor" class="settings-custom-username-editor hidden">
                                    <input id="settings-custom-username" class="minimal-input" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="e.g. r" aria-label="Custom username">
                                    <button id="btn-save-custom-username" class="btn btn-link settings-text-action">Save</button>
                                </div>
                            </div>
                            <div id="settings-sharing-coming-soon" class="settings-coming-soon hidden">
                                Public profiles are coming soon.
                            </div>
                            <div id="settings-sharing-content">
                                <div class="settings-row">
                                    <div class="settings-label-group">
                                        <span class="settings-sub-label">Allow others to view your shared stats page</span>
                                    </div>
                                    <input type="checkbox" id="settings-public-profile" aria-label="Allow others to view your shared stats page">
                                </div>
                                <div class="settings-row settings-identity-row">
                                    <span class="settings-main-label">Public identity</span>
                                    <div id="emoji-identity-picker" class="emoji-picker-container">
                                        <div class="emoji-slots">
                                            <div class="emoji-slot" data-index="0">❓</div>
                                            <div class="emoji-slot" data-index="1">❓</div>
                                            <div class="emoji-slot" data-index="2">❓</div>
                                        </div>
                                        <button id="btn-save-identity" class="btn btn-sm btn-primary">Save identity</button>
                                    </div>
                                    <span id="settings-identity-help" class="settings-sub-label">Choose carefully — this identity can’t be changed later.</span>
                                    <div id="settings-username-display" class="settings-main-label settings-account-value text-xxs text-muted"></div>
                                </div>
                                <div class="settings-row">
                                    <div class="settings-label-group">
                                        <span class="settings-main-label">Profile URLs</span>
                                        <div id="settings-public-link" class="settings-profile-links settings-main-label text-xs">Pick your identity to enable sharing.</div>
                                    </div>
                                </div>
                                <div id="emoji-popover" class="emoji-popover hidden">
                                    <div class="emoji-grid"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function showTab(tabId) {
    document.querySelectorAll('.settings-panel-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.settingsTab === tabId);
    });
    document.querySelectorAll('.settings-panel-pane').forEach(pane => {
        pane.classList.toggle('active', pane.dataset.settingsPane === tabId);
    });
}

function injectPanel() {
    if (injected) return;
    injected = true;
    document.body.insertAdjacentHTML('beforeend', panelMarkup());
    if (window.lucide) lucide.createIcons();

    document.querySelectorAll('.settings-panel-tab').forEach(tab => {
        tab.addEventListener('click', () => showTab(tab.dataset.settingsTab));
    });
}

// Pages other than dashboard/routes/trip-paths don't call requireAuth() (the
// public profile page only checks Firebase auth state directly), so window.currentUser
// and window.isAdmin aren't guaranteed to be set. Reuse them when present;
// otherwise resolve isAdmin the same way requireAuth() does.
async function resolveAuthContext() {
    if (window.currentUser) {
        return { user: window.currentUser, isAdmin: !!window.isAdmin };
    }
    const user = auth.currentUser;
    if (!user) return null;
    const verification = await Auth.checkWhitelist(user.email || null, user.uid);
    return { user, isAdmin: !!verification.isAdmin };
}

async function initPanelData() {
    if (initialized) return;
    const context = await resolveAuthContext();
    if (!context) return;
    initialized = true;

    const { user } = context;
    await Profile.load(user);
    await Profile.loadAgencies(user);
    await Profile.init();

    document.getElementById('btn-reset-password')?.addEventListener('click', async () => {
        const button = document.getElementById('btn-reset-password');
        if (!user.email || button?.disabled) return;
        button.disabled = true;
        button.textContent = 'Sending…';
        try {
            await Auth.sendPasswordReset(user.email);
            UI.showNotification('Password reset email sent.', 'success');
        } catch (error) {
            UI.showNotification(error.message || 'Could not send password reset email.');
        } finally {
            button.disabled = false;
            button.textContent = 'Reset password';
        }
    });

    refreshIcons();
}

export async function openSettingsPanel({ tab } = {}) {
    injectPanel();
    ModalManager.init();
    await initPanelData();
    if (tab) showTab(tab);
    ModalManager.open('modal-settings');
}
