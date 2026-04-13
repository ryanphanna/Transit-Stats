# Prediction Engine

Engineering record for the TransitStats `PredictionEngine`. Tracks what changed, why, and what signals are currently active.

Not a roadmap (see [ROADMAP_NEXTGEN.md](./ROADMAP_NEXTGEN.md)). Not a feature changelog (see [CHANGELOG.md](../CHANGELOG.md)). This is the internal notebook for the engine itself.

---

## Current Version: v3

### Active Signals

| Signal | Where used | What it does |
|---|---|---|
| **Stop match** | `guess`, `guessEndStop` | Hard filters candidates to trips that started at the current stop (canonicalized). No match = no vote. |
| **GTFS route filter** | `guess` | Hard filters candidates to routes known to serve the boarding stop. Sourced from GTFS stop→route mapping. Falls back to unfiltered if no candidates survive (guards against stale data). |
| **Recency weight** | Both | Exponential decay with 20-day half-life. Recent trips vote harder than old ones. |
| **Time similarity** | Both | Gaussian centered on current time (σ = 1.5h). Trips at the same time of day score higher. |
| **Day similarity** | Both | Weekday/weekend boundary is a hard penalty (0.1×). Within weekdays, adjacent days score higher than distant ones. Within weekend, Sat/Sun score 0.7. |
| **Sequence boost** | `guess` | 1.5× multiplier applied when the last completed trip ended at the current boarding stop (i.e. this looks like a transfer). Window: 3 hours. |
| **Route family grouping** | `guess` | Variant suffixes stripped (510a, 510b → 510) so route variants pool votes rather than splitting signal. Returns most-voted specific variant within the winning family. |
| **Duration similarity** | `guessEndStop` | Gaussian on trip duration (σ = 5 min). Used to weight end-stop candidates when current trip duration is known mid-trip. |
| **Trip validity filter** | Both | Excludes malformed trips from the candidate pool — stop names that look like sentence fragments from bad SMS parses, routes with no digits that are probably partial words. |
| **Stop canonicalization** | Both | Aliases and spelling variants collapse to one canonical stop name via the stops library. Prevents the same stop from being treated as multiple distinct stops. |

### Config

```js
TIME_SIGMA_HOURS: 1.5       // Width of time-of-day Gaussian
DECAY_HALFLIFE_DAYS: 20     // Recency decay: a trip 20 days old votes at half weight
SEQUENCE_WINDOW_HOURS: 3    // How recent a prior trip must be to trigger sequence boost
SEQUENCE_BOOST: 1.5         // Multiplier applied at transfer points
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

### v3 — *current*
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

### v4 — *in shadow mode (not yet live)*
**Problem it solved:** V3's scoring weights are hand-coded constants (`TIME_SIGMA_HOURS: 1.5`, `DECAY_HALFLIFE_DAYS: 20`, etc.) chosen by intuition, not learned from actual trip data. The model cannot discover signals it wasn't explicitly told to look for.

**Approach:** Logistic regression classifier trained on historical trip data. Features: hour-of-day (sin/cos encoded), day-of-week (sin/cos encoded), start stop (one-hot encoded). Trained on 385 trips (Jan–Apr 2026) using scikit-learn. Weights exported to JSON and loaded by a Cloud Function at inference time.

**Results on held-out test set:**
- Top-1 accuracy: 52% (correct first guess)
- Top-3 accuracy: 74% (correct answer in top 3)
- Strong on dominant routes (1, 2, 510). Weak on rare routes with < 5 trips in history.

**What the model figured out on its own:** Correct geographic stop-to-route associations (Spadina Station → 510, York University → Line 1, Bay/St George → Line 2) purely from trip history — no GTFS, no topology given during training.

**Known ceiling:** Logistic regression only weights the features given to it. Cannot discover new signals or feature interactions on its own. V5 will address this with a gradient boosted tree (XGBoost).

**Topology constraint layer:** `ml/topology.json` stores ordered stop sequences for TTC Lines 1, 2, 4, 5. Applied at inference time to zero out directionally impossible candidates (e.g. boarding eastbound → can't exit at a western stop).

**Retraining:** Fully autonomous — Cloud Function retrains weekly from Firestore directly. Retrain history (date, trip count, accuracy) logged to Firestore.

**Files:**
| File | Purpose |
|---|---|
| `ml/export_trips.py` | Pulls Firestore trips to CSV for training |
| `ml/predict_v4.ipynb` | Training notebook (exploration + evaluation) |
| `ml/topology.json` | TTC line stop sequences for direction filtering |

---

### v5 — *planned*
**Problem it will solve:** Logistic regression can't find feature interactions or discover signals we haven't thought of. Accuracy ceiling is ~60-65% top-1 on this dataset.

**Approach:** XGBoost gradient boosted tree. Drop-in replacement — same features, same data pipeline. Discovers combinations like "York University + Monday morning = almost certainly Line 1 southbound" without being told. Richer signals to add: weather, TTC alerts, time since last trip, day of term/semester.

**Target:** Beat V4's 52% top-1 before replacing it in shadow mode.

---

## Files

| File | Module format | Use |
|---|---|---|
| `functions/lib/predict.js` | CommonJS | Cloud Functions (Node) |
| `js/predict.js` | ESM | Browser client |

Both files implement the same engine. Changes must be applied to both. The CJS version is the reference — apply changes there first, then mirror to ESM.
