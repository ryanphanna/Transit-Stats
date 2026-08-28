import { auth } from '../firebase.js';
import { Auth } from '../auth.js';
import { normalizePhone } from '../phone-fields.js';

const DOM = {
    phoneStep: document.getElementById('auth-phone-step'),
    emailStep: document.getElementById('auth-email-step'),
    codeStep: document.getElementById('auth-code-step'),
    stepFrame: document.querySelector('.auth-step-frame'),
    heading: document.getElementById('auth-heading'),
    phoneInput: document.getElementById('auth-phone'),
    phoneWrap: document.getElementById('auth-phone-wrap'),
    codeInput: document.getElementById('auth-code'),
    codeWrap: document.querySelector('.auth-code-wrap'),
    requestCode: document.getElementById('btn-auth-request-code'),
    emailMode: document.getElementById('btn-auth-email-mode'),
    phoneMode: document.getElementById('btn-auth-phone-mode'),
    emailInput: document.getElementById('auth-email'),
    passwordInput: document.getElementById('auth-password'),
    emailLogin: document.getElementById('btn-auth-email-login'),
    resetPassword: document.getElementById('btn-auth-reset-password'),
    verifyCode: document.getElementById('btn-auth-verify-code'),
    resendCode: document.getElementById('btn-auth-resend-code'),
    status: document.getElementById('auth-status')
};

let normalizedPhone = '';
let requestBusy = false;
let adminSession = false;
let resendSeconds = 0;
let resendTimer = null;
let phoneCooldownTimer = null;
const RESEND_COOLDOWN_SECONDS = 60;

const TRANSIT_THEMES = [
    { match: ['toronto'], label: 'Toronto transit colours', featuredLine: 'Line 2 · Bloor–Danforth', colors: ['#f8c84b', '#009b4e', '#8b4a9c', '#e87511'] },
    { match: ['mississauga'], label: 'MiWay colours', featuredLine: 'MiWay · Route 10', colors: ['#f58220', '#0072bc', '#00a99d', '#f8c84b'] },
    { match: ['vaughan', 'markham', 'richmond hill', 'york region'], label: 'YRT colours', featuredLine: 'Viva Blue', colors: ['#0072bc', '#f8c84b', '#ee6a52', '#3bb58a'] },
    { match: ['montreal'], label: 'Montréal transit colours', featuredLine: 'Orange line', colors: ['#0072bc', '#ee6a52', '#f8c84b', '#3bb58a'] },
    { match: ['vancouver', 'burnaby', 'surrey'], label: 'TransLink colours', featuredLine: 'Expo Line', colors: ['#0072bc', '#f8c84b', '#ee6a52', '#3bb58a'] },
    { match: ['new york', 'brooklyn', 'queens', 'bronx'], label: 'MTA colours', featuredLine: '7 · Flushing–Main St', colors: ['#ee6a52', '#4a6cf7', '#3bb58a', '#f8c84b'] },
    { match: ['chicago'], label: 'CTA colours', featuredLine: 'Red Line', colors: ['#ee6a52', '#4a6cf7', '#8b4a9c', '#3bb58a'] },
    { match: ['san francisco'], label: 'Muni colours', featuredLine: 'Muni Metro', colors: ['#ee6a52', '#4a6cf7', '#f8c84b', '#3bb58a'] },
    { match: ['london'], label: 'TfL colours', featuredLine: 'Central line', colors: ['#ee6a52', '#4a6cf7', '#f8c84b', '#3bb58a'] }
];

async function applyLocalTransitTheme() {
    const view = document.querySelector('.auth-view');
    const featuredLine = document.getElementById('auth-featured-line');
    if (!view) return;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2500);
        const response = await fetch('https://ipapi.co/json/', { signal: controller.signal });
        clearTimeout(timeout);
        if (!response.ok) throw new Error('Location lookup unavailable');

        const location = await response.json();
        const searchText = `${location.city || ''} ${location.region || ''}`.toLowerCase();
        const theme = TRANSIT_THEMES.find((candidate) => candidate.match.some((name) => searchText.includes(name)));
        if (!theme) return;

        ['gold', 'blue', 'red', 'green'].forEach((name, index) => {
            view.style.setProperty(`--auth-route-${name}`, theme.colors[index]);
        });
        if (featuredLine) featuredLine.textContent = theme.featuredLine;
    } catch { /* Default colours remain in place. */ }
}

function setStatus(message, type = 'error') {
    DOM.status.textContent = message;
    DOM.status.className = `status-msg auth-status ${type}`;
    DOM.status.classList.remove('hidden');
}

function clearStatus() {
    DOM.status.textContent = '';
    DOM.status.className = 'status-msg auth-status hidden';
}

function setBusy(button, busy, busyText, idleText) {
    button.disabled = busy;
    button.innerHTML = busy ? busyText : `${idleText} <i data-lucide="arrow-right" aria-hidden="true"></i>`;
    if (window.lucide) lucide.createIcons();
}

function syncButtons() {
    if (!requestBusy) updateRequestButton();
    DOM.verifyCode.disabled = DOM.codeInput.value.trim().length !== 6;
    DOM.codeWrap?.classList.toggle('ready', !DOM.verifyCode.disabled);
}

function phoneCooldownKey(phone) {
    let hash = 2166136261;
    for (const character of phone) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return `auth_otp_cooldown_${(hash >>> 0).toString(36)}`;
}

function getPhoneCooldownSeconds(phone) {
    if (adminSession) return 0;
    try {
        const until = Number(localStorage.getItem(phoneCooldownKey(phone)) || 0);
        const seconds = Math.ceil((until - Date.now()) / 1000);
        if (seconds > 0) return seconds;
        if (until) localStorage.removeItem(phoneCooldownKey(phone));
    } catch { /* Continue without persisted cooldown if storage is unavailable. */ }
    return 0;
}

function persistPhoneCooldown(phone) {
    try {
        localStorage.setItem(phoneCooldownKey(phone), String(Date.now() + RESEND_COOLDOWN_SECONDS * 1000));
    } catch { /* The server still enforces the cooldown. */ }
}

function clearPhoneCooldown(phone) {
    try {
        localStorage.removeItem(phoneCooldownKey(phone));
    } catch { /* Ignore unavailable storage. */ }
}

function updateRequestButton() {
    const phone = normalizePhone(DOM.phoneInput.value);
    const cooldownSeconds = hasValidPhone() ? getPhoneCooldownSeconds(phone) : 0;
    if (cooldownSeconds > 0) {
        DOM.requestCode.disabled = true;
        DOM.requestCode.textContent = `Try again in ${cooldownSeconds}s`;
        if (!phoneCooldownTimer) {
            phoneCooldownTimer = window.setInterval(() => {
                updateRequestButton();
                if (!getPhoneCooldownSeconds(normalizePhone(DOM.phoneInput.value))) {
                    window.clearInterval(phoneCooldownTimer);
                    phoneCooldownTimer = null;
                }
            }, 1000);
        }
        return;
    }
    DOM.requestCode.disabled = false;
    DOM.requestCode.innerHTML = 'Text me a code <i data-lucide="arrow-right" aria-hidden="true"></i>';
    if (window.lucide) lucide.createIcons();
}

function updateResendButton() {
    const coolingDown = resendSeconds > 0;
    DOM.resendCode.disabled = coolingDown;
    DOM.resendCode.textContent = coolingDown ? `Resend (${resendSeconds}s)` : 'Resend code';
}

function startResendCooldown(skipCooldown = false) {
    window.clearInterval(resendTimer);
    resendSeconds = skipCooldown ? 0 : RESEND_COOLDOWN_SECONDS;
    updateResendButton();
    if (skipCooldown) return;
    resendTimer = window.setInterval(() => {
        resendSeconds -= 1;
        updateResendButton();
        if (resendSeconds <= 0) window.clearInterval(resendTimer);
    }, 1000);
}

function wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function showEmailStep() {
    DOM.phoneStep.classList.add('hidden');
    DOM.codeStep.classList.add('hidden');
    DOM.emailStep.classList.remove('hidden');
    DOM.heading.textContent = 'Log in with email';
    DOM.emailInput.focus();
}

function showPhoneStep() {
    DOM.emailStep.classList.add('hidden');
    DOM.codeStep.classList.add('hidden');
    DOM.phoneStep.classList.remove('hidden');
    DOM.heading.textContent = 'Get started or log in';
    DOM.phoneInput.focus();
}

async function signInWithEmail() {
    const email = DOM.emailInput.value.trim();
    const password = DOM.passwordInput.value;
    if (!email || !password) {
        setStatus('Enter your email and password.');
        return;
    }

    clearStatus();
    setBusy(DOM.emailLogin, true, 'Opening…', 'Log in with email');
    try {
        await Auth.signInWithPassword(email, password);
        await Auth.syncSharedSession(auth.currentUser);
    } catch (error) {
        setStatus(Auth.getErrorMessage(error.code));
    } finally {
        setBusy(DOM.emailLogin, false, 'Opening…', 'Log in with email');
    }
}

async function sendPasswordReset() {
    const email = DOM.emailInput.value.trim();
    if (!email) {
        setStatus('Enter your email address first.');
        DOM.emailInput.focus();
        return;
    }

    clearStatus();
    DOM.resetPassword.disabled = true;
    try {
        await Auth.sendPasswordReset(email);
        setStatus('Password reset email sent.', 'success');
    } catch (error) {
        setStatus(Auth.getErrorMessage(error.code));
    } finally {
        DOM.resetPassword.disabled = false;
    }
}

async function transitionAuthStep(fromStep, toStep) {
    const frame = DOM.stepFrame;
    const startHeight = frame.offsetHeight;
    frame.style.height = `${startHeight}px`;
    fromStep.classList.add('is-exiting');
    await wait(140);
    fromStep.classList.add('hidden');
    fromStep.classList.remove('is-exiting');
    toStep.classList.remove('hidden');
    toStep.classList.add('is-entering');
    const endHeight = frame.scrollHeight;
    requestAnimationFrame(() => {
        frame.style.height = `${endHeight}px`;
        toStep.classList.remove('is-entering');
    });
    await wait(230);
    frame.style.height = '';
}

function hasValidPhone() {
    return normalizePhone(DOM.phoneInput.value).replace(/\D/g, '').length >= 10;
}

async function requestCode() {
    if (requestBusy) return;
    if (!hasValidPhone()) {
        clearStatus();
        DOM.phoneWrap.classList.remove('auth-input-shake');
        void DOM.phoneWrap.offsetWidth;
        DOM.phoneWrap.classList.add('auth-input-shake');
        DOM.phoneInput.focus();
        return;
    }

    normalizedPhone = normalizePhone(DOM.phoneInput.value);
    const existingCooldown = getPhoneCooldownSeconds(normalizedPhone);
    if (!adminSession && existingCooldown > 0) {
        setStatus(`Please wait ${existingCooldown} seconds before requesting another code.`);
        updateRequestButton();
        return;
    }
    clearStatus();
    requestBusy = true;
    setBusy(DOM.requestCode, true, 'Sending…', 'Text me a code');

    try {
        const result = await Auth.requestPhoneCode(normalizedPhone);
        adminSession = result.isAdmin === true;
        if (adminSession) clearPhoneCooldown(normalizedPhone);
        else persistPhoneCooldown(normalizedPhone);
        DOM.requestCode.innerHTML = 'Code sent <i data-lucide="check" aria-hidden="true"></i>';
        if (window.lucide) lucide.createIcons();
        await wait(350);
        DOM.codeInput.value = '';
        DOM.heading.textContent = 'Enter the 6-digit code';
        await transitionAuthStep(DOM.phoneStep, DOM.codeStep);
        DOM.codeInput.focus();
        startResendCooldown(adminSession);
    } catch (error) {
        setStatus(error.message);
    } finally {
        requestBusy = false;
        setBusy(DOM.requestCode, false, 'Sending…', 'Text me a code');
        syncButtons();
    }
}

async function verifyCode() {
    clearStatus();
    setBusy(DOM.verifyCode, true, 'Opening…', 'Open TransitStats');

    try {
        await Auth.verifyPhoneCode(normalizedPhone, DOM.codeInput.value.trim());
        setStatus('Verified. You’re all set.', 'success');
    } catch (error) {
        setStatus(error.message);
        DOM.codeInput.select();
    } finally {
        setBusy(DOM.verifyCode, false, 'Opening…', 'Open TransitStats');
        syncButtons();
    }
}

function setupListeners() {
    DOM.phoneInput.addEventListener('input', () => {
        DOM.phoneWrap.classList.remove('auth-input-shake');
        syncButtons();
    });
    DOM.phoneInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !DOM.requestCode.disabled) requestCode();
    });
    DOM.codeInput.addEventListener('input', () => {
        DOM.codeInput.value = DOM.codeInput.value.replace(/\D/g, '').slice(0, 6);
        syncButtons();
    });
    DOM.codeInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !DOM.verifyCode.disabled) verifyCode();
    });
    DOM.requestCode.addEventListener('click', requestCode);
    DOM.emailMode.addEventListener('click', showEmailStep);
    DOM.phoneMode.addEventListener('click', showPhoneStep);
    DOM.emailLogin.addEventListener('click', signInWithEmail);
    DOM.resetPassword.addEventListener('click', sendPasswordReset);
    DOM.passwordInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') signInWithEmail();
    });
    DOM.verifyCode.addEventListener('click', verifyCode);
    DOM.resendCode.addEventListener('click', requestCode);
}

function init() {
    window.TransitTheme?.apply(window.TransitTheme.getPreference());

    let restoring = false;
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            window.location.href = '/dashboard';
            return;
        }
        if (restoring) return;
        restoring = true;
        const restoredUser = await Auth.restoreSharedSession();
        if (restoredUser) {
            window.location.href = '/dashboard';
        }
    });

    setupListeners();
    syncButtons();
    applyLocalTransitTheme();
    if (window.lucide) lucide.createIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
