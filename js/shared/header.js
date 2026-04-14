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

    const navItems = [
        { id: 'insights', label: 'Insights', icon: 'line-chart', href: '/insights' },
        { id: 'map', label: 'Map', icon: 'map', href: '/map' },
    ];

    if (isAdmin) {
        navItems.push({ id: 'rocket', label: 'Rocket', icon: 'rocket', href: '/rocket' });
        navItems.push({ id: 'admin', label: 'Stops', icon: 'database', href: '/admin' });
        navItems.push({ id: 'users', label: 'Users', icon: 'users', href: '/users' });
    }

    const headerHtml = `
        <header class="header">
            <div class="header-container">
                <a href="/dashboard" class="logo">
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
                </div>
            </div>
        </header>
    `;

    root.insertAdjacentHTML('afterbegin', headerHtml);
    if (window.lucide) lucide.createIcons();
}

