/**
 * TransitStats Prediction Engine Compatibility Layer
 *
 * PredictionEngine = V3 (heuristic frequency voting).
 * V3 provides guess(), guessEndStop(), guessTopEndStops(), and getEndStopConstraint(),
 * which handlers-trip.js calls directly. V4/V5 run alongside via their own imports.
 */

const { PredictionEngineV3 } = require('./predict_v3');

const PredictionEngine = PredictionEngineV3;

module.exports = { PredictionEngine };
