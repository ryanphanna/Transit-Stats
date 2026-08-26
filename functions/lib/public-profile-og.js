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
  const map = { left: 60, top: 70, width: 790, height: 500 };
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

function buildSvg(data) {
  const { paths } = projectBands(data.heatmapBands || []);
  const name = escapeXml(data.displayName || 'Traveler');
  const stat = (value, label, x) => `<text x="${x}" y="${label === 'TRIPS' ? 245 : label === 'ROUTES' ? 355 : 465}" fill="#ffffff" font-family="Arial, sans-serif"><tspan font-size="54" font-weight="700">${escapeXml(value)}</tspan><tspan x="${x}" dy="30" font-size="16" letter-spacing="2" fill="#aaa6c4">${label}</tspan></text>`;
  const mapContent = paths.length
    ? paths.join('')
    : '<text x="455" y="310" text-anchor="middle" fill="#aaa6c4" font-family="Arial, sans-serif" font-size="20">No matched route segments yet</text>';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <rect width="1200" height="630" fill="#11101b"/>
    <rect x="884" width="316" height="630" fill="#19172a"/>
    <text x="60" y="48" fill="#aaa6c4" font-family="Arial, sans-serif" font-size="15" font-weight="700" letter-spacing="3">TRANSITSTATS</text>
    <text x="60" y="610" fill="#aaa6c4" font-family="Arial, sans-serif" font-size="14">Darker lines = more recorded trips</text>
    <g>${mapContent}</g>
    <text x="930" y="92" fill="#ffffff" font-family="Arial, sans-serif" font-size="26" font-weight="700">${name}&apos;s map</text>
    <text x="930" y="125" fill="#aaa6c4" font-family="Arial, sans-serif" font-size="15">Public transit history</text>
    ${stat(data.totalTrips ?? 0, 'TRIPS', 930)}
    ${stat(data.routes ?? 0, 'ROUTES', 930)}
    ${stat(data.agencies ?? 0, 'AGENCIES', 930)}
    <text x="930" y="575" fill="#6d6885" font-family="Arial, sans-serif" font-size="13">transitstats.fyi</text>
  </svg>`;
}

async function handlePublicProfileOg(req, res) {
  const username = String(req.query.user || '').trim().toLowerCase();
  if (!username) {
    res.status(400).send('Missing user parameter');
    return;
  }
  const result = await getPublicProfilePayload(username, { includeHeatmap: true });
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

exports.publicProfileOg = onRequest({ concurrency: 40, maxInstances: 4 }, handlePublicProfileOg);
exports.buildSvg = buildSvg;
