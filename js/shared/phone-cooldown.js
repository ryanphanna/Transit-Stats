const RESEND_COOLDOWN_SECONDS = 60;

function cooldownKey(phone) {
    let hash = 2166136261;
    for (const character of phone) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return `auth_otp_cooldown_${(hash >>> 0).toString(36)}`;
}

export function getPhoneCooldownSeconds(phone) {
    try {
        const until = Number(localStorage.getItem(cooldownKey(phone)) || 0);
        const seconds = Math.ceil((until - Date.now()) / 1000);
        if (seconds > 0) return seconds;
        if (until) localStorage.removeItem(cooldownKey(phone));
    } catch { /* Continue without persisted cooldown if storage is unavailable. */ }
    return 0;
}

export function persistPhoneCooldown(phone) {
    try {
        localStorage.setItem(cooldownKey(phone), String(Date.now() + RESEND_COOLDOWN_SECONDS * 1000));
    } catch { /* The server still enforces the cooldown. */ }
}

export function clearPhoneCooldown(phone) {
    try {
        localStorage.removeItem(cooldownKey(phone));
    } catch { /* Ignore unavailable storage. */ }
}

export { RESEND_COOLDOWN_SECONDS };
