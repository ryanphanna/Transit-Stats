# Transit Modeling Engine (NextGen)

R&D initiatives to transition TransitStats from a manual logging utility into a high-fidelity autonomous transit intelligence layer.

## The Objective

The engine's primary goal is to eliminate the "Friction" of transit tracking. This is achieved by modeling user habits, geographic stop entities, and real-time agency data into a unified autonomous agent that understands not just where you *were*, but where you are *going*.

---

## What Exists

- **`PredictionEngine`**: Core heuristic logic for route and end-stop estimation.
- **Silent Evaluation**: Real-time accuracy tracking for "Shadow Predictions" via the `predictionStats` collection.
- **`AccuracyDashboard`**: Internal tooling to monitor hit rates against the 90% production-readiness goal.
- **Stop Name Resolution**: Basic library-based fuzzy matching for text-to-coordinate conversion.

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
- [ ] **Trip feature matrix**: Encode each historical trip as a vector — hour (sin/cos), day-of-week (one-hot), start stop (encoded), previous route within 3h window.
- [ ] **Data export pipeline**: Script to pull trip history from Firestore into a format suitable for training (CSV or JSON).

### 2. Model Training
- [ ] **Baseline logistic regression**: Train a route classifier in a Python notebook using scikit-learn. Establish a benchmark accuracy against the current `PredictionEngine` on a held-out test set.
- [ ] **Feature importance analysis**: Understand which signals (time of day, day of week, stop, sequence) matter most in practice vs. what the hand-coded weights assumed.

### 3. Inference Integration
- [ ] **Model serialization**: Export trained weights to a format callable from JS or a Cloud Function.
- [ ] **A/B evaluation**: Run the learned model in parallel with `PredictionEngine` via shadow scoring — compare confidence and hit rate before replacing.
- [ ] **Feedback loop**: Log prediction outcomes (correct/incorrect) back to Firestore to enable continuous retraining as trip history grows.

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
