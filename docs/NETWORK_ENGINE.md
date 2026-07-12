# Network Engine

Engineering record for the TransitStats `NetworkEngine`. Tracks what changed, why, and what signals are currently active.

Not a roadmap. Not a feature changelog. This is the internal notebook for the engine itself.

---

## Current Version

**Problem it solved:** topology.json required hand-curated stop sequences for every line. Branchy networks like BART couldn't be represented as a single linear sequence, so directional filtering either broke or required per-station workarounds. The engine would bleed wrong-direction predictions (e.g. westbound stops when heading eastbound) whenever historical trips in that direction were absent.

**Approach:** Learn the transit graph from completed trips. Each trip is an observed edge: `fromStop → toStop` on a given route, direction, and agency, with a duration. After MIN_TRIPS observations on an edge, the engine trusts it for prediction filtering. Works for any network without configuration — BART, Muni, LA Metro, future cities all build their graph automatically.

**Priority:** NetworkEngine runs before topology.json. If it has sufficient data, topology.json is bypassed entirely for that route. If data is insufficient, topology.json takes over as the fallback.

### Active Signals

| Signal | What it does |
|---|---|
| **Direct edge** | If `fromStop → toStop` has been observed MIN_TRIPS times in this direction, toStop is reachable |
| **Reverse edge inference** | If `toStop → fromStop` has been observed in the opposite direction, toStop is also considered reachable (e.g. B→A westbound implies A is reachable from B eastbound) |
| **Unknown stop passthrough** | Stops not seen in the graph are kept (don't over-filter new stops) |

**Confidence threshold:** MIN_TRIPS = 3 observations before an edge is trusted.

**Duration tracking:** Each edge stores a rolling window of 50 observed durations. Median is computed and stored. Currently informational — used in v2 for distance-based stop ordering.

### Config

```js
MIN_TRIPS: 3  // Observations before edge is trusted for filtering
// Duration window: last 50 observations per edge
```

### Data Model

```
Firestore: networkGraph/{userId}_{agency}_{route}
{
  userId, agency, route,
  edges: {
    "{fromStop}__{direction}__{toStop}": {
      fromStop, toStop, direction,
      durations: [8, 9, 7, ...],   // rolling window of 50
      tripCount: 15,
      medianMinutes: 8,
      updatedAt: ISO string
    }
  }
}
```

One document per user/agency/route combination. Edges are keyed by normalized `fromStop__direction__toStop`.

---

## Version History

### v1.0.0
**What changed:** Initial implementation. Replaces topology.json filtering for any route with sufficient trip history. Falls back to topology.json when data is sparse.

**Files:**
| File | Purpose |
|---|---|
| `functions/lib/network.js` | Engine: observe, load, filterCandidates |
| `functions/lib/predict.js` | Calls NetworkEngine before topology.json in `_preFilterCandidatesByTopology` |
| `functions/lib/handlers.js` | Calls `NetworkEngine.load()` at trip start, `NetworkEngine.observe()` at trip end |

Future work for network learning lives in [NEXTGEN.md](./roadmap/NEXTGEN.md).
