import { auth, db } from './firebase.js';

/**
 * TransitStats V2 Authentication Module
 */
export const Auth = {
    // --- Rate Limiting ---
    getRateLimit() {
        try {
            return JSON.parse(localStorage.getItem('auth_rl') || '{}');
        } catch { return {}; }
    },

    isRateLimited() {
        const { attempts, lockedUntil } = this.getRateLimit();
        if (lockedUntil && Date.now() < lockedUntil) return true;
        if (lockedUntil && Date.now() >= lockedUntil) {
            localStorage.removeItem('auth_rl');
        }
        return false;
    },

    recordFailure() {
        const data = this.getRateLimit();
        const attempts = (data.attempts || 0) + 1;
        const lockedUntil = attempts >= 5 ? Date.now() + 15 * 60 * 1000 : null;
        localStorage.setItem('auth_rl', JSON.stringify({ attempts, lockedUntil }));
        return attempts;
    },

    clearRateLimit() {
        localStorage.removeItem('auth_rl');
    },

    // --- Whitelist Check ---
    async checkWhitelist(email) {
        try {
            const doc = await db.collection('allowedUsers').doc(email.toLowerCase()).get();
            if (!doc.exists) return { allowed: false, error: 'Access denied. This app is invite-only.' };
            return { allowed: true, isAdmin: doc.data().isAdmin === true };
        } catch (err) {
            console.error('Whitelist check failed, retrying:', err);
            // Retry once before giving up — guards against transient network errors
            // on page load signing out valid users.
            try {
                const doc = await db.collection('allowedUsers').doc(email.toLowerCase()).get();
                if (!doc.exists) return { allowed: false, error: 'Access denied. This app is invite-only.' };
                return { allowed: true, isAdmin: doc.data().isAdmin === true };
            } catch (retryErr) {
                console.error('Whitelist check failed after retry:', retryErr);
                return { allowed: false, error: 'Verification failed. Try again.' };
            }
        }
    },

    // --- Core Methods ---
    async signInWithPassword(email, password) {
        if (this.isRateLimited()) throw new Error('Too many attempts. Try again in 15m.');
        
        try {
            // First check whitelist before even trying to auth? 
            // Better to auth first then check, but for invite-only we can pre-check or post-check.
            // Legacy did it post-auth in onAuthStateChanged. Let's keep that for consistency but
            // wrap the login call.
            const result = await auth.signInWithEmailAndPassword(email.toLowerCase(), password);
            this.clearRateLimit();
            return result;
        } catch (err) {
            this.recordFailure();
            throw err;
        }
    },

    async sendMagicLink(email) {
        const settings = {
            url: window.location.origin + '/',
            handleCodeInApp: true
        };
        await auth.sendSignInLinkToEmail(email.toLowerCase(), settings);
        localStorage.setItem('emailForSignIn', email);
    },

    async completeMagicLinkSignIn() {
        if (auth.isSignInWithEmailLink(window.location.href)) {
            let email = localStorage.getItem('emailForSignIn');
            if (!email) email = window.prompt('Please confirm your email:');
            
            if (email) {
                await auth.signInWithEmailLink(email, window.location.href);
                localStorage.removeItem('emailForSignIn');
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        }
    },

    async sendPasswordReset(email) {
        if (!email) throw new Error('Email required');
        await auth.sendPasswordResetEmail(email.toLowerCase());
    },

    signOut() {
        return auth.signOut();
    },

    getErrorMessage(code) {
        switch (code) {
            case 'auth/wrong-password':
            case 'auth/user-not-found': return 'Incorrect email or password.';
            case 'auth/invalid-email': return 'Invalid email address.';
            case 'auth/user-disabled': return 'Account disabled.';
            default: return 'Authentication failed. Please try again.';
        }
    }
};
