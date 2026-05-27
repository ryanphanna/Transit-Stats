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

When correcting a trip, prefer recording **what the user actually meant to enter** over immediately forcing the fully normalized canonical name.

### Why
- Future models (especially V6) benefit from seeing realistic imperfect inputs + the context (route, direction, time, etc.) that should have resolved them.
- It forces the matching logic to get stronger at handling real user phrasing instead of relying on perfect data.
- It creates better training signal about common failure modes.

### Practical Pattern
For a high-impact stop name correction:

1. Set the raw input field (`startStop` or equivalent) to what the user meant to type.
2. Ensure `startStopName` holds a valid canonical name from the stops library (this can stay as the resolved form).
3. Set `stop_matched: true` once the corrected intent + route/direction context should allow clean resolution.
4. Always apply full correction metadata:
   - `correctedFields`
   - `correctedAt`
   - `originalValues` (preserve both the bad raw and bad normalized values when possible)
5. Apply exclusion flags (`needs_reprocess`, `exclude_from_training`, `exclude_from_accuracy`).

**Example (real trip, May 2026):**
- Original: `startStopName = "Collegea"`, `startStop = null`
- Correction applied:
  - `startStop = "College"` (what the user meant to text on 506 Westbound)
  - `startStopName = "College St at Spadina Ave"` (canonical name)
  - `stop_matched = true`
  - `correctedFields` includes both fields
  - `originalValues` recorded the bad values
  - All high-impact exclusion flags set

This keeps the trip honest about the user's actual input while still giving downstream systems (prediction, matching, training) clean canonical data where it matters.

The same principle applies to other high-impact fields (route, direction, etc.): record the intended value first, then ensure proper metadata and exclusion.

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
