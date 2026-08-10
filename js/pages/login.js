import { auth } from '../firebase.js';
import { Auth } from '../auth.js';

const DOM = {
    phoneStep: document.getElementById('auth-phone-step'),
    codeStep: document.getElementById('auth-code-step'),
    phoneInput: document.getElementById('auth-phone'),
    phoneDisplay: document.getElementById('auth-phone-display'),
    codeInput: document.getElementById('auth-code'),
    requestCode: document.getElementById('btn-auth-request-code'),
    verifyCode: document.getElementById('btn-auth-verify-code'),
    resendCode: document.getElementById('btn-auth-resend-code'),
    changePhone: document.getElementById('btn-auth-change-phone'),
    status: document.getElementById('auth-status')
};

let normalizedPhone = '';

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

function normalizePhone(phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return phone.trim().startsWith('+') ? `+${digits}` : `+${digits}`;
}

function formatPhone(phone) {
    if (phone.length === 12 && phone.startsWith('+1')) {
        return `(${phone.slice(2, 5)}) ${phone.slice(5, 8)}-${phone.slice(8)}`;
    }
    return phone;
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
    DOM.requestCode.disabled = normalizePhone(DOM.phoneInput.value).replace(/\D/g, '').length < 10;
    DOM.verifyCode.disabled = DOM.codeInput.value.trim().length !== 6;
}

async function requestCode() {
    normalizedPhone = normalizePhone(DOM.phoneInput.value);
    clearStatus();
    setBusy(DOM.requestCode, true, 'Sending…', 'Text me a code');

    try {
        await Auth.requestPhoneCode(normalizedPhone);
        DOM.phoneDisplay.textContent = formatPhone(normalizedPhone);
        DOM.phoneStep.classList.add('hidden');
        DOM.codeStep.classList.remove('hidden');
        DOM.codeInput.value = '';
        DOM.codeInput.focus();
    } catch (error) {
        setStatus(error.message);
    } finally {
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

function resetToPhoneStep() {
    clearStatus();
    DOM.codeStep.classList.add('hidden');
    DOM.phoneStep.classList.remove('hidden');
    DOM.phoneInput.focus();
    syncButtons();
}

function setupListeners() {
    DOM.phoneInput.addEventListener('input', syncButtons);
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
    DOM.verifyCode.addEventListener('click', verifyCode);
    DOM.resendCode.addEventListener('click', requestCode);
    DOM.changePhone.addEventListener('click', resetToPhoneStep);
}

function init() {
    document.body.classList.toggle('dark', localStorage.getItem('ts_theme') === 'dark');

    auth.onAuthStateChanged((user) => {
        if (user) window.location.href = '/dashboard';
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
