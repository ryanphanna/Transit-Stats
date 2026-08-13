const { onRequest } = require('firebase-functions/v2/https');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

const SESSION_COOKIE = 'transitstats_session';
const SESSION_MAX_AGE_SECONDS = 5 * 24 * 60 * 60;
const ALLOWED_HOSTS = new Set([
  'transitstats.fyi',
  'www.transitstats.fyi',
  'beta.transitstats.fyi',
  'admin.transitstats.fyi',
  'localhost',
  '127.0.0.1',
]);

function cookieHeader(value, maxAge) {
  return [
    `${SESSION_COOKIE}=${value}`,
    'Domain=.transitstats.fyi',
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ].join('; ');
}

function getHost(req) {
  return String(req.hostname || req.get('host') || '').split(':')[0].toLowerCase();
}

function getCookie(req) {
  const header = req.get('cookie') || '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : '';
}

async function isAllowedUser(uid, email) {
  const db = getFirestore();
  if (email) {
    const allowed = await db.collection('allowedUsers').doc(email.toLowerCase()).get();
    return allowed.exists;
  }

  const phone = await db.collection('phoneNumbers').where('userId', '==', uid).limit(1).get();
  return !phone.empty;
}

async function handleAuthSession(req, res) {
  if (!ALLOWED_HOSTS.has(getHost(req))) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  res.set('Cache-Control', 'no-store');

  if (req.method === 'DELETE') {
    res.set('Set-Cookie', cookieHeader('', 0));
    res.status(204).end();
    return;
  }

  try {
    const adminAuth = getAuth();
    if (req.method === 'POST') {
      const authHeader = req.get('authorization') || '';
      if (!authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing authentication token' });
        return;
      }

      const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
      if (!(await isAllowedUser(decoded.uid, decoded.email || ''))) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const sessionCookie = await adminAuth.createSessionCookie(authHeader.slice(7), {
        expiresIn: SESSION_MAX_AGE_SECONDS * 1000,
      });
      res.set('Set-Cookie', cookieHeader(sessionCookie, SESSION_MAX_AGE_SECONDS));
      res.status(204).end();
      return;
    }

    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const sessionCookie = getCookie(req);
    if (!sessionCookie) {
      res.status(401).json({ error: 'No shared session' });
      return;
    }

    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    if (!(await isAllowedUser(decoded.uid, decoded.email || ''))) {
      res.set('Set-Cookie', cookieHeader('', 0));
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const customToken = await adminAuth.createCustomToken(decoded.uid);
    res.status(200).json({ token: customToken });
  } catch (error) {
    if (req.method === 'GET') res.set('Set-Cookie', cookieHeader('', 0));
    res.status(401).json({ error: 'Shared session is invalid' });
  }
}

exports.handleAuthSession = handleAuthSession;
exports.authSession = onRequest({ concurrency: 80, maxInstances: 10 }, handleAuthSession);
