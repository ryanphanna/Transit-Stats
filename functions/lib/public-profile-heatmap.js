function normalizedRoute(value) {
  return String(value || '').trim().toLowerCase().replace(/^(route|line)\s*/i, '');
}

function baseRouteKey(value) {
  const route = normalizedRoute(value);
  return route.match(/^(\d+)/)?.[1] || route;
}

function routeMatches(featureRoute, tripRoute) {
  const feature = normalizedRoute(featureRoute);
  const trip = normalizedRoute(tripRoute);
  return Boolean(feature && trip && (feature === trip || baseRouteKey(feature) === baseRouteKey(trip)));
}

function projectionForPoint(point, coordinates) {
  const lat = Number(point?.lat);
  const lng = Number(point?.lng ?? point?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || coordinates.length < 2) return null;

  const lengths = [];
  let totalLength = 0;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const [x1, y1] = coordinates[index];
    const [x2, y2] = coordinates[index + 1];
    const length = Math.hypot(x2 - x1, y2 - y1);
    lengths.push(length);
    totalLength += length;
  }
  if (totalLength === 0) return null;

  let best = null;
  let distanceBefore = 0;
  for (let index = 0; index < lengths.length; index += 1) {
    const [x1, y1] = coordinates[index];
    const [x2, y2] = coordinates[index + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((lng - x1) * dx + (lat - y1) * dy) / lengthSquared));
    const projectedLng = x1 + dx * t;
    const projectedLat = y1 + dy * t;
    const distance = Math.hypot(lng - projectedLng, lat - projectedLat);
    if (!best || distance < best.distance) {
      best = {
        fraction: (distanceBefore + lengths[index] * t) / totalLength,
        distance,
      };
    }
    distanceBefore += lengths[index];
  }
  return best;
}

function stopPosition(feature, code) {
  if (!code) return null;
  const properties = feature.properties || {};
  const order = Array.isArray(properties.stopOrder) ? properties.stopOrder : [];
  const positions = Array.isArray(properties.stopPositions) ? properties.stopPositions : [];
  const index = order.findIndex(value => String(value) === String(code));
  const position = index >= 0 ? Number(positions[index]) : NaN;
  return Number.isFinite(position) ? Math.max(0, Math.min(1, position)) : null;
}

function pointAtFraction(coordinates, fraction) {
  const clamped = Math.max(0, Math.min(1, fraction));
  const lengths = coordinates.slice(0, -1).map(([x1, y1], index) => {
    const [x2, y2] = coordinates[index + 1];
    return Math.hypot(x2 - x1, y2 - y1);
  });
  const totalLength = lengths.reduce((sum, length) => sum + length, 0);
  if (totalLength === 0) return coordinates[0];

  let remaining = totalLength * clamped;
  for (let index = 0; index < lengths.length; index += 1) {
    if (remaining <= lengths[index] || index === lengths.length - 1) {
      const [x1, y1] = coordinates[index];
      const [x2, y2] = coordinates[index + 1];
      const t = lengths[index] === 0 ? 0 : remaining / lengths[index];
      return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
    }
    remaining -= lengths[index];
  }
  return coordinates.at(-1);
}

function sliceLine(coordinates, start, end) {
  if (!Array.isArray(coordinates) || coordinates.length < 2 || end <= start) return null;
  const result = [pointAtFraction(coordinates, start)];
  let distance = 0;
  let totalLength = 0;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    totalLength += Math.hypot(
      coordinates[index + 1][0] - coordinates[index][0],
      coordinates[index + 1][1] - coordinates[index][1],
    );
  }
  for (let index = 1; index < coordinates.length - 1; index += 1) {
    distance += Math.hypot(
      coordinates[index][0] - coordinates[index - 1][0],
      coordinates[index][1] - coordinates[index - 1][1],
    );
    const fraction = distance / totalLength;
    if (fraction > start && fraction < end) result.push(coordinates[index]);
  }
  result.push(pointAtFraction(coordinates, end));
  return result.map(([lng, lat]) => [lat, lng]);
}

function tripFractions(feature, trip) {
  const coordinates = feature?.geometry?.type === 'LineString' ? feature.geometry.coordinates : null;
  if (!coordinates || coordinates.length < 2) return null;

  const start = stopPosition(feature, trip.startStopCode);
  const end = stopPosition(feature, trip.endStopCode);
  if (start !== null && end !== null) return end > start ? { start, end } : null;

  const startProjection = projectionForPoint(trip.boardingLocation || trip.boardLocation, coordinates);
  const endProjection = projectionForPoint(trip.exitLocation, coordinates);
  if (!startProjection || !endProjection || endProjection.fraction <= startProjection.fraction) return null;
  if (startProjection.distance > 0.01 || endProjection.distance > 0.01) return null;
  return { start: startProjection.fraction, end: endProjection.fraction };
}

function buildHeatmapBands(trips, routeFeatures, binCount = 24) {
  const groups = new Map();
  for (const trip of trips) {
    const agency = trip.agency || 'TTC';
    const candidates = routeFeatures.filter(feature => {
      const properties = feature.properties || {};
      return feature.__agency === agency
        && routeMatches(properties.routeShortName || properties.routeId, trip.route);
    }).sort((left, right) => {
      const leftRoute = normalizedRoute(left.properties?.routeShortName || left.properties?.routeId);
      const rightRoute = normalizedRoute(right.properties?.routeShortName || right.properties?.routeId);
      const tripRoute = normalizedRoute(trip.route);
      return Number(rightRoute === tripRoute) - Number(leftRoute === tripRoute);
    });
    const match = candidates.map(feature => ({ feature, fractions: tripFractions(feature, trip) }))
      .find(candidate => candidate.fractions);
    if (!match) continue;

    const properties = match.feature.properties || {};
    const key = [agency, properties.routeId, properties.directionId, properties.day, properties.routeBranch, properties.headsign]
      .map(value => String(value ?? ''))
      .join('::');
    let group = groups.get(key);
    if (!group) {
      group = { coordinates: match.feature.geometry.coordinates, counts: new Array(binCount).fill(0) };
      groups.set(key, group);
    }
    const firstBin = Math.max(0, Math.floor(match.fractions.start * binCount));
    const lastBin = Math.min(binCount - 1, Math.ceil(match.fractions.end * binCount) - 1);
    for (let bin = firstBin; bin <= lastBin; bin += 1) group.counts[bin] += 1;
  }

  const bands = [];
  for (const group of groups.values()) {
    group.counts.forEach((count, bin) => {
      if (!count) return;
      const line = sliceLine(group.coordinates, bin / binCount, (bin + 1) / binCount);
      if (line) bands.push({ line, count });
    });
  }
  return bands;
}

module.exports = { buildHeatmapBands };
