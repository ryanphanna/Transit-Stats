import { requireAuth } from '../shared/auth-guard.js';
import { initHeader } from '../shared/header.js';
import { Profile } from '../profile.js';
import { Auth } from '../auth.js';
import { SettingsView } from '../shared/settings-view.js';
import { UI } from '../ui-utils.js';

function refreshIcons() {
    if (window.lucide) lucide.createIcons();
    else setTimeout(() => { if (window.lucide) lucide.createIcons(); }, 100);
}

async function init() {
    const { user, isAdmin } = await requireAuth();
    initHeader({ isAdmin, currentPage: 'settings' });

    await Profile.load(user);
    Profile.setupListeners();

    document.getElementById('btn-logout')?.addEventListener('click', async () => {
        if (confirm('Sign out of TransitStats?')) {
            await Auth.signOut();
            window.location.href = '/';
        }
    });

    document.getElementById('btn-reset-password')?.addEventListener('click', async () => {
        await Auth.sendPasswordReset(user.email);
        UI.showNotification('Password reset email sent.');
    });

    if (isAdmin) {
        document.getElementById('section-prediction-accuracy')?.classList.remove('hidden');
        SettingsView.renderTelemetry();
    }

    refreshIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
