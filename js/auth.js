
import { auth, db } from './firebase.js';
import { UI } from './ui-utils.js';

/**
 * TransitStats Authentication Module
 * Handles Firebase Auth, whitelist checks, and all login UI logic
 */
export const Auth = {
    init: function () {
        this.setupEventListeners();
        this.checkMagicLink();

        auth.onAuthStateChanged(async (user) => {
            window.currentUser = user;
            try {
                if (user) {
                    let isAdmin = false;
                    try {
                        const allowedUsersRef = db.collection('allowedUsers');
                        const docRef = allowedUsersRef.doc(user.email.toLowerCase());
                        const docSnap = await docRef.get();

                        if (docSnap.exists) {
                            isAdmin = docSnap.data().isAdmin === true;
                        } else {
                            await auth.signOut();
                            UI.showNotification('Access denied. This app is invite-only.', 'error');
                            return;
                        }
                    } catch (err) {
                        console.error('Whitelist check failed:', err);
                        await auth.signOut();
                        UI.showNotification('Access verification failed. Please try again.', 'error');
                        return;
                    }

                    if (document.getElementById('adminBtn')) {
                        document.getElementById('adminBtn').style.display = isAdmin ? 'block' : 'none';
                    }

                    console.log('✅ User authenticated' + (isAdmin ? ' (Admin)' : ''));
                    this.showApp();
                } else {
                    console.log('❌ No user authenticated');
                    this.showAuth();
                }
            } catch (error) {
                console.error('Error in auth state change:', error);
                this.showAuth();
            }
        });
    },

    setupEventListeners: function () {
        const continueBtn = document.getElementById('continueBtn');
        const emailInput = document.getElementById('emailInput');
        const passwordBtn = document.getElementById('passwordBtn');
        const signInBtn = document.getElementById('signInBtn');
        const magicLinkBtn = document.getElementById('magicLinkBtn');
        const passwordInput = document.getElementById('passwordInput');

        if (continueBtn) {
            continueBtn.addEventListener('click', () => {
                const email = emailInput.value.trim();
                if (!email) {
                    UI.showNotification('Please enter your email', 'error');
                    return;
                }
                document.getElementById('emailDisplay').textContent = email;
                document.getElementById('emailStep').style.display = 'none';
                document.getElementById('authMethodStep').style.display = 'block';
            });
        }

        if (emailInput) {
            const validate = () => {
                const val = emailInput.value.trim();
                if (continueBtn) continueBtn.disabled = !val.includes('@');
            };

            emailInput.addEventListener('input', validate);
            emailInput.addEventListener('change', validate); // Catch autofill
            emailInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && continueBtn && !continueBtn.disabled) continueBtn.click();
            });

            // Initial check if pre-filled
            setTimeout(validate, 100);
            validate();
        }

        if (passwordBtn) {
            passwordBtn.addEventListener('click', () => {
                document.getElementById('passwordGroup').style.display = 'block';
                document.getElementById('authButtons').style.display = 'none';
                document.getElementById('signInBtn').style.display = 'block';
                if (passwordInput) passwordInput.focus();
            });
        }

        if (signInBtn) {
            signInBtn.addEventListener('click', () => this.signInWithPassword());
        }

        if (magicLinkBtn) {
            magicLinkBtn.addEventListener('click', () => this.sendMagicLink());
        }

        if (passwordInput) {
            passwordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && signInBtn) signInBtn.click();
            });
        }
    },

    signInWithPassword: async function () {
        const emailInput = document.getElementById('emailInput');
        const passwordInput = document.getElementById('passwordInput');
        const signInBtn = document.getElementById('signInBtn');

        if (!emailInput || !passwordInput || !signInBtn) return;

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!password) {
            this.showError('Please enter your password');
            return;
        }

        signInBtn.disabled = true;
        signInBtn.textContent = 'Signing in...';
        this.hideError();

        try {
            await auth.signInWithEmailAndPassword(email, password);
        } catch (error) {
            console.error('Sign in error:', error);
            this.showError(this.getErrorMessage(error.code));
            signInBtn.disabled = false;
            signInBtn.textContent = 'Sign In';
        }
    },

    sendMagicLink: async function () {
        const emailInput = document.getElementById('emailInput');
        if (!emailInput) return;
        const email = emailInput.value.trim();

        try {
            const actionCodeSettings = {
                url: window.location.origin + window.location.pathname,
                handleCodeInApp: true
            };

            await auth.sendSignInLinkToEmail(email, actionCodeSettings);
            window.localStorage.setItem('emailForSignIn', email);
            this.showSuccess('Magic link sent! Check your email.');
        } catch (error) {
            this.showError('Error sending magic link: ' + error.message);
        }
    },

    checkMagicLink: function () {
        if (auth.isSignInWithEmailLink(window.location.href)) {
            let email = window.localStorage.getItem('emailForSignIn');
            if (!email) email = window.prompt('Please provide your email for confirmation');

            if (email) {
                auth.signInWithEmailLink(email, window.location.href)
                    .then(() => {
                        window.localStorage.removeItem('emailForSignIn');
                        window.history.replaceState({}, document.title, window.location.pathname);
                    })
                    .catch(error => {
                        UI.showNotification('Error signing in: ' + error.message, 'error');
                        this.showAuth();
                    });
            }
        }
    },

    showAuth: function () {
        document.body.classList.remove('user-logged-in');
        document.getElementById('authSection').style.display = 'block';
        document.getElementById('appContent').style.display = 'none';
        document.getElementById('userInfo').style.display = 'none';

        // Initialize public map for login screen
        if (window.MapEngine) {
            window.MapEngine.init(true);
        }
    },

    showApp: function () {
        document.body.classList.add('user-logged-in');
        document.getElementById('authSection').style.display = 'none';
        document.getElementById('appContent').style.display = 'none'; // Will trigger fade in
        document.getElementById('userInfo').style.display = 'flex';

        if (window.Profile) window.Profile.load();
        if (typeof window.initializeApp === 'function') window.initializeApp();
        UI.fadeInSection(document.getElementById('appContent'));
    },

    signOut: function () {
        return auth.signOut();
    },

    showError: function (message) {
        const status = document.getElementById('authStatus');
        if (status) {
            status.textContent = message;
            status.style.display = 'block';
            status.className = 'auth-status error';
        }
    },

    hideError: function () {
        const status = document.getElementById('authStatus');
        if (status) status.style.display = 'none';
    },

    showSuccess: function (message) {
        const status = document.getElementById('authStatus');
        if (status) {
            status.textContent = message;
            status.style.display = 'block';
            status.className = 'auth-status success';
        }
    },

    getErrorMessage: function (code) {
        switch (code) {
            case 'auth/wrong-password':
            case 'auth/user-not-found': return 'Incorrect email or password.';
            default: return 'An error occurred. Please try again.';
        }
    },

    goBackToEmail: function () {
        document.getElementById('emailStep').style.display = 'block';
        document.getElementById('authMethodStep').style.display = 'none';
        document.getElementById('passwordGroup').style.display = 'none';
        document.getElementById('authButtons').style.display = 'flex';
        document.getElementById('signInBtn').style.display = 'none';
        this.hideError();
    },

    sendPasswordReset: async function () {
        const emailInput = document.getElementById('emailInput');
        if (!emailInput) return;
        const email = emailInput.value.trim();
        if (!email) {
            UI.showNotification('Email is required', 'error');
            return;
        }

        try {
            await auth.sendPasswordResetEmail(email);
            this.showSuccess('Password reset email sent!');
        } catch (error) {
            this.showError('Error: ' + error.message);
        }
    }
};

// Expose to window for legacy compatibility
window.Auth = Auth;
window.signOut = Auth.signOut.bind(Auth);
window.goBackToEmail = Auth.goBackToEmail.bind(Auth);
window.sendPasswordReset = Auth.sendPasswordReset.bind(Auth);
