import { auth, authPersistenceReady } from '../firebase.js';
import { Auth } from '../auth.js';

const AUTH_RESTORE_GRACE_MS = 15000;

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function verifyWithRetry(user) {
    let verification;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        verification = await Auth.checkWhitelist(user.email, user.uid);
        if (verification.allowed || !verification.retryable) return verification;
        await wait(500 * (attempt + 1));
    }
    return verification;
}

// Apply theme immediately to prevent flash of unstyled content
const _theme = localStorage.getItem('ts_theme') || 'system';
if (window.TransitTheme) window.TransitTheme.apply(_theme);
else document.body.classList.toggle('dark', _theme === 'dark');

/**
 * Resolves when auth is confirmed. Redirects to / if not authed or not whitelisted.
 * @param {object} options
 * @param {boolean} options.adminOnly — redirect to /dashboard if user is not admin
 */
export function requireAuth(options = {}) {
    let checking = false;
    let resolved = false;
    return new Promise((resolve) => {
        const listen = () => auth.onAuthStateChanged(async (user) => {
            if (checking || resolved) return;
            checking = true;
            const loginUrl = '/';
            // A Vite live reload can recreate the page before Firebase has
            // finished hydrating its LOCAL session. Give that restoration a
            // short grace period instead of treating the transient null as a
            // real sign-out.
            if (!user) await wait(AUTH_RESTORE_GRACE_MS);
            const sessionUser = auth.currentUser || user || await Auth.restoreSharedSession();
            if (!sessionUser) {
                console.warn('[auth-guard] Redirecting without a restored session.', {
                    path: window.location.pathname,
                    initialUser: Boolean(user),
                    currentUser: Boolean(auth.currentUser),
                });
                window.location.href = loginUrl;
                return;
            }
            const verification = await verifyWithRetry(sessionUser);
            if (!verification.allowed) {
                if (verification.retryable) {
                    console.warn('Auth verification is temporarily unavailable; keeping the Firebase session.');
                    checking = false;
                    return;
                }
                console.warn('[auth-guard] Whitelist rejected the session.', {
                    path: window.location.pathname,
                    reason: verification.error,
                });
                await Auth.signOut();
                window.location.href = loginUrl;
                return;
            }
            if (options.adminOnly && !verification.isAdmin) {
                window.location.href = '/dashboard';
                return;
            }
            await Auth.syncSharedSession(sessionUser);
            window.currentUser = sessionUser;
            window.isAdmin = verification.isAdmin;
            resolved = true;
            resolve({ user: sessionUser, isAdmin: verification.isAdmin });
        });

        // Firebase can emit its initial null state before LOCAL persistence
        // has finished hydrating after a full-page navigation. Wait for that
        // initialization before treating null as a real signed-out state.
        Promise.resolve(authPersistenceReady)
            .then(() => typeof auth.authStateReady === 'function'
                ? auth.authStateReady()
                : null)
            .catch(error => console.warn('Firebase auth hydration failed:', error.message))
            .finally(listen);
    });
}
