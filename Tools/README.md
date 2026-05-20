# Tools

Operational scripts and small utilities for Transit Stats.

Keep reusable scripts here. Do not create a second top-level scripts folder unless the repo develops a clear split between product/admin utilities and build/dev automation.

## Most Used

- `inspect-trip-context.js` — inspect one trip with nearby context for the same user
- `list-needs-review.js` — list recent trips still marked `needs_review`
- `find-duplicate-review-candidates.js` — surface likely duplicate trips for manual review
- `clear-route-review-flags.js` — clear route-review flags after confirmation
- `bulk-mark-duplicate-groups.js` — mark duplicate groups in bulk
- `audit-prediction-shadow.js` — summarize shadow prediction accuracy
- `audit-transfer-pair-candidates.js` — review repeated transfer-pair evidence before promoting it

## Review Ops

- `list-needs-review.js`
- `find-duplicate-review-candidates.js`
- `bulk-mark-duplicate-groups.js`
- `clear-route-review-flags.js`
- `retro-verify.js`
- `audit-unresolved.js`

## Prediction and Intelligence

- `audit-prediction-shadow.js`
- `inspect-trip-context.js`
- `audit-transfer-pair-candidates.js`

## Network and Stops

- `inspect-network-graph.js`
- `backfill-network-graph.js`
- `topup-network-graph.js`
- `diagnose-naming-drift.js`
- `create-normalized-stops.js`
- `gtfs-import-prep.py`

## Standalone Utility

- `Rocket/` — Rocket research instrument static files

## Placement Rule

- If you expect to run it again, keep it in `Tools/`.
- If it is a local-only throwaway script, put it in `Tools/scratch/` so it stays out of git.
- If it is a one-off migration or temporary backfill worth keeping, name it clearly as such or remove/archive it after use.
- If a category grows large enough to be annoying, split inside `Tools/` by purpose rather than adding a new repo-root folder.
