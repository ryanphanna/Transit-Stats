/**
 * TransitStats Prediction Engine V4 (Logistic Regression)
 * 
 * Runs in parallel with V3 (Shadow Mode).
 * Uses weights trained via ml/train_routes.py and ml/train_endstop.py.
 */

const model = require('./model_v4.json');
const endStopModel = require('./model_v4_endstop.json');
const { getStopFeature, normalizeRouteForMl, getGapFeatures } = require('./ml_utils');

let _topology = null;
try {
  _topology = require('./topology.json');
} catch (e) {
  // topology filter disabled
}

// Shared topology helpers
function topologyLine(routeStr) {
  if (!_topology) return null;
  const lines = _topology.lines;
  if (lines[routeStr]) return lines[routeStr];
  const lower = routeStr.toLowerCase();
  for (const line of Object.values(lines)) {
    if ((line.route_aliases || []).some(a => a.toLowerCase() === lower)) return line;
  }
  return null;
}

function topologyStopIndex(line, stopName) {
  if (!stopName) return -1;
  const lower = stopName.trim().toLowerCase();
  for (let i = 0; i < line.stops.length; i++) {
    if (line.stops[i].toLowerCase() === lower) return i;
    const aliases = (line.aliases && line.aliases[line.stops[i]]) || [];
    if (aliases.some(a => a.toLowerCase() === lower)) return i;
  }
  return -1;
}

function topologyMask(route, boardingStop, direction, classes) {
  if (!_topology || !boardingStop || !direction) return null;
  const routeStr = route.toString().replace(/^(\d+).*/, '$1');
  const line = topologyLine(routeStr);
  if (!line) return null;
  const normDir = direction.toLowerCase().replace(/bound$/, '').trim();
  const boardingIdx = topologyStopIndex(line, boardingStop);
  if (boardingIdx === -1) return null;
  let goingHigher;
  if (line.name === 'Yonge-University') {
    const unionIdx = topologyStopIndex(line, 'Union');
    if (unionIdx === -1) return null;
    goingHigher = boardingIdx <= unionIdx ? ['south','s','sb'].includes(normDir) : ['north','n','nb'].includes(normDir);
  } else {
    goingHigher = ['east','e','eb','north','n','nb'].includes(normDir);
  }
  const mask = classes.map(cls => {
    const idx = topologyStopIndex(line, cls);
    if (idx === -1) return true;
    return goingHigher ? idx > boardingIdx : idx < boardingIdx;
  });
  return mask.some(Boolean) ? mask : null;
}

const PredictionEngineV4 = {
  VERSION: '4.3',

  /**
   * Guess the next route given the current stop and time.
   * @param {Object} context - { stopName, time, lastEndStopName, stopsLibrary }
   */
  guessTopRoutes: function (context, topN = 5) {
    if (!context || !context.time) return [];

    const date = context.time instanceof Date ? context.time : new Date(context.time);
    const hour = date.getHours();
    const pyDay = (date.getDay() + 6) % 7;

    const hour_sin = Math.sin(2 * Math.PI * hour / 24);
    const hour_cos = Math.cos(2 * Math.PI * hour / 24);
    const day_sin  = Math.sin(2 * Math.PI * pyDay / 7);
    const day_cos  = Math.cos(2 * Math.PI * pyDay / 7);

    const stopFeature = getStopFeature(context.stopName, context.stopsLibrary);
    const lastStopFeature = `last_stop_${getStopFeature(context.lastEndStopName, context.stopsLibrary).replace('stop_', '')}`;

    const x = new Array(model.feature_names.length).fill(0);
    for (let i = 0; i < model.feature_names.length; i++) {
      const fn = model.feature_names[i];
      if      (fn === 'hour_sin') x[i] = hour_sin;
      else if (fn === 'hour_cos') x[i] = hour_cos;
      else if (fn === 'day_sin')  x[i] = day_sin;
      else if (fn === 'day_cos')  x[i] = day_cos;
      else if (fn === stopFeature) x[i] = 1.0;
      else if (fn === lastStopFeature) x[i] = 1.0;
    }

    const logits = model.classes.map((_, c) => {
      let z = model.intercept[c];
      for (let f = 0; f < x.length; f++) z += model.coef[c][f] * x[f];
      return z;
    });

    const maxLogit = Math.max(...logits);
    let sumExp = 0;
    const exps = logits.map(z => { const e = Math.exp(z - maxLogit); sumExp += e; return e; });
    const probs = exps.map(e => e / sumExp);

    return probs
      .map((p, i) => ({ route: model.classes[i].toString(), confidence: Math.round(p * 100), version: this.VERSION }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, topN);
  },

  /**
   * Predict top N exit stops.
   * @param {Object} context - { route, startStopName, direction, time, lastEndStopName, lastRoute, minutesSinceLastTrip, agency, stopsLibrary }
   */
  guessTopEndStops: function (context, topN = 3) {
    if (!context || !context.time || !context.startStopName) return [];

    const date = context.time instanceof Date ? context.time : new Date(context.time);
    const hour  = date.getHours();
    const pyDay = (date.getDay() + 6) % 7;

    const hour_sin = Math.sin(2 * Math.PI * hour / 24);
    const hour_cos = Math.cos(2 * Math.PI * hour / 24);
    const day_sin  = Math.sin(2 * Math.PI * pyDay / 7);
    const day_cos  = Math.cos(2 * Math.PI * pyDay / 7);

    const cleanRoute = normalizeRouteForMl(context.route, context.agency).toString().toLowerCase();
    const prevRoute = normalizeRouteForMl(context.lastRoute, context.agency) || 'none';
    const stopFeature = getStopFeature(context.startStopName, context.stopsLibrary);
    const lastStopFeature = `last_stop_${getStopFeature(context.lastEndStopName, context.stopsLibrary).replace('stop_', '')}`;
    const prevRouteFeature = `prev_route_${prevRoute.toString().toLowerCase()}`;
    const { gapLog, gapMissing } = getGapFeatures(context.minutesSinceLastTrip);

    const x = new Array(endStopModel.feature_names.length).fill(0);
    for (let i = 0; i < endStopModel.feature_names.length; i++) {
      const fn = endStopModel.feature_names[i];
      if      (fn === 'hour_sin')            x[i] = hour_sin;
      else if (fn === 'hour_cos')            x[i] = hour_cos;
      else if (fn === 'day_sin')             x[i] = day_sin;
      else if (fn === 'day_cos')             x[i] = day_cos;
      else if (fn === 'gap_log')             x[i] = gapLog;
      else if (fn === 'gap_missing')         x[i] = gapMissing;
      else if (fn === stopFeature)           x[i] = 1.0;
      else if (fn === `route_${cleanRoute}`) x[i] = 1.0;
      else if (fn === prevRouteFeature)      x[i] = 1.0;
      else if (fn === lastStopFeature)      x[i] = 1.0;
    }

    const logits = endStopModel.classes.map((_, c) => {
      let z = endStopModel.intercept[c];
      for (let f = 0; f < x.length; f++) z += endStopModel.coef[c][f] * x[f];
      return z;
    });

    // NetworkEngine mask takes priority — it learns surface routes automatically.
    // Fall back to topology.json for subway/LRT lines when NetworkEngine has no data.
    const { NetworkEngine } = require('./network.js');
    const networkMask = NetworkEngine.getMask(context.networkGraph, endStopModel.classes, context.startStopName, context.direction);
    const mask = networkMask || topologyMask(context.route, context.startStopName, context.direction, endStopModel.classes);
    if (mask) mask.forEach((keep, i) => { if (!keep) logits[i] = -Infinity; });

    const maxL = Math.max(...logits.filter(isFinite));
    let sumExp = 0;
    const exps = logits.map(z => { const e = isFinite(z) ? Math.exp(z - maxL) : 0; sumExp += e; return e; });
    const probs = exps.map(e => sumExp > 0 ? e / sumExp : 0);

    return probs
      .map((p, i) => ({ stop: endStopModel.classes[i], prob: p }))
      .filter(v => v.prob > 0)
      .sort((a, b) => b.prob - a.prob)
      .slice(0, topN)
      .map(v => ({ stop: v.stop, confidence: Math.round(v.prob * 100), version: this.VERSION }));
  },
};

module.exports = { PredictionEngineV4 };
