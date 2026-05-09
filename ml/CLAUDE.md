# ML Directory — Claude Instructions

Training pipeline for the TransitStats Prediction Engine.

## Files

| File | Purpose |
|---|---|
| `export_trips.py` | Pulls completed trips from Firestore → `trips.csv` |
| `trips.csv` | Training data (gitignored) |
| `train_routes.py` | Trains/evaluates V4 and V5 route models and exports artifacts |
| `train_endstop.py` | Trains/evaluates V4 and V5 end-stop models and exports artifacts |
| `route_normalization.py` | Shared ML route normalization rules used by training/export |
| `model_v4.json` | Exported V4 route weights — loaded by `functions/lib/predict_v4.js` |
| `model_v4_endstop.json` | Exported V4 end-stop weights — loaded by `functions/lib/predict_v4.js` |
| `model_v5.onnx` | Exported V5 route ONNX model — loaded by `functions/lib/predict_v5.js` |
| `model_v5_endstop.onnx` | Exported V5 end-stop ONNX model — loaded by `functions/lib/predict_v5.js` |
| `topology.json` | TTC Lines 1/2/4/5 ordered stop sequences for direction filtering |
| `calibrate_v4.py` | Calibration script |
| `../Tools/audit-prediction-shadow.js` | Firestore shadow-audit tool for comparing V3/V4/V5 on scoped slices |

## How to Retrain

1. Export fresh trip data:
   ```
   GRPC_DNS_RESOLVER=native python3 export_trips.py
   ```
   Credentials: `~/Desktop/Dev/Credentials/Firebase for Transit Stats.json`

2. Train route models:
   ```
   GRPC_DNS_RESOLVER=native python3 train_routes.py
   ```

3. Train end-stop models:
   ```
   GRPC_DNS_RESOLVER=native python3 train_endstop.py
   ```

4. If needed, recalibrate the V4 JSON exports:
   ```
   python3 calibrate_v4.py
   ```

5. Route and end-stop artifacts are written into `ml/` and mirrored into `functions/lib/` by the training scripts. Do not hand-copy notebook exports.

## Shadow Evaluation

- Live destination suggestions still come from V3.
- V4 and V5 run in shadow mode and are graded into `predictionStats`.
- Use the shadow audit tool to evaluate scoped slices before considering any promotion:
  ```
  node ../Tools/audit-prediction-shadow.js <userId> --agency=TTC --source=sms --since=2026-05-01
  ```
- Prefer paired or tightly scoped comparisons over raw lifetime counters when historical dirty data may pollute the logs.

## Environment

- `GRPC_DNS_RESOLVER=native` is required — gRPC's c-ares resolver fails DNS on Python 3.14.
- Key packages: `scikit-learn`, `xgboost`, `pandas`, `numpy`, `firebase-admin`

## Logs

- `MODEL_LOG.md` — training accuracy per version (held-out test sets)
- `ACCURACY_LOG.md` — live production shadow accuracy snapshots; record here before any `predictionAccuracy` counter reset
