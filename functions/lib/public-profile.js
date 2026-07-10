/**
 * Public profile stats endpoint.
 *
 * The `trips` collection is never publicly readable (see firestore.rules) because
 * each document carries userId, route, stop names, and exact timestamps that a
 * public profile page has no business exposing. This endpoint reads trips with
 * the Admin SDK and returns only the aggregate fields the public profile page
 * actually renders: trip/hour totals and anonymous lat/lng points for the heatmap.
 */

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
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
    const db = admin.firestore();

    const usernameDoc = await db.collection('usernames').doc(username).get();
    if (!usernameDoc.exists) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const userId = usernameDoc.data().uid;

    const profileDoc = await db.collection('profiles').doc(userId).get();
    const profile = profileDoc.exists ? profileDoc.data() : null;
    if (!profile || !profile.isPublic) {
      res.status(403).json({ error: 'This profile is private' });
      return;
    }

    const tripsSnap = await db.collection('trips')
      .where('userId', '==', userId)
      .where('isPublic', '==', true)
      .limit(1000)
      .get();

    let totalMinutes = 0;
    const points = [];
    tripsSnap.forEach((doc) => {
      const trip = doc.data();
      totalMinutes += trip.duration || 0;
      const start = trip.boardingLocation || trip.boardLocation;
      const end = trip.exitLocation;
      if (start?.lat != null && start?.lng != null) points.push({ lat: start.lat, lng: start.lng, type: 'start' });
      if (end?.lat != null && end?.lng != null) points.push({ lat: end.lat, lng: end.lng, type: 'end' });
    });

    res.status(200).json({
      displayName: profile.displayName || profile.name || null,
      username: profile.username || null,
      emoji: profile.emoji || null,
      defaultAgency: profile.defaultAgency || null,
      totalTrips: tripsSnap.size,
      totalHours: Math.round((totalMinutes / 60) * 10) / 10,
      points,
    });
  } catch (err) {
    logger.error('Public profile lookup failed', { error: err.message, username });
    res.status(500).json({ error: 'Internal error' });
  }
}

exports.publicProfile = onRequest({ concurrency: 80, maxInstances: 10 }, handlePublicProfile);
