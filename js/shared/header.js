import { auth, db } from '../firebase.js';
import { Auth } from './auth-guard.js';
import { Profile } from '../profile.js';

/**
 * Shared Header Component
 * Injects navigation and standard modal structure into the page.
 */
export function initHeader({ isAdmin = false, currentPage = '' } = {}) {
    _render(isAdmin, currentPage);
    _setupNav();
    _setupSettings(isAdmin);
    _setupLogout();
}

function _render(isAdmin, currentPage) {
    const root = document.getElementById('app-root');
    if (!root) return;

    const navItems = [
        { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', href: '/dashboard' },
        { id: 'insights', label: 'Insights', icon: 'line-chart', href: '/insights' },
        { id: 'map', label: 'Map', icon: 'map', href: '/map' }
    ];

    if (isAdmin) {
        navItems.push({ id: 'admin', label: 'Stops', icon: 'database', href: '/admin' });
        navItems.push({ id: 'users', label: 'Users', icon: 'users', href: '/users' });
        navItems.push({ id: 'rocket', label: 'Rocket', icon: 'rocket', href: '/rocket' });
    }

    const headerHtml = `
        <header class="header">
            <div class="header-container">
                <div class="logo">
                     <div class="logo-icon"><i data-lucide="zap"></i></div>
                     <span class="logo-text">TransitStats</span>
                </div>
                
                <nav class="nav-desktop">
                    ${navItems.map(item => `
                        <a href="${item.href}" class="nav-item ${currentPage === item.id ? 'active' : ''}">
                            <i data-lucide="${item.icon}"></i>
                            <span>${item.label}</span>
                        </a>
                    `).join('')}
                </nav>

                <div class="header-actions">
                    <button class="icon-btn" id="nav-settings" title="Settings">
                        <i data-lucide="settings"></i>
                    </button>
                    <!-- Mobile Nav Toggle could go here -->
                </div>
            </div>
        </header>

        <!-- Modals -->
        <div id="modal-backdrop" class="modal-backdrop hidden"></div>
        
        <div id="modal-settings" class="modal hidden">
            <div class="modal-header">
                <h3>Settings</h3>
                <button class="icon-btn" id="btn-close-settings"><i data-lucide="x"></i></button>
            </div>
            
            <div class="modal-body">
                <div class="settings-section">
                    <label>Profile</label>
                    <div class="profile-info">
                        <div class="row-between">
                            <span class="text-secondary">Email</span>
                            <span id="settings-email" class="text-main">—</span>
                        </div>
                        <div class="row-between mt-2">
                            <span class="text-secondary">Phone</span>
                            <span id="settings-phone" class="text-accent">Not linked</span>
                        </div>
                    </div>
                </div>

                <div class="settings-section">
                    <label>Preferences</label>
                    <div class="form-group">
                        <span class="text-secondary mb-1 block">Default Agency</span>
                        <select id="settings-agency">
                            <option value="TTC">TTC (Toronto)</option>
                            <option value="GO">GO Transit</option>
                            <option value="UP">UP Express</option>
                        </select>
                    </div>
                </div>

                <div class="settings-section">
                    <label>Beta Lab</label>
                    <div class="row-between">
                        <div>
                            <span class="block">Predicted Trips</span>
                            <span class="text-secondary text-xs">Show next predicted boarding in dashboard</span>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="settings-beta-predictions">
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>

                ${isAdmin ? `
                <div class="settings-section admin-only">
                    <label>Admin Insights</label>
                    <div class="profile-info">
                        <div class="text-xs text-secondary mb-1">Prediction Accuracy</div>
                        <div id="prediction-accuracy-stat" class="text-main">Loading...</div>
                    </div>
                </div>
                ` : ''}

                <div class="mt-4 pt-4 border-t">
                    <button id="btn-logout" class="btn btn-outline full-width text-danger">Sign Out</button>
                </div>
            </div>
        </div>
    `;

    // Inject before other content
    root.insertAdjacentHTML('afterbegin', headerHtml);

    // Initial icon refresh
    if (window.lucide) lucide.createIcons();
}

function _setupNav() {
    // Current page highlighting is handled in _render
}

function _setupSettings(isAdmin) {
    document.getElementById('nav-settings')?.addEventListener('click', () => _openSettings(isAdmin));
    document.getElementById('btn-close-settings')?.addEventListener('click', _closeSettings);
    document.getElementById('modal-backdrop')?.addEventListener('click', _closeSettings);
}

async function _openSettings(isAdmin) {
    document.getElementById('modal-backdrop')?.classList.remove('hidden');
    const modal = document.getElementById('modal-settings');
    if (modal) {
        modal.classList.remove('hidden');
        await Profile.syncUI(auth.currentUser?.email || '');
        
        // Add user specific insights if admin
        if (isAdmin && auth.currentUser) {
            const stat = document.getElementById('prediction-accuracy-stat');
            if (stat) {
                try {
                    const doc = await db.collection('predictionAccuracy').doc(auth.currentUser.uid).get();
                    if (!doc.exists) { 
                        stat.textContent = 'No predictions graded yet.'; 
                    } else {
                        const d = doc.data();
                        const routePct = d.total ? Math.round((d.hits / d.total) * 100) : null;
                        const endPct = d.endStopTotal ? Math.round((d.endStopHits / d.endStopTotal) * 100) : null;
                        
                        const parts = [];
                        if (routePct !== null) parts.push(`Route: ${routePct}% (${d.hits}/${d.total})`);
                        if (endPct !== null) parts.push(`End stop: ${endPct}% (${d.endStopHits}/${d.endStopTotal})`);
                        stat.textContent = parts.length ? parts.join(' · ') : 'No data yet.';
                    }
                } catch (err) {
                    stat.textContent = 'Could not load.';
                }
            }
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
