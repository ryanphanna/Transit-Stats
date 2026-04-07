import { auth, db } from '../firebase.js';
import { Auth } from '../auth.js';
import { Profile } from '../profile.js';

/**
 * Injects the shared header, settings modal, backdrop, and toast container
 * into the page. Call after requireAuth() resolves.
 */
export function initHeader({ isAdmin = false, currentPage = '' } = {}) {
    _injectHeader(isAdmin, currentPage);
    _injectSettingsModal(isAdmin);
    _injectSharedDOM();
    _setupTheme();
    _setupSettings(isAdmin);
    _setupLogout();
    if (window.lucide) lucide.createIcons();
}

function _injectHeader(isAdmin, currentPage) {
    const header = document.createElement('header');
    header.id = 'site-header';
    header.className = 'header';
    header.innerHTML = `
        <div class="container header-inner">
            <a href="/dashboard" class="logo"><span class="text-accent">Transit</span>Stats</a>
            <nav id="user-nav" class="nav-links">
                ${isAdmin ? `<a href="/admin" class="btn btn-ghost${currentPage === 'admin' ? ' active' : ''}">Data</a>` : ''}
                ${isAdmin ? `<a href="/users" class="btn btn-ghost${currentPage === 'users' ? ' active' : ''}">Users</a>` : ''}
                <a href="/insights" class="btn btn-ghost${currentPage === 'insights' ? ' active' : ''}">Insights</a>
                <a href="/map" class="btn btn-icon${currentPage === 'map' ? ' active' : ''}" title="Map"><i data-lucide="map"></i></a>
                ${isAdmin ? `<a href="/rocket" class="btn btn-icon${currentPage === 'rocket' ? ' active' : ''}" title="Rocket"><i data-lucide="rocket"></i></a>` : ''}
                <button id="nav-settings" class="btn btn-icon" title="Settings"><i data-lucide="settings"></i></button>
            </nav>
        </div>
    `;
    document.body.prepend(header);
}

function _injectSettingsModal(isAdmin) {
    const modal = document.createElement('div');
    modal.id = 'modal-settings';
    modal.className = 'modal hidden';
    modal.innerHTML = `
        <div class="modal-header">
            <h2>Settings</h2>
            <button class="btn-close" id="btn-close-settings"><i data-lucide="x"></i></button>
        </div>
        <div class="modal-body">
            <div class="settings-group mb-4">
                <label class="section-label">Account</label>
                <div id="settings-profile-info" class="profile-info-box mt-2">
                    <div class="info-row">
                        <span class="info-label">Email</span>
                        <span id="settings-email" class="info-value">-</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Phone</span>
                        <span id="settings-phone" class="info-value">Not linked</span>
                    </div>
                </div>
            </div>
            <div class="settings-group mb-4">
                <label class="section-label">Preferences</label>
                <div class="form-group mt-2">
                    <label>Default Transit Agency</label>
                    <select id="settings-agency" class="modal-select">
                        <option value="TTC">TTC (Toronto)</option>
                        <option value="GO Transit">GO Transit</option>
                        <option value="MiWay">MiWay (Mississauga)</option>
                        <option value="YRT">YRT (York Region)</option>
                        <option value="Brampton Transit">Brampton Transit</option>
                        <option value="Durham Transit">Durham Transit</option>
                        <option value="HSR">HSR (Hamilton)</option>
                        <option value="GRT">GRT (Waterloo)</option>
                        <option value="OC Transpo">OC Transpo (Ottawa)</option>
                        <option value="STM">STM (Montreal)</option>
                        <option value="TransLink">TransLink (Vancouver)</option>
                        <option value="Other">Other</option>
                    </select>
                </div>
            </div>
            <div class="settings-group mb-4">
                <label class="section-label">Beta Features</label>
                <div class="toggle-row mt-2">
                    <div class="toggle-info">
                        <span class="toggle-title">Destination Predictions</span>
                        <span class="toggle-desc">Show predicted end stops when logging.</span>
                    </div>
                    <label class="switch">
                        <input type="checkbox" id="settings-beta-predictions">
                        <span class="slider round"></span>
                    </label>
                </div>
            </div>
            <div class="settings-group">
                <label class="section-label">App Appearance</label>
                <div class="toggle-group full-width mt-2 mb-4">
                    <button id="theme-light" class="toggle-btn w-50">Light</button>
                    <button id="theme-dark" class="toggle-btn w-50">Dark</button>
                </div>
            </div>
            ${isAdmin ? `
            <div id="prediction-accuracy-section" class="settings-group" style="border-top: 1px solid var(--border-color); padding-top: 1rem; margin-top: 1rem;">
                <label>Admin Insights</label>
                <p id="prediction-accuracy-stat" class="text-secondary" style="font-size: 0.85rem; margin-top: 0.4rem;">Loading...</p>
            </div>` : ''}
            <button id="btn-logout" class="btn btn-danger-outline full-width mt-4">Log Out</button>
        </div>
    `;
    document.body.appendChild(modal);
}

function _injectSharedDOM() {
    const backdrop = document.createElement('div');
    backdrop.id = 'modal-backdrop';
    backdrop.className = 'modal-backdrop hidden';
    document.body.appendChild(backdrop);

    const toast = document.createElement('div');
    toast.id = 'toast-container';
    toast.className = 'toast-container';
    document.body.appendChild(toast);
}

function _setupTheme() {
    const theme = localStorage.getItem('ts_theme') || 'light';
    const themeLight = document.getElementById('theme-light');
    const themeDark = document.getElementById('theme-dark');
    if (themeLight) {
        themeLight.classList.toggle('active', theme === 'light');
        themeLight.addEventListener('click', () => _applyTheme('light'));
    }
    if (themeDark) {
        themeDark.classList.toggle('active', theme === 'dark');
        themeDark.addEventListener('click', () => _applyTheme('dark'));
    }
}

function _applyTheme(theme) {
    localStorage.setItem('ts_theme', theme);
    document.body.classList.toggle('dark', theme === 'dark');
    document.getElementById('theme-light')?.classList.toggle('active', theme === 'light');
    document.getElementById('theme-dark')?.classList.toggle('active', theme === 'dark');
}

function _setupSettings(isAdmin) {
    document.getElementById('nav-settings')?.addEventListener('click', () => _openSettings(isAdmin));
    document.getElementById('btn-close-settings')?.addEventListener('click', _closeSettings);
    document.getElementById('modal-backdrop')?.addEventListener('click', _closeSettings);
}

function _openSettings(isAdmin) {
    document.getElementById('modal-backdrop')?.classList.remove('hidden');
    document.getElementById('modal-settings')?.classList.remove('hidden');
    Profile.syncUI(auth.currentUser?.email || '');

    if (isAdmin && auth.currentUser) {
        const stat = document.getElementById('prediction-accuracy-stat');
        if (stat) {
            db.collection('predictionAccuracy').doc(auth.currentUser.uid).get().then(doc => {
                if (!doc.exists) { stat.textContent = 'No predictions graded yet.'; return; }
                const d = doc.data();
                const routePct = d.total ? Math.round((d.hits / d.total) * 100) : null;
                const endPct = d.endStopTotal ? Math.round((d.endStopHits / d.endStopTotal) * 100) : null;
                const parts = [];
                if (routePct !== null) parts.push(`Route: ${routePct}% (${d.hits}/${d.total})`);
                if (endPct !== null) parts.push(`End stop: ${endPct}% (${d.endStopHits}/${d.endStopTotal})`);
                stat.textContent = parts.length ? parts.join(' · ') : 'No data yet.';
            }).catch(() => { stat.textContent = 'Could not load.'; });
        }
    }
}

function _closeSettings() {
    document.getElementById('modal-backdrop')?.classList.add('hidden');
    document.getElementById('modal-settings')?.classList.add('hidden');
}

function _setupLogout() {
    document.getElementById('btn-logout')?.addEventListener('click', async () => {
        await Auth.signOut();
        window.location.href = '/';
    });
}
