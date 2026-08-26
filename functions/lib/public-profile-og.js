const { onRequest } = require('firebase-functions/v2/https');
const sharp = require('sharp');
const { getPublicProfilePayload } = require('./public-profile');

const WIDTH = 1200;
const HEIGHT = 630;

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function projectBands(bands) {
  const points = bands.flatMap(band => band.line || []);
  if (points.length === 0) return { paths: [], maxCount: 0 };
  const lats = points.map(point => Number(point[0]));
  const lngs = points.map(point => Number(point[1]));
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const map = { left: 50, top: 55, width: 1100, height: 520 };
  const latSpan = Math.max(0.0001, maxLat - minLat);
  const lngSpan = Math.max(0.0001, maxLng - minLng);
  const scale = Math.min(map.width / lngSpan, map.height / latSpan);
  const usedWidth = lngSpan * scale;
  const usedHeight = latSpan * scale;
  const left = map.left + (map.width - usedWidth) / 2;
  const top = map.top + (map.height - usedHeight) / 2;
  const maxCount = Math.max(...bands.map(band => Number(band.count) || 0), 1);

  const paths = bands.map(band => {
    const pointsString = (band.line || []).map(([lat, lng]) => {
      const x = left + (Number(lng) - minLng) * scale;
      const y = top + (maxLat - Number(lat)) * scale;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' L ');
    const intensity = Math.max(0, Math.min(1, Number(band.count) / maxCount));
    const lightness = Math.round(78 - intensity * 48);
    return `<path d="M ${pointsString}" fill="none" stroke="hsl(252 75% ${lightness}%)" stroke-width="${(2 + intensity * 7).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" opacity="${(0.35 + intensity * 0.6).toFixed(2)}"/>`;
  });
  return { paths, maxCount };
}

function projectPoints(points) {
  const valid = points.filter(point => Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)));
  if (valid.length === 0) return [];
  const lats = valid.map(point => Number(point.lat));
  const lngs = valid.map(point => Number(point.lng));
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const map = { left: 50, top: 55, width: 1100, height: 520 };
  const latSpan = Math.max(0.0001, maxLat - minLat);
  const lngSpan = Math.max(0.0001, maxLng - minLng);
  const scale = Math.min(map.width / lngSpan, map.height / latSpan);
  const usedWidth = lngSpan * scale;
  const usedHeight = latSpan * scale;
  const left = map.left + (map.width - usedWidth) / 2;
  const top = map.top + (map.height - usedHeight) / 2;
  return valid.map(point => {
    const x = left + (Number(point.lng) - minLng) * scale;
    const y = top + (maxLat - Number(point.lat)) * scale;
    const radius = Math.min(13, 5 + Math.sqrt(Number(point.usage) || 1));
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius.toFixed(1)}" fill="#39d39f" fill-opacity="0.72" stroke="#ffffff" stroke-opacity="0.35" stroke-width="1.5"/>`;
  });
}

function buildSvg(data) {
  const { paths } = projectBands(data.heatmapBands || []);
  const points = projectPoints(data.points || []);
  const mapContent = paths.length
    ? paths.join('')
    : points.length
      ? points.join('')
    : '<text x="455" y="310" text-anchor="middle" fill="#aaa6c4" font-family="Arial, sans-serif" font-size="20">No matched route segments yet</text>';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <rect width="1200" height="630" fill="#11101b"/>
    <g>${mapContent}</g>
  </svg>`;
}

async function handlePublicProfileOg(req, res) {
  const username = String(req.query.user || '').trim().toLowerCase();
  if (!username) {
    res.status(400).send('Missing user parameter');
    return;
  }
  // Social crawlers have short fetch timeouts. Use only saved locations here;
  // loading the full stop library and route geometry is appropriate for the
  // interactive profile, but too slow for an OG image request.
  const result = await getPublicProfilePayload(username, {
    includeHeatmap: false,
    includePoints: true,
    resolveStops: false,
  });
  if (result.statusCode !== 200) {
    res.status(result.statusCode).send(result.body?.error || 'Profile unavailable');
    return;
  }
  try {
    const image = await sharp(Buffer.from(buildSvg(result.body))).png().toBuffer();
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=300');
    res.status(200).send(image);
  } catch (error) {
    console.error('Public profile OG image failed:', error.message);
    res.status(500).send('Image unavailable');
  }
}

exports.publicProfileOg = onRequest({ memory: '512MiB', concurrency: 8, maxInstances: 4 }, handlePublicProfileOg);
exports.buildSvg = buildSvg;
