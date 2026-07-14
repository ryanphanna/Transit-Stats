function normalizeStopLabel(name) {
  if (!name) return null;
  return name.trim().toLowerCase()
    .replace(/\s*[/&@]\s*/g, '/')
    .replace(/\s+at\s+/g, '/');
}

function normalizeDirection(direction) {
  if (!direction) return null;
  const dir = direction.toString().toLowerCase().replace(/bound$/, '').trim();
  if (['south', 's', 'sb'].includes(dir)) return 'Southbound';
  if (['north', 'n', 'nb'].includes(dir)) return 'Northbound';
  if (['east', 'e', 'eb'].includes(dir)) return 'Eastbound';
  if (['west', 'w', 'wb'].includes(dir)) return 'Westbound';
  return null;
}

function defaultBaseRoute(route) {
  const routeStr = route?.toString().trim();
  if (!routeStr) return '';
  return routeStr.replace(/^(\d+).*/, '$1');
}

function getLine(topology, route, options = {}) {
  if (!topology || !route) return null;
  const routeStr = (options.baseRoute || defaultBaseRoute)(route.toString());
  const lines = topology.lines || {};

  const exact = lines[routeStr];
  if (exact && (!options.agency || exact.network === options.agency)) return exact;

  const lower = routeStr.toLowerCase();
  for (const line of Object.values(lines)) {
    if (options.agency && line.network !== options.agency) continue;
    if ((line.route_aliases || []).some(alias => alias.toLowerCase() === lower)) return line;
  }
  return null;
}

function stopIndex(line, stopName) {
  if (!line || !stopName) return -1;
  const normalized = normalizeStopLabel(stopName);

  for (let i = 0; i < (line.stops || []).length; i++) {
    const canon = line.stops[i];
    if (normalizeStopLabel(canon) === normalized) return i;

    const aliases = (line.aliases && line.aliases[canon]) || [];
    if (aliases.some(alias => normalizeStopLabel(alias) === normalized)) return i;

    const variants = (line.directional_stops && line.directional_stops[canon]) || [];
    if (variants.some(variant => {
      const names = [variant.name, ...(variant.aliases || [])].filter(Boolean);
      return names.some(name => normalizeStopLabel(name) === normalized);
    })) return i;
  }

  return -1;
}

function goingHigherForDirection(line, boardingIdx, direction) {
  const normDir = normalizeDirection(direction);
  if (!line || boardingIdx < 0 || !normDir) return null;

  if (line.name === 'Yonge-University') {
    const unionIdx = stopIndex(line, 'Union');
    if (unionIdx === -1 || boardingIdx === unionIdx) return null;
    return boardingIdx <= unionIdx ? normDir === 'Southbound' : normDir === 'Northbound';
  }

  if (line.direction_order) {
    if (normDir === line.direction_order.forward) return true;
    if (normDir === line.direction_order.reverse) return false;
    return null;
  }

  return normDir === 'Eastbound' || normDir === 'Northbound';
}

function stopLabels(line, canon, direction) {
  const normDir = normalizeDirection(direction);
  const variants = (line.directional_stops && line.directional_stops[canon]) || [];
  if (variants.length > 0) {
    return variants
      .filter(variant => !variant.directions || variant.directions.includes(normDir))
      .flatMap(variant => [variant.name, ...(variant.aliases || [])])
      .map(normalizeStopLabel)
      .filter(Boolean);
  }

  return [
    canon,
    ...((line.aliases && line.aliases[canon]) || []),
  ].map(normalizeStopLabel).filter(Boolean);
}

function platformCompatible(line, stopName, direction) {
  if (!line || !stopName || !direction) return true;
  const normDir = normalizeDirection(direction);
  const normStop = normalizeStopLabel(stopName);
  if (!normDir || !normStop) return true;

  for (const canon of line.stops || []) {
    const variants = (line.directional_stops && line.directional_stops[canon]) || [];
    if (variants.length === 0) continue;

    let matchedVariant = false;
    let compatibleVariant = false;
    for (const variant of variants) {
      const labels = [variant.name, ...(variant.aliases || [])]
        .map(normalizeStopLabel)
        .filter(Boolean);
      if (labels.includes(normStop)) {
        matchedVariant = true;
        if (!variant.directions || variant.directions.includes(normDir)) compatibleVariant = true;
      }
    }
    if (matchedVariant) return compatibleVariant;
  }

  return true;
}

function getConstraint(topology, context, options = {}) {
  const route = context?.route;
  const boardingStop = context?.startStopName || context?.boardingStop;
  const direction = context?.direction;
  if (!topology || !route || !boardingStop || !direction) return { source: 'none', legalStops: null };

  const line = getLine(topology, route, options);
  if (!line) return { source: 'none', legalStops: null };

  const boardingIdx = stopIndex(line, options.canonicalizeStop?.(boardingStop) || boardingStop);
  if (boardingIdx === -1) return { source: 'none', legalStops: null };

  const goingHigher = goingHigherForDirection(line, boardingIdx, direction);
  if (goingHigher === null) return { source: 'none', legalStops: null };

  const legalStops = new Set();
  for (let i = 0; i < (line.stops || []).length; i++) {
    if (goingHigher ? i > boardingIdx : i < boardingIdx) {
      for (const label of stopLabels(line, line.stops[i], direction)) {
        legalStops.add(label);
      }
    }
  }

  return { source: 'topology', legalStops, routeCovered: true, line };
}

function stopAllowedByConstraint(stopName, constraint, options = {}) {
  if (!constraint?.legalStops || !stopName) return false;
  const labels = [
    normalizeStopLabel(stopName),
    options.canonicalizeStop?.(stopName),
  ].filter(Boolean);
  return labels.some(label => constraint.legalStops.has(label));
}

function filterCandidatesByConstraint(candidates, constraint, options = {}) {
  return candidates.filter(candidate => {
    const stopName = options.getStopName ? options.getStopName(candidate) : candidate.stop || candidate.endStop || candidate.endStopName;
    return stopAllowedByConstraint(stopName, constraint, options);
  });
}

function filterCandidatesByPlatform(candidates, topology, route, direction, options = {}) {
  const line = getLine(topology, route, options);
  if (!line) return candidates;
  return candidates.filter(candidate => {
    const stopName = options.getStopName ? options.getStopName(candidate) : candidate.stop || candidate.endStop || candidate.endStopName;
    return platformCompatible(line, stopName, direction);
  });
}

function getMask(topology, route, boardingStop, direction, classes, options = {}) {
  if (!topology || !route || !boardingStop || !direction || !classes) return null;
  const line = getLine(topology, route, options);
  if (!line) return null;

  const boardingIdx = stopIndex(line, boardingStop);
  const goingHigher = goingHigherForDirection(line, boardingIdx, direction);
  if (boardingIdx === -1 || goingHigher === null) return null;

  const mask = classes.map(cls => {
    const idx = stopIndex(line, cls);
    if (idx === -1) return false;
    return (goingHigher ? idx > boardingIdx : idx < boardingIdx) && platformCompatible(line, cls, direction);
  });

  return mask.some(Boolean) ? mask : null;
}

module.exports = {
  filterCandidatesByConstraint,
  filterCandidatesByPlatform,
  getConstraint,
  getLine,
  getMask,
  normalizeDirection,
  normalizeStopLabel,
  platformCompatible,
  stopAllowedByConstraint,
  stopIndex,
  stopLabels,
};
