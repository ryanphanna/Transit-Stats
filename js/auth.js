
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

                        // Explicitly check for an email-based document if direct permission on collection is strict
                        // Fallback to query only if we have proper permissions
                        const querySnapshot = await allowedUsersRef
                            .where('email', '==', user.email.toLowerCase())
                            .get();

                        if (!querySnapshot.empty) {
                            const userData = querySnapshot.docs[0].data();
                            isAdmin = userData && userData.isAdmin === true;
                        } else {
                            // Secondary check: search for doc ID if it matches email
                            // This works if rules allow get() on specific doc but not list() on collection
                            const docRef = allowedUsersRef.doc(user.email.toLowerCase());
                            const docSnap = await docRef.get();
                            if (docSnap.exists) {
                                isAdmin = docSnap.data().isAdmin === true;
                            } else {
                                await auth.signOut();
                                UI.showNotification('Access denied. This app is invite-only.', 'error');
                                return;
                            }
                        }
                    } catch (err) {
                        console.warn('Firestore whitelist check failed (likely permissions):', err);
                        // If it fails, we still let them in if they are authenticated, 
                        // but they won't have admin rights.
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
            emailInput.addEventListener('input', () => {
                if (continueBtn) continueBtn.disabled = !emailInput.value.trim().includes('@');
            });
            emailInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && continueBtn && !continueBtn.disabled) continueBtn.click();
            });
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
            case 'auth/wrong-password': return 'Incorrect password.';
            case 'auth/user-not-found': return 'No account found.';
            default: return 'An error occurred. Please try again.';
        }
    }
};

// Expose to window for legacy compatibility
window.Auth = Auth;
window.signOut = Auth.signOut.bind(Auth);
