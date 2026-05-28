/**
 * TransitStats Prediction Engine Compatibility Layer
 *
 * Re-exports V5 (XGBoost) as the primary PredictionEngine.
 * V3 (heuristic voting) runs in shadow mode for fallback/comparison.
 * V4 (logistic regression) retained for legacy support.
 */

const { PredictionEngineV5 } = require('./predict_v5');

// Primary model: V5 (XGBoost with prev_route + transfer_rarity features)
// Accuracy: 79.8% on temporal holdout (62 training trips, 16 test trips)
const PredictionEngine = PredictionEngineV5;

module.exports = { PredictionEngine };
