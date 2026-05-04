/**
 * TransitStats Prediction Engine V4 (Logistic Regression)
 * 
 * Runs in parallel with V3 (Shadow Mode).
 * Uses weights trained via ml/predict_v4.ipynb.
 */

const model = require('./model_v4.json');
const endStopModel = require('./model_v4_endstop.json');

let _topology = null;
try { _topology = require('./topology.json'); } catch (e) {}

// Shared topology helpers (mirrors predict.js)
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
  const goingHigherDir = ['east', 'e', 'eb', 'north', 'n', 'nb'].includes(normDir);
  const goingLowerDir  = ['west', 'w', 'wb', 'south', 's', 'sb'].includes(normDir);
  if (!goingHigherDir && !goingLowerDir) return null;

  const boardingIdx = topologyStopIndex(line, boardingStop);
  if (boardingIdx === -1) return null;

  let goingHigher;
  if (line.name === 'Yonge-University') {
    const unionIdx = topologyStopIndex(line, 'Union');
    if (unionIdx === -1) return null;
    goingHigher = boardingIdx <= unionIdx ? !goingHigherDir : goingHigherDir;
    // Yonge branch southbound = toward Union = higher index
    goingHigher = boardingIdx <= unionIdx ? goingLowerDir === false && normDir === 'south' : goingHigherDir;
    // Simpler: Yonge branch: south→higher, University branch: north→higher
    goingHigher = boardingIdx <= unionIdx ? ['south','s','sb'].includes(normDir) : goingHigherDir;
  } else {
    goingHigher = goingHigherDir;
  }

  // Build a boolean mask over the class list
  const mask = classes.map(cls => {
    const idx = topologyStopIndex(line, cls);
    if (idx === -1) return true; // unknown — keep
    return goingHigher ? idx > boardingIdx : idx < boardingIdx;
  });

  return mask.some(Boolean) ? mask : null; // null = no valid stops, don't filter
}

const PredictionEngineV4 = {
  VERSION: '4.1',

  /**
   * Guess the next route given the current stop and time using the V4 Logistic Regression model.
   * @param {Object} context - { stopName, time }
   * @returns {Object|null} { route, confidence, version }
   */
  guess: function (context) {
    if (!context || !context.time) return null;

    const date = context.time instanceof Date ? context.time : new Date(context.time);
    const hour = date.getHours(); // 0-23
    
    // JS getDay is 0 (Sun) to 6 (Sat). Python weekday is 0 (Mon) to 6 (Sun).
    const pyDay = (date.getDay() + 6) % 7; 

    const hour_sin = Math.sin(2 * Math.PI * hour / 24);
    const hour_cos = Math.cos(2 * Math.PI * hour / 24);
    const day_sin = Math.sin(2 * Math.PI * pyDay / 7);
    const day_cos = Math.cos(2 * Math.PI * pyDay / 7);

    const cleanStop = context.stopName ? context.stopName.trim().toLowerCase() : '';
    const stopFeatureName = `stop_${cleanStop}`;

    // Build the feature vector 'x' based on exported model.feature_names
    const x = new Array(model.feature_names.length).fill(0);
    
    for (let i = 0; i < model.feature_names.length; i++) {
      const fn = model.feature_names[i];
      if (fn === 'hour_sin') x[i] = hour_sin;
      else if (fn === 'hour_cos') x[i] = hour_cos;
      else if (fn === 'day_sin') x[i] = day_sin;
      else if (fn === 'day_cos') x[i] = day_cos;
      else if (fn === stopFeatureName) x[i] = 1.0;
    }

    // Compute dot product (logits) for each class
    const logits = [];
    for (let c = 0; c < model.classes.length; c++) {
      let z = model.intercept[c];
      for (let f = 0; f < x.length; f++) {
        z += model.coef[c][f] * x[f];
      }
      logits.push(z);
    }

    // Apply Softmax to get probabilities
    const maxLogit = Math.max(...logits);
    let sumExp = 0;
    const exps = logits.map(z => {
      const e = Math.exp(z - maxLogit);
      sumExp += e;
      return e;
    });
    
    const probs = exps.map(e => e / sumExp);
    
    // Find highest probability route
    let bestIdx = 0;
    let bestProb = 0;
    for (let c = 0; c < probs.length; c++) {
      if (probs[c] > bestProb) {
        bestProb = probs[c];
        bestIdx = c;
      }
    }

    return {
      route: model.classes[bestIdx].toString(),
      confidence: Math.round(bestProb * 100),
      version: this.VERSION,
    };
  },

  /**
   * Return the top N route predictions sorted by probability descending.
   * @param {Object} context - { stopName, time }
   * @param {number} topN
   * @returns {Array} [{ route, confidence, version }]
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

    const cleanStop = context.stopName ? context.stopName.trim().toLowerCase() : '';
    const stopFeatureName = `stop_${cleanStop}`;

    const x = new Array(model.feature_names.length).fill(0);
    for (let i = 0; i < model.feature_names.length; i++) {
      const fn = model.feature_names[i];
      if (fn === 'hour_sin') x[i] = hour_sin;
      else if (fn === 'hour_cos') x[i] = hour_cos;
      else if (fn === 'day_sin') x[i] = day_sin;
      else if (fn === 'day_cos') x[i] = day_cos;
      else if (fn === stopFeatureName) x[i] = 1.0;
    }

    const logits = [];
    for (let c = 0; c < model.classes.length; c++) {
      let z = model.intercept[c];
      for (let f = 0; f < x.length; f++) z += model.coef[c][f] * x[f];
      logits.push(z);
    }

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
   * Predict top N exit stops using the V4 end stop logistic regression model.
   * Topology pre-filter zeros out directionally impossible stops before softmax.
   * @param {Object} context - { route, startStopName, direction, time }
   * @param {number} topN
   * @returns {Array} [{ stop, confidence, version }]
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

    const cleanStop  = context.startStopName.trim().toLowerCase();
    const cleanRoute = context.route ? context.route.toString().replace(/^(\d+).*/, '$1').toLowerCase() : '';

    const x = new Array(endStopModel.feature_names.length).fill(0);
    for (let i = 0; i < endStopModel.feature_names.length; i++) {
      const fn = endStopModel.feature_names[i];
      if (fn === 'hour_sin') x[i] = hour_sin;
      else if (fn === 'hour_cos') x[i] = hour_cos;
      else if (fn === 'day_sin') x[i] = day_sin;
      else if (fn === 'day_cos') x[i] = day_cos;
      else if (fn === `stop_${cleanStop}`) x[i] = 1.0;
      else if (fn === `route_${cleanRoute}`) x[i] = 1.0;
    }

    // Compute logits
    const logits = endStopModel.classes.map((_, c) => {
      let z = endStopModel.intercept[c];
      for (let f = 0; f < x.length; f++) z += endStopModel.coef[c][f] * x[f];
      return z;
    });

    // Topology pre-filter: zero out impossible stops before softmax
    const mask = topologyMask(context.route, context.startStopName, context.direction, endStopModel.classes);
    if (mask) mask.forEach((keep, i) => { if (!keep) logits[i] = -Infinity; });

    // Softmax
    const maxL = Math.max(...logits.filter(isFinite));
    let sumExp = 0;
    const exps = logits.map(z => { const e = isFinite(z) ? Math.exp(z - maxL) : 0; sumExp += e; return e; });
    const probs = exps.map(e => sumExp > 0 ? e / sumExp : 0);

    // Rank and return top N
    return probs
      .map((p, i) => ({ stop: endStopModel.classes[i], prob: p }))
      .filter(v => v.prob > 0)
      .sort((a, b) => b.prob - a.prob)
      .slice(0, topN)
      .map(v => ({ stop: v.stop, confidence: Math.round(v.prob * 100), version: this.VERSION }));
  },
};

module.exports = { PredictionEngineV4 };
