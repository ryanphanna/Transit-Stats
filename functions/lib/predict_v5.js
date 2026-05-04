/**
 * TransitStats Prediction Engine V5 (XGBoost via ONNX)
 *
 * Runs in parallel with V3 and V4 (Shadow Mode).
 * Model trained via ml/predict_v4.ipynb (cell 4b).
 */

const path = require('path');
const meta = require('./model_v5_meta.json');
const endStopMeta = require('./model_v5_endstop_meta.json');

let _session = null;
let _endStopSession = null;

let _topology = null;
try { _topology = require('./topology.json'); } catch (e) {}

async function getSession() {
  if (_session) return _session;
  const ort = require('onnxruntime-node');
  _session = await ort.InferenceSession.create(path.join(__dirname, 'model_v5.onnx'));
  return _session;
}

async function getEndStopSession() {
  if (_endStopSession) return _endStopSession;
  const ort = require('onnxruntime-node');
  _endStopSession = await ort.InferenceSession.create(path.join(__dirname, 'model_v5_endstop.onnx'));
  return _endStopSession;
}

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
    goingHigher = boardingIdx <= unionIdx
      ? ['south','s','sb'].includes(normDir)
      : ['north','n','nb'].includes(normDir);
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

const PredictionEngineV5 = {
  VERSION: '5.1',

  /**
   * Guess the next route using the V5 XGBoost model.
   * @param {Object} context - { stopName, time }
   * @returns {Promise<Object|null>} { route, confidence, version }
   */
  guess: async function (context) {
    if (!context || !context.time) return null;

    const date = context.time instanceof Date ? context.time : new Date(context.time);
    const hour = date.getHours();
    const pyDay = (date.getDay() + 6) % 7;

    const hour_sin = Math.sin(2 * Math.PI * hour / 24);
    const hour_cos = Math.cos(2 * Math.PI * hour / 24);
    const day_sin  = Math.sin(2 * Math.PI * pyDay / 7);
    const day_cos  = Math.cos(2 * Math.PI * pyDay / 7);

    const cleanStop = context.stopName ? context.stopName.trim().toLowerCase() : '';
    const stopFeature = `stop_${cleanStop}`;

    // Build float32 feature vector in same column order as training
    const x = new Float32Array(meta.feature_names.length);
    for (let i = 0; i < meta.feature_names.length; i++) {
      const fn = meta.feature_names[i];
      if      (fn === 'hour_sin')    x[i] = hour_sin;
      else if (fn === 'hour_cos')    x[i] = hour_cos;
      else if (fn === 'day_sin')     x[i] = day_sin;
      else if (fn === 'day_cos')     x[i] = day_cos;
      else if (fn === stopFeature)   x[i] = 1.0;
    }

    try {
      const ort = require('onnxruntime-node');
      const session = await getSession();
      const tensor = new ort.Tensor('float32', x, [1, meta.feature_names.length]);
      const results = await session.run({ float_input: tensor });

      // probabilities is a flat Float32Array of shape [1, n_classes]
      const probs = results.probabilities.data;
      let bestIdx = 0;
      let bestProb = 0;
      for (let i = 0; i < probs.length; i++) {
        if (probs[i] > bestProb) {
          bestProb = probs[i];
          bestIdx = i;
        }
      }

      return {
        route: String(meta.classes[bestIdx]),
        confidence: Math.round(bestProb * 100),
        version: this.VERSION,
      };
    } catch (err) {
      console.error('[V5] Inference error:', err.message);
      return null;
    }
  },

  /**
   * Return the top N route predictions sorted by probability descending.
   * @param {Object} context - { stopName, time }
   * @param {number} topN
   * @returns {Promise<Array>} [{ route, confidence, version }]
   */
  guessTopRoutes: async function (context, topN = 5) {
    if (!context || !context.time) return [];

    const date = context.time instanceof Date ? context.time : new Date(context.time);
    const hour = date.getHours();
    const pyDay = (date.getDay() + 6) % 7;

    const hour_sin = Math.sin(2 * Math.PI * hour / 24);
    const hour_cos = Math.cos(2 * Math.PI * hour / 24);
    const day_sin  = Math.sin(2 * Math.PI * pyDay / 7);
    const day_cos  = Math.cos(2 * Math.PI * pyDay / 7);

    const cleanStop = context.stopName ? context.stopName.trim().toLowerCase() : '';
    const stopFeature = `stop_${cleanStop}`;

    const x = new Float32Array(meta.feature_names.length);
    for (let i = 0; i < meta.feature_names.length; i++) {
      const fn = meta.feature_names[i];
      if      (fn === 'hour_sin')  x[i] = hour_sin;
      else if (fn === 'hour_cos')  x[i] = hour_cos;
      else if (fn === 'day_sin')   x[i] = day_sin;
      else if (fn === 'day_cos')   x[i] = day_cos;
      else if (fn === stopFeature) x[i] = 1.0;
    }

    try {
      const ort = require('onnxruntime-node');
      const session = await getSession();
      const tensor = new ort.Tensor('float32', x, [1, meta.feature_names.length]);
      const results = await session.run({ float_input: tensor });
      const probs = results.probabilities.data;

      return Array.from(probs)
        .map((p, i) => ({ route: String(meta.classes[i]), confidence: Math.round(p * 100), version: this.VERSION }))
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, topN);
    } catch (err) {
      console.error('[V5] guessTopRoutes error:', err.message);
      return [];
    }
  },

  /**
   * Predict top N exit stops using the V5 XGBoost end stop model.
   * Topology pre-filter zeros out impossible stops before reading probabilities.
   * @param {Object} context - { route, startStopName, direction, time }
   * @param {number} topN
   * @returns {Promise<Array>} [{ stop, confidence, version }]
   */
  guessTopEndStops: async function (context, topN = 3) {
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

    const x = new Float32Array(endStopMeta.feature_names.length);
    for (let i = 0; i < endStopMeta.feature_names.length; i++) {
      const fn = endStopMeta.feature_names[i];
      if      (fn === 'hour_sin')            x[i] = hour_sin;
      else if (fn === 'hour_cos')            x[i] = hour_cos;
      else if (fn === 'day_sin')             x[i] = day_sin;
      else if (fn === 'day_cos')             x[i] = day_cos;
      else if (fn === `stop_${cleanStop}`)   x[i] = 1.0;
      else if (fn === `route_${cleanRoute}`) x[i] = 1.0;
    }

    try {
      const ort = require('onnxruntime-node');
      const session = await getEndStopSession();
      const tensor = new ort.Tensor('float32', x, [1, endStopMeta.feature_names.length]);
      const results = await session.run({ float_input: tensor });
      const probs = Array.from(results.probabilities.data);

      // Topology pre-filter: zero out impossible stops
      const mask = topologyMask(context.route, context.startStopName, context.direction, endStopMeta.classes);
      if (mask) mask.forEach((keep, i) => { if (!keep) probs[i] = 0; });

      // Renormalize and rank
      const total = probs.reduce((s, p) => s + p, 0);
      return probs
        .map((p, i) => ({ stop: endStopMeta.classes[i], prob: total > 0 ? p / total : 0 }))
        .filter(v => v.prob > 0)
        .sort((a, b) => b.prob - a.prob)
        .slice(0, topN)
        .map(v => ({ stop: v.stop, confidence: Math.round(v.prob * 100), version: this.VERSION }));
    } catch (err) {
      console.error('[V5 endstop] Inference error:', err.message);
      return [];
    }
  },
};

module.exports = { PredictionEngineV5 };
