/**
 * TransitStats Prediction Engine V5 (XGBoost via ONNX)
 *
 * Runs in parallel with V3 and V4 (Shadow Mode).
 * Model trained via ml/predict_v4.ipynb (cell 4b).
 */

const path = require('path');
const meta = require('./model_v5_meta.json');

let _session = null;

async function getSession() {
  if (_session) return _session;
  const ort = require('onnxruntime-node');
  _session = await ort.InferenceSession.create(
    path.join(__dirname, 'model_v5.onnx')
  );
  return _session;
}

const PredictionEngineV5 = {
  VERSION: 5,

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
};

module.exports = { PredictionEngineV5 };
