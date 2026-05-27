# V6 Experiments Log

**Purpose:**  
This document records all experiments, analyses, and small scientific investigations done as part of developing Prediction Engine V6.  

It follows a deliberate "scientist" approach:  
- Clear hypothesis  
- Defined method and scope  
- Results with proper sample sizes (n)  
- Interpretation and next steps  

This is separate from the main design thinking in `V6_DESIGN_SPIKE.md` and from live accuracy tracking in `ACCURACY_LOG.md` / `MODEL_LOG.md`.

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
3. Link to any scripts or Notion comments where raw work lives.

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
- Notion task: Prediction Engine V6

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
- Notion task comments for raw output

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

*This document is the living experiment log for V6. All work is kept under the single approved Notion task.*