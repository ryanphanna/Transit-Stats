import { auth } from '../firebase.js';
import { Auth } from '../auth.js';
import { UI } from '../ui-utils.js';

// Apply theme immediately
const _theme = localStorage.getItem('ts_theme') || 'light';
document.body.classList.toggle('dark', _theme === 'dark');

// Toast container (settings modal not needed on login)
const _toast = document.createElement('div');
_toast.id = 'toast-container';
_toast.className = 'toast-container';
document.body.appendChild(_toast);

const DOM = {
    emailInput: document.getElementById('auth-email'),
    passwordInput: document.getElementById('auth-password'),
    btnContinue: document.getElementById('btn-auth-continue'),
    btnSignIn: document.getElementById('btn-auth-signin'),
    btnMagic: document.getElementById('btn-auth-magic'),
    btnUsePassword: document.getElementById('btn-auth-use-password'),
    btnForgot: document.getElementById('btn-auth-forgot'),
    emailStep: document.getElementById('auth-email-step'),
    passwordStep: document.getElementById('auth-password-step'),
    passwordInputGroup: document.getElementById('auth-password-input-group'),
    loginOptions: document.getElementById('auth-login-options'),
    displayEmail: document.getElementById('auth-display-email'),
    statusMsg: document.getElementById('auth-status')
};

function showError(msg) {
    if (!DOM.statusMsg) return;
    DOM.statusMsg.textContent = msg;
    DOM.statusMsg.style.color = 'var(--danger)';
    DOM.statusMsg.classList.remove('hidden');
}

function showSuccess(msg) {
    if (!DOM.statusMsg) return;
    DOM.statusMsg.textContent = msg;
    DOM.statusMsg.style.color = 'var(--success)';
    DOM.statusMsg.classList.remove('hidden');
}

function setupListeners() {
    const syncBtn = () => {
        DOM.btnContinue.classList.toggle('btn-inactive', !DOM.emailInput.value.trim());
    };
    DOM.emailInput.addEventListener('input', syncBtn);
    DOM.emailInput.addEventListener('change', syncBtn);
    DOM.emailInput.addEventListener('blur', syncBtn);
    DOM.emailInput.addEventListener('animationstart', syncBtn);
    DOM.emailInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') DOM.btnContinue.click(); });

    DOM.btnContinue.addEventListener('click', () => {
        const email = DOM.emailInput.value.trim();
        if (!email) { DOM.emailInput.focus(); return; }
        DOM.displayEmail.textContent = email;
        DOM.emailStep.classList.add('hidden');
        DOM.passwordStep.classList.remove('hidden');
        DOM.statusMsg.classList.add('hidden');
    });

    DOM.btnMagic.addEventListener('click', async () => {
        const email = DOM.emailInput.value.trim();
        try {
            DOM.btnMagic.disabled = true;
            DOM.btnMagic.textContent = 'Sending...';
            await Auth.sendMagicLink(email);
            showSuccess('Magic link sent! Check your email.');
        } catch (err) {
            showError(err.message);
        } finally {
            DOM.btnMagic.disabled = false;
            DOM.btnMagic.textContent = 'Send Magic Link';
        }
    });

    DOM.btnUsePassword.addEventListener('click', () => {
        DOM.loginOptions.classList.add('hidden');
        DOM.passwordInputGroup.classList.remove('hidden');
        DOM.passwordInput.focus();
    });

    DOM.btnSignIn.addEventListener('click', async () => {
        const email = DOM.emailInput.value.trim();
        const pwd = DOM.passwordInput.value;
        if (!email || !pwd) return;
        try {
            DOM.btnSignIn.disabled = true;
            DOM.btnSignIn.textContent = 'Signing in...';
            DOM.statusMsg.classList.add('hidden');
            await Auth.signInWithPassword(email, pwd);
        } catch (err) {
            showError(Auth.getErrorMessage(err.code || err.message));
        } finally {
            DOM.btnSignIn.disabled = false;
            DOM.btnSignIn.textContent = 'Sign In';
        }
    });

    DOM.passwordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') DOM.btnSignIn.click(); });

    DOM.btnForgot.addEventListener('click', async () => {
        const email = DOM.emailInput.value.trim();
        try {
            DOM.btnForgot.disabled = true;
            DOM.btnForgot.textContent = 'Sending...';
            await Auth.sendPasswordReset(email);
            showSuccess('Reset email sent!');
        } catch (err) {
            showError(err.message);
        } finally {
            DOM.btnForgot.disabled = false;
            DOM.btnForgot.textContent = 'Forgot Password?';
        }
    });
}

async function init() {
    // Complete magic link sign-in if applicable
    await Auth.completeMagicLinkSignIn();

    // If already authed, go straight to dashboard
    auth.onAuthStateChanged((user) => {
        if (user) window.location.href = '/dashboard';
    });

    setupListeners();

    if (window.lucide) lucide.createIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
