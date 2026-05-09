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
- **Route models (V4/V5)**: Shared export + training pipeline for logistic-regression and XGBoost route prediction, with route normalization and artifact export into `functions/lib/`.
- **End-stop models (V4/V5)**: Separate logistic-regression and XGBoost end-stop classifiers, trained from the same reviewed trip export and tracked in `ml/MODEL_LOG.md`.

---

## Intelligence & Signals (Active)

Building the foundation of the user's transit model.

### 1. Habit Modeling
- [ ] **Confidence-Based UI**: Implement dynamic suggestion cards once the 90% accuracy threshold is crossed in evaluation.

### 2. Semantic Stop Resolution (v2)
- [ ] **Proximity Clustering**: Grouping distinct GPS coordinates into logical "Transit Hubs" (e.g., Union Station as a single entity across various entrance coordinates).
- [ ] **Walking Distance Inference**: Modeling the path from a "Check-in" coordinate to the actual stop platform.

---

## Learned Prediction (ML)

Replacing hand-coded scoring weights with a model trained on actual trip history.

### 1. Feature Engineering
- [ ] **Richer feature matrix**: Expand beyond hour/day/start-stop fundamentals with stronger sequence, context, and service-level signals while keeping export semantics stable.

### 2. Model Training — V4 (Logistic Regression)
- [ ] **Model interpretability pass**: Improve tooling for understanding why route models choose one corridor over another, especially around overlapping TTC transfer hubs.

### 3. Inference Integration — V4 & V5
- [ ] **End-stop inference integration**: Promote the trained end-stop models from evaluation artifacts into the live prediction path so V4/V5 can shadow or replace V3 destination voting in production.

### 4. Model Evolution — V5 (Gradient Boosted Tree)
- [ ] **Richer signals**: Previous route, time since last trip, week of term, holiday flag, weather, TTC service alerts — add as features and let the model determine relevance.
- [ ] **Replace hand-coded route-family heuristics with configurable agency policies**: The current ML route normalization is shared and much cleaner than before, but still needs to evolve into a fully configurable per-agency policy layer instead of relying on TTC-led assumptions.
- [ ] **End-stop promotion**: V3 still owns the live end-stop path. Use the trained V4/V5 end-stop models to shadow, calibrate, and eventually replace the hand-coded end-stop engine where they consistently outperform it.
- [ ] **Replace V4** once V5 consistently outperforms in shadow scoring.

### 5. Model Evolution — V6 (Journey-Context ML)
- [ ] **Define V6 as a journey-context engine, not just a larger V5**: Model trips as connected journey state rather than isolated rows. Primary signals should be things like previous route, previous end stop, time since last trip, and whether the current start looks transfer-like.
- [ ] **Transfer vs. stopover classifier**: Use gap duration + transfer stop identity + route frequency + time of day to learn whether a gap between trips was a connection or a deliberate stop. Replaces the current fixed-threshold journey linking logic.
- [ ] **GTFS-informed constraints and features**: Use service frequency, route availability, and downstream-stop plausibility as side information or guardrails where they measurably help. Do not make raw GTFS the core model input by default.
- [ ] **Autonomous retraining**: Same goal as V4/V5 — fully hands-off weekly retraining for V6 once the feature set and evaluation slice are stable.

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
