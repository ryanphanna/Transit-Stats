# NextGen

R&D initiatives to transition TransitStats from a manual logging utility into a high-fidelity autonomous transit intelligence layer.

## The Objective

The engine's primary goal is to eliminate the "Friction" of transit tracking. This is achieved by modeling user habits, geographic stop entities, and real-time agency data into a unified autonomous agent that understands not just where you *were*, but where you are *going*.

---

## What Exists

- **`PredictionEngine` (V3)**: Weighted voting with recency decay, time-of-day similarity (Gaussian), and day-of-week similarity. Hand-coded scoring weights.
- **Parallel Evaluation**: Real-time accuracy tracking for candidate predictions via the `predictionStats` collection.
- **Accuracy analysis tooling**: `predictionStats`, export scripts, and audit tools for monitoring hit rates during model evaluation.
- **Stop Name Resolution**: Basic library-based fuzzy matching for text-to-coordinate conversion.
- **Trip Export Pipeline** (`ml/export_trips.py`): Pulls completed trip history from Firestore into a CSV for ML training.
- **Topology constraints** (`functions/lib/topology.json`): Ordered stop sequences and directional platform variants used as physical legality guardrails for end-stop prediction.
- **Route models (V4/V5)**: Shared export + training pipeline for logistic-regression and XGBoost route prediction, with route normalization and artifact export into `functions/lib/`.
- **End-stop models (V4/V5)**: Separate logistic-regression and XGBoost end-stop classifiers, trained from the same reviewed trip export and tracked in `ml/MODEL_LOG.md`.

---

## Intelligence & Signals (Active)

Building the foundation of the user's transit model.

### 1. Habit Engine
- [ ] **Habit change detection**: When observed trips start diverging from a known habit (new route, new start stop, different time window), flag the habit as stale and begin learning the replacement. Your Yonge arm commute starting today is exactly this — the model should notice the shift and adapt within a week of new trips.
- [ ] **Confidence-based UI**: Surface habit-matched predictions differently than ML predictions in the app — they warrant higher confidence display.

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
- [x] **End-stop shadow inference integration**: V4/V5 end-stop models now run in the trip-start path and store candidate predictions for evaluation while V3 remains user-facing.
- [ ] **End-stop user-facing promotion**: Calibrate V4/V5 end-stop confidence and promote only if scoped production slices consistently beat V3.

### 4. Model Evolution — V5 (Gradient Boosted Tree)
- [ ] **Richer external signals**: Week of term, holiday flag, weather, TTC service alerts, and route/service frequency — add as features and let the model determine relevance.
- [x] **Configurable agency route policies**: Route normalization now uses explicit per-agency policies in the Python training pipeline and JS inference helpers instead of hardcoded TTC-led assumptions.
- [ ] **Replace V4** once V5 consistently outperforms in candidate evaluation.

### 5. Model Evolution — V6 (Journey-Context ML)
- [x] **Define V6 as a journey-context engine, not just a larger V5**: Model trips as connected journey state rather than isolated rows. The first production-shadow evaluator uses previous-route/start-stop sequence context and beats V5 route accuracy on the scoped TTC SMS slice.
- [x] **Scoped V3→V4→V5→V6 promotion evaluator**: `ml/v6_eval_against_shadow.py` compares model generations on the same clean production trip windows and separates architectural capability from promotion evidence.
- [x] **V6 end-stop baseline**: The no-leakage evaluator now compares V6 destination suggestions against V3/V4/V5 under the same clean production trip scope.
- [x] **V6 end-stop lift beyond V3**: The topology-filtered V6 destination baseline now beats the live V3 end-stop path on the scoped TTC SMS slice, not just V4/V5.
- [ ] **Broader V6 validation**: Re-run V6 route + end-stop evaluation on larger and more recent slices before promotion.
- [ ] **Transfer vs. stopover classifier**: Use gap duration + transfer stop identity + route frequency + time of day to learn whether a gap between trips was a connection or a deliberate stop. Replaces the current fixed-threshold journey linking logic.
- [ ] **GTFS-informed constraints and features**: Use service frequency, route availability, and downstream-stop plausibility as side information or guardrails where they measurably help. Do not make raw GTFS the core model input by default.
- [ ] **Autonomous retraining**: Same goal as V4/V5 — fully hands-off weekly retraining for V6 once the feature set and evaluation slice are stable.
- [ ] **Confidence calibration**: The current V4/V5 models output probabilities that aren't well-calibrated — "80% confidence" doesn't mean the model is right 80% of the time. Apply temperature scaling or Platt scaling to the ONNX outputs so confidence scores are actually meaningful. Matters for the top-3 display and any threshold-based downstream logic.
- [ ] **Incremental/online learning**: Currently models retrain in batch when enough new data accumulates. An online learning approach would update model weights incrementally with each new trip, so the model improves in real-time rather than requiring a manual retrain cycle. Particularly valuable for capturing habit changes quickly.

---

## NetworkEngine Improvements

The NetworkEngine builds a stop-connection graph from observed trips and contributes learned reachability and duration signals. It is observational: topology/GTFS-derived constraints remain authoritative for covered routes and platforms, while NetworkEngine narrows inside that legal set or fills gaps where no physical topology exists yet.

- [x] **Transitive reachability** — if A→B and B→C are both observed with sufficient confidence, infer A→C without requiring a direct observation. Reduces the number of trips needed before the graph is useful on a new route.
- [x] **Hour-slot travel time buckets** — store edge durations bucketed by hour-of-day (`durationsByHour: { "7": [...], "8": [...] }`) instead of one flat pool. Use the current hour's bucket when enough observations exist; fall back to the aggregate.
- [ ] **Stop sequence inference productization** — `NetworkEngine.inferStopSequence()` can reconstruct likely stop order from overlapping observations. Next step is deciding where that experimental map is useful without letting it overrule GTFS/topology physical legality.
- [ ] **Duration prediction model** — NetworkEngine already collects median travel times per edge. A lightweight model on top could give per-trip duration estimates ("this trip will take about 18 minutes") using boarding stop, route, direction, and time-of-day. Useful for the app UI and as a signal in the "likely ended" trip detection logic.

---

## Global Intelligence

Taking the system beyond a single user's trip history.

- [ ] **Multi-user global model**: V4/V5 currently train on one user's trips. A shared model trained across all users would generalize far better — especially for cold-start on new routes, new stops, and unusual trip times. Even a global prior that gets fine-tuned per user would significantly outperform the current personal-data-only approach. Requires careful privacy handling (no raw trip data shared; aggregate patterns only).
- [ ] **Population-level stop intelligence**: Route-stop and transfer indexes already aggregate agency-level observations. Use and audit those indexes more broadly as supporting evidence for service-at-stop facts without letting them overrule GTFS/topology legality.
- [ ] **Agency-wide pattern sharing**: Transfer connections, typical trip durations, and stop sequences are objective facts about the transit network. These should be learned once from all users and shared, not re-learned independently per rider.

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

### 1. Journey Leg Prediction
- [ ] **Full journey destination prediction**: The current models predict the end stop of *this* trip. The smarter question is where you're going *today*. If you board the 510 at Spadina/Nassau on a weekday morning, the system should be able to predict "your final destination is Davisville — you'll transfer to Line 2 at Spadina, then Line 1 north." Multi-hop prediction built on top of TransferEngine and the NetworkEngine transfer index, which now provides the physical connection graph.
- [ ] **Next-leg suggestion**: After a trip ends at a known transfer stop, proactively surface the most likely next route — "You usually take Line 2 eastbound from here." Feeds from the transfer index connection counts.
- [ ] **Anomaly detection**: Identifying real-world service gaps by comparing user trip durations against NetworkEngine median times. A trip taking 3× its historical median is likely a delay worth flagging.

### 2. External Context
- [ ] **Weather signals**: Rain and extreme cold measurably shift transit behavior — people take transit more, choose different routes, and tolerate longer waits. Weather at trip start time as a feature for V5/V6 and for the Habit Engine's confidence scoring.
- [ ] **TTC service alerts**: When a line or route has an active service alert, prediction confidence should drop and the alert should surface in the UI. Requires polling the TTC real-time disruptions feed.
- [ ] **Calendar/holiday awareness**: Holidays and special events (Leafs games, etc.) break normal commute patterns entirely. A calendar signal in the model would prevent confidently wrong predictions on anomalous days.

---

[Back to Roadmap](./ROADMAP.md)
