# Trip Corrections

Design notes and open questions for post-trip edits such as `NOTES ...` and a possible future `CORRECT ...` command.

## Why This Exists

Editing a trip after it ends is not just a UI concern. A corrected trip may already have been used for:

- prediction grading
- journey linking
- NetworkEngine observation
- TransferEngine-derived learning
- HabitEngine rebuild inputs
- training/export analysis

That means a post-hoc correction can make some derived data stale even if the trip document itself is now right.

## Current Practical Rule

For now, the simplest safe model is:

- trips process immediately at `END`
- low-risk edits like `notes` are fine
- high-impact edits mark the trip as corrected/stale rather than trying to fully unwind every downstream effect

Current high-impact fields:

- `route`
- `direction`
- `agency`
- `startStop`
- `startStopCode`
- `startStopName`
- `endStop`
- `endStopCode`
- `endStopName`

Current correction metadata / guardrails:

- `correctedAt`
- `correctedFields`
- `correctionSource`
- `originalValues` for changed fields when available
- `needs_reprocess`
- `exclude_from_accuracy`
- `exclude_from_training`

Background finalization (via `onTripFinalized` trigger + `runPostEndFinalization`) only runs on first `endTime`. Corrections set the exclusion flags and are skipped by the idempotency guard even if `needs_reprocess` is true; only explicit `triggerManualFinalization` (force) re-runs learning/grading.

## Recording User Intent in Corrections

When correcting a trip, the goal is not always to immediately produce "perfect" canonical data.

A deliberate approach is to record **what the user actually meant to enter** (the raw or near-raw intent) rather than jumping straight to the fully normalized stop/route name. This has several benefits:

- Future matching and prediction logic (especially V6 and beyond) can learn to handle realistic imperfect user input.
- Route + direction context can often disambiguate and auto-match from a corrected but still "human" input.
- It preserves signal about common user mistakes and phrasing, which is valuable training data.

Example: Changing a bad entry like "collegea" to the user's intended "College" (rather than directly to "College St at Spadina Ave") lets the system demonstrate that it can resolve from context.

This does **not** remove the need for proper correction metadata (`correctedFields`, `originalValues`, exclusion flags). The trip is still marked as corrected and excluded from training/accuracy until explicitly reprocessed.

The tension is intentional: we want both (a) clean data for immediate use and (b) realistic imperfect examples that strengthen the matching system over time.

## Why Not Full Delayed Finalization Yet

The cleaner architecture would be to separate:

- **ended**: the trip is complete for the user
- **finalized**: the trip is safe for learning/grading

That would allow a correction window before the system commits the trip to downstream intelligence. But it adds real complexity:

- new lifecycle state for completed trips
- scheduled or opportunistic finalization rules
- new edge cases for transfer detection and habit rebuilding
- more bookkeeping around when a trip is visible vs trusted

For now, that complexity is likely disproportionate to the need.

## Candidate `CORRECT` Scope

If a correction command is added, the safest v1 is:

- admin-only
- only the most recent completed trip
- one field per message
- explicit deterministic grammar, not freeform AI-first parsing

Recommended command shape:

- `CORRECT ROUTE <value>`
- `CORRECT DIRECTION <value>`
- `CORRECT START <value>`
- `CORRECT END <value>`
- `CORRECT NOTES <value>`

Anything outside that should be rejected with a help message rather than guessed.

## Accuracy and Training Policy

Per-trip prediction grading can still happen immediately and be logged in `predictionStats`.

But aggregate model accuracy like "V3 is correct 75% of the time" should be treated as an on-demand calculation from raw `predictionStats`, not as fragile canonical counters.

Practical rule:

- `predictionStats` is the source of truth
- corrected high-impact trips are excluded from accuracy and training paths until explicitly reprocessed
- any incremental `predictionAccuracy` summaries are convenience telemetry only, not authoritative evaluation

## If Delayed Finalization Is Revisited Later

The likely design would be:

- `END` completes the trip for the user
- the most recent completed trip stays editable for some bounded rule
- downstream learning/grading finalizes later

Possible finalization triggers:

- next trip start
- timeout job
- explicit admin repair/reprocess flow

This remains a future architecture option, not a current implementation commitment.
