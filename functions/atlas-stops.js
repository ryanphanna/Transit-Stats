const { onRequest } = require('firebase-functions/v2/https');

const ATLAS_R2_BASE = process.env.ATLAS_R2_BASE || 'https://data.transitatlas.fyi';
const ALLOWED_SLUGS = new Set([
  'ttc',
  'octranspo',
  'go',
  'miway',
  'yrt',
  'brampton',
  'drt',
  'hamilton',
]);
const cache = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

exports.atlasStops = onRequest({
  cors: true,
  maxInstances: 4,
}, async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const slug = String(req.query.agency || '').trim().toLowerCase();
  if (!ALLOWED_SLUGS.has(slug)) {
    res.status(400).json({ error: 'Unsupported transit agency' });
    return;
  }

  const cached = cache.get(slug);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    res.set('Cache-Control', 'public, max-age=3600');
    res.status(200).json(cached.data);
    return;
  }

  try {
    const response = await fetch(`${ATLAS_R2_BASE}/atlas/${slug}-stops.json`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      res.status(502).json({ error: 'Atlas stop data unavailable' });
      return;
    }

    const data = await response.json();
    cache.set(slug, { fetchedAt: Date.now(), data });
    res.set('Cache-Control', 'public, max-age=3600');
    res.status(200).json(data);
  } catch (error) {
    console.error(`Atlas stop proxy failed for ${slug}:`, error.message);
    res.status(502).json({ error: 'Atlas stop data unavailable' });
  }
});
