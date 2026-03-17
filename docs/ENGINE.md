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

## Files

| File | Module format | Use |
|---|---|---|
| `functions/lib/predict.js` | CommonJS | Cloud Functions (Node) |
| `js/predict.js` | ESM | Browser client |

Both files implement the same engine. Changes must be applied to both. The CJS version is the reference — apply changes there first, then mirror to ESM.
