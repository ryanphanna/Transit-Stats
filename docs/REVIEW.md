# Trip Review & Filtering Policy

This document defines how AI agents and humans should review trips, when to mark them reviewed, and which trips are eligible for ML/history use.

## Trip Signals

- `stop_matched`
  - The trip endpoints were auto-resolved against known stops.
  - This is an automatic mapping signal, not human review.
- `needs_review`
  - The parse or trip is suspicious and should stay out of ML/history until fixed.
- `manually_verified`
  - A human reviewed or corrected the trip with high confidence.

Do not conflate these signals.

## Manual Verification Rules

- Mark `manually_verified` only when a human can confidently vouch for the trip as stored or after correcting it.
- Do not invent missing route, direction, or end stop unless the surrounding trip context makes the answer obvious.
- If a trip is corrected, preserve rider-entered stop text on the trip and map it to the canonical stop with stop codes.
- Trips with no end stop may still be `manually_verified` as reviewed records, but they remain excluded from ML because they are incomplete labeled examples.
- If a trip remains suspicious or unresolved, leave or set `needs_review` and do not mark it `manually_verified`.

## Rider Text vs Canonical Stops

- Preserve the rider-entered stop wording on the trip where possible.
- Use `startStopCode` / `endStopCode` to map back to canonical stop records in `stops`.
- Do not overwrite trip stop text during normal verification.
- A user-approved typo correction is the exception: preserve the original value in correction metadata, record the corrected wording, and apply the required reprocessing exclusions.

## Stop Verification Order

For an unmatched trip endpoint, use this order:

1. Search the `stops` library by agency, stop code, canonical name, or alias.
2. If no library match exists, search the agency's GTFS inventory for the rider's stop wording.
3. Restrict GTFS candidates by route first.
4. Use the trip direction only to disambiguate the remaining route candidates.
5. When exactly one candidate remains, add its canonical GTFS name, code, coordinates, agency, and route metadata to `stops`, and add the rider's submitted wording as an alias.
6. Link the trip through its stop-code field and set `stop_matched` only when both endpoints are linked.
7. Leave ambiguous or unresolved candidates flagged for review. Never guess.

## ML / History Filters

Live prediction history and ML exports should exclude trips that are:

- `incomplete`
- `discarded`
- `needs_review`
- not `stop_matched` (with backward-compatible fallback to legacy `verified`)

`manually_verified` is a useful trust signal, but it does not override completeness requirements for ML eligibility.

## Practical Review Order

Easiest trips to manually verify first:

- station-to-station trips
- stop-matched trips with coherent route, direction, origin, and destination
- recent trips the rider is likely to still remember
- corrected trips where the intended fix is obvious

Lower-confidence trips to defer or inspect carefully:

- trips with missing end stops
- unmatched trips
- suspicious parses
- trips with correction notes embedded in stop names
- trips where route or direction would have to be guessed
