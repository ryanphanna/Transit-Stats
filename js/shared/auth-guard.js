import { auth } from '../firebase.js';
import { Auth } from '../auth.js';

// Apply theme immediately to prevent flash of unstyled content
const _theme = localStorage.getItem('ts_theme') || 'light';
document.body.classList.toggle('dark', _theme === 'dark');

/**
 * Resolves when auth is confirmed. Redirects to / if not authed or not whitelisted.
 * @param {object} options
 * @param {boolean} options.adminOnly — redirect to /dashboard if user is not admin
 */
export function requireAuth(options = {}) {
    return new Promise((resolve) => {
        auth.onAuthStateChanged(async (user) => {
    const loginUrl = '/';
            if (!user) {
                window.location.href = loginUrl;
                return;
            }
            const verification = await Auth.checkWhitelist(user.email, user.uid);
            if (!verification.allowed) {
                await Auth.signOut();
                window.location.href = loginUrl;
                return;
            }
            if (options.adminOnly && !verification.isAdmin) {
                window.location.href = '/dashboard';
                return;
            }
            window.currentUser = user;
            window.isAdmin = verification.isAdmin;
            resolve({ user, isAdmin: verification.isAdmin });
        });
    });
}
