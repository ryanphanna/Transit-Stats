# Prediction Engine

Engineering record for the TransitStats prediction and inference engines. Tracks what changed, why, and what signals are currently active.

Not a roadmap (see [ROADMAP_NEXTGEN.md](./ROADMAP_NEXTGEN.md)). Not a feature changelog (see [CHANGELOG.md](../CHANGELOG.md)). This is the internal notebook for the engines themselves.

---

## Engine Inventory

| Engine | File | Type | What it does | Status |
|---|---|---|---|---|
| **PredictionEngine V3** | `functions/lib/predict.js` | Heuristic weighted voting | Predicts next route and end stop at trip start using recency, time-of-day, and day-of-week signals. Hand-coded weights. | Live (production) |
| **PredictionEngine V4** | `functions/lib/predict_v4.js` | Logistic regression (trained) | Same prediction task as V3; weights learned from trip history rather than hand-coded. Weights in `ml/model_v4.json`. | Shadow mode |
| **PredictionEngine V5** | `functions/lib/predict_v5.js` | XGBoost (trained, ONNX) | Same as V4; gradient boosted trees discover feature interactions LR can't. Model in `ml/model_v5.onnx`. | Shadow mode |
| **NetworkEngine** | `functions/lib/network.js` | Observed graph (Firestore) | Builds a stop-connection graph from completed trips. Filters directionally impossible end stop candidates. Primary filter — topology.json is the cold-start fallback only. Auto-updates at trip end. | Live |
| **TransferEngine** | `functions/lib/transfer.js` | Heuristic confidence scoring | Determines whether two consecutive trips are a transfer within one journey or two separate trips, using historical transfer patterns (stop pairs, route pairs, gap time, time-of-day). | Live |

**Retraining:** V4 and V5 require a manual retrain via `ml/predict_v4.ipynb` + `ml/export_trips.py` when enough new trips have accumulated. NetworkEngine and TransferEngine update passively from trip data — no retrain needed. See `ml/CLAUDE.md` for the retrain workflow.

---

## Current Version: v3.3.0

### Active Signals

| Signal | Where used | What it does |
|---|---|---|
| **Stop match** | `guess`, `guessEndStop` | Hard filters candidates to trips that started at the current stop (canonicalized). No match = no vote. |
| **GTFS route filter** | `guess` | Hard filters candidates to routes known to serve the boarding stop. Sourced from GTFS stop→route mapping. Falls back to unfiltered if no candidates survive (guards against stale data). |
| **Recency weight** | Both | Exponential decay by same-agency ride count. A trip 100 same-agency rides ago votes at half weight. Being in another city does not decay home network predictions. |
| **Time similarity** | Both | Gaussian centered on current time (σ = 1.5h). Trips at the same time of day score higher. |
| **Day similarity** | Both | Weekday/weekend boundary is a hard penalty (0.1×). Within weekdays, adjacent days score higher than distant ones. Within weekend, Sat/Sun score 0.7. |
| **Sequence boost** | `guess` | 1.5× multiplier applied when the last completed trip ended at the current boarding stop (i.e. this looks like a transfer). Window: 3 hours. |
| **Route family grouping** | `guess` | Variant suffixes stripped (510a, 510b → 510) so route variants pool votes rather than splitting signal. Returns most-voted specific variant within the winning family. |
| **Duration similarity** | `guessEndStop` | Gaussian on trip duration (σ = 5 min). Used to weight end-stop candidates when current trip duration is known mid-trip. |
| **Trip validity filter** | Both | Excludes malformed trips from the candidate pool — stop names that look like sentence fragments from bad SMS parses, routes with no digits that are probably partial words. |
| **Stop canonicalization** | Both | Aliases and spelling variants collapse to one canonical stop name via the stops library. Prevents the same stop from being treated as multiple distinct stops. |

### Config

```js
TIME_SIGMA_HOURS: 1.5        // Width of time-of-day Gaussian
DECAY_HALFLIFE_RIDES: 100    // Recency decay: a trip 100 same-agency rides ago votes at half weight
SEQUENCE_WINDOW_HOURS: 3     // How recent a prior trip must be to trigger sequence boost
SEQUENCE_BOOST: 1.5          // Multiplier applied at transfer points
```

---

## Version History

### v1
**Problem it solved:** Initial working prototype. Needed something to produce a route guess at trip start.

**Approach:** Additive point scoring across 5 signals: location match, sequence match, time of day, day of week, frequency.

**What actually worked:** Time, day, and frequency only. Location matching was dead (no coordinate normalization). Sequence matching was broken (checked the wrong field on the trip object). In practice the engine was a frequency + time-of-day model.

---

### v2
**Problem it solved:** Additive scoring treated all signals as equally stackable — a trip that matched 3 weak signals could outscore a trip that matched 1 strong signal. Also, candidates weren't filtered to the current stop first, so the engine was voting on trips from completely different stops.

**Approach:** Stop-first candidate filtering. Switched to multiplicative weighted voting: each past trip casts one vote for its `(route, direction)` pair with weight = `recency × time_similarity × day_similarity`. Sequence matching fixed: checks whether the last trip's end stop matches the current boarding stop, applies a flat 1.5× boost. No location dependency.

**What actually worked:** Everything. The multiplicative formulation meant a trip had to match on all dimensions to score high, not just accumulate points from weak matches.

---

### v3.3.0 — *current*
**What changed from v3.2:** Recency decay axis changed from calendar time to same-agency ride count. Previously, a week travelling in LA decayed TTC predictions — the engine treated elapsed time as evidence of pattern change, even when the pattern hadn't changed at all. Now each trip's weight decays based on how many same-agency rides occurred after it. `DECAY_HALFLIFE_RIDES: 100` means a trip 100 TTC rides ago votes at half the weight of the most recent trip. Being in a different city no longer ages your home network predictions.

### v3.2.0
**What changed from v3.1.1:** NetworkEngine integrated as a higher-priority directional filter. At trip start, the learned graph for the current route is loaded and used to pre-filter end stop candidates before topology.json. Falls back to topology.json when fewer than 3 trips observed on an edge. Reverse-edge inference: B→A westbound implies A is reachable from B eastbound.

### v3.1.1 — *previously current*
**What changed from v3.1:** Topology filter moved upstream — candidate trips are now pre-filtered by topology before voting, not post-filtered after. Impossible destinations are eliminated before the model scores anything. Same fallback behaviour (unfiltered if no candidates survive).

### v3.1
**What changed from v3:** Topology constraint filter added to end stop prediction. Stop names canonicalized via stops library before topology index lookup. Networks expanded to TTC Lines 1–5, LA Metro B/D/A/E, BART, Muni N/T. Route alias resolution added — "Line 1", "Red Line", "N Judah" etc. resolve to correct topology entry without exact key match. `VERSION` bumped to 3.1 so predictionStats logs distinguish pre/post-filter predictions.

### v3
**Problems it solved:**
1. The same physical stop logged under slightly different names ("King St W / Bathurst" vs "King / Bathurst") was being treated as two separate stops, splitting the vote signal.
2. Day similarity used a flat 0.5 for any non-matching weekday pair, which didn't distinguish between "Tuesday vs Wednesday" and "Monday vs Friday."
3. Malformed trips from bad SMS parses were polluting the candidate pool and casting noise votes.
4. Route variants (510, 510a, 510b) were competing against each other rather than pooling.
5. Direction strings from different sources (nb, northbound, north, N) weren't normalizing to the same value, causing mismatches.
6. No guard against the engine predicting routes that don't physically serve the boarding stop.

**Changes:**
- Stop canonicalization via stops library (aliases collapse to canonical name; lazy-built index for performance).
- Day similarity is now distance-based within weekdays: 1 day apart → 0.85, 4 days apart → 0.40. Weekend/weekday boundary stays at 0.1.
- Trip validity filter added (excludes sentence-fragment stop names, routes with no digits).
- Route family grouping: variants strip to base number for vote pooling; most-voted specific variant returned.
- Direction normalization: nb/northbound/north/N all map to "Northbound" before comparison.
- GTFS stop→route hard filter: candidates pruned to routes that actually serve the boarding stop. Fallback to unfiltered if no candidates survive.

---

---

### v4.1 — *shadow mode*
**What changed from v4:** End stop prediction added (`guessTopEndStops`). Trained a separate logistic regression classifier on 114 trips (11 end stop classes). Features: route (one-hot), start stop (one-hot), hour (sin/cos), day (sin/cos). Topology pre-filter applied before softmax — impossible stops zeroed out before probabilities are computed. Top-1: 39%, Top-3: 87%.

### v4 — *shadow mode*
**Problem it solved:** V3's scoring weights are hand-coded constants (`TIME_SIGMA_HOURS: 1.5`, `DECAY_HALFLIFE_DAYS: 20`, etc.) chosen by intuition, not learned from actual trip data. The model cannot discover signals it wasn't explicitly told to look for.

**Approach:** Logistic regression classifier trained on historical trip data. Features: hour-of-day (sin/cos encoded), day-of-week (sin/cos encoded), start stop (one-hot encoded). Trained on 385 trips (Jan–Apr 2026) using scikit-learn. Weights exported to JSON and loaded by a Cloud Function at inference time.

**Results on held-out test set:**
- Top-1 accuracy: 52% (correct first guess)
- Top-3 accuracy: 74% (correct answer in top 3)
- Strong on dominant routes (1, 2, 510). Weak on rare routes with < 5 trips in history.

**What the model figured out on its own:** Correct geographic stop-to-route associations (Spadina Station → 510, York University → Line 1, Bay/St George → Line 2) purely from trip history — no GTFS, no topology given during training.

**Known ceiling:** Logistic regression only weights the features given to it. Cannot discover new signals or feature interactions on its own. V5 will address this with a gradient boosted tree (XGBoost).

**What's built:**
- Training notebook + weights (`ml/predict_v4.ipynb`, `ml/model_v4.json`)
- Trip export pipeline (`ml/export_trips.py`)
- Topology file (`ml/topology.json`) — ordered stop sequences for Lines 1, 2, 4, 5

**Still to build:**
- Cloud Function inference (load weights, run prediction, return top-3)
- Autonomous weekly retraining from Firestore (no manual steps)
- Retrain audit log (date, trip count, accuracy) to Firestore

**Files:**
| File | Purpose |
|---|---|
| `ml/export_trips.py` | Pulls Firestore trips to CSV for training |
| `ml/predict_v4.ipynb` | Training notebook (exploration + evaluation) |
| `ml/model_v4.json` | Trained logistic regression weights |
| `ml/topology.json` | TTC line stop sequences for direction filtering |

---

### v5.1 — *shadow mode*
**What changed from v5:** End stop prediction added (`guessTopEndStops`). Trained a separate XGBoost classifier on same 114-trip dataset (11 end stop classes). Same features as V4.1. Topology pre-filter applied before reading ONNX probabilities — zeroed out, renormalized, then ranked. Top-1: 48%, Top-3: 96%.

### v5 — *shadow mode*
**Problem it solved:** Logistic regression can't find feature interactions or discover signals we haven't thought of.

**Approach:** XGBoost gradient boosted tree. Drop-in replacement — same features, same data pipeline. Discovers combinations like "York University + Monday morning = almost certainly Line 1 southbound" without being told.

**Results (same 385-trip dataset, same train/test split as V4):**
- Top-1 accuracy: 60.6% (+8.5pp over V4)
- Top-3 accuracy: 80.3% (+5.6pp over V4)
- Config: n_estimators=200, max_depth=4, learning_rate=0.1

**What's built:**
- ONNX model (`ml/model_v5.onnx`) running in shadow mode alongside V3 and V4
- Graded and logged to `predictionStats` at trip end

**Still to build:**
- Richer signals: time since last trip, week of term, holiday flag, weather, TTC service alerts
- Autonomous weekly retraining from Firestore
- Retrain audit log to Firestore
- Replace V4 once V5 consistently outperforms in shadow scoring

---

## Files

| File | Module format | Use |
|---|---|---|
| `functions/lib/predict.js` | CommonJS | Cloud Functions (Node) |
| `js/predict.js` | ESM | Browser client |

Both files implement the same engine. Changes must be applied to both. The CJS version is the reference — apply changes there first, then mirror to ESM.

---

## Concept: v6 — External Data Sources

**Core idea:** The engine can request information beyond trip history. Instead of only learning from what you've done, v6 pulls in external signals at inference time to inform predictions.

**Candidate sources:**
- **Weather** — rain/snow affects which routes you take and where you board
- **TTC service alerts** — disruptions make certain routes or stops unlikely
- **Calendar/events** — concerts, games, holidays shift your travel patterns
- **Time since last trip** — gap context that pure history can't see

**What this requires:**
- A signal-fetching layer that pulls external data at trip start (low-latency, cached)
- Feature engineering to encode external signals alongside existing trip features
- Retraining pipeline that includes external features in the training set

**Why it's a new version and not an add-on to v5:** Adding new feature types to an ONNX model requires retraining from scratch with the new schema. The model file and inference code both change.

**Status:** Concept only. No training data collection yet.
