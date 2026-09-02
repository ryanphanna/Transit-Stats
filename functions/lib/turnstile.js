const { defineSecret } = require('firebase-functions/params');

const turnstileSecretKey = defineSecret('TURNSTILE_SECRET_KEY');

async function verifyTurnstile(token, remoteIp) {
  if (!token) return false;
  const body = new URLSearchParams({ secret: turnstileSecretKey.value(), response: token });
  if (remoteIp) body.set('remoteip', remoteIp);

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
  });
  const data = await response.json().catch(() => ({ success: false }));
  return data.success === true;
}

module.exports = { verifyTurnstile, turnstileSecretKey };
