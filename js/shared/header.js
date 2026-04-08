import { auth } from '../firebase.js';
import { Auth } from './auth-guard.js';
import { ModalManager } from './modal-engine.js';
import { SettingsView } from './settings-view.js';

/**
 * Shared Header Component
 * Injects navigation and standard modal structure into the page.
 */
export function initHeader({ isAdmin = false, currentPage = '' } = {}) {
    ModalManager.init();
    _render(isAdmin, currentPage);
    _setupListeners(isAdmin);
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
                </div>
            </div>
        </header>

        <!-- Shared Settings Modal Structure -->
        <div id="modal-settings" class="modal hidden">
            <div class="modal-header">
                <div class="flex-column">
                    <h3 class="m-0">System Configuration</h3>
                    <span class="text-xxs text-muted">User Preferences & Laboratory</span>
                </div>
                <button class="icon-btn" data-close-modal><i data-lucide="x"></i></button>
            </div>
            
            <div class="modal-body">
                <div class="settings-grid">
                    <!-- Section: Account -->
                    <div class="settings-group">
                        <div class="settings-group-title"><i data-lucide="user"></i><span>Account</span></div>
                        <div class="settings-card premium-card">
                            <div class="settings-row">
                                <div class="settings-label-group">
                                    <span class="settings-sub-label">Email</span>
                                    <span id="settings-email" class="settings-main-label text-xs">—</span>
                                </div>
                                <button id="btn-reset-password" class="btn btn-sm btn-ghost p-1"><i data-lucide="key" class="icon-inline m-0" style="width:14px;"></i></button>
                            </div>
                            <div class="settings-row">
                                <div class="settings-label-group">
                                    <span class="settings-main-label">RCS Signal</span>
                                    <span id="settings-phone" class="text-accent font-bold text-xxs">Establishing...</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Section: Settings -->
                    <div class="settings-group">
                        <div class="settings-group-title"><i data-lucide="settings"></i><span>Settings</span></div>
                        <div class="settings-card premium-card">
                            <div class="settings-row">
                                <span class="settings-main-label">Base Agency</span>
                                <select id="settings-agency" class="minimal-select">
                                    <option value="TTC">Toronto (TTC)</option>
                                    <option value="GO">GO Transit</option>
                                    <option value="UP">UP Express</option>
                                    <option value="DRT">Durham Region</option>
                                </select>
                            </div>
                            <div class="settings-row">
                                <span class="settings-main-label text-xs">Theme</span>
                                <div class="status-indicator active" title="System Match"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Section: Beta -->
                <div class="settings-group mt-2">
                    <div class="settings-group-title"><i data-lucide="flask-conical"></i><span>Beta</span></div>
                    <div class="settings-card premium-card">
                        <div class="settings-row">
                            <div class="settings-label-group">
                                <span class="settings-main-label">Station Prediction Engine</span>
                                <span class="settings-sub-label">Anticipate stops based on historical telemetry</span>
                            </div>
                            <label class="switch">
                                <input type="checkbox" id="settings-beta-predictions">
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                </div>

                ${isAdmin ? `
                <div class="settings-group mt-4">
                    <div class="settings-group-title"><i data-lucide="activity"></i><span>Admin Intelligence</span></div>
                    <div id="admin-insights-container" class="settings-card premium-card" style="padding: 16px;">
                        <div class="loading-state">Syncing Probes...</div>
                    </div>
                </div>
                ` : ''}

                <div class="mt-8">
                    <button id="btn-logout" class="btn btn-danger-outline full-width">Sign Out Of Terminal</button>
                </div>
            </div>
        </div>
    `;

    root.insertAdjacentHTML('afterbegin', headerHtml);
    if (window.lucide) lucide.createIcons();
}

function _setupListeners(isAdmin) {
    document.getElementById('nav-settings')?.addEventListener('click', () => SettingsView.open(isAdmin));
    
    document.getElementById('btn-logout')?.addEventListener('click', async () => {
        if (confirm('Sign out of TransitStats?')) {
            await Auth.signOut();
            window.location.href = '/';
        }
    });
}
