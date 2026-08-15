/**
 * Public profile stats endpoint.
 *
 * The `trips` collection is never publicly readable (see firestore.rules) because
 * each document carries userId, route, and exact timestamps that a public
 * profile page has no business exposing. This endpoint reads trips with the
 * Admin SDK and returns only aggregate stats plus public transit stop names,
 * coordinates, and usage counts for the map.
 */

const { onRequest } = require('firebase-functions/v2/https');
const { db, getUserProfile } = require('./db');
const logger = require('./logger');
const PUBLIC_PROFILE_BETA_USERNAME = 'subway-subway-subway';

function isPublicProfileBetaOwner(profile = {}) {
  if (profile.publicProfileBeta === true) return true;
  const candidates = [profile.username, profile.emojiUsername, ...(profile.usernameAliases || [])];
  return candidates.some(username => String(username || '').replace(/_/g, '-') === PUBLIC_PROFILE_BETA_USERNAME);
}

function normalizeStopLabel(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function stopBelongsToAgency(stop, agency) {
  const candidates = [...new Set(stop?.agencies || (stop?.agency ? [stop.agency] : []))]
    .map(value => String(value).trim().toLowerCase());
  const target = String(agency || '').trim().toLowerCase();
  if (!target || candidates.length === 0) return true;
  return candidates.some(candidate => candidate === target
    || (candidate === 'go' && target === 'go transit')
    || (candidate === 'go transit' && target === 'go'));
}

function validStopLocation(stop) {
  const lat = Number(stop?.lat);
  const lng = Number(stop?.lng ?? stop?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) return null;
  return { lat, lng };
}

function uniquePrestoStopCandidates(record, stops) {
  const target = normalizeStopLabel(record.locationLabel || record.location);
  if (!target) return [];
  const candidates = new Map();

  for (const stop of stops) {
    if (!stopBelongsToAgency(stop, record.agency)) continue;
    const labels = [stop.code, stop.name, ...(stop.aliases || [])]
      .filter(Boolean)
      .map(normalizeStopLabel);
    if (!labels.includes(target)) continue;

    const location = validStopLocation(stop);
    const agency = String(stop.agency || (stop.agencies || [])[0] || '').toLowerCase();
    const code = normalizeStopLabel(stop.code);
    const key = code
      ? `${agency}:code:${code}`
      : `${agency}:label:${normalizeStopLabel(stop.name)}:${location?.lat?.toFixed(5) || ''}:${location?.lng?.toFixed(5) || ''}`;
    const candidate = {
      name: stop.name || stop.stopName || stop.code || null,
      location,
    };
    const existing = candidates.get(key);
    if (!existing || (!existing.location && location)) candidates.set(key, candidate);
  }

  return [...candidates.values()];
}

const AGENCY_COUNTRIES = new Map([
  ...['TTC', 'GO', 'GO Transit', 'MiWay', 'YRT', 'Brampton Transit', 'Durham Transit', 'HSR', 'GRT', 'Grand River Transit', 'OC Transpo', 'STM', 'TransLink', 'Oakville Transit', 'GTAA Terminal Link', 'Flagship Cruises & Events', 'Exo', 'CDPQ Infra', 'Niagara Region Transit'].map(agency => [agency.toLowerCase(), 'Canada']),
  ...['NYC MTA', 'New York City Transit', 'LA Metro', 'LADOT', 'Los Angeles Department of Transportation', 'Big Blue Bus', 'BART', 'Muni', 'Caltrain', 'VTA', 'AC Transit', 'SamTrans', 'MTS', 'Amtrak', 'Golden Gate Transit', 'SMART', 'Santa Rosa CityBus', 'CDTA', 'NFTA Metro', 'TriMet', 'C-Tran', 'Sound Transit', 'King County Metro', 'Utah Transit Authority', 'Sacramento Regional Transit', 'GCRTA'].map(agency => [agency.toLowerCase(), 'United States']),
  ...['RATP', 'SNCF Transilien'].map(agency => [agency.toLowerCase(), 'France']),
  ...['TMB'].map(agency => [agency.toLowerCase(), 'Spain']),
]);

async function handlePublicProfile(req, res) {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET');
    res.status(204).send('');
    return;
  }

    const requestedUsername = String(req.query.user || '').trim().toLowerCase();
    if (!requestedUsername) {
        res.status(400).json({ error: 'Missing user parameter' });
        return;
    }

    try {
    let username = requestedUsername;
    let usernameDoc = await db.collection('usernames').doc(username).get();
    if (!usernameDoc.exists && username.includes('-')) {
      username = username.replace(/-/g, '_');
      usernameDoc = await db.collection('usernames').doc(username).get();
    }
    if (!usernameDoc.exists) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const userId = usernameDoc.data().uid;

    const profile = await getUserProfile(userId);
    if (!profile || !profile.isPublic) {
      res.status(403).json({ error: 'This profile is private' });
      return;
    }
    if (!isPublicProfileBetaOwner(profile)) {
      res.status(403).json({
        code: 'COMING_SOON',
        error: 'Public profiles are coming soon.',
      });
      return;
    }

    // The public profile switch is the permission boundary. Once the profile
    // is public, expose the same history as the signed-in map through the
    // aggregate-only response below. Individual trip documents remain private.
    const [tripsSnap, prestoSnap, stopsSnap] = await Promise.all([
      db.collection('trips').where('userId', '==', userId).get(),
      db.collection('prestoTransactions').where('userId', '==', userId).get(),
      db.collection('stops').get(),
    ]);
    const prestoRecords = prestoSnap.docs
      .map(doc => doc.data())
      .filter(record => record.type === 'fare_payment');
    const stops = stopsSnap.docs.map(doc => doc.data());

    let totalMinutes = 0;
    let thisMonth = 0;
    let thisWeek = 0;
    const riddenDays = new Set();
    const agencies = new Set();
    const countries = new Set();
    const pointsByStop = new Map();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const addPoint = (location, type, fallbackName) => {
      if (location?.lat == null || location?.lng == null) return;
      const lat = Number(location.lat);
      const lng = Number(location.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const key = `${type}:${lat}:${lng}`;
      const existing = pointsByStop.get(key);
      if (existing) {
        existing.usage += 1;
        if (fallbackName) existing.names.add(fallbackName);
        return;
      }
      pointsByStop.set(key, {
        lat,
        lng,
        type,
        usage: 1,
        names: new Set(fallbackName ? [fallbackName] : []),
      });
    };
    tripsSnap.forEach((doc) => {
      const trip = doc.data();
      totalMinutes += trip.duration || 0;
      const tripDate = trip.startTime?.toDate ? trip.startTime.toDate() : new Date(trip.startTime);
      if (!Number.isNaN(tripDate.getTime())) {
        riddenDays.add(`${tripDate.getFullYear()}-${tripDate.getMonth()}-${tripDate.getDate()}`);
        if (tripDate >= monthStart) thisMonth += 1;
        if (tripDate >= weekStart) thisWeek += 1;
      }
      const agency = String(trip.agency || '').trim();
      if (agency) {
        agencies.add(agency.toLowerCase());
        const country = AGENCY_COUNTRIES.get(agency.toLowerCase());
        if (country) countries.add(country);
      }
      addPoint(
        trip.boardingLocation || trip.boardLocation,
        'start',
        trip.startStopName || trip.startStop || trip.boardingLocation?.name,
      );
      addPoint(
        trip.exitLocation,
        'end',
        trip.endStopName || trip.endStop || trip.exitLocation?.name,
      );
    });

    prestoRecords.forEach((record) => {
      const tripDate = Number.isFinite(Number(record.occurredAtSortKey))
        ? new Date(Number(record.occurredAtSortKey))
        : new Date(record.occurredAtLocal);
      if (!Number.isNaN(tripDate.getTime())) {
        riddenDays.add(`${tripDate.getFullYear()}-${tripDate.getMonth()}-${tripDate.getDate()}`);
        if (tripDate >= monthStart) thisMonth += 1;
        if (tripDate >= weekStart) thisWeek += 1;
      }

      const agency = String(record.agency || '').trim();
      if (agency) {
        agencies.add(agency.toLowerCase());
        const country = AGENCY_COUNTRIES.get(agency.toLowerCase());
        if (country) countries.add(country);
      }

      // Only uniquely resolved PRESTO locations are exposed. Ambiguous
      // directional candidates remain stored but do not get guessed publicly.
      const candidates = uniquePrestoStopCandidates(record, stops);
      if (candidates.length === 1) {
        addPoint(candidates[0].location, 'start', candidates[0].name);
      }
    });

    res.status(200).json({
      displayName: profile.displayName || profile.name || null,
      username: profile.username || null,
      canonicalUsername: profile.username || requestedUsername,
      emoji: profile.emoji || null,
      defaultAgency: profile.defaultAgency || null,
      mapStopMode: profile.mapStopMode === 'exiting' ? 'exiting' : 'boarding',
      totalTrips: tripsSnap.size + prestoRecords.length,
      totalHours: Math.round((totalMinutes / 60) * 10) / 10,
      thisMonth,
      thisWeek,
      daysRidden: riddenDays.size,
      agencies: agencies.size,
      countries: countries.size,
      points: [...pointsByStop.values()].map(point => ({
        ...point,
        names: [...point.names],
      })),
    });
  } catch (err) {
    logger.error('Public profile lookup failed', { error: err.message, username: requestedUsername });
    res.status(500).json({ error: 'Internal error' });
  }
}

const publicProfileOptions = { concurrency: 80, maxInstances: 10 };

exports.publicProfile = onRequest(publicProfileOptions, handlePublicProfile);
// Pull-request previews use a separate function name so the preview can be
// deployed without replacing the live public-profile endpoint.
exports.publicProfilePreview = onRequest(publicProfileOptions, handlePublicProfile);
