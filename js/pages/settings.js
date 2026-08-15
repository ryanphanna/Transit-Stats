import { requireAuth } from '../shared/auth-guard.js';
import { initHeader } from '../shared/header.js';
import { refreshIcons } from '../shared/icons.js';
import { Profile } from '../profile.js';
import { UI } from '../ui-utils.js';
import { Auth } from '../auth.js';

async function init() {
    const { user, isAdmin } = await requireAuth();
    initHeader({ isAdmin, currentPage: 'settings' });

    await Profile.load(user);
    await Profile.loadAgencies(user);
    await Profile.init();

    if (window.location.hash === '#public-profile-settings') {
        document.getElementById('public-profile-settings')?.scrollIntoView({ block: 'start' });
    }

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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
