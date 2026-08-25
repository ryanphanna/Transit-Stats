/**
 * Public profile stats endpoint.
 *
 * The `trips` collection is never publicly readable (see firestore.rules) because
 * each document carries userId, route, and exact timestamps that a public
 * profile page has no business exposing. This endpoint reads trips with the
 * Admin SDK and returns only aggregate stats plus coordinates and usage counts
 * for the map.
 */

const { onRequest } = require('firebase-functions/v2/https');
const { db, getUserProfile, getStopsLibrary } = require('./db');
const logger = require('./logger');
const { isPublicProfileBetaOwner, getMapStopMode } = require('./profile-fields');

const ACTIVE_TRIP_WINDOW_MS = 6 * 60 * 60 * 1000;

function isDashboardHistoryTrip(trip, now = Date.now()) {
  if (trip.endTime || trip.discarded) return true;
  const startTime = trip.startTime?.toDate ? trip.startTime.toDate() : new Date(trip.startTime);
  return Number.isFinite(startTime.getTime()) && now - startTime.getTime() >= ACTIVE_TRIP_WINDOW_MS;
}

const AGENCY_COUNTRIES = new Map([
  ...['TTC', 'GO', 'GO Transit', 'MiWay', 'YRT', 'Brampton Transit', 'Durham Transit', 'HSR', 'GRT', 'Grand River Transit', 'OC Transpo', 'STM', 'TransLink', 'Oakville Transit', 'GTAA Terminal Link', 'Flagship Cruises & Events', 'Exo', 'CDPQ Infra', 'Niagara Region Transit'].map(agency => [agency.toLowerCase(), 'Canada']),
  ...['NYC MTA', 'New York City Transit', 'LA Metro', 'LADOT', 'Los Angeles Department of Transportation', 'Big Blue Bus', 'BART', 'Muni', 'Caltrain', 'VTA', 'AC Transit', 'SamTrans', 'MTS', 'Amtrak', 'Golden Gate Transit', 'SMART', 'Santa Rosa CityBus', 'CDTA', 'NFTA Metro', 'TriMet', 'C-Tran', 'Sound Transit', 'King County Metro', 'Utah Transit Authority', 'Sacramento Regional Transit', 'GCRTA'].map(agency => [agency.toLowerCase(), 'United States']),
  ...['RATP', 'SNCF Transilien'].map(agency => [agency.toLowerCase(), 'France']),
  ...['TMB'].map(agency => [agency.toLowerCase(), 'Spain']),
]);

function normalizeStopLabel(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function buildStopLocationIndex(stops = []) {
  const index = new Map();
  const add = (key, location) => {
    if (key && !index.has(key)) index.set(key, location);
  };

  for (const stop of stops) {
    const lat = Number(stop.lat);
    const lng = Number(stop.lng ?? stop.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) continue;

    const labels = [stop.name, stop.stopName, stop.code, ...(stop.aliases || [])]
      .map(normalizeStopLabel)
      .filter(Boolean);
    const agencies = [stop.agency, ...(stop.agencies || [])]
      .map(normalizeStopLabel)
      .filter(Boolean);
    const location = { lat, lng };
    labels.forEach(label => {
      add(`*:${label}`, location);
      agencies.forEach(agency => add(`${agency}:${label}`, location));
    });
  }
  return index;
}

function resolveTripLocation(location, stopName, agency, stopIndex) {
  const savedLat = Number(location?.lat);
  const savedLng = Number(location?.lng ?? location?.lon);
  if (Number.isFinite(savedLat) && Number.isFinite(savedLng) && savedLat !== 0 && savedLng !== 0) {
    return { lat: savedLat, lng: savedLng };
  }

  const label = normalizeStopLabel(stopName);
  if (!label || !stopIndex) return null;
  return stopIndex.get(`${normalizeStopLabel(agency)}:${label}`)
    || stopIndex.get(`*:${label}`)
    || null;
}

async function handlePublicProfile(req, res) {
  res.set('Access-Control-Allow-Origin', '*');
  // Public profile data can be briefly stale; allowing intermediary caching
  // avoids repeating the Firestore aggregation for every new device.
  res.set('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=300');
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
    const tripsSnap = await db.collection('trips').where('userId', '==', userId).get();
    const historyTrips = [];
    const nowMs = Date.now();
    tripsSnap.forEach((doc) => {
      const trip = doc.data();
      if (isDashboardHistoryTrip(trip, nowMs)) historyTrips.push(trip);
    });

    let totalMinutes = 0;
    let last30Days = 0;
    let last7Days = 0;
    const riddenDays = new Set();
    const agencies = new Set();
    const countries = new Set();
    const pointsByStop = new Map();
    let stopIndex = null;
    let stopIndexPromise = null;
    const getStopIndex = async () => {
      if (!stopIndexPromise) {
        stopIndexPromise = getStopsLibrary().then(buildStopLocationIndex);
      }
      stopIndex = await stopIndexPromise;
      return stopIndex;
    };
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const addPoint = (location, type) => {
      if (location?.lat == null || location?.lng == null) return;
      const lat = Number(location.lat);
      const lng = Number(location.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const key = `${type}:${lat}:${lng}`;
      const existing = pointsByStop.get(key);
      if (existing) {
        existing.usage += 1;
        return;
      }
      pointsByStop.set(key, {
        lat,
        lng,
        type,
        usage: 1,
      });
    };
    for (const trip of historyTrips) {
      totalMinutes += trip.duration || 0;
      const tripDate = trip.startTime?.toDate ? trip.startTime.toDate() : new Date(trip.startTime);
      if (!Number.isNaN(tripDate.getTime())) {
        riddenDays.add(`${tripDate.getFullYear()}-${tripDate.getMonth()}-${tripDate.getDate()}`);
        if (tripDate >= thirtyDaysAgo) last30Days += 1;
        if (tripDate >= sevenDaysAgo) last7Days += 1;
      }
      const agency = String(trip.agency || '').trim();
      if (agency) {
        agencies.add(agency.toLowerCase());
        const country = AGENCY_COUNTRIES.get(agency.toLowerCase());
        if (country) countries.add(country);
      }
      const boardingLocation = resolveTripLocation(
        trip.boardingLocation || trip.boardLocation,
        trip.startStopName || trip.startStop,
        trip.agency,
        stopIndex,
      ) || await resolveTripLocation(
        trip.boardingLocation || trip.boardLocation,
        trip.startStopName || trip.startStop,
        trip.agency,
        await getStopIndex(),
      );
      const exitLocation = resolveTripLocation(
        trip.exitLocation,
        trip.endStopName || trip.endStop,
        trip.agency,
        stopIndex,
      ) || await resolveTripLocation(
        trip.exitLocation,
        trip.endStopName || trip.endStop,
        trip.agency,
        await getStopIndex(),
      );
      addPoint(
        boardingLocation,
        'start',
      );
      addPoint(
        exitLocation,
        'end',
      );
    }

    res.status(200).json({
      displayName: profile.displayName || profile.name || null,
      username: profile.username || null,
      canonicalUsername: profile.username || requestedUsername,
      emoji: profile.emoji || null,
      defaultAgency: profile.defaultAgency || null,
      mapStopMode: getMapStopMode(profile),
      totalTrips: historyTrips.length,
      totalHours: Math.round((totalMinutes / 60) * 10) / 10,
      // Keep the existing response keys for clients that have not refreshed yet.
      thisMonth: last30Days,
      thisWeek: last7Days,
      daysRidden: riddenDays.size,
      agencies: agencies.size,
      countries: countries.size,
      points: [...pointsByStop.values()],
    });
  } catch (err) {
    logger.error('Public profile lookup failed', { error: err.message, username: requestedUsername });
    res.status(500).json({ error: 'Internal error' });
  }
}

exports.publicProfile = onRequest({ concurrency: 80, maxInstances: 10 }, handlePublicProfile);
