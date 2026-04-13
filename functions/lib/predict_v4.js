/**
 * TransitStats Prediction Engine V4 (Logistic Regression)
 * 
 * Runs in parallel with V3 (Shadow Mode).
 * Uses weights trained via ml/predict_v4.ipynb.
 */

const model = require('./model_v4.json');

const PredictionEngineV4 = {
  VERSION: 4,

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
  }
};

module.exports = { PredictionEngineV4 };
