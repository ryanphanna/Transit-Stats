import { requireAuth } from '../shared/auth-guard.js';
import { initHeader } from '../shared/header.js';
import { Profile } from '../profile.js';
import { Auth } from '../auth.js';
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

    let logoutArmed = false;
    let logoutTimer = null;
    document.getElementById('btn-logout')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if (!logoutArmed) {
            logoutArmed = true;
            btn.textContent = 'Tap again to sign out';
            btn.classList.add('btn-danger');
            logoutTimer = setTimeout(() => {
                logoutArmed = false;
                btn.textContent = 'Sign Out';
                btn.classList.remove('btn-danger');
            }, 3000);
            return;
        }
        clearTimeout(logoutTimer);
        logoutArmed = false;
        await Auth.signOut();
        window.location.href = '/';
    });

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
