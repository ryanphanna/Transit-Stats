import { Auth } from '../auth.js';

/**
 * Shared Header Component
 * Injects navigation into the page.
 */
export function initHeader({ isAdmin = false, currentPage = '' } = {}) {
    _render(isAdmin, currentPage);
}

function _render(isAdmin, currentPage) {
    const root = document.getElementById('app-root');
    if (!root) return;

    const adminHost = window.location.hostname === 'admin.transitstats.fyi';
    const adminSurface = adminHost || ['admin', 'users', 'insights', 'rocket'].includes(currentPage);
    const betaSurface = ['localhost', '127.0.0.1', 'beta.transitstats.fyi'].includes(window.location.hostname);
    const navItems = adminSurface
        ? [
            { id: 'admin', label: 'Stops', icon: 'database', href: '/admin' },
            { id: 'users', label: 'Users', icon: 'users', href: '/users' },
            { id: 'insights', label: 'Insights', icon: 'line-chart', href: '/insights' },
            ...(isAdmin ? [{ id: 'rocket', label: 'Rocket', icon: 'rocket', href: '/rocket' }] : []),
        ]
        : currentPage === 'dashboard' ? [] : [
            { id: 'map', label: 'Stops', icon: 'map-pin', href: '/map' },
            { id: 'routes', label: 'Routes', icon: 'route', href: '/routes' },
            ...(betaSurface ? [{ id: 'heatmap', label: 'Heatmap', icon: 'layers-2', href: '/heatmap' }] : []),
        ];
    const logoHref = adminHost ? '/admin' : '/dashboard';

    const headerHtml = `
        <header class="header">
            <div class="header-container">
                <a href="${logoHref}" class="logo">
                     <div class="logo-icon"><i data-lucide="zap"></i></div>
                     <span class="logo-text">TransitStats</span>
                </a>
                
                <nav class="nav-desktop">
                    ${navItems.map(item => `
                        <a href="${item.href}" class="nav-item ${currentPage === item.id ? 'active' : ''}">
                            <i data-lucide="${item.icon}"></i>
                            <span>${item.label}</span>
                        </a>
                    `).join('')}
                </nav>

                <div class="header-actions">
                    <a href="/settings" class="icon-btn ${currentPage === 'settings' ? 'active' : ''}" title="Settings">
                        <i data-lucide="settings"></i>
                    </a>
                    <button id="btn-header-logout" class="icon-btn header-logout" title="Sign out" aria-label="Sign out">
                        <i data-lucide="log-out"></i>
                    </button>
                </div>
            </div>
        </header>
    `;

    root.insertAdjacentHTML('afterbegin', headerHtml);
    if (window.lucide) lucide.createIcons();

    const logout = document.getElementById('btn-header-logout');
    let armed = false;
    let timer = null;
    logout?.addEventListener('click', async () => {
        if (!armed) {
            armed = true;
            logout.classList.add('confirming');
            logout.setAttribute('aria-label', 'Tap again to sign out');
            logout.title = 'Tap again to sign out';
            timer = setTimeout(() => {
                armed = false;
                logout.classList.remove('confirming');
                logout.setAttribute('aria-label', 'Sign out');
                logout.title = 'Sign out';
            }, 3000);
            return;
        }

        clearTimeout(timer);
        logout.disabled = true;
        await Auth.signOut();
        window.location.href = '/';
    });
}
