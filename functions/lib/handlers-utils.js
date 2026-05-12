/**
 * Shared handler utilities — no exported command handlers.
 */
const {
  sendSmsReply,
} = require('./twilio');
const {
  setPendingState,
  lookupStop,
  findMatchingStops,
  getUserProfile,
  createTrip,
  getLastTripAgency,
  getTripCount,
} = require('./db');
const {
  getStopDisplay,
  getRouteDisplay,
  normalizeRoute,
  isValidRoute,
} = require('./utils');
const { AGENCY_CITY } = require('./constants');

/**
 * Pick the best V4/V5 route prediction that GTFS confirms actually serves this stop.
 * If routesAtStop is empty/null (no GTFS data), fall back to the top prediction.
 * Suppresses predictions below 25% confidence regardless.
 *
 * @param {Array} topRoutes - Sorted [{route, confidence, version}] from guessTopRoutes()
 * @param {Array|null} routesAtStop - Routes known to serve this stop from GTFS, or null
 * @returns {Object|null}
 */
function correctPredictionByGtfs(topRoutes, routesAtStop) {
  if (!topRoutes || topRoutes.length === 0) return null;
  const baseRoute = r => r.toString().replace(/[a-zA-Z]+$/, '').trim();
  if (routesAtStop && routesAtStop.length > 0) {
    const known = new Set(routesAtStop.map(r => baseRoute(r)));
    return topRoutes.find(p => p.confidence >= 25 && known.has(baseRoute(p.route))) || null;
  }
  const top = topRoutes[0];
  return top.confidence >= 25 ? top : null;
}

/**
 * Returns " via [Agency]" if the trip agency differs from the user's default, otherwise "".
 * @param {string} tripAgency
 * @param {string} defaultAgency
 * @returns {string}
 */
function agencySuffix(tripAgency, defaultAgency) {
  if (!tripAgency || tripAgency === defaultAgency) return '';
  return ` via ${tripAgency}`;
}

// Returns the city label for an agency to use in disambiguation prompts.
// Falls back to the agency name if both options share the same city (e.g. LA Metro vs LADOT).
function getDisambiguationLabel(agency, otherAgency) {
  const city = AGENCY_CITY[agency];
  const otherCity = AGENCY_CITY[otherAgency];
  if (!city || city === otherCity) return agency;
  return city;
}

async function promptAgencyChoice(
  phoneNumber, stopDisplay, route, direction, stopInput, options, lastAgency, defaultAgency
) {
  await setPendingState(phoneNumber, {
    type: 'confirm_agency',
    route,
    direction,
    stopInput,
    options,
    agencyOptions: [lastAgency, defaultAgency],
  });
  await sendSmsReply(
    phoneNumber,
    `Which ${stopDisplay}?
1. ${getDisambiguationLabel(lastAgency, defaultAgency)}
2. ${getDisambiguationLabel(defaultAgency, lastAgency)}`
  );
}

async function resolveTripAgency(
  phoneNumber, userId, parsedStop, route, direction, agency, options, stopInput, stopDisplay
) {
  let resolvedAgency = agency;
  if (options.agencyExplicit) return { resolvedAgency, handled: false };

  const lastAgency = await getLastTripAgency(userId);
  if (!lastAgency || lastAgency === agency) return { resolvedAgency, handled: false };

  const [stopInDefault, stopInLast] = await Promise.all([
    lookupStop(parsedStop.stopCode, parsedStop.stopName, agency, route),
    lookupStop(parsedStop.stopCode, parsedStop.stopName, lastAgency, route),
  ]);

  if (stopInDefault && stopInLast) {
    const userProfile = await getUserProfile(userId);
    const defaultAgency = userProfile?.defaultAgency || agency;
    await promptAgencyChoice(phoneNumber, stopDisplay, route, direction, stopInput, options, lastAgency, defaultAgency);
    return { resolvedAgency, handled: true };
  }

  if (stopInLast) {
    resolvedAgency = lastAgency;
    return { resolvedAgency, handled: false };
  }

  if (stopInDefault) {
    const userProfile = await getUserProfile(userId);
    const defaultAgency = userProfile?.defaultAgency || agency;
    await promptAgencyChoice(phoneNumber, stopDisplay, route, direction, stopInput, options, lastAgency, defaultAgency);
    return { resolvedAgency, handled: true };
  }

  // Neither has it — infer last trip's agency (unverified).
  resolvedAgency = lastAgency;
  return { resolvedAgency, handled: false };
}

function narrowStopCandidates(candidates, route, direction) {
  let narrowed = candidates;
  if (narrowed.length > 1 && route) {
    // Filter by route — keep stops that serve this route (or have no route data)
    const routeFiltered = narrowed.filter(c =>
      !c.routes || c.routes.length === 0 ||
      c.routes.some(r => normalizeRoute(r) === normalizeRoute(route))
    );
    if (routeFiltered.length >= 1) narrowed = routeFiltered;
  }
  // Further narrow by direction if provided and candidates still ambiguous
  if (narrowed.length > 1 && direction) {
    const dirFiltered = narrowed.filter(c =>
      !c.direction || c.direction.toLowerCase() === direction.toLowerCase()
    );
    if (dirFiltered.length >= 1) narrowed = dirFiltered;
  }
  return narrowed;
}

function isStopMatched(trip) {
  if (!trip) return false;
  if (trip.stop_matched != null) return !!trip.stop_matched;
  return !!trip.verified;
}

async function maybeHandleStopDisambiguation({
  phoneNumber, user, activeTrip, parsedStop, route, direction, resolvedAgency, options,
}) {
  if (parsedStop.stopCode || !parsedStop.stopName) return false;

  const candidates = narrowStopCandidates(
    await findMatchingStops(parsedStop.stopName, resolvedAgency),
    route,
    direction
  );
  if (candidates.length <= 1) return false;

  const list = candidates.map((c, i) => {
    const dir = c.direction ? ` (${c.direction})` : '';
    return `${i + 1}. ${c.stopName}${dir}`;
  }).join('\n');

  if (!activeTrip) {
    let tripId;
    try {
      tripId = await createTrip({
        userId: user.userId,
        route,
        direction: direction || null,
        startStopCode: null,
        startStopName: parsedStop.stopName || null,
        startStop: null,
        stop_matched: false,
        agency: resolvedAgency,
        sentiment: options.sentiment || null,
        tags: options.tags || [],
        parsed_by: options.parsed_by || 'manual',
        prediction: null,
        predictionV4: null,
        predictionV5: null,
        endStopPrediction: null,
        endStopPredictions: null,
        endStopPredictionV4: null,
        endStopPredictionV5: null,
        needs_review: !isValidRoute(route) || null,
      });
    } catch (err) {
      console.error('createTrip failed during stop disambiguation', err.message);
      await sendSmsReply(phoneNumber, 'Could not start your trip. Please try again.');
      return true;
    }
    await setPendingState(phoneNumber, {
      type: 'confirm_stop',
      tripId,
      route,
      direction,
      agency: resolvedAgency,
      options,
      stopCandidates: candidates,
    });
    const routeDisplay = getRouteDisplay(route, direction);
    await sendSmsReply(
      phoneNumber,
      `${routeDisplay} started. Multiple stops match "${parsedStop.stopName}":\n${list}\n` +
      'Reply with a number to set your stop, or DISCARD to cancel.'
    );
    return true;
  }

  // Active trip conflict — leave trip creation until after disambiguation
  await setPendingState(phoneNumber, {
    type: 'confirm_stop',
    route,
    direction,
    agency: resolvedAgency,
    options,
    stopCandidates: candidates,
  });
  await sendSmsReply(
    phoneNumber,
    `Multiple stops match "${parsedStop.stopName}":\n${list}\nReply with a number or DISCARD to cancel.`
  );
  return true;
}

/**
 * Build a conversational prediction prompt for the user.
 */
function getPredictionPrompt(predictions) {
  if (!predictions || predictions.length === 0) {
    return '\n\nEND [stop] to finish. FORGOT if you forgot to end. INFO for help.';
  }

  const shortcutNums = predictions.map((_, i) => i + 1).join('/');

  if (predictions.length === 1) {
    const p = predictions[0];
    return `\n\nHeading to ${p.stop}? (${p.confidence}%)\nReply END 1 to confirm, or END [stop]. FORGOT if you forgot to end.`;
  }

  const predLines = predictions.map((p, i) => `${i + 1}. ${p.stop} (${p.confidence}%)`).join('\n');
  return `\n\nWhere to?\n${predLines}\n\nEND [stop] or END ${shortcutNums} to finish. FORGOT if forgot to end.`;
}

/**
 * Checks for transit milestones and returns a celebratory note if reached.
 * @param {string} userId
 * @returns {Promise<string>}
 */
async function getAchievementNote(userId) {
  try {
    const count = await getTripCount(userId);
    const milestones = {
      1: '🎉 Your 1st trip! Welcome to the network.',
      10: '🔟 Your 10th trip! Frequent Rider status.',
      25: '🏅 Your 25th trip! System Regular status.',
      50: '🥈 Your 50th trip! Commuter Pro status.',
      100: '🥇 Your 100th trip! Network Veteran status.',
      250: '👑 Your 250th trip! Elite Commuter status.',
      500: '🏟️ Your 500th trip! System Analyst status.',
      1000: '🌌 Your 1,000th trip! Transit Authority status.',
    };
    return milestones[count] ? `\n\n${milestones[count]}` : '';
  } catch (err) {
    console.error('getAchievementNote failed', err);
    return '';
  }
}

module.exports = {
  correctPredictionByGtfs,
  agencySuffix,
  getDisambiguationLabel,
  promptAgencyChoice,
  resolveTripAgency,
  narrowStopCandidates,
  isStopMatched,
  maybeHandleStopDisambiguation,
  getPredictionPrompt,
  getAchievementNote,
};
