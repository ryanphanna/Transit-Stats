import { auth, authPersistenceReady } from '../firebase.js';
import { Auth } from '../auth.js';

const AUTH_RESTORE_GRACE_MS = 3000;
const AUTH_SHARED_SESSION_DELAY_MS = 750;
const AUTH_RESTORE_POLL_MS = 250;

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

async function waitForRestoredUser(initialUser) {
    if (initialUser) return initialUser;

    const startedAt = Date.now();
    const deadline = startedAt + AUTH_RESTORE_GRACE_MS;
    let sharedSessionAttempted = false;

    while (Date.now() < deadline) {
        if (auth.currentUser) return auth.currentUser;

        // The shared cookie is a fallback for pages opened on another
        // TransitStats surface. Try it once while Firebase finishes restoring
        // its own LOCAL session, rather than repeatedly hitting the endpoint.
        if (!sharedSessionAttempted && Date.now() - startedAt >= AUTH_SHARED_SESSION_DELAY_MS) {
            sharedSessionAttempted = true;
            const sharedUser = await Auth.restoreSharedSession();
            if (sharedUser) return sharedUser;
        }

        await wait(AUTH_RESTORE_POLL_MS);
    }

    return auth.currentUser || null;
}

function setAuthRestoring(isRestoring) {
    document.body?.toggleAttribute('data-auth-restoring', isRestoring);
    if (!isRestoring) document.body?.classList.remove('dashboard-auth-pending');
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
            if (!user) setAuthRestoring(true);
            const sessionUser = await waitForRestoredUser(user);
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
            setAuthRestoring(false);
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
