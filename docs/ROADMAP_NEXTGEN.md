# NextGen

R&D initiatives to transition TransitStats from a manual logging utility into a high-fidelity autonomous transit intelligence layer.

## The Objective

The engine's primary goal is to eliminate the "Friction" of transit tracking. This is achieved by modeling user habits, geographic stop entities, and real-time agency data into a unified autonomous agent that understands not just where you *were*, but where you are *going*.

---

## What Exists

- **`PredictionEngine` (V3)**: Weighted voting with recency decay, time-of-day similarity (Gaussian), and day-of-week similarity. Hand-coded scoring weights.
- **Silent Evaluation**: Real-time accuracy tracking for "Shadow Predictions" via the `predictionStats` collection.
- **`AccuracyDashboard`**: Internal tooling to monitor hit rates against the 90% production-readiness goal.
- **Stop Name Resolution**: Basic library-based fuzzy matching for text-to-coordinate conversion.
- **Trip Export Pipeline** (`ml/export_trips.py`): Pulls completed trip history from Firestore into a CSV for ML training.
- **TTC Topology** (`ml/topology.json`): Ordered stop sequences for Lines 1, 2, 4, 5 — used to filter directionally impossible predictions.
- **V4 Training Notebook** (`ml/predict_v4.ipynb`): Logistic regression classifier. 52% top-1 accuracy, 74% top-3 accuracy on held-out test set (385 trips, Jan–Apr 2026).

---

## Intelligence & Signals (Active)

Building the foundation of the user's transit model.

### 1. Habit Modeling
- [x] **Temporal Correlation**: Log trip start times to model recurring "Commute" windows.
- [x] **Route Stickiness**: Measure frequency of specific routes per start-stop pair.
- [ ] **Confidence-Based UI**: Implement dynamic suggestion cards once the 90% accuracy threshold is crossed in evaluation.

### 2. Semantic Stop Resolution (v2)
- [x] **Stop Library**: Basic canonical list of agency stops.
- [ ] **Proximity Clustering**: Grouping distinct GPS coordinates into logical "Transit Hubs" (e.g., Union Station as a single entity across various entrance coordinates).
- [ ] **Walking Distance Inference**: Modeling the path from a "Check-in" coordinate to the actual stop platform.

---

## Learned Prediction (ML)

Replacing hand-coded scoring weights with a model trained on actual trip history.

### 1. Feature Engineering
- [x] **Trip feature matrix**: Hour (sin/cos), day-of-week (sin/cos), start stop (one-hot encoded).
- [x] **Data export pipeline**: `ml/export_trips.py` — pulls Firestore trips to CSV.
- [x] **Topology constraint file**: `ml/topology.json` — ordered stop sequences for Lines 1, 2, 4, 5 for direction filtering.

### 2. Model Training — V4 (Logistic Regression)
- [x] **Baseline logistic regression**: 52% top-1, 74% top-3 on held-out test set. Strong on dominant routes (1, 2, 510).
- [x] **Feature importance analysis**: Model correctly learned route geography from trip history alone (e.g. Spadina Station → 510, York University → 1).
- [x] **Topology file**: `ml/topology.json` — ordered stop sequences for Lines 1, 2, 4, 5.

### 3. Inference Integration — V4 & V5
- [ ] **Cloud Function inference**: Load model weights, run prediction, return top-3 — for both V4 and V5.
- [x] **Topology constraint filter**: Applied at inference time in V3 engine — zero out directionally impossible end stop candidates using `topology.json` stop sequences. Lines 1, 2, 4, 5 covered. Line 1 handled with branch-aware logic (Yonge vs University branch, Union as turning point).
- [ ] **A/B shadow scoring**: Run V4 and V5 alongside V3 on every SMS prediction — log all results without changing user-facing output.
- [ ] **Feedback loop**: Log prediction outcomes (correct/incorrect) back to Firestore for continuous retraining signal.
- [ ] **Autonomous retraining**: Cloud Function that retrains V4 and V5 weekly from Firestore directly — no local steps, no notebook.
- [ ] **Retrain audit log**: Log each retrain (date, trip count, accuracy) to Firestore so model improvement is trackable.

### 4. Model Evolution — V5 (Gradient Boosted Tree)
- [x] **XGBoost classifier**: Benchmarked on same 385-trip dataset — 60.6% top-1 / 80.3% top-3 (+8.5pp / +5.6pp over V4). Same features, better algorithm.
- [ ] **Richer signals**: Previous route, time since last trip, week of term, holiday flag, weather, TTC service alerts — add as features and let the model determine relevance.
- [ ] **End stop prediction**: Train a separate classifier for end stop (not just route). V3 uses weighted voting for end stop; V4 and V5 currently only predict route. A dedicated end stop model would let V4/V5 shadow V3's end stop predictions and eventually replace them.
- [ ] **Replace V4** once V5 consistently outperforms in shadow scoring.

### 5. Model Evolution — V6 (Advanced ML)
- [ ] **GTFS service frequencies**: Route headways by time window (e.g. Line 1 runs every 2 min, Route 26 every 30 min). Enables the model to interpret trip gaps correctly — a 22-minute gap between a 2-min line and a 30-min line is a normal wait; the same gap between two 2-min lines is probably a stopover. Unlocks accurate transfer detection, journey linking, and anomaly detection in one addition.
- [ ] **Transfer vs. stopover classifier**: Use gap duration + transfer stop identity + route frequency + time of day to learn whether a gap between trips was a connection or a deliberate stop. Replaces the current fixed-threshold journey linking logic.
- [ ] **Autonomous retraining**: Same goal as V4/V5 — fully hands-off weekly retraining for V6.

---

## NetworkEngine Improvements

The NetworkEngine builds a stop-connection graph from observed trips and acts as the primary directional filter for end stop prediction. `topology.json` is a cold-start fallback only — NetworkEngine takes over once an edge has ≥3 observations.

- [ ] **Transitive reachability** — if A→B and B→C are both observed with sufficient confidence, infer A→C without requiring a direct observation. Reduces the number of trips needed before the graph is useful on a new route.
- [ ] **Hour-slot travel time buckets** — store edge durations bucketed by hour-of-day (`durationsByHour: { "7": [...], "8": [...] }`) instead of one flat pool. Use the current hour's bucket when ≥3 observations exist; fall back to the aggregate. Rush hour and off-peak travel times are currently conflated into one median.
- [ ] **Full stop sequence inference** — reconstruct ordered stop sequences from overlapping trip observations (A→B + B→C + C→D = inferred stop order). Eventually allows topology.json to be retired for all agencies, not just used as a TTC cold-start fallback.

---

## Autonomous Logging (NextGen)

Moving from "Pull" (SMS triggers) to "Push" (Background detection).

### 1. Zero-Touch Passive Logging
- [ ] **Geofence Integration**: Automatically detect entry/exit at high-probability transit hubs.
- [ ] **Motion-Sensing Signatures**: Using device accelerometer data to identify "Transit Motion" (distinct from walking or driving) to trigger passive logging.
- [ ] **Contextual Confirmation**: Use low-priority notifications to ask for trip confirmation rather than requiring an active login.

---

## Forward Intelligence (Vision)

Using platform-wide data to improve mobility.

### 1. Path Forecasting
- [ ] **Transfer Prediction**: Automatically identifying multi-leg journeys and predicting the likely second leg (e.g., matching a bus-to-subway transfer pattern).
- [ ] **Anomaly Detection**: Identifying real-world service gaps by comparing user trip durations against GTFS schedules in real-time.

---

[Back to Roadmap](../ROADMAP.md)
