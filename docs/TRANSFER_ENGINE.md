# Transfer Engine

Engineering record for the TransitStats `TransferEngine`. Tracks what changed, why, and what signals are currently active.

Not a roadmap. Not a feature changelog. This is the internal notebook for the engine itself.

---

## Current Version: v1.0.0

**Problem it solved:** Journey linking used a single hardcoded rule — link any two trips within 60 minutes at the same stop. This linked unrelated trips (e.g. two separate 47 trips 31 minutes apart at the same stop) with no way to know whether the gap was a normal transfer or time between independent outings.

**Approach:** Confidence scoring from historical journey patterns. Extracts real transfers from trips sharing a `journeyId`, then scores a candidate pair against those patterns. Returns a confidence score (0–1); links only if score ≥ threshold.

### Active Signals

| Signal | Weight | What it does |
|---|---|---|
| **Stop pair match** | +0.40 | Checks whether this (endStop → startStop) pair has been a real transfer before. Primary signal. |
| **Gap vs historical average** | +0.25 / +0.10 | If gap ≤ 1.5× historical average for this stop pair: +0.25. If gap ≤ 1.2× historical max: +0.10. |
| **Route pair match** | +0.20 | Checks whether this (routeA → routeB) pair has been linked before. Used alongside stop pair for full confirmation; standalone if stop pair has no history. |
| **Time-of-day similarity** | +0.10 | Trips within ±2 hours of the historical transfer time boost confidence. |

**Route pair fallback** (when stop pair has no history):
- Route pair found → +0.25 base, +0.15 if gap within typical range
- No pattern at all → 0.5 if gap ≤ 10 min, 0.3 if ≤ 20 min, 0 otherwise

**Hard limits:** Gap < 0 → 0. Gap > 90 min → 0.

**Confidence threshold:** 0.55

**Cold start behaviour:** When no historical journeys exist, links only if gap ≤ 15 minutes (confidence 0.6). Conservative by design — better to miss a transfer than to link separate trips.

### Config

```js
CONFIDENCE_THRESHOLD: 0.55  // Minimum to auto-link
// Hard limits: gap < 0 or gap > 90 min → score = 0
// Cold start: gap <= 15 min → 0.6, else 0
```

---

## Version History

### v1.0.0 — *current*
**What changed:** Initial implementation. Replaced the hardcoded `gapMinutes <= 60` check in `handlers.js`. Fetches 100 recent completed trips (up from 5) to give the engine enough history to learn from.

**Files:**
| File | Purpose |
|---|---|
| `functions/lib/transfer.js` | Engine + scoring logic |
| `functions/test_transfer.js` | 15 tests covering extractTransfers, score, _stopMatch |

---

## Planned Improvements

### v2 — Day-of-week awareness
Transfers that make sense on weekday commutes (Mon–Fri 8–10am, 5–7pm) are likely real. Same route pair on a Sunday afternoon with a 30-minute gap is more likely two separate trips. Add day-of-week signal.

### v3 — Multi-leg journeys
Currently only looks at the most recent completed trip as a candidate. A journey could be 3+ legs. Need to find the best-scoring candidate across all recent trips, not just the first one that clears the threshold.

### v4 — External data
Transfer scoring informed by external signals:
- **TTC service disruptions**: a 25-minute gap at a station is expected if there's a signal delay
- **Weather**: longer gaps in bad weather are more plausible (waiting for shelter)
- **Time since last trip**: a 30-minute gap at 11pm is different from the same gap at 9am

See also: Prediction Engine v6 concept in ENGINE.md, which pursues external data integration for route prediction.
