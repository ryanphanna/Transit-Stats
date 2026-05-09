# Changelog

All notable changes to this project will be documented in this file.

**See also:** [Prediction Engine history](docs/ENGINE.md) · [Transfer Engine history](docs/TRANSFER_ENGINE.md) · [Network Engine history](docs/NETWORK_ENGINE.md)

## [1.32.0] - 2026-05-07

### Added
- **"Likely Ended" Trip Intelligence** (`functions/lib/handlers.js`, `functions/lib/network.js`): Replaced the blunt 6-hour active trip cutoff with route-aware logic. The system now uses historical median durations from the NetworkEngine to detect likely forgotten trips and suggest saving them as incomplete.
- **Refined SMS Prediction UX**: Balanced natural language with efficiency. Single predictions now ask a direct question ("Heading to [Stop]?") but retain the "END 1" shortcut and numeric identifiers for speed and clarity.
- **Numeric Shortcut Restoration**: Restored the "1., 2., 3." numbering and "END 1/2/3" commands for end-stop predictions, prioritizing unambiguous user confirmation over minimal text.
- **V3 Sequence Awareness** (`functions/lib/predict.js`, `functions/lib/handlers.js`): Aligned the hand-coded V3 heuristic engine with the new sequence signals. V3 now uses the `last_end_stop` feature to provide a massive boost to transfer prediction accuracy.
- **User-based Visibility (Master Switch)** (`js/profile.js`): Shifted to a user-level visibility model. Toggling the public profile in Settings now automatically syncs the visibility state across all existing and new trips via a batch update.
- **Map-First Public Profile** (`public.html`, `js/public.js`, `styles/main.css`): Redesigned the public profile as a full-screen, high-impact heatmap experience. Core stats and identity now float over an interactive transit map.
- **High-intensity Heatmap Rendering** (`js/visuals.js`): Integrated `Leaflet.heat` for professional-grade heatmap visualization of user trip patterns.
- **Triple Emoji Identity system** (`js/identity.js`, `js/profile.js`, `settings.html`): Replaced the text-based username system with a visual triplet of unique emojis (e.g., 🚌🌮🐼). Triplets are now enforced to be unique (no repeated emojis). Handles are stored as URL-safe slugs (e.g., `bus_taco_panda`).
- **Interactive Emoji Picker** (`js/profile.js`, `settings.html`, `styles/main.css`): Built a custom popover picker in Settings with a curated library of 80+ transit, food, animal, and nature icons.
- **Auto-generated Emoji identities** (`js/profile.js`): New users are automatically assigned a random emoji triplet upon their first dashboard visit.
- **Agency-Linked Timezones** (`functions/lib/constants.js`, `functions/lib/db/trips.js`): Refactored timezone handling to be agency-driven. Timezones are now stored directly on every trip document at creation, ensuring historical stats remain accurate during multi-city travel.
- **Automated Coordinate Backfill** (`functions/lib/db/stops.js`): Implemented a fuzzy-matching script to assign coordinates to manual stop entries based on GTFS data. All automated updates are tagged with `source: 'automated_backfill'` for auditability.
- **Stop library caching** (`js/trips.js`): Implemented 24-hour `localStorage` caching for the stops library to reduce Firestore reads and improve dashboard load times.
- **Node 22 parallel testing** (`functions/package.json`): Modernized the backend test suite to use the native Node test runner with concurrent execution (`npm test`).
- **Library Expansion**: Added verified stop records for **Humber College Station (Line 6)**, **Dundas/Bathurst**, **Dundas/Dufferin**, and several **GO Transit** and **BART/Muni** stations to support multi-agency travel audits.

### Fixed
- **ML Stop Blindness** (`ml/train_routes.py`, `ml/train_endstop.py`, `functions/lib/ml_utils.js`): Fixed a major bug where V4 and V5 models were blind to stop aliases. All training and inference data is now passed through `stopsLibrary` canonicalization.
- **ML Sequence Amnesia**: Upgraded V4 and V5 to be sequence-aware. They now use the `last_end_stop` feature to understand transfers and journey context, significantly boosting accuracy.
- **ML Route/End-Stop Mismatch**: Separated the training pipelines so models are properly trained for the specific task they are asked to perform in shadow mode (Routes vs. End Stops).
- **ML Pipeline Data Integrity** (`ml/export_trips.py`): Hardened the training export logic to strictly require both a **Start Stop** and an **End Stop**.
- **Incomplete Trip Normalization**: Batch-corrected 48 "incomplete" trips to nullify their `endTime` and `duration` fields, accurately reflecting that these values are unknown.
- **Cedarvale Station Aliases** (`stops` library): Added "Eglinton West" and "Eglinton West Station" as canonical aliases for Cedarvale Station to preserve historical continuity.
- **SMS Acronym Preservation** (`functions/lib/utils.js`): Updated `toTitleCase` to respect capitalization for transit acronyms (TMU, TTC, GO, etc.) in confirmation replies.
- **SMS Stop Name Prioritization** (`functions/lib/utils.js`): Confirmation replies now prefer canonical stop names (e.g., "Spadina Ave at Nassau St") even when a numeric code is provided.
- **AI Stats Timezone Regression** (`functions/lib/gemini.js`): Fixed a `ReferenceError: timezone is not defined` that broke the aggregate stats tool for ASK queries.
- **Journey Linking Logic** (`functions/lib/handlers.js`): Fixed an undefined `thisStartTime` variable that prevented automated journey linking at trip end.

### Changed
- **Documentation synchronized**: Updated all core guides (README, ROADMAP_TECHNICAL, ROADMAP_NEXTGEN, CLAUDE, AGENTS) to reflect the current feature set and the shift to a page-based JS architecture.
- **Legacy Cleanup** (`js/main.js`): Verified and retired the legacy `js/main.js` entry point.
- **Agency mapping pruned**: Removed speculative timezone/city data for unused agencies to maintain a lean resource profile.
- **Dependency Modernization**: Manually updated `eslint`, `twilio`, `globals`, and `jsdom` to their latest versions.

## [1.31.0] - 2026-05-05

### Added
- **Public profile page wired end to end** (`public.html`, `js/public.js`, `js/profile.js`, `settings.html`, `vite.config.js`, `firebase.json`, `firestore.rules`): Added a real routed public profile page, public username lookup, basic public-profile settings, username reservation, and a shareable `/public?user=...` flow. Public rendering is constrained to `isPublic == true` trips.
- **Regression test coverage for SMS/MMS routing and prediction wiring** (`functions/test_dispatcher.js`, `functions/test_handlers.js`, `functions/test_stops.js`, `functions/test_network.js`): Added focused tests for END retry dedup bypass, MMS Snap-to-Start dispatch and pending-state follow-ups (`mms_stop_needed`, `confirm_mms_route`), MMS timing metadata propagation (`startTime`, `source`, `timing_reliability`), route-aware stop selection in `lookupStop`, global NetworkGraph fallback behavior, and GTFS-corrected V4/V5 route selection before trip creation.

### Changed
- **SMS flow internals refactored for maintainability** (`functions/lib/dispatcher.js`, `functions/lib/handlers.js`): Split pending-state handling into focused state-specific helpers in the dispatcher, and decomposed `handleTripLog` agency/stop-disambiguation logic into dedicated helper functions. No behavior changes intended.

### Fixed
- **Gemini stats now bucket dates in the requested timezone** (`functions/lib/gemini.js`, `tests/gemini.test.js`): Replaced server-local date bucketing in route/day/month/streak/time-of-day helpers with shared timezone-aware date-part extraction so ASK answers stay consistent across multi-city and near-midnight trips.

## [1.30.0] - 2026-05-05
