
// TransitStats UI Utility Module
export const UI = {
    /**
     * Load saved theme from localStorage
     */
    loadSavedTheme: function () {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.setAttribute('data-theme', 'dark');
            this.updateThemeButtons('dark');
        } else {
            this.updateThemeButtons('light');
        }
    },

    /**
     * Set the application theme
     * @param {string} theme - 'light' or 'dark'
     */
    setTheme: function (theme) {
        if (theme === 'dark') {
            document.body.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.body.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
        }
        this.updateThemeButtons(theme);
    },

    /**
     * Update theme toggle button styles
     */
    updateThemeButtons: function (theme) {
        const themeLightBtn = document.getElementById('themeLightBtn');
        const themeDarkBtn = document.getElementById('themeDarkBtn');

        if (themeLightBtn && themeDarkBtn) {
            if (theme === 'dark') {
                themeDarkBtn.style.background = 'var(--accent-primary)';
                themeDarkBtn.style.borderColor = 'var(--accent-primary)';
                themeDarkBtn.style.color = 'white';

                themeLightBtn.style.background = 'transparent';
                themeLightBtn.style.borderColor = 'var(--border-color)';
                themeLightBtn.style.color = 'var(--text-secondary)';
            } else {
                themeLightBtn.style.background = 'var(--accent-primary)';
                themeLightBtn.style.borderColor = 'var(--accent-primary)';
                themeLightBtn.style.color = 'white';

                themeDarkBtn.style.background = 'transparent';
                themeDarkBtn.style.borderColor = 'var(--border-color)';
                themeDarkBtn.style.color = 'var(--text-secondary)';
            }
        }
    },

    /**
     * HTML sanitization to prevent XSS
     */
    escapeHtml: function (unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        return String(unsafe)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    /**
     * Update the connection status indicator
     */
    updateConnectionStatus: function (online) {
        const indicator = document.getElementById('connectionStatus');
        if (indicator) {
            indicator.className = online ? 'status-online' : 'status-offline';
        }
    },

    /**
     * Apply a simple fade-in animation to a section
     */
    fadeInSection: function (element) {
        if (!element) return;
        element.style.opacity = '0';
        element.style.transition = 'opacity 0.4s ease';
        setTimeout(() => {
            element.style.opacity = '1';
        }, 10);
    },

    /**
     * Unified error reporting
     */
    showNotification: function (message, type = 'error') {
        const notification = document.createElement('div');
        const bgColor = type === 'error' ? 'var(--danger-text)' : 'var(--success)';

        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${bgColor};
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 10000;
            font-weight: 500;
            animation: slideUp 0.3s ease;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translate(-50%, 10px)';
            notification.style.transition = 'all 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    },

    /**
     * Settings Modal Management
     */
    openSettings: function () {
        const modal = document.getElementById('settingsModal');
        if (modal) {
            modal.style.display = 'block';
            this.fadeInSection(modal);
        }
    },

    closeSettings: function () {
        const modal = document.getElementById('settingsModal');
        if (modal) modal.style.display = 'none';
    }
};

// Expose to window for legacy compatibility if needed
window.UI = UI;
window.setTheme = UI.setTheme.bind(UI);
window.escapeHtml = UI.escapeHtml;
window.showNotification = UI.showNotification;
window.openSettings = UI.openSettings.bind(UI);
window.closeSettings = UI.closeSettings.bind(UI);
