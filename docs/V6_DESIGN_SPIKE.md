# V6 Prediction Engine — Initial Spike (2026-05-27)

**Goal of this spike:** Small, low-risk analysis to decide the best first direction for Prediction Engine V6, leveraging the new background finalization + journey linking architecture.

## Key Findings from Recent Logs

### Accuracy Reality (ACCURACY_LOG + MODEL_LOG)
- V5 (XGBoost) is the strongest candidate but remains in shadow mode.
- Recent scoped TTC paired slices show V5 competitive with V3 on end-stops, but sample sizes are still small.
- Adding sequence features (`last_end_stop`, `prev_route`, gap) helped V4 more visibly than V5 in some training runs.
- Top misses continue to cluster around:
  - Transfer points / multi-leg journeys
  - Overlapping TTC corridors (1/2/510/506 family)
  - Short vs long versions of the same physical route
- V3 (heuristic + topology) remains surprisingly strong on clean, high-review data.

### Current Architecture Limitations
- V5 already receives *some* sequence signals (last end stop, prev route, gap) via context passed from handlers.
- However, it is still fundamentally a **flat, single-trip classifier** with hand-crafted features.
- No real modeling of journey *structure* or recent trip *sequence*.
- Background finalization and journey linking now reliably produce `journeyId` + cleaned side effects — this data is currently under-utilized by the prediction path.

## Promising V6 Directions (ranked for this moment)

1. **Journey-Sequence V6 (Strongly Recommended First Step)**
   - Treat the last N trips in a `journeyId` group (or recent history) as a short sequence.
   - Use a lightweight sequence model (small transformer, GRU, or even simple attention over embeddings) on top of existing features.
   - Directly leverages the new reliable journey linking + background pipeline.
   - Highest expected lift on the exact failure modes we currently see (transfers, corridors).
   - Compatible with existing shadow-mode + grading infrastructure.

2. **Graph-Native Hybrid**
   - Move beyond using `networkGraph` only as a mask.
   - Learn stop/route embeddings or run light message passing on the personal + global graphs produced by the empirical NetworkEngine.
   - Natural fit with the "NetworkEngine as pure learner" philosophy the project has been moving toward.

3. **Continual / Online Adaptation Layer**
   - Keep a strong global model.
   - Add cheap per-user (or per-recent-pattern) adaptation updated via the background finalization trigger.
   - Lower risk, good cold-start + personalization upside.

## Recommendation

**Start with a minimal Journey-Sequence prototype** (direction #1) as the first real V6 experiment.

Rationale:
- Directly attacks the biggest observed weakness (transfers + journey context).
- Reuses infrastructure we just spent significant effort hardening and testing (background finalization, journey linking, E2E coverage).
- Can be done as an incremental addition that still runs in shadow alongside V5.
- Gives the team real data on whether sequence modeling moves the needle before committing to bigger architectural changes (GNNs, full continual learning systems, etc.).

**Suggested next micro-step (if approved):**
- Export a small journey-grouped dataset.
- Build a minimal sequence prototype (even a simple RNN or transformer over trip embeddings) and compare against current V5 on held-out recent data.
- Keep scope tiny — proof of concept only.

This spike was deliberately kept small and focused on leveraging recent architecture wins rather than starting from a blank slate.

**Experiments for this work are recorded in:**  
[docs/V6_EXPERIMENTS.md](./V6_EXPERIMENTS.md)

---

*All work kept under the single "Prediction Engine V6" Notion task.*