# Transit Modeling Engine (NextGen)

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
- [ ] **Autonomous retraining**: Cloud Function that retrains weekly from Firestore directly — no local steps required.
- [ ] **Retrain audit log**: Log each retrain (date, trip count, accuracy) to Firestore so model improvement is trackable.

### 3. Inference Integration — V4 Shadow Mode
- [ ] **Cloud Function inference**: Load V4 weights from Firestore, apply topology constraint filter, return top-3 predictions.
- [ ] **A/B shadow scoring**: Run V4 alongside V3 on every SMS prediction — log both results without changing user-facing output.
- [ ] **Feedback loop**: Log prediction outcomes (correct/incorrect) back to Firestore for continuous retraining signal.

### 4. Model Evolution — V5 (Gradient Boosted Tree)
- [ ] **XGBoost classifier**: Drop-in replacement for logistic regression. Discovers feature interactions automatically (e.g. stop + time-of-day combinations) without manual specification.
- [ ] **Richer signals**: Weather, TTC service alerts, time since last trip, calendar patterns — add as features and let the model determine relevance.
- [ ] **Replace V4** once V5 hit rate consistently exceeds V4 in shadow scoring.

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
