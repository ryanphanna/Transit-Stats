# Production Accuracy Log

Live shadow mode accuracy snapshots from the `predictionAccuracy` Firestore collection.
Each entry is recorded before a counter reset. Complements [MODEL_LOG.md](./MODEL_LOG.md) (training accuracy).

**V3 counters are never reset** — V3 has no known accuracy bugs and its running total is a reliable cumulative record.

---

## Snapshot 1 — 2026-05-04 (Pre-Fix Baseline)

**Status: Discarded — not meaningful.**

V4/V5 were firing on all agencies regardless of the user's default agency. The disambiguation null gap also meant ~50% of trips had `predictionV4/V5: null` at grade time, scored as misses. Numbers are included for the record only.

| Metric | V3 | V4 | V5 |
|---|---|---|---|
| Route top-1 | 61/125 (49%) | 7/132 (5%) | 14/132 (11%) |
| Route partial hit | 9/125 (7%) | 0/132 (0%) | 9/132 (7%) |
| End stop top-1 | 54/95 (57%) | 7/129 (5%) | 9/129 (7%) |
| Duration end stop | 58/95 (61%) | — | — |

**Fixes applied before reset:**
- V4/V5 now gated on `profile.defaultAgency` — no longer fire on non-default-agency trips
- V4/V5 predictions now filled after stop disambiguation resolves (previously always null)
- `agency` field now written to all `predictionStats` documents

**Action:** V4/V5 counters reset to 0. V3 left intact.
