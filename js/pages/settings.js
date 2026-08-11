import { requireAuth } from '../shared/auth-guard.js';
import { initHeader } from '../shared/header.js';
import { refreshIcons } from '../shared/icons.js';
import { Profile } from '../profile.js';
import { UI } from '../ui-utils.js';

async function init() {
    const { user, isAdmin } = await requireAuth();
    initHeader({ isAdmin, currentPage: 'settings' });

    await Profile.load(user);
    await Profile.init();

    document.getElementById('btn-reset-password')?.addEventListener('click', async () => {
        await Auth.sendPasswordReset(user.email);
        UI.showNotification('Password reset email sent.');
    });

    refreshIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
