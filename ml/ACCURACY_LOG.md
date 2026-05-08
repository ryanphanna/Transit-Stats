# Production Accuracy Log

Live shadow mode accuracy snapshots from the `predictionAccuracy` Firestore collection.
Each entry is recorded before a counter reset. Complements [MODEL_LOG.md](./MODEL_LOG.md) (training accuracy).

**V3 counters are never reset** — V3 has no known accuracy bugs and its running total is a reliable cumulative record.

---

## Snapshot 2 — 2026-05-07 (v1.32.0 Brain Overhaul)

**Status: Highly Successful.**

This snapshot records the results after a massive refactor that gave V4 and V5 "Sequence Awareness" (access to `last_end_stop`) and "Stops Library Vision" (canonicalizing all aliases before training/inference). 

These changes, combined with a manual verification pass on ~100 historical trips, resulted in a leap from 5% to 60-70% accuracy.

| Metric | V3 (Heuristic) | V4 (LogReg) | V5 (XGBoost) |
|---|---|---|---|
| Route top-1 | ~48% | 52.0% | 58.8% |
| Route top-3 | — | 71.6% | 73.5% |
| End stop top-1 | ~57% | 60.0% | 74.0% |
| End stop top-3 | — | 92.0% | 96.0% |

**Fixes applied in this release:**
- **Sequence Integration**: All models now use `last_end_stop` to understand transfers.
- **Canonicalization**: Training and inference pipelines now share the `stopsLibrary` via `ml_utils.js`.
- **Task Alignment**: Separated Route and End-Stop models into distinct training paths.
- **Data Quality**: Manual verification pass improved ground-truth accuracy.

**Action:** V4/V5 are now performing significantly better than V3 in local tests. They will remain in Shadow Mode for 100 more trips to confirm production parity before V5 is promoted to primary.
