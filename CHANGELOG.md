# Changelog

All notable changes to this project will be documented in this file.

**See also:** [Prediction Engine history](docs/ENGINE.md) · [Transfer Engine history](docs/TRANSFER_ENGINE.md) · [Network Engine history](docs/NETWORK_ENGINE.md)

## [Unreleased]

### Fixed
- **V4/V5 route grading normalization** (`functions/lib/handlers.js`): Route grading now normalizes both the predicted and actual route labels before comparing, matching the agency-aware normalization applied during ML training. Previously, a V5 prediction of `510` against an actual trip logged as `510A` always scored as a miss — grading compared raw labels, not normalized ones.

### Added
- **Prediction stats analysis script** (`ml/analyze_predictions.py`): Reports hit rates by model version, top confusion pairs, confidence calibration, and high-confidence misses from live `predictionStats` data.
- **Trip count diagnostic** (`ml/count_trips.py`): Breaks down total Firestore trip count by export-filter category to understand how many trips are excluded from ML training and why.
- **V5.2/V5.3 grade backfill** (`ml/backfill_v5_grades.py`): One-time script to correct `isHit` values for V5.2/V5.3 prediction records that were mis-graded due to the normalization bug above. Also corrects the corresponding `predictionAccuracy` running counters.

## [1.34.1] - 2026-05-11

### Security
- **SSRF fix**: Validate `mediaUrl` against trusted Twilio domains (`api.twilio.com`, `media.twiliocdn.com`, `mms.twilio.com`) before fetching MMS images — prevents server-side request forgery via crafted webhook payloads.
- **ReDoS fixes**: Capped unbounded `.+` in SMS parsing regexes to `.{1,160}` (SMS max length) and made route-matching alternatives mutually exclusive to eliminate polynomial backtracking.
- **SRI hashes**: Added `integrity` + `crossorigin` attributes to Leaflet and Lucide CDN script tags in `v2.html` and `v2-home.html`; pinned Lucide to `1.14.0` (was `@latest`).
- **Secure randomness**: Replaced `Math.random()` with `crypto.getRandomValues()` in `identity.js` username slug generation.

## [1.34.0] - 2026-05-09

### Fixed
- **Multiline SMS field-order parsing** (`functions/lib/parsing.js`, `tests/parsing.test.js`): Multi-line trip logs now support both `route / stop / direction` and `route / direction / stop`, fixing cases like `506 / West / College / Spadina` that were previously misparsed with the direction stored as the stop.
- **Explicit `START` multiline parsing** (`functions/lib/parsing.js`, `functions/lib/dispatcher.js`): Messages like `START / 2 / Kipling / West` now parse as real trip starts instead of falling through to `sms_fallback`.
- **Casual trip-start phrasing** (`functions/lib/parsing.js`, `functions/lib/dispatcher.js`): Added deterministic parsing for sentence-style starts like `I'm on the 510 from Spadina and Nassau`.
- **Live route day-of-week features** (`functions/lib/predict_v4.js`, `functions/lib/predict_v5.js`): Fixed a bug in live V4/V5 route inference where `day_cos` was derived from `day_sin` instead of the actual day index, which skewed day-of-week feature encoding at prediction time.

### Changed
- **Trip stop-text preservation**: Corrected a live trip record to preserve the rider-entered stop text `College / Spadina` while still mapping it to verified TTC stop `844` (`College St at Spadina Ave`), reinforcing the rule that trip records should retain rider wording rather than overwriting it with the official stop name.
- **Trip stop-match semantics** (`functions/lib/handlers.js`, `functions/lib/dispatcher.js`): Renamed the automatic stop-resolution flag from `verified` to `stop_matched` for new writes, while keeping backward-compatible reads from older trip records.
- **ML history filtering** (`functions/lib/db/trips.js`, `ml/export_trips.py`): Live prediction history and training exports now exclude trips that are incomplete, discarded, marked `needs_review`, or missing a confirmed stop match (`stop_matched`, with fallback support for older `verified` records).
- **Manual verification signal** (`js/trips/TripController.js`, `ml/export_trips.py`): Review confirmation now stamps trips with `manually_verified: true`, and training exports carry that field so hand-reviewed trips can be identified downstream.
- **ML route normalization** (`ml/route_normalization.py`, `ml/train_routes.py`, `ml/train_endstop.py`, `ml/calibrate_v4.py`): Added a shared agency-aware route normalization helper so TTC branch, shuttle, and short-turn labels collapse into their base route family for ML, while non-TTC labels like `Red`, `K`, and `N` retain their distinct identities.
- **End-stop sequence features** (`ml/export_trips.py`, `ml/train_endstop.py`, `functions/lib/ml_utils.js`, `functions/lib/predict_v4.js`, `functions/lib/predict_v5.js`, `functions/lib/handlers.js`): Added `prev_route` and trip-gap features to the end-stop training pipeline and live shadow inference path so V4/V5 can use basic journey context rather than treating each trip start as fully isolated.
- **Line 5 station normalization** (`Tools/create-normalized-stops.js`): Promoted `Keelesdale` to `Keelesdale Station` with proper aliases and Line 5 routing, and aligned Cedarvale station metadata to include Line 5 service in the normalized stop library.
- **Trip coordinate writes deprecated** (`functions/lib/handlers.js`, `functions/lib/dispatcher.js`): New trip writes no longer copy `boardingLocation` or `exitLocation` coordinates onto trip records; canonical stop geometry now lives in the normalized stop library, with read-side fallbacks left intact.
- **Multi-agency route validation** (`functions/lib/utils.js`): Route validation now accepts legitimate named/non-TTC route labels like `Orange`, `Green Line`, `Pacific Surfliner`, and `Flagship Cruises & Events` instead of incorrectly flagging them for review.
- **Review/audit tooling** (`Tools/*.js`): Added reusable scripts for duplicate manual-verification candidates, shadow prediction audits, route-review cleanup, trip-context inspection, and review-queue triage.
- **Fallback recovery policy**: Confirmed `sms_fallback` records with clear trip-start text can be backfilled into real trip starts while preserving the original `raw_text`.

## [1.33.0] - 2026-05-07

### Fixed
- **AI Stats Timezone Regression** (`functions/lib/gemini.js`): Fixed a `ReferenceError: timezone is not defined` that broke aggregate stats for ASK queries.
- **Journey Linking Logic** (`functions/lib/handlers.js`): Fixed an undefined `thisStartTime` variable that prevented automated journey linking at trip end.
- **Restored Organic Agency Expansion** (`functions/lib/parsing.js`): Corrected a regression to allow unknown agencies on Line 3 of multi-line SMS messages, ensuring the system can learn new agencies organically.

### Changed
- **Dependency Modernization**: Manually updated `eslint`, `twilio`, `globals`, and `jsdom` to their latest versions, satisfying multiple Dependabot security and maintenance alerts.

## [1.32.0] - 2026-05-07

### Added
- **"Likely Ended" Trip Intelligence** (`functions/lib/handlers.js`, `functions/lib/network.js`): Replaced the blunt 6-hour active trip cutoff with route-aware logic using historical median durations from the NetworkEngine.
- **V3 Sequence Awareness** (`functions/lib/predict.js`): Upgraded the hand-coded V3 heuristic engine to use the `last_end_stop` signal, significantly boosting transfer prediction accuracy.
- **User-based Visibility (Master Switch)** (`js/profile.js`): Toggling the public profile in Settings now automatically syncs the visibility state across all existing and new trips via a batch update.
- **Map-First Public Profile** (`public.html`, `js/public.js`): Redesigned the public profile as a full-screen, high-impact dark heatmap experience.
- **Triple Emoji Identity system** (`js/identity.js`, `js/profile.js`): Launched a visual triplet handle system (e.g., 🚌🌮🐼) with unique constraints and an interactive picker in Settings.
- **Stop library caching** (`js/trips.js`): Implemented 24-hour `localStorage` caching for the stops library to reduce Firestore reads.
- **Node 22 parallel testing** (`functions/package.json`): Modernized the backend test suite to use the native Node test runner.
- **Automated Coordinate Backfill**: Implemented a fuzzy-matching script to assign coordinates to manual stop entries, tagged with `source: 'automated_backfill'`.

### Fixed
- **ML Stop Blindness**: Fixed a major bug where V4 and V5 models were blind to stop aliases; all data is now passed through `stopsLibrary` canonicalization.
- **ML Sequence Amnesia**: Upgraded V4 and V5 to use the `last_end_stop` feature to understand transfers and journey context.
- **ML Route/End-Stop Mismatch**: Separated the training pipelines so models are properly trained for their specific shadow-mode tasks.
- **SMS Acronym Preservation**: Updated `toTitleCase` to respect capitalization for transit acronyms (TMU, TTC, GO).
- **SMS Stop Name Prioritization**: Confirmation replies now prefer canonical stop names over numeric codes.

### Changed
- **Documentation synchronized**: Updated all core guides including [README.md](./README.md), [ROADMAP_TECHNICAL.md](./docs/ROADMAP_TECHNICAL.md), [ROADMAP_NEXTGEN.md](./docs/ROADMAP_NEXTGEN.md), [CLAUDE.md](./CLAUDE.md), and [AGENTS.md](./AGENTS.md).
- **Legacy Cleanup**: Deleted the deprecated `js/main.js` entry point.
- **Agency mapping pruned**: Removed speculative timezone/city data for unused agencies to maintain a lean resource profile.

## [1.31.0] - 2026-05-05

### Added
- **Public profile page wired end to end**: Added a real routed public profile page, public username lookup, and a shareable `/public?user=...` flow.
- **Regression test coverage**: Added focused tests for END retry dedup, MMS Snap-to-Start dispatch, and timing metadata propagation.

### Changed
- **SMS flow internals refactored**: Split pending-state handling into focused helpers and decomposed `handleTripLog` for maintainability.

### Fixed
- **Gemini stats bucketing**: Gemini stats now bucket dates in the requested timezone rather than server-local time.

## [1.30.0] - 2026-05-05

---

See also: [Documents Index](./DOCUMENTS.md)
