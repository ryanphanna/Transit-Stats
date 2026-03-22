
// TransitStats UI Utility Module
export const UI = {
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
     * JS sanitization for inline event handlers
     */
    escapeForJs: function (unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        return String(unsafe)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/"/g, '&quot;')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');
    },

    /**
     * Show loading state on a button
     */
    showLoading: function (button, loadingText = 'Loading...') {
        if (!button) return;
        button.disabled = true;
        button.dataset.originalText = button.textContent;
        button.textContent = loadingText;
    },

    /**
     * Hide loading state on a button
     */
    hideLoading: function (button) {
        if (!button || !button.dataset.originalText) return;
        button.disabled = false;
        button.textContent = button.dataset.originalText;
        delete button.dataset.originalText;
    }
};

// Expose to window for legacy compatibility if needed
window.UI = UI;
window.escapeHtml = UI.escapeHtml;
window.showNotification = UI.showNotification;
