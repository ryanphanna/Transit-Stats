/**
 * Query, stats, and journey link handlers.
 */
const admin = require('firebase-admin');
const { randomUUID } = require('crypto');
const {
  sendSmsReply,
} = require('./twilio');
const {
  getActiveTrip,
  getUserProfile,
  isEmailAdmin,
  db,
  isGeminiRateLimited,
  getRecentCompletedTrips,
  getConversationHistory,
  saveConversationTurn,
} = require('./db');
const {
  getRouteDisplay,
} = require('./utils');
const {
  aggregateTripStats,
  answerQueryWithGemini,
  lookupAgencyTimezone,
} = require('./gemini');

/**
 * Handle natural-language query (premium feature)
 */
async function handleQuery(phoneNumber, user, question) {
  const profile = await getUserProfile(user.userId);
  const isAdmin = await isEmailAdmin(user.email);
  if (!profile?.isPremium) {
    await sendSmsReply(phoneNumber,
      'AI Stats is a premium feature. Text STATS for your 30-day summary.',
    );
    return;
  }

  if (!question) {
    await sendSmsReply(phoneNumber, 'Ask me anything about your trips, ' +
      'e.g. "ASK how many trips have I taken on Fridays?"');
    return;
  }

  const [snapshot, conversationHistory] = await Promise.all([
    db.collection('trips')
      .where('userId', '==', user.userId)
      .where('endTime', '!=', null)
      .orderBy('endTime', 'desc')
      .limit(200).get(),
    getConversationHistory(user.userId),
  ]);

  const trips = snapshot.docs.map((d) => d.data());

  if (trips.length === 0) {
    await sendSmsReply(phoneNumber, 'You don\'t have any completed trips yet!');
    return;
  }

  const recentAgency = trips[0]?.agency || null;
  const timezone = await lookupAgencyTimezone(recentAgency);
  const stats = aggregateTripStats(trips, timezone);
  if (await isGeminiRateLimited(phoneNumber, !!profile?.isPremium, isAdmin)) {
    await sendSmsReply(phoneNumber, 'AI limit reached. Try again later.');
    return;
  }
  const answer = await answerQueryWithGemini(user.userId, question, trips, stats, conversationHistory, timezone);
  await sendSmsReply(phoneNumber, answer);

  // Fire-and-forget — never block or fail the reply
  saveConversationTurn(user.userId, question, answer)
    .catch((err) => console.error('saveConversationTurn failed:', err));
  db.collection('queryLogs').add({
    userId: user.userId,
    question,
    answer,
    tripWindowSize: trips.length,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    source: 'sms',
  }).catch((err) => console.error('queryLogs write failed:', err));
}

/**
 * Handle STATS command
 */
async function handleStatsCommand(phoneNumber, user) {
  const now = new Date();

  // Windows
  const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const fourteenDaysAgo = new Date(now); fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date(now); sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const snapshot = await db.collection('trips')
    .where('userId', '==', user.userId)
    .where('startTime', '>=', admin.firestore.Timestamp.fromDate(sixtyDaysAgo))
    .get();

  const toDate = (t) => t.startTime?.toDate ? t.startTime.toDate() : new Date(t.startTime);
  const allTrips = snapshot.docs.map((d) => d.data()).filter((t) => t.endStopName != null || t.endStopCode != null);

  // Filter buckets
  const thisWeek = allTrips.filter((t) => toDate(t) >= sevenDaysAgo);
  const lastWeek = allTrips.filter((t) => {
    const d = toDate(t);
    return d >= fourteenDaysAgo && d < sevenDaysAgo;
  });
  const last30 = allTrips.filter((t) => toDate(t) >= thirtyDaysAgo);
  const prev30 = allTrips.filter((t) => {
    const d = toDate(t);
    return d >= sixtyDaysAgo && d < thirtyDaysAgo;
  });

  if (allTrips.length === 0) {
    await sendSmsReply(phoneNumber, 'No trips logged in the last 60 days.');
    return;
  }

  const profile = await getUserProfile(user.userId);
  const isPremium = !!profile?.isPremium;

  const getTrend = (current, previous, label) => {
    if (!isPremium || previous === 0) return '';
    const pct = Math.round(((current - previous) / previous) * 100);
    const arrow = pct >= 0 ? '↑' : '↓';
    return ` (${arrow}${Math.abs(pct)}% vs ${label})`;
  };

  const totalMin30 = last30.reduce((sum, t) => sum + (t.duration || 0), 0);
  const uniqueRoutes30 = new Set(last30.map((t) => t.route).filter(Boolean)).size;

  // Top route in the last 30 days
  const routeCounts30 = {};
  for (const t of last30) {
    if (t.route) routeCounts30[t.route] = (routeCounts30[t.route] || 0) + 1;
  }
  const topRoute = Object.entries(routeCounts30).sort((a, b) => b[1] - a[1])[0];

  const totalHours = totalMin30 / 60;
  const timeStr = totalHours >= 1 ? `${totalHours.toFixed(1)}h` : `${Math.round(totalMin30)}min`;

  const weekLine = `Past 7 days: ${thisWeek.length} trip${thisWeek.length !== 1 ? 's' : ''}${getTrend(thisWeek.length, lastWeek.length, 'prior week')}`;
  const topLine = topRoute ? `Top route: ${topRoute[0]} (${topRoute[1]}×)` : '';
  const thirtyLine = `Last 30 days: ${last30.length} trips across ${uniqueRoutes30} route${uniqueRoutes30 !== 1 ? 's' : ''}, ${timeStr} riding${getTrend(last30.length, prev30.length, 'prior 30')}`;

  const parts = [weekLine, thirtyLine];
  if (topLine) parts.push(topLine);
  await sendSmsReply(phoneNumber, parts.join('\n\n'));
}

/**
 * Handle LINK command — join the most recent pair of consecutive trips as a journey.
 *
 * Case A (active trip exists): links the last completed trip → current active trip.
 * Case B (no active trip): links the last two completed trips.
 *
 * A journeyId (UUID) is shared across all legs. If either trip already belongs to a
 * journey, that ID is reused so the journey can grow leg by leg.
 * Only trips within a 60-minute gap are eligible.
 */
async function handleJourneyLink(phoneNumber, user) {
  const [activeTrip, history] = await Promise.all([
    getActiveTrip(user.userId),
    getRecentCompletedTrips(user.userId, 2),
  ]);

  let earlierTrip, laterTrip;

  if (activeTrip && history.length >= 1) {
    // Case A: last completed trip → active trip
    earlierTrip = history[0];
    laterTrip = activeTrip;
  } else if (!activeTrip && history.length >= 2) {
    // Case B: second-to-last completed → last completed
    earlierTrip = history[1]; // older (lower endTime)
    laterTrip = history[0];   // newer
  } else {
    await sendSmsReply(phoneNumber, 'Not enough trips to link. Complete at least one trip first.');
    return;
  }

  // Validate temporal gap
  const earlierEnd = earlierTrip.endTime?.toDate
    ? earlierTrip.endTime.toDate() : new Date(earlierTrip.endTime);
  const laterStart = laterTrip.startTime?.toDate
    ? laterTrip.startTime.toDate() : new Date(laterTrip.startTime);
  const gapMinutes = (laterStart - earlierEnd) / 60000;

  if (gapMinutes < 0) {
    await sendSmsReply(phoneNumber, 'Trips overlap in time — cannot link.');
    return;
  }
  if (gapMinutes > 60) {
    await sendSmsReply(
      phoneNumber,
      `Gap between trips is ${Math.round(gapMinutes)} min. Only trips within 60 min can be linked as a journey.`,
    );
    return;
  }

  // Reuse an existing journeyId if one leg already belongs to a journey
  const journeyId = earlierTrip.journeyId || laterTrip.journeyId || randomUUID();

  // Guard: already linked together
  if (earlierTrip.journeyId && laterTrip.journeyId && earlierTrip.journeyId === laterTrip.journeyId) {
    await sendSmsReply(phoneNumber, 'These trips are already linked as a journey.');
    return;
  }

  const batch = db.batch();
  batch.update(db.collection('trips').doc(earlierTrip.id), { journeyId });
  batch.update(db.collection('trips').doc(laterTrip.id), { journeyId });
  await batch.commit();

  const gapStr = gapMinutes < 1 ? '<1' : Math.round(gapMinutes);
  await sendSmsReply(
    phoneNumber,
    `${getRouteDisplay(earlierTrip.route)} → ${getRouteDisplay(laterTrip.route)} ` +
    `linked as a journey (${gapStr} min transfer).`,
  );
}

module.exports = {
  handleQuery,
  handleStatsCommand,
  handleJourneyLink,
};
