# Changelog

All notable changes to this project will be documented in this file.

**See also:** [Prediction Engine history](docs/ENGINE.md) · [Transfer Engine history](docs/TRANSFER_ENGINE.md) · [Network Engine history](docs/NETWORK_ENGINE.md)

## [Unreleased]

### Added
- **Conversational SMS Predictions**: Refined the end-stop prediction UX to be more natural. Single predictions now ask a direct question ("Heading to [Stop]?") while retaining the "END 1" shortcut for efficiency.
- **Library Expansion**: Added verified stop records for **Humber College Station (Line 6)**, **Dundas/Bathurst**, and **Dundas/Dufferin** to support multi-agency travel audits.

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

## [1.31.0] - 2026-05-05

### Added
- **Public profile page wired end to end**: Added a real routed public profile page, public username lookup, and a shareable `/public?user=...` flow.
- **Regression test coverage**: Added focused tests for END retry dedup, MMS Snap-to-Start dispatch, and timing metadata propagation.

### Changed
- **SMS flow internals refactored**: Split pending-state handling into focused helpers and decomposed `handleTripLog` for maintainability.

### Fixed
- **Gemini stats bucketing**: Gemini stats now bucket dates in the requested timezone rather than server-local time.

## [1.30.0] - 2026-05-05

### Added
- **Route + direction-aware stop disambiguation**: Candidates are now filtered by route first, then direction, auto-selecting silently if only one remains.
- **Global NetworkGraph**: Observations now dual-write to a global graph to cold-start predictions for new users.

### Fixed
- **lookupStop now route-aware**: Prevents wrong-stop assignment by checking `stopRoutes` during name-based lookup.

## [1.29.1] - 2026-05-04
### Fixed
- **MMS stop code extraction**: Improved Gemini pass for small "Next Vehicle" sticker text.

---

## Older Releases
Historical changes can be found in the [Changelog Archive](./CHANGELOG_ARCHIVE.md).

---
*See [migrations/](./migrations/) for scripts to address technical debt.*
