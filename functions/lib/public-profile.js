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

async function handlePublicProfile(req, res) {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET');
    res.status(204).send('');
    return;
  }

  const username = String(req.query.user || '').trim().toLowerCase();
  if (!username) {
    res.status(400).json({ error: 'Missing user parameter' });
    return;
  }

  try {
    const usernameDoc = await db.collection('usernames').doc(username).get();
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

    const tripsSnap = await db.collection('trips')
      .where('userId', '==', userId)
      .where('isPublic', '==', true)
      .get();

    let totalMinutes = 0;
    const pointsByStop = new Map();
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

    res.status(200).json({
      displayName: profile.displayName || profile.name || null,
      username: profile.username || null,
      emoji: profile.emoji || null,
      defaultAgency: profile.defaultAgency || null,
      totalTrips: tripsSnap.size,
      totalHours: Math.round((totalMinutes / 60) * 10) / 10,
      points: [...pointsByStop.values()].map(point => ({
        ...point,
        names: [...point.names],
      })),
    });
  } catch (err) {
    logger.error('Public profile lookup failed', { error: err.message, username });
    res.status(500).json({ error: 'Internal error' });
  }
}

exports.publicProfile = onRequest({ concurrency: 80, maxInstances: 10 }, handlePublicProfile);
