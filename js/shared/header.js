import { Auth } from '../auth.js';

/**
 * Shared Header Component
 * Injects navigation into the page.
 */
export function initHeader({ isAdmin = false, currentPage = '', profileHref = '' } = {}) {
    _render(isAdmin, currentPage, profileHref);
}

function _render(isAdmin, currentPage, profileHref) {
    const root = document.getElementById('app-root');
    if (!root) return;

    const navItems = ['dashboard', 'settings'].includes(currentPage) ? [] : [
            { id: 'routes', label: 'Routes', icon: 'route', href: '/routes' },
        ];
    const logoHref = '/dashboard';

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
                            <span>${item.label}</span>
                        </a>
                    `).join('')}
                </nav>

                <div class="header-actions">
                    ${profileHref ? `
                        <a href="${profileHref}" class="header-action-link ${currentPage === 'profile' ? 'active' : ''}" title="Profile">
                            <span>Profile</span>
                        </a>` : ''}
                    <a href="/settings" class="header-action-link ${currentPage === 'settings' ? 'active' : ''}" title="Settings">
                        <span>Settings</span>
                    </a>
                    <button id="btn-header-logout" class="header-action-link header-logout" title="Log out" aria-label="Log out">
                        <span>Log out</span>
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
