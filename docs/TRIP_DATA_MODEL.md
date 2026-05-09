# Trip Data Model

This document explains what lives in trip records, what lives in the normalized stop library, and which fields are raw vs derived.

## The Two Main Layers

### 1. `trips`

Trip records are the ride history itself.

They answer questions like:

- What route was ridden?
- In which direction?
- What did the rider record as the origin and destination?
- When did the trip start and end?
- Has a human reviewed it?

Trip records are editable. Corrections to trip fields are normal.

### 2. `stops`

The `stops` collection is the normalized stop library.

It is the canonical layer for:

- official stop names
- aliases
- stop codes
- agency
- routes known to serve the stop
- coordinates

This layer sits on top of rider-entered trip text. It is not the ride history itself.

## Raw vs Derived vs Review Fields

### Raw / rider-facing trip fields

These are the fields that describe the trip as logged or corrected:

- `route`
- `direction`
- `startStopName`
- `endStopName`
- `startTime`
- `endTime`
- `duration`
- `notes`

`startStopName` and `endStopName` should preserve the rider-facing wording of the trip as corrected, not blindly overwrite everything with the official stop-library name.

### Normalization reference fields

These indicate how a trip maps to the normalized stop library:

- `startStopCode`
- `endStopCode`
- `stop_matched`

These do not mean the trip was human reviewed. They only describe stop-library linkage.

### Review fields

These describe trust/review state:

- `needs_review`
- `manually_verified`
- legacy `verified` on older records

Meanings:

- `needs_review` = suspicious or unresolved
- `manually_verified` = a human reviewed/corrected the trip and judged it to be real/plausible
- legacy `verified` should be treated as old stop-match behavior, not human review

## Coordinates

### Source of truth

Coordinates should be treated as belonging to the normalized `stops` library, not as raw trip input.

Why:

- the rider never texts coordinates
- one stop fix in `stops` should improve every linked trip
- storing coords only in `stops` avoids per-trip backfills

Current policy decision:

- canonical stop coordinates live in `stops`
- trip-level `boardingLocation` / `exitLocation` are not source-of-truth fields
- new logic should prefer normalized stop lookup over trip-level copied geometry
- new writes should avoid adding trip-level coordinates unless there is a deliberate, documented exception

### Current implementation

The current codebase historically copied derived coordinates onto trips via:

- `boardingLocation`
- `exitLocation`

These fields are derived cache-like fields, not raw rider-entered data.

The app already has fallback behavior that can resolve map geometry from normalized stops when trip-level coordinates are missing.

### Recommended policy

- `stops` owns canonical coordinates
- trips may still contain legacy copied coordinates
- new logic should not rely on trip-level coordinates as the source of truth
- over time, trip-level coordinates should be treated as deprecated cache fields rather than core trip data

## Review vs Normalization

Do not conflate these questions:

1. Is this a real/plausible trip?
2. Did this trip map to normalized stop records?
3. Is this trip eligible for ML/history use?

Those are different.

Examples:

- a trip can be `manually_verified: true` and `stop_matched: false`
- a trip can be `stop_matched: true` and still not be human reviewed
- a trip can be manually reviewed but still stay out of ML if it is incomplete

## ML / History Use

Live history and ML export should use filtered trips, not every trip.

Current policy lives in [REVIEW.md](../REVIEW.md), but the short version is:

- exclude `incomplete`
- exclude `discarded`
- exclude `needs_review`
- exclude trips that are not stop-matched

`manually_verified` is a trust signal, but not a substitute for completeness.

## Practical Mental Model

Use this model:

- `trips` = what happened
- `stops` = normalized stop dictionary
- `stop_matched` = linkage to that dictionary
- `manually_verified` = human confidence the trip is real

If a future change conflicts with this model, document it explicitly before extending the behavior.
