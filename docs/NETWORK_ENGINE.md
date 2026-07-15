# Network Engine

Engineering record for the TransitStats `NetworkEngine`. Tracks what changed, why, and what signals are currently active.

Not a roadmap. Not a feature changelog. This is the internal notebook for the engine itself.

---

## Current Version

**Problem it solved:** topology.json required hand-curated stop sequences for every line. Branchy networks like BART couldn't be represented as a single linear sequence, so learned reachability and trip-duration signals needed a route-agnostic source. The engine builds that empirical graph from completed trips.

**Approach:** Learn the transit graph from completed trips only. Each trip is an observed edge: `fromStop → toStop` on a given route, direction, and agency, with a duration. After MIN_TRIPS observations on an edge, the engine trusts it as observational evidence. Works for any network without configuration — BART, Muni, LA Metro, future cities all build their graph automatically.

**Constraint role:** NetworkEngine is not the physical source of truth. Topology/GTFS-derived constraints are authoritative for covered routes and platforms, but they live outside the engine. NetworkEngine must not ingest GTFS, Atlas, or topology rows as graph observations; it can only narrow inside external legal sets or fill gaps from completed-trip evidence.

### Active Signals

| Signal | What it does |
|---|---|
| **Direct edge** | If `fromStop → toStop` has been observed MIN_TRIPS times in this direction, toStop is reachable |
| **Reverse edge inference** | If `toStop → fromStop` has been observed in the opposite direction, toStop is also considered reachable (e.g. B→A westbound implies A is reachable from B eastbound) |
| **Transitive reachability** | If A→B and B→C are observed in the same direction, A→C can be inferred without direct observation |
| **Hour-slot durations** | Edge durations are stored by hour as well as aggregate median, so trip-duration checks can use time-of-day where enough data exists |
| **Unknown stop passthrough** | Stops not seen in the graph are kept (don't over-filter new stops) |

**Confidence threshold:** MIN_TRIPS = 3 completed-trip observations before an edge is trusted. Stop source metadata and topology labels do not boost graph confidence.

**Duration tracking:** Each edge stores a rolling window of 50 observed durations plus hour-slot buckets. Median is computed and stored for aggregate and hour-aware duration checks.

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
**What changed:** Initial implementation. Added trip-observed reachability filtering for routes with sufficient history, with external topology constraints still available outside the engine when learned data is sparse.

**Current note:** That original priority has been superseded. The live prediction path now combines constraints with topology/GTFS as the authoritative physical guardrail and NetworkEngine as an observational narrowing signal. Those guardrails are applied outside NetworkEngine; they are not training data for the graph.

**Files:**
| File | Purpose |
|---|---|
| `functions/lib/network.js` | Engine: observe, load, filterCandidates |
| `functions/lib/predict_v3.js` | Combines topology/GTFS constraints with NetworkEngine reachability in `_preFilterCandidatesByTopology` |
| `functions/lib/handlers.js` | Calls `NetworkEngine.load()` at trip start, `NetworkEngine.observe()` at trip end |

Future work for network learning lives in [NEXTGEN.md](./roadmap/NEXTGEN.md).
