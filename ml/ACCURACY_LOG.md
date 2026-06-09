# Production Accuracy Log

Live and candidate accuracy snapshots from the `predictionAccuracy` Firestore collection.
Each entry is recorded before a counter reset. Complements [MODEL_LOG.md](./MODEL_LOG.md) (training accuracy).

**V3 counters are never reset** — V3 has no known accuracy bugs and its running total is a reliable cumulative record.

**Current evaluation rule:** Do not use raw lifetime candidate counters by themselves to decide whether V4/V5 should replace V3. Historical dirty labels and non-TTC rows can pollute the broad totals. Promotion decisions should use a scoped candidate slice first:
- recent rows
- TTC only
- `source=sms`
- paired windows where V3, V4, and V5 all predicted the same trip outcome

---

## Snapshot 5 — 2026-06-09 (V5.6 — stop features fixed)

**Status: No new production data yet. Next audit after ~30 TTC trips.**

Critical bug discovered and fixed: all `stop_*` and `last_stop_*` features were zero in every production inference call since the models were introduced (feature names from Python had spaces/slashes, JS generated underscores — never matched). Models V5.6/V4.6 are the first versions where stop identity actually works in production. Expected significant improvement in production accuracy beyond what the direction fix alone achieved.

---

## Snapshot 4 — 2026-06-09 (Post direction-feature, pre-new-data)

**Status: Baseline before direction-aware model goes live.**

All stored `predictionStats` entries reflect old V4.4/V5.4 models (pre-direction). New trips starting today will use the direction-aware V4.4/V5.4 models. Re-audit after ~30 new TTC trips to see the improvement.

**Notable findings from audit:**
- `predictionStats` query was broken: `familyFromVersion` didn't handle `'v4-endstop'`/`'v5-endstop'` version strings — fixed in audit tool
- All recent V4/V5 predictions (May 26) predicted wrong stop; many predictions were 510 streetcar stops for Route 1 trips — topology mask was disabled because direction was null at prediction time
- Prediction block was silently broken May 28–June 9 (predict.js exported V5 instead of V3); fixed this session

**Audit command:**
```bash
node Tools/audit-prediction-shadow.js N8f5vS0sLjgjwxMCSUZUkVFv7ax2 --agency=TTC --source=sms
```

| Metric | V3 (Heuristic) | V4 (LogReg) | V5 (XGBoost) |
|---|---|---|---|
| Overall end-stop hit rate (all history) | 20/27 (74.1%) | 19/87 (21.8%) | 23/87 (26.4%) |
| Recent 30 end-stop hit rate | 5/6 (83.3%) | 0/12 (0.0%) | 0/12 (0.0%) |
| Paired end-stop hit rate (27 trips) | 20/27 (74.1%) | 10/27 (37.0%) | 9/27 (33.3%) |

**Conclusion:**
- V3 remains the live predictor at 74% paired.
- V4/V5 paired at ~35% — well below V3, but the historical data predates the direction fix.
- 0% recent rate reflects 12 consecutive misses from May 26 (old models, no direction signal).
- Re-audit after ~30 new trips to evaluate direction-aware model improvement.

---

## Snapshot 3 — 2026-05-09 (TTC Shadow Slice Baseline)

**Status: Not enough evidence to promote V5 yet.**

This snapshot reflects the new scoped candidate-evaluation workflow using:
- `agency=TTC`
- `source=sms`
- `since=2026-05-01`
- paired trip windows where V3, V4, and V5 all logged an end-stop prediction

The paired slice matters because broad historical candidate totals still include older dirty labels and non-TTC noise that are not relevant to the "should V5 replace V3 for live TTC end-stop suggestions?" decision.

**Audit command used:**
```bash
node ../Tools/audit-prediction-shadow.js N8f5vS0sLjgjwxMCSUZUkVFv7ax2 --agency=TTC --source=sms --since=2026-05-01
```

| Metric | V3 (Heuristic) | V4 (LogReg) | V5 (XGBoost) |
|---|---|---|---|
| TTC scoped overall end-stop hit rate | 5/6 (83.3%) | 10/30 (33.3%) | 14/30 (46.7%) |
| TTC recent 30 end-stop hit rate | 4/4 (100%) | 5/13 (38.5%) | 7/13 (53.8%) |
| TTC paired end-stop hit rate | 5/6 (83.3%) | 5/6 (83.3%) | 5/6 (83.3%) |

**Conclusion:**
- V3 remains the live end-stop predictor.
- V5 remains the only serious challenger worth tracking.
- V4 is still useful as a baseline, but not a promotion candidate.
- The paired TTC slice makes V5 look much healthier than the noisy lifetime stats, but the sample is still too small to justify promotion.

**Action:** Keep V3 live. Keep V5 in candidate evaluation. Re-run this TTC paired slice after more reviewed TTC trips accumulate before considering promotion.

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
