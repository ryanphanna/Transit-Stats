# Transfer Engine

Engineering record for the TransitStats `TransferEngine`. Tracks what changed, why, and what signals are currently active.

Not a roadmap. Not a feature changelog. This is the internal notebook for the engine itself.

---

## Current Version

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

### v1.1.0
**What changed:** NetworkEngine transfer index wired in as a possibility signal. When `score()` falls into the "no historical pattern" branch, it now checks `routeStopIndex`/`transferIndex` (via `networkConnections` passed from handlers.js) for population-level evidence that this route pair connects at the boarding stop. A count ≥ 2 pushes the no-pattern confidence from 0.5 → 0.60 (gap ≤ 10 min) and 0.3 → 0.45 (gap ≤ 20 min), and extends the cold-start window from 15 → 20 minutes. Indexes build automatically — gets smarter with every trip.

**Files changed:** `functions/lib/transfer.js`, `functions/lib/handlers.js`

### v1.0.0
**What changed:** Initial implementation. Replaced the hardcoded `gapMinutes <= 60` check in `handlers.js`. Fetches 100 recent completed trips (up from 5) to give the engine enough history to learn from.

**Files:**
| File | Purpose |
|---|---|
| `functions/lib/transfer.js` | Engine + scoring logic |
| `functions/test_transfer.js` | 15 tests covering extractTransfers, score, _stopMatch |

Future work for transfer reasoning lives in [NEXTGEN.md](./roadmap/NEXTGEN.md).
