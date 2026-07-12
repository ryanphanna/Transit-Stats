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
- Do not overwrite trip stop text with the official stop name unless that is explicitly the intended correction.

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
