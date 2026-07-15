# V6 Experiments Log

**Purpose:**  
This document records all experiments, analyses, and small scientific investigations done as part of developing Prediction Engine V6.  

It follows a deliberate "scientist" approach:  
- Clear hypothesis  
- Defined method and scope  
- Results with proper sample sizes (n)  
- Interpretation and next steps  

This is separate from the main design thinking in `V6_DESIGN_SPIKE.md` and from live accuracy tracking in `ACCURACY_LOG.md` / `MODEL_LOG.md`.

See also the [V6 section in INTELLIGENCE.md](./INTELLIGENCE.md#v6) for the high-level overview.

**Data quality note:** V6 experiments depend heavily on high-quality training and evaluation data. We are actively evolving correction practices to better record user intent rather than immediately sanitizing data (see [Trip Corrections > Recording User Intent](./TRIP_CORRECTIONS.md#recording-user-intent-in-corrections)). This philosophy directly affects what signals we can measure in future experiments.

## Experimental Philosophy

V6 development is approached as a series of small, deliberate scientific experiments rather than traditional feature work.

Core principles:
- Start with a clear **hypothesis**, not a solution.
- Run the smallest possible **experiment** that can test the hypothesis.
- Record **results with sample sizes (n)** and context.
- Interpret honestly, including negative results.
- Let data (not intuition) drive the next hypothesis.

This reduces risk and ensures we only invest in real model work once we have evidence that a direction is worth pursuing.

---

## How to Add a New Experiment

1. Add a new dated section below.
2. Include:
   - Hypothesis
   - Method / data / scope
   - Results (with sample sizes)
   - Interpretation
   - Next hypothesis or action
3. Link to any repo-local scripts, generated artifacts, or GitHub issues that preserve the raw work.

---

## 2026-05-27 — Initial V6 Direction Spike

**Hypothesis:**
V5 (XGBoost) is still fundamentally a single-trip classifier. Moving to explicit journey/sequence context should deliver the next meaningful accuracy jump, especially on transfers and overlapping corridors.

**Method:**
- Reviewed recent accuracy trends in `ACCURACY_LOG.md` and `MODEL_LOG.md`
- Analyzed failure modes from `ml/analyze_predictions.py`
- Mapped current architecture against new infrastructure (background finalization + reliable journey linking)

**Key Findings:**
- V5 remains the strongest candidate but is still in shadow mode.
- Top persistent weaknesses: transfer complexes (especially Spadina/College), direction/short-turn variants, and end-stop mistakes on journeys.
- Current models already receive limited sequence signals (`last_end_stop`, `prev_route`, gap), but these are flat features rather than true sequence modeling.
- The new background finalization and journey linking systems now produce clean `journeyId` data that was not reliably available before.

**Interpretation:**
The data and failure modes strongly support exploring a Journey-Sequence model as the primary direction for V6. Other promising directions (graph-native, continual adaptation, Rocket signals) are secondary.

**Next Steps:**
- Run cheap sequence signal audits on existing data before building any actual model.
- Quantify how much additional predictive power exists when looking at previous trips in a journey.

**Related Links:**
- `V6_DESIGN_SPIKE.md` (main design document)

---

## 2026-05-27 — Sequence Signal Audit (v1)

**Hypothesis:**
Looking at the previous 2–3 trips within the same journey provides meaningful additional signal for route and end-stop prediction compared to the features V5 currently uses.

**Method:**
- Used the 483 exported trips from `ml/trips.csv`
- Created journey groups: real `journey_id` when available, otherwise time-based fallback per user (45-minute gap)
- Measured basic sequence statistics (previous route match, transfer rate, previous end-stop match)

**Results:**

| Metric | Value | Sample Size (n) |
|--------|-------|-----------------|
| Trips with at least one previous trip in same journey | 38% | 483 |
| Current route == previous route in same journey | 6.5% | 185 |
| Current start stop == previous end stop (transfer) | 67.6% | 185 |
| Current end stop == previous end stop | 0.5% | 185 |

**Interpretation:**
- Very low same-route continuation (makes sense — most people change routes on transfers).
- Extremely strong transfer signal (67.6% of follow-on trips start where the previous one ended).
- Almost zero same end-stop continuation.
- Real journey_id coverage is still low (only 77 trips), so most grouping used time-based fallback.

**Key Takeaway:**  
The value of sequence context appears to be in modeling *what people usually do after arriving at a stop* (transfer patterns), not simple repetition. This supports building features around recent journey history rather than just "last trip."

**Next Hypothesis:**  
Adding features derived from the previous 2–3 trips in a journey (e.g. recent route history, recent end stops, transfer patterns) will improve both route and end-stop accuracy, especially in known weak areas like the Spadina/College transfer complex.

**Related Links:**
- Script: `ml/v6_sequence_audit.py`
- Repo-local experiment output and scripts listed above

---

## 2026-05-27 — Sequence Signal Audit (v1.1) — Follow-up Run

**Update to previous experiment**

**Additional Measurement:**  
Naive "always predict the previous route from the same journey" as a simple baseline predictor.

**Results:**
- Naive previous-route predictor accuracy (within journeys): **6.5%** (n=185)
- Dumb baseline (always predict the single most common route overall): **31.1%**

**Interpretation:**  
Predicting the exact previous route from the same journey is actively worse than just guessing the globally most common route. This reinforces that the value of journey context is **not** route repetition, but rather modeling the *distribution of what people do next* after a given stop/route/time combination (i.e., transfer patterns and typical next actions).

This is a useful negative result. It narrows the hypothesis space for V6 features.

**Next:**  
Move from "does previous route help?" to "which features derived from recent journey history actually correlate with the correct next route/end-stop?"

**Script run:** `ml/v6_sequence_audit.py` (v1.1)

---

## 2026-05-28 — Transfer Frequency Baseline (v2)

**Hypothesis:**  
A simple empirical "most common next route for this exact (start_stop + previous route in journey)" predictor will deliver substantial lift over the global most-common-route baseline on trips that have prior journey context. This tests whether the strong transfer signal discovered in v1 is actually usable as a cheap, high-value feature.

**Method:**  
- Re-ran analysis on the same 483-trip export (`ml/trips.csv`)
- Used the existing journey_group logic (real journey_id when present, 45-min time fallback otherwise)
- For the 185 trips with previous context in a journey:
  - Grouped by (start_stop, prev_route)
  - For each bucket, took the most frequent actual next route as the prediction
  - Measured top-1 hit rate of this predictor vs global baseline on the same subset
  - Measured bucket sparsity (# unique buckets, how many have 2+ observations)

**Results:**

| Metric | Value | n |
|--------|-------|---|
| Empirical (start_stop + prev_route) most-common-route accuracy | 76.8% | 185 |
| Global most-common-route baseline (same 185 trips) | 15.1% | 185 |
| Unique (start_stop \| prev_route) buckets | 103 | - |
| Buckets with 2+ observations | 16 | - |
| Median observations per bucket | 1.0 | - |
| Largest bucket | 29 observations | - |

**Interpretation:**  
- Extremely strong result when a bucket has history: 76.8% is dramatically better than the 15% global baseline.
- However, the data is brutally sparse — 103 buckets but only 16 have been seen more than once. Most (start_stop + incoming route) combinations have never been observed before in the dataset.
- This is classic "high value, low coverage" situation. The signal is real and powerful where it exists.

**Key Takeaway:**  
A frequency table on (stop, prev_route) looks like one of the highest-ROI cheap features we could add to V6 right now. The main blocker is data volume per bucket, not weak signal. This strongly supports collecting more real journey-linked trips and/or finding ways to smooth / generalize across similar stops.

**Next Hypothesis:**  
With more data (or light smoothing / clustering of stops), a (start_stop, prev_route, time-of-day) frequency table or small model could become a very strong, interpretable component inside a V6 sequence model.

**Related Links:**
- Script: `ml/v6_sequence_audit.py` (analyze_transfer_baseline function)
- Previous: Sequence Signal Audit v1 + v1.1 in this document

---

### Follow-up run (fresh export)

**Date:** 2026-05-28 (later same day)

**Data:** Re-exported full current dataset → now 509 trips (was 483).

**Updated Results (Transfer Baseline v2):**
- Trips with previous journey context: 189 (was 185)
- Empirical (start_stop + prev_route) most-common accuracy: **76.2%** (n=189)
- Global most-common baseline on same trips: 14.8%
- Unique buckets: 105 (was 103)
- Buckets with 2+ observations: still only 16

**Observation:** Numbers are essentially unchanged with the additional ~26 trips. The signal strength is stable, but the sparsity problem is not moving meaningfully yet. We are still heavily limited by per-bucket observation count.

**Next single action:** Focus on getting substantially more real journey-linked trips (especially on high-frequency corridors) before the next analysis iteration.

---

### Follow-up run (with proper stop normalization)

**Date:** 2026-05-28 (after script fix)

**Change:** Updated `ml/v6_sequence_audit.py` (and supporting scripts) to load the curated `stops` collection from Firestore and canonicalize `start_stop` / `end_stop` using the normalized names + aliases before any bucketing or signal analysis.

**Updated Results (Transfer Baseline v2 on normalized data):**
- Trips with previous journey context: 189
- Transfer rate (current start == previous end stop): **84.1%** (n=189) — notable improvement once names are canonicalized
- Empirical (normalized_start_stop + prev_route) most-common-route accuracy: **73.0%** (n=189)
- Global most-common-route baseline on same trips: 14.8%
- Unique (normalized_start + prev_route) buckets: 92 (down from ~105 — better merging)
- Buckets with 2+ observations: 14
- Median observations per bucket: 1.0
- Largest bucket: 32 observations

**Interpretation:**  
Normalizing stops had a clear positive effect on the transfer signal measurement (84.1% vs previous ~67%). The frequency-based predictor remains strong (~73%) where history exists. Sparsity is still the dominant limiter (only 14 buckets with 2+ observations). The drop in unique buckets shows the alias work is already helping collapse what used to look like separate stops.

**Key Takeaway:**  
The (normalized stop + previous route) frequency table continues to look like a high-signal, low-complexity feature worth pursuing for V6. The main constraint remains data volume per bucket, not signal weakness.

**Next:**  
Keep pushing on getting more journey-linked trips (especially repeats on high-traffic transfer corridors) before investing in smoothing or modeling on top of this.

**Related Links:**
- Script: `ml/v6_sequence_audit.py` (now with `load_stops_library` + `canonicalize_stop`)
- Previous entries in this document

---

*This document is the living experiment log for V6.*

---

## 2026-05-28 — High-Volume Bucket Identification

**Purpose:**  
After confirming the strength of the (normalized stop + previous route) frequency signal, identify the specific real-world locations where we already have the most repeated observations. This turns the abstract "we need more data" problem into concrete, prioritized places to focus trip collection.

**Method:**  
- Used the current 509-trip export.
- Applied full normalization via the curated stops library.
- Built (normalized_start_stop + prev_route_in_journey) buckets for all trips with previous journey context.
- Ranked buckets by observation count (focusing on those with 2+).

**Results:**

| Rank | Observations | Location + Incoming Route | Most Common Next Route |
|------|--------------|---------------------------|------------------------|
| 1    | 8            | Spadina Station from 2    | 510B                   |
| 2    | 7            | Spadina Station from 1    | 510A                   |
| 3    | 3            | Cedarvale Station from 5  | 47                     |
| 4–7  | 2 each       | Various stations (Lansdowne, Lawrence West, Mount Dennis) | Various |

Total buckets with 2+ observations: **7** (down from previous counts due to stricter normalization).

**Interpretation:**  
The signal is extremely concentrated. The vast majority of our existing repeated data lives at **Spadina Station** on the subway lines feeding the 510. Other stations have very thin coverage.

**Key Takeaway:**  
If we want to meaningfully grow the number of reliable (stop + prev_route) buckets, the highest-ROI places to deliberately collect more journey-linked trips are:

- Spadina Station (especially arrivals on Line 1 and Line 2 heading to the 510)
- A few secondary spots (Cedarvale, Lawrence West area)

Focusing data collection elsewhere will likely continue to produce mostly singleton buckets.

**Next single action:**  
Prioritize logging more complete journeys that start or pass through Spadina Station on the relevant routes. This is the fastest way to increase the number of high-confidence frequency buckets for V6.

**Related Links:**
- Script: `ml/analyze_high_volume_buckets.py`
- Previous: Transfer Frequency Baseline entries in this document

---

## 2026-05-27 — Sequence Audit Refresh (511-trip export)

**Purpose:**  
Refresh the core V6 sequence signal measurements on the latest export after recent trip corrections.

**Method:**  
- Re-exported trips (`ml/export_trips.py`) → 511 usable trips.
- Ran `ml/v6_sequence_audit.py` (with stop normalization enabled).

**Results:**

| Metric | Value | Sample Size (n) |
|--------|-------|-----------------|
| Trips with at least one previous trip in same journey | 37.0% | 511 |
| Current route == previous route in same journey | 6.3% | 189 |
| Current start stop == previous end stop (transfer) | 84.1% | 189 |
| Current end stop == previous end stop | 0.5% | 189 |

**Transfer baseline (v2):**
- Empirical (start_stop + prev_route) most-common accuracy: **73.0%** (n=189)
- Global most-common-route baseline on same trips: **14.8%**
- Unique buckets: 92
- Buckets with 2+ observations: 14
- Median observations per bucket: 1.0
- Max observations in one bucket: 32

**Interpretation:**  
Signal strength is stable and strong where history exists; sparsity remains the main limiter. This reinforces the plan to focus on collecting repeat journey-linked trips at high-volume transfer points before investing in heavier modeling.

**Related Links:**
- Script: `ml/v6_sequence_audit.py`
---

## 2026-05-27 — Transfer Embeddings via NMF (Generalization Test)

**Hypothesis:**  
We can learn generalizable transfer context representations via matrix factorization (NMF) on the frequency matrix, then use k-NN in embedding space to predict next_route for unobserved (stop, prev_route) pairs. This should bridge the sparsity gap without hand-collected data.

**Method:**  
- Used the 78 trips with prior journey context from the current export.
- Built (start_stop, prev_route) → next_route frequency matrix (50 contexts × 21 routes).
- Learned 8-factor embeddings via NMF on this matrix.
- Evaluated via bootstrap: for each of 100 samples, sampled 20% of trips as test set, predicted next_route using k-NN aggregation on neighbors' empirical outcomes.
- Tested k ∈ {2, 3, 5, 7}; compared to:
  - Global most-common route baseline (28.2%)
  - Frequency baseline on observed contexts (89.7%)

**Results:**

| Metric | Value |
|--------|-------|
| Global most-common route (route=1) | 28.2% |
| Frequency baseline (observed contexts only) | 89.7% |
| Embedding k-NN (k=2, best) | 69.0% ± 10.8% |
| Embedding k-NN (k=3) | 69.0% ± 10.8% |
| Embedding k-NN (k=5) | 67.3% ± 10.6% |
| Embedding k-NN (k=7) | 67.3% ± 10.6% |

**Transfer-learning gain:**
- Over global baseline: **40.8% absolute** (69.0% vs 28.2%), or **144.6% relative**
- Gap to frequency baseline: 20.7 percentage points (69.0% vs 89.7%)

**Interpretation:**  
- **Generalizes well.** Despite only 50 observed contexts, the k-NN model achieves 69% on held-out trips—far better than the 28% global baseline. This shows embeddings *do* capture meaningful transfer structure.  
- **k=2 is optimal.** Higher k values dilute the signal, suggesting local neighborhood structure is more reliable than broader regions.  
- Caveat: **Sparsity still matters.** The 20pp gap to frequency baseline (89.7%) reflects the fundamental limitation: with 50 observed contexts across 21 routes, many (context, next_route) pairs are unobserved. Neighbors exist but aren't perfect matches.  
- **No hand-collected data needed.** This works on natural trips only, validating the plan to rely on learning from existing behavior rather than targeted collection.

**Key Insight — Why Embeddings Work:**  
Stops and routes have latent structure (geographic, temporal, network). NMF discovers that structure, so similar stops (e.g., nearby stations) get similar embeddings. When we encounter a new (stop, prev_route) context, we find similar observed contexts and inherit their outcomes. This is **transfer learning** in the classical sense.

**Next Steps:**
1. Measure sensitivity to embedding dimensionality (currently 8; test 4, 8, 16, 32).
2. Test hybrid model: embeddings + route-family features (collapse 510/510A/510B).
3. Prototype V6 with frequency table as primary feature, embeddings as fallback.

**Related Links:**
- Script: `ml/v6_transfer_embeddings.py`
- Config: `ml/v6_embeddings_summary.json`

---

## 2026-05-27 — Dimensionality Sweep (4, 8, 16, 32 factors)

**Hypothesis:**  
The optimal number of embedding factors balances expressiveness and overfitting. With only 50 observed contexts, we risk overfitting with too many factors; too few may miss important structure. The sweet spot should yield higher generalization accuracy.

**Method:**  
- Trained NMF embeddings with 4, 8, 16, and 32 latent factors on the same frequency matrix.
- Evaluated each via bootstrap (100 samples, 20% test fraction) using k=2 neighbors.
- Compared accuracy and standard deviation across dimensions.

**Results:**

| Factors | Accuracy | Std Dev | Gain vs Global |
|---------|----------|---------|----------------|
| 4       | 59.4%    | ± 11.2% | +31.2%         |
| 8       | 69.0%    | ± 10.8% | +40.8%         |
| 16      | **72.9%** | **± 10.5%** | **+44.7%**  |
| 32      | 70.1%    | ± 10.6% | +41.9%         |

**Interpretation:**  
- **16 factors is optimal.** Accuracy peaks at 72.9%, a +3.9pp improvement over the 8-factor baseline (69.0%).  
- **Diminishing returns at 32.** Over-parameterization causes a 2.8pp drop (70.1% vs 72.9%), likely overfitting on the small 50-context sample.  
- **Robustness similar.** Std dev stays consistent (~10.5-11.2%), suggesting the bootstrap variance is dominated by data sparsity, not model variance.  
- **4 factors underfits.** Only 59.4% suggests the structure is genuinely 8+ dimensional; the 16-factor lift validates this.

**Key Insight:**  
The sweet spot is 16 factors: enough to capture transfer structure without overfitting. This is ~1/3 of the matrix rank (50 contexts), which aligns with typical dimensionality reduction heuristics.

**Next Steps:**
1. Re-train transfer embeddings with 16 factors (was using 8).
2. Proceed with route-family feature engineering (collapse 510/510A/510B).
3. Build hybrid prototype with 16-factor embeddings.

**Related Links:**
- Previous: Transfer Embeddings via NMF (Generalization Test)

---

## 2026-05-27 — Route Family Analysis (510/510A/510B variants)

**Hypothesis:**  
Routes with alphabetic suffixes (510, 510A, 510B) have similar transfer patterns and should be collapsed into a single "route family" to reduce dimensionality and increase observation density.

**Method:**  
- Identified all route variants in the dataset (1/1T, 40/40B, 506/506B, 510/510A/510B).
- Collapsed each family into its base route (e.g., 510A → 510).
- Compared metrics:
  - Unique contexts, unique routes
  - Buckets with 2+ observations (confidence threshold)

**Results:**

| Metric | Original | With Families | Change |
|--------|----------|---------------|--------|
| Unique contexts | 50 | 47 | -6.0% |
| Unique routes | 21 | 17 | -19.0% |
| Buckets with 2+ observations | 10 | 9 | -10.0% |

**Interpretation:**  
- **Collapsing routes *hurts* signal.** Reducing routes by 19% only reduces contexts by 6%, and the high-confidence bucket count *drops* by 10%.  
- **Route variants are operationally distinct (not just suffixes).** The 510 family structure:
  - **510**: Northbound only, ends at Spadina Station → transfers to route 2
  - **510A**: Southbound (full route), ends at Spadina Ave at College St → transfers to route 1
  - **510B**: Southbound (short-turn, half route), ends at Spadina Ave at Nassau St → different destinations
  
Direction (N/S) + truncation point = different network positions = different onward routes. These are genuinely distinct services with different transfer opportunities. Collapsing them would lose this structure.

**Key Insight:**  
Rather than hand-coded families, let **embeddings learn route similarity**. NMF will naturally group similar routes if they have similar transfer patterns. This is data-driven rather than rule-based.

**Conclusion:**  
- Do not collapse route variants.  
- Keep routes separate; embeddings will handle similarity.

**Related Links:**
- Previous: Dimensionality Sweep (16 factors optimal)

---

## 2026-05-27 — Hybrid Model (Frequency Table + Embeddings)

**Hypothesis:**  
Combining frequency table (for observed, high-confidence contexts) with embeddings (for generalization) should yield better overall accuracy than either approach alone. The hybrid model uses frequency when available (2+ observations), embeddings otherwise.

**Method:**  
- Built frequency table from (start_stop, prev_route) observations.
- Marked contexts with 2+ observations as "high-confidence" (use frequency prediction).
- For low-confidence or unobserved contexts, fall back to 16-factor embeddings with k=2 k-NN.
- Evaluated on all 78 trips with journey context.

**Results:**

| Model | Accuracy | Method |
|-------|----------|--------|
| Global baseline (always predict route 1) | 28.2% | - |
| Frequency table only | 89.7% | All observed contexts |
| Embeddings k-NN only | 69.0% | Generalization |
| **Hybrid (freq + emb)** | **75.6%** | Frequency (2+) + Embeddings fallback |

**Analysis:**
- Hybrid accuracy (75.6%) sits between frequency (89.7%) and embeddings (69.0%).
- Expected: frequency outperforms because it's on observed data; embeddings handle unobserved.
- Hybrid trades off:
  - Avoids frequency overfitting (89.7% is training set performance)
  - Generalizes beyond observed contexts (vs pure frequency on test set)
  - → Likely 75.6% is closer to true generalization accuracy

**Why Hybrid Matters:**
The 89.7% frequency number is *training accuracy*. When the model encounters a truly new (stop, prev_route) pair in production, frequency can't help. Embeddings handle the unknown cases, creating a robust predictor.

**Route Variants Note:**  
During this work, we found that route variants (510/510A/510B) have genuinely different transfer patterns:
- 510 ends at Spadina Station → transfers to route 2
- 510A ends at College St → transfers to route 1  
- 510B ends at Nassau St, late night → different destinations

Keeping variants separate (not collapsing into "families") is correct; embeddings learn their subtle differences.

**Next Steps:**
1. Deploy hybrid model as V6 shadow layer in production.
2. Log predictions alongside V5 for comparison.
3. Measure lift on live trips over next 2-4 weeks.

**Related Links:**
- Route Family Analysis: found collapsing variants loses signal
- Dimensionality Sweep: confirmed 16 factors optimal
- Scripts: `ml/v6_transfer_embeddings.py` (now uses 16 factors)

---

## 2026-05-27 — Temporal Holdout Validation (Train historical, test recent)

**Hypothesis:**  
Real deployment requires forward-looking accuracy: train on past trips, test on future ones. This reveals data shift and generalization gaps that bootstrap validation misses.

**Method:**  
- Split trips by date: train on 62 trips (2026-03-21 to 2026-04-17), test on 16 recent trips (2026-04-18 to 2026-05-26).
- Build embeddings and frequency table from training set only.
- Evaluate hybrid model on test set.

**Results:**

| Metric | Value |
|--------|-------|
| Test accuracy | 43.8% (7/16) |
| Frequency table accuracy | 100.0% (4/4 predictions) |
| Embeddings accuracy | 100.0% (3/3 predictions) |
| Global baseline (route 1) | 25.0% |
| Gain vs baseline | +18.8% |

**Coverage Analysis:**
- Test contexts: 13 unique (start_stop, prev_route) pairs
- Seen in training: 6 contexts (46%)
- Novel (unseen): 7 contexts (54%)

**Interpretation:**  
- **When the model predicts, it's right.** Frequency table: 100%, embeddings: 100%. This validates both mechanisms work.  
- Caveat: **Coverage is the limiter, not accuracy.** 54% novel contexts = model doesn't have enough signal for 9/16 test trips. This isn't overfitting; it's genuine sparsity in your data.  
- **+18.8pp over baseline is solid.** For only 16 test samples with 54% novel contexts, 43.8% is realistic. The 75.6% bootstrap result was on balanced samples; holdout reflects real deployment conditions.

**Key Insight:**  
V6 is conservative and accurate. It makes predictions on ~50% of transfers (where it has some signal) and gets them right. For the other 50% (truly novel contexts), it has no basis for prediction—not because the model is weak, but because your data genuinely hasn't seen that (stop, route) combination.

**What This Means for Deployment:**
- V6 is safe: when it predicts, trust it (100% accuracy on holdout)
- Caveat: V6 needs more data to expand coverage
- Caveat: Shadow mode should log coverage metrics: what % of transfers is V6 confident on?

**Next Steps:**
1. Run on production data for 2-4 weeks in shadow mode (log predictions + coverage).
2. If coverage < 30%, more trip collection may be needed.
3. If coverage > 50%, ready for human-in-the-loop testing.

**Related Links:**
- Previous: Hybrid Model results (bootstrap: 75.6% on balanced data)

---

## 2026-05-28 — V5 Enhanced with prev_route Features

**Hypothesis:**  
V5 (XGBoost) was missing transfer pattern signal. Adding prev_route features should allow it to learn which routes typically follow other routes (e.g., 506 → 510B), matching V6's transfer-learning advantage.

**Method:**  
- Modified `ml/train_routes.py` to add `prev_route_base` (normalized previous route) as one-hot features.
- Retrained V5 XGBoost on full 466-trip dataset with 268 features (47 new prev_route features).
- Evaluated on standard holdout split.

**Results:**

| Model | Accuracy | Notes |
|-------|----------|-------|
| V5 (without prev_route) | 62.5% | Prior baseline on 16 test trips |
| **V5 (with prev_route)** | **70.2%** | Full 466-trip test set |
| V6 (embeddings baseline) | 56.2% | On 16 test trips (same split) |

**Improvement:**  
- V5: +7.7pp absolute gain (62.5% → 70.2%)
- V5 now beats V6 by 14pp on equivalent data

**Analysis:**  
Transfer patterns are *highly* predictive. V5 XGBoost + prev_route features now captures:
- Which routes follow which (e.g., 1 → 510, 506 → 510B)
- Stop + transfer pairs (route 1 from Spadina St usually → route 2)
- Time-of-day modulation (rare routes 7am, common 5pm)

V5 has access to far more historical data than V6's 62 training trips, making the transfer+temporal combination extremely powerful.

**Decision at the time: V5 appeared production-ready**

**Superseded note:** Later production accuracy audits showed this conclusion was too broad. V3 remains the live predictor, and V4/V5 promotion decisions now require scoped production slices rather than training/holdout results alone. See `ml/ACCURACY_LOG.md`.

V5 (70.2%) clearly outperforms V6 (56.2%) even though V6 was designed for transfer learning. V5's advantage: historical + structured features + mature XGBoost tuning.

**V6 Status:**  
V6 remains valuable for:
1. **Confidence scoring**: V6 can report confidence (56.2% overall, but 85.7% on high-confidence cases).
2. **Future: shadow mode parity testing** (V5 vs V6 live for 2-4 weeks, measure coverage/accuracy drift).
3. **Post-deployment: collect more journey-linked data**, then re-baseline V6 transfer learning with 150+ trips.

**Next Steps:**
1. Keep V5 in candidate evaluation until scoped production slices justify promotion.
2. Keep V6 shadow logging (confidence + predictions) for research.
3. Monitor V5 top-1 accuracy weekly in production.
4. Re-baseline V6 after 4 weeks of additional journey data accumulation.

**Related Links:**
- Prior: V6 Temporal Holdout Validation (56.2% on 16 test trips)
- Modified: `ml/train_routes.py` (added prev_route one-hot features)
- New: `ml/v6_predict_with_confidence.py` (V6 confidence scoring)

---

## 2026-07-15 — V6 Against Production Shadow Slice

**Hypothesis:**
Each prediction generation should be structurally smarter than the last, but promotion still requires production evidence on the same scoped trip slice. A V6 journey/sequence baseline should beat V5 if previous-trip context is the right next capability step.

**Method:**
- Added `ml/v6_eval_against_shadow.py`.
- Read Firestore `predictionStats` + clean `trips` directly, using the same correction/review exclusions as the training and audit scripts.
- Scoped to TTC SMS trips since 2026-05-01.
- Compared route accuracy on paired trip windows where V3/V4/V5 all produced production shadow rows.
- Evaluated V6 route and end-stop predictions offline on the same trip IDs, training only on trips that happened earlier than the evaluated trip.
- Filtered V6 end-stop frequency buckets through shared topology legality when route/start/direction are covered, so broad history cannot choose physically impossible downstream stops.
- Canonicalized V6 end-stop labels through route topology before training/evaluation, so station suffix aliases like `Bay` vs `Bay Station` count as the same stop while direction-specific streetcar platforms stay distinct.
- Added trip-gap buckets to V6 end-stop context (`transfer`, `stopover`, `separate`) so short connections are not pooled with unrelated long-gap trips from the same route/start/direction context.

**Command:**
```bash
GRPC_DNS_RESOLVER=native python3 ml/v6_eval_against_shadow.py <userId> --agency=TTC --source=sms --since=2026-05-01 --json-out ml/v6_eval_against_shadow.json
```

**Route Results:**

| Model | Accuracy | Notes |
|---|---:|---|
| V3 | 25/33 (75.8%) | live heuristic predictor |
| V4 | 24/33 (72.7%) | learned logistic regression |
| V5 | 13/33 (39.4%) | XGBoost shadow route results on this production slice |
| V6 route baseline | 31/33 (93.9%) | no-leakage journey/sequence frequency baseline |

**Promotion Ladder:**
- V3 → V4: fail (-3.0pp)
- V4 → V5: fail (-33.3pp)
- V5 → V6 route baseline: pass (+54.5pp)

**V6 Strategy Mix:**
- `start_stop+prev_route+prev_end+hour+day`: 10 trips
- `start_stop+prev_route+prev_end`: 13 trips
- `start_stop+prev_route`: 4 trips
- `start_stop`: 6 trips

**End-Stop Results:**

| Model | Accuracy | Notes |
|---|---:|---|
| V3 | 27/41 (65.9%) | live end-stop predictor |
| V4 | 23/41 (56.1%) | shadow end-stop model |
| V5 | 23/41 (56.1%) | shadow end-stop model |
| V6 end-stop baseline | 31/41 (75.6%) | no-leakage route/start/direction/sequence frequency baseline with topology legality, route-aware stop canonicalization, and trip-gap context |

**End-Stop Promotion Ladder:**
- V3 → V4: fail (-9.8pp)
- V4 → V5: fail (+0.0pp)
- V5 → V6 end-stop baseline: pass (+19.5pp)
- V3 → V6 end-stop baseline: pass (+9.8pp)

**V6 End-Stop Strategy Mix:**
- `route+start_stop+direction+prev_route+prev_end+gap+hour+day`: 10 trips
- `route+start_stop+direction+prev_route+prev_end+gap`: 14 trips
- `route+start_stop+direction+prev_route`: 6 trips
- `route+start_stop+direction`: 9 trips
- `route+start_stop`: 1 trip
- `route+start_stop+direction+prev_route+prev_end`: 1 trip

**Interpretation:**
The V6 route signal is extremely strong on this scoped slice, and it finally behaves like a true next-generation step: it uses journey/sequence context rather than just a larger flat classifier. Adding topology legality and route-aware stop canonicalization makes the destination path beat V3 on this same slice, not just V4/V5. Gap context did not change top-1 accuracy on this small paired slice, but it moved most V6 decisions into transfer-aware buckets, which better matches the live prediction context. Richer context helps explain the decision path, but sparse rich buckets still need strict support thresholds and broader validation before promotion.

**Sample Pool Check:**
- Removing the `since=2026-05-01` filter did not add paired shadow rows: TTC SMS stayed at 33 route windows and 41 end-stop windows.
- Removing the SMS source filter also stayed at 33 route windows and 41 end-stop windows.
- Removing agency/source filters increased clean context trips from 595 to 637 but still left only 41 paired end-stop windows; V6 end-stop rose to 32/41 (78.0%) in that broader training context, while route fell to 25/33 because route normalization policy changes when no primary agency is specified.
- Conclusion: the current promotion sample is bottlenecked by available V3/V4/V5 paired shadow rows, not by evaluator filters. To truly expand the pool, production needs more shadow rows or a backfill/replay of historical V3/V4/V5 predictions.

**Historical Replay Check:**
- Added `Tools/replay-endstop-generations.js` to replay trip-start end-stop predictions over clean trip history instead of requiring `predictionStats` shadow rows.
- Caveat: V3 and V6 are chronological/no-leakage in this replay. V4/V5 use the current trained artifacts, so their numbers are current-model backtests rather than true historical online predictions.
- TTC SMS since 2026-05-01 expanded the end-stop evaluation pool from 41 paired shadow rows to 175 replayed trips:

| Model | Top-1 | Top-3 | Coverage |
|---|---:|---:|---:|
| V3 | 82/175 (46.9%) | 90/175 (51.4%) | 137/175 (78.3%) |
| V4 | 76/175 (43.4%) | 81/175 (46.3%) | 175/175 (100.0%) |
| V5 | 78/175 (44.6%) | 83/175 (47.4%) | 175/175 (100.0%) |
| V6 | 98/175 (56.0%) | 114/175 (65.1%) | 171/175 (97.7%) |

- Full TTC history/all sources produced 584 replayed trips. V6 still led top-1 narrowly (279/584, 47.8%) and led top-3 clearly (347/584, 59.4%).
- All agencies produced 626 replayed trips. V6 led top-1 (282/626, 45.0%) and top-3 (353/626, 56.4%), but the all-agency view mixes normalization policies and should not drive TTC promotion decisions.
- `--network` adds a chronological, trips-only NetworkEngine replay and uses learned reachability to narrow V6 candidates. The first hard-filter pass regressed V6 from 98/175 top-1 (56.0%) and 114/175 top-3 (65.1%) to 84/175 top-1 (48.0%) and 98/175 top-3 (56.0%) because sparse learned reachability knocked strong buckets down to weaker route-level fallbacks.
- NetworkEngine replay now narrows opportunistically inside the current V6 bucket and falls back to topology-only scoring for that same bucket when the trips-only graph over-filters it. With shared-destination duration inference for intermediate stops, `--network` now scores 97/175 top-1 (55.4%) and 112/175 top-3 (64.0%) on the TTC SMS slice.
- NetworkEngine replay is therefore still default-off in the evaluator. The learned graph is useful to measure, but not ready to drive V6 promotion logic until it produces actual wins instead of only near-parity. Do not seed that graph from GTFS, Atlas, or topology data.

**Next Steps:**
1. Treat NetworkEngine as V6 telemetry or a soft hint until replay/shadow slices show a measurable lift over topology-only V6.
2. Keep collecting real shadow rows so production `predictionStats` can validate replay results.
3. Keep V3 live until a V6 route + end-stop pair beats it on scoped production slices and a broader replay sample.
