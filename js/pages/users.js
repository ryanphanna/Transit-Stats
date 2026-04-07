import { requireAuth } from '../shared/auth-guard.js';
import { initHeader } from '../shared/header.js';
import { Users } from '../users.js';
import { Utils } from '../utils.js';

window.Utils = Utils;

function refreshIcons() {
    if (window.lucide) {
        lucide.createIcons();
    } else {
        setTimeout(() => { if (window.lucide) lucide.createIcons(); }, 100);
    }
}

async function init() {
    const { user, isAdmin } = await requireAuth({ adminOnly: true });
    initHeader({ isAdmin, currentPage: 'users' });

    Users.init();

    refreshIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
