# Changelog

All notable changes to this project will be documented in this file.

**See also:** [Prediction Engine history](docs/ENGINE.md) · [Transfer Engine history](docs/TRANSFER_ENGINE.md) · [Network Engine history](docs/NETWORK_ENGINE.md)

## [Unreleased]

### Fixed
- **AI Stats Timezone Regression** (`functions/lib/gemini.js`): Fixed a `ReferenceError: timezone is not defined` that broke the aggregate stats tool for ASK queries.
- **Journey Linking Logic** (`functions/lib/handlers.js`): Fixed an undefined `thisStartTime` variable that prevented automated journey linking at trip end.
- **Restored Organic Agency Expansion** (`functions/lib/parsing.js`): Corrected a regression to allow unknown agencies on Line 3 of multi-line SMS messages, ensuring the system can learn new agencies organically.

### Changed
- **Dependency Modernization**: Manually updated `eslint`, `twilio`, `globals`, and `jsdom` to their latest versions, satisfying and closing multiple Dependabot security and maintenance alerts.

## [1.32.0] - 2026-05-07


### Fixed
- **Strict Multi-line Parsing** (`functions/lib/parsing.js`): Reverted the v1.26.0 regression that allowed Line 3 to be treated as an agency. Line 3 is now strictly reserved for **Direction** in 3-line messages. Explicit agency overrides now require a **4th line**, preventing stop names from being misparsed as agencies.
- **ML Pipeline Data Integrity** (`ml/export_trips.py`): Hardened the training export logic to strictly require both a **Start Stop** and an **End Stop**. This ensures that "incomplete" trips (trips without a destination) are automatically excluded from training data regardless of their verification status.
- **Incomplete Trip Normalization**: Batch-corrected 48 "incomplete" trips to nullify their `endTime` and `duration` fields, accurately reflecting that these values are unknown rather than using timeout-generated "fake" data.
- **Cedarvale Station Aliases** (`stops` library): Added "Eglinton West" and "Eglinton West Station" as canonical aliases for Cedarvale Station to preserve historical continuity.

### Added
- **Library Expansion**: Added verified stop records for **Humber College Station (Line 6)**, **Dundas/Bathurst**, **Dundas/Dufferin**, and several **GO Transit** and **BART/Muni** stations to support multi-agency travel audits.

## [1.32.0] - 2026-05-07

### Added
- **Refined SMS Prediction UX**: Balanced natural language with efficiency. Single predictions now ask a direct question ("Heading to [Stop]?") but retain the "END 1" shortcut and numeric identifiers for speed and clarity.
- **Numeric Shortcut Restoration**: Restored the "1., 2., 3." numbering and "END 1/2/3" commands for end-stop predictions, prioritizing unambiguous user confirmation over minimal text.
- **"Likely Ended" Trip Intelligence** (`functions/lib/handlers.js`, `functions/lib/network.js`): Replaced the blunt 6-hour active trip cutoff with route-aware logic. The system now uses historical median durations from the NetworkEngine to detect likely forgotten trips and suggest saving them as incomplete.
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

### Fixed
- **ML Stop Blindness** (`ml/train_routes.py`, `ml/train_endstop.py`, `functions/lib/ml_utils.js`): Fixed a major bug where V4 and V5 models were blind to stop aliases. All training and inference data is now passed through `stopsLibrary` canonicalization.
- **ML Sequence Amnesia**: Upgraded V4 and V5 to be sequence-aware. They now use the `last_end_stop` feature to understand transfers and journey context, significantly boosting accuracy.
- **ML Route/End-Stop Mismatch**: Separated the training pipelines so models are properly trained for the specific task they are asked to perform in shadow mode (Routes vs. End Stops).
- **SMS Acronym Preservation** (`functions/lib/utils.js`): Updated `toTitleCase` to respect capitalization for transit acronyms (TMU, TTC, GO, etc.) in confirmation replies.
- **SMS Stop Name Prioritization** (`functions/lib/utils.js`): Confirmation replies now prefer canonical stop names (e.g., "Spadina Ave at Nassau St") even when a numeric code is provided.

### Changed
- **Documentation synchronized**: Updated all core guides (README, ROADMAP_TECHNICAL, ROADMAP_NEXTGEN, CLAUDE, AGENTS) to reflect the current feature set and the shift to a page-based JS architecture.
- **Legacy Cleanup** (`js/main.js`): Verified and retired the legacy `js/main.js` entry point.
- **Agency mapping pruned**: Removed speculative timezone/city data for unused agencies to maintain a lean resource profile.

## [1.31.0] - 2026-05-05

### Added
- **Public profile page wired end to end** (`public.html`, `js/public.js`, `js/profile.js`, `settings.html`, `vite.config.js`, `firebase.json`, `firestore.rules`): Added a real routed public profile page, public username lookup, basic public-profile settings, username reservation, and a shareable `/public?user=...` flow. Public rendering is constrained to `isPublic == true` trips.
- **Regression test coverage for SMS/MMS routing and prediction wiring** (`functions/test_dispatcher.js`, `functions/test_handlers.js`, `functions/test_stops.js`, `functions/test_network.js`): Added focused tests for END retry dedup bypass, MMS Snap-to-Start dispatch and pending-state follow-ups (`mms_stop_needed`, `confirm_mms_route`), MMS timing metadata propagation (`startTime`, `source`, `timing_reliability`), route-aware stop selection in `lookupStop`, global NetworkGraph fallback behavior, and GTFS-corrected V4/V5 route selection before trip creation.

### Changed
- **SMS flow internals refactored for maintainability** (`functions/lib/dispatcher.js`, `functions/lib/handlers.js`): Split pending-state handling into focused state-specific helpers in the dispatcher, and decomposed `handleTripLog` agency/stop-disambiguation logic into dedicated helper functions. No behavior changes intended.

### Fixed
- **Gemini stats now bucket dates in the requested timezone** (`functions/lib/gemini.js`, `tests/gemini.test.js`): Replaced server-local date bucketing in route/day/month/streak/time-of-day helpers with shared timezone-aware date-part extraction so ASK answers stay consistent across multi-city and near-midnight trips.

## [1.30.0] - 2026-05-05

### Added
- **Route + direction-aware stop disambiguation** (`functions/lib/handlers.js`, `functions/lib/db/stops.js`): When a stop name matches multiple physical stops (e.g. "Dufferin / Lawrence" at an intersection served by both a Lawrence bus and a Dufferin bus), candidates are now filtered by route first, then direction. If one candidate remains, it's auto-selected silently. If multiple remain, the disambiguation prompt lists direction in parentheses so the user can tell them apart. Same filtering applied to end-trip stop lookup using the active trip's known route and direction.
- **`direction` field on stop documents**: Stop docs now carry a canonical direction string (e.g. `"Eastbound"`) sourced from GTFS headsigns. Used by the disambiguation filter to auto-select without prompting when the trip direction is known.
- **`findMatchingStops` returns `routes` and `direction`** (`functions/lib/db/stops.js`): Previously omitted, meaning the route filter in the disambiguation path was always a no-op. Both fields are now included so the filter actually works.
- **Global NetworkGraph** (`functions/lib/network.js`): Every trip observation now dual-writes to a global graph doc keyed by `global_{agency}_{route}` in addition to the per-user doc. Stop-sequence facts are objective (a route's stops don't change per rider), so the global graph cold-starts predictions for new users and feeds stop disambiguation without waiting for personal history. `load()` falls back to the global graph when the personal graph has no confident edges. New `loadGlobal()` method for direct access.

### Fixed
- **`lookupStop` now route-aware** (`functions/lib/db/stops.js`): When looking up a stop by name, all matching candidates are collected first. If a route is provided and multiple candidates exist, the system checks `stopRoutes` to prefer the stop that actually serves the route. Prevents wrong-stop assignment when a common intersection name resolves to a stop on a different route (e.g. stop 2070 being assigned to a 52B trip when 2070 only serves route 929).

### Data
- **Added stops 5360, 5361** (Lawrence / Dufferin, Eastbound and Westbound): GTFS-verified stops for route 52/52B on Dufferin St at Lawrence Ave. Previously missing, causing "Dufferin / Lawrence" to always resolve to stop 2070 (a 929 Lawrence Ave stop) regardless of route.
- **Added stop 2069** (Dufferin / Lawrence, Northbound): GTFS-verified Northbound stop for routes 29/329/929. Complements existing stop 2070 (Southbound).
- **Fixed stop 2070** routes array: Removed incorrectly auto-taught `52B`. Added `direction: "Southbound"`.

### UI
- **v2 homepage preview map uses real GTFS geometry** (`js/v2/v2-home.js`): All four TTC subway lines (1, 2, 4, 5) now use coordinates extracted directly from the official GTFS shapes.txt — 159 pts for Line 1, 156 for Line 2, 28 for Line 4, 102 for Line 5. Previous coordinates were hand-approximated.
- **TTC line colours corrected** (`js/v2/v2-home.js`): Line 4 updated to official magenta (`#B300B3`); Line 5 updated to official orange (`#FF8000`).

## [1.29.1] - 2026-05-04
### Fixed
- **`getTripCount` not exported from db module** (`functions/lib/db/index.js`): `getTripCount` was defined and exported in `db/trips.js` but never re-exported from the barrel `db/index.js`, so `handlers.js` received `undefined` and the SMS achievements check threw on every trip start.
- **MMS stop code missed when "Next Vehicle" sticker text is small** (`functions/lib/gemini.js`): When Gemini Vision found routes but no stop code, it silently fell back to manual entry. A second focused pass now runs on the same image, specifically prompting Gemini to locate the "Next Vehicle" / "Text stop" sticker and extract the numeric code from it (e.g. "Text 11985 to 898882" → 11985). Non-fatal if the second pass also fails.
- **MMS partial parse fallbacks ask only for what's missing** (`functions/lib/handlers.js`, `functions/lib/dispatcher.js`): When Gemini finds routes but no stop, it now replies "Got 510 and 310 — what stop are you at?" and stores the routes in a `mms_stop_needed` pending state. The user's next reply (stop name or code) is matched with the pre-saved routes and proceeds directly — no need to re-type the route. If multiple routes were found, a route disambiguation prompt follows after the stop is provided.

## [1.29.0] - 2026-05-04
### Added
- **`guessTopRoutes()` on V4 and V5 engines** (`functions/lib/predict_v4.js`, `functions/lib/predict_v5.js`): Both engines now expose a `guessTopRoutes(context, n)` method returning the top N route candidates sorted by probability. Used internally by the new GTFS correction filter.
- **GTFS-correction filter for V4/V5 route predictions** (`functions/lib/handlers.js`): Instead of suppressing a wrong V4/V5 guess, the system now picks the best prediction from the engine's top-5 that GTFS actually confirms serves this boarding stop. Falls back to the top prediction when no GTFS data exists. Predictions below 25% confidence are suppressed regardless. Applied at trip start, conflict-resolution start, and `fillPredictions`.
- **V4/V5 agency gate in `handleConfirmStart`** (`functions/lib/handlers.js`): The conflict-resolution path (trip start when active trip exists) was missing the `agency === defaultAgency` gate, so V4/V5 ran on all agencies. Fixed.

## [1.28.1] - 2026-05-04
### Fixed
- **MMS stop code extraction** (`functions/lib/gemini.js`): Improved Gemini Vision prompt to better identify numeric stop IDs (any length, typically 3-6 digits like '110' or '11985') on small 'Next Vehicle' stickers. Prompt now includes real-world examples derived from the stops library to improve extraction confidence. Fixes cases where routes were found but the stop was missed.

## [1.28.0] - 2026-05-04

### Added
- **SMS Achievements**: Automated milestone celebrations for trip counts (1st, 10th, 50th, 100th, etc.) sent directly via SMS reply.
- **Trip Counting**: High-performance Firestore aggregation for user trip totals.
- **Snap-to-start via MMS** (`functions/sms.js`, `functions/lib/dispatcher.js`, `functions/lib/handlers.js`, `functions/lib/gemini.js`): Sending a photo of a stop sign pole via MMS now starts a trip. Gemini Vision extracts stop code/name and visible route numbers. Single route → trip starts immediately. Multiple routes → numbered disambiguation prompt using the existing pending state system. Trip `startTime` is set to the photo send time (captured at webhook entry), not AI processing time. Logged as `source: 'mms'`, `timing_reliability: 'approximate'`.
- **`ml/ACCURACY_LOG.md` created**: New doc tracking live production shadow accuracy snapshots, separate from `MODEL_LOG.md` (which tracks training accuracy). First entry records pre-fix V4/V5 baseline before counter reset.
- **V4/V5 `predictionAccuracy` counters reset to 0**: Pre-fix numbers were corrupted by the agency gate and disambiguation bugs. Baseline recorded in `ml/ACCURACY_LOG.md`. V3 counters left intact.
- **V4/V5 predictions gated on user's default agency** (`functions/lib/handlers.js`): V4 and V5 models are trained on one agency's data and produce meaningless predictions on trips for other agencies. Both engines now only run when the trip agency matches `profile.defaultAgency`. V3 is unaffected and still runs on all trips.
- **V4/V5 predictions filled after stop disambiguation** (`functions/lib/handlers.js`, `functions/lib/dispatcher.js`): Trips created during stop disambiguation (user prompted to pick between multiple matching stops) were always stored with `predictionV4/V5: null` because the canonical stop name wasn't known at create time. A new `fillPredictions()` helper now runs V4/V5 after the user resolves the stop and patches the trip document, fire-and-forget.
- **`agency` field added to all `predictionStats` writes** (`functions/lib/handlers.js`): All five grading writes now include `agency: activeTrip.agency` so accuracy can be broken down by agency without a fragile timestamp join against the trips collection.
- **`createTrip` accepts optional `startTime` override** (`functions/lib/db/trips.js`): When a `startTime` is passed, it is stored as a Firestore `Timestamp` rather than `serverTimestamp()`. Enables accurate boarding time for MMS trips and any future non-realtime logging paths.
- **Retroactive verification pass** (`Tools/retro-verify.js`): Admin script that scans all completed, unverified trips and flips `verified: true` when the start/end stop names now resolve against the stops library. Supports both legacy `agency` field and new `agencies` array on stop documents. First run verified 311 trips; 90 remain unresolved (stops not yet in library). Safe to re-run as library grows.

## [1.27.1] - 2026-05-03

### Fixed
- **Cross-agency stop fallback scoped to same city** (`functions/lib/db/stops.js`): The `_findAndExpandStop` fallback previously searched the entire stops collection globally, risking a wrong-city match (e.g. Toronto Union Station resolving for a Muni trip). Now filters to stops whose home agency shares the same city per `AGENCY_CITY`. Agencies not in `AGENCY_CITY` skip the fallback entirely rather than risk a bad match.

## [1.27.0] - 2026-05-03

### Changed
- **Stops library now use agencies array for multi-agency support** (`functions/lib/db/stops.js`, `firestore.indexes.json`): Stop documents now carry an `agencies: [...]` array alongside the existing `agency` field. `lookupStop` and `findMatchingStops` query via `array-contains` so a single stop entry (e.g. Montgomery Station) resolves correctly for BART, Muni, or any other operator. All 191 existing stops migrated automatically.
- **Stop agencies array self-expands from trip data** (`functions/lib/db/stops.js`): When a stop is found via cross-agency fallback (i.e. the trip's agency isn't yet in the stop's `agencies` array), the array is updated automatically. Shared stops like Union Station or Montgomery Station grow their agency list organically as new trips are logged — no manual maintenance needed.

## [1.26.0] - 2026-05-02

### Changed
- **Agency disambiguation now asks by city, not agency name** (`functions/lib/handlers.js`): "Which Union Station? 1. LA Metro 2. TTC" now reads "Which Union Station? 1. Los Angeles 2. Toronto". Falls back to agency name when both options are in the same city (e.g. LA Metro vs LADOT). City map lives in `AGENCY_CITY` in `constants.js`.
- **Unknown agencies now accepted on line 3/4 without pre-registration** (`functions/lib/parsing.js`): Previously, only agencies listed in `KNOWN_AGENCIES` were recognized — typing "Barrie Transit" on line 4 was silently ignored and fell back to default agency inference. Line 4 is now always treated as an agency. Line 3 is treated as an agency if it doesn't resolve to a recognized direction word.

### Fixed
- **Shared transit hub stops not found under operator agency** (`functions/lib/db/stops.js`): `lookupStop` now falls back to a cross-agency search when a stop name isn't in the specified agency's library. Covers cases like Union Station (in LA Metro's library, but boarded via DASH/Foothill/Metrolink).

## [1.25.1] - 2026-05-02

### Fixed
- **`toTitleCase` capitalizing ordinal suffixes** (`functions/lib/utils.js`): Letters immediately following digits (e.g. "9th") were being uppercased to "9Th". Fixed by skipping capitalization when the non-letter prefix ends with a digit.
- **MTS, SMART, Golden Gate Transit, Amtrak, LA DOT not recognized as agencies** (`functions/lib/constants.js`): These agency names and their variants were missing from `AGENCY_CANONICAL` and `KNOWN_AGENCIES`, causing explicit agency lines to be silently ignored and the parser to fall back to last-trip agency inference.
- **Explicit agency ignored when it matches default agency** (`functions/lib/parsing.js`): `agencyExplicit` was derived from `agency !== defaultAgency`, so typing "TTC" when TTC is your default was treated as no agency specified. The parser then fell through to last-trip agency inference, picking the wrong agency (e.g. SamTrans after a Bay Area trip). Fixed by tracking whether the user actually typed an agency line, independent of whether it matches the default.
- **Null startStopName/endStopName on 10 510-route trips**: Trips logged before stop name persistence was reliable had null name fields despite valid stop codes. Backfilled GTFS names from `startStopCode`/`endStopCode` directly in Firestore. Affected trips tagged with `corrected: ['startStopName']` or `corrected: ['endStopName']` for auditability.

## [1.25.0] - 2026-04-20

### Added
- **Autonomous weekly model retraining** (`.github/workflows/retrain.yml`): GitHub Action fires every Monday at 4 AM UTC. Exports fresh trips from Firestore, retrains V4 (logistic regression) and V5 (XGBoost) with ride-count weighting, commits updated model files, and deploys functions to Firebase — no manual steps needed. Also triggerable manually via GitHub UI. Requires `FIREBASE_SERVICE_ACCOUNT` and `FIREBASE_TOKEN` secrets.
- **Ride-count weighting in V4/V5 training** (`ml/train_endstop.py`): Training examples are now weighted by same-agency ride count — recent trips count more in the loss function. Mirrors V3's per-agency ride-count decay. A trip 100 same-agency rides ago gets half the weight of the most recent trip.

- **LA Metro G Line (Orange) and J Line (Silver) added to topology** (`functions/lib/topology.json`): Both BRT lines now have full stop sequences. G Line: 17 stops, North Hollywood → Chatsworth. J Line: 13 key stops, El Monte → Harbor Gateway Transit Center via Union Station and the Harbor Transitway. Enables direction filtering from the first trip on either line.

### Changed
- **V3 recency decay now per-agency ride count, not calendar time** (v3.3.0): Previously, trip weights decayed by days elapsed — so a week in LA decayed TTC predictions even though Toronto commute patterns hadn't changed. Now decay is measured by how many same-agency rides occurred after each trip. A trip 100 same-agency rides ago counts for half what the most recent trip counts for (configurable via `DECAY_HALFLIFE_RIDES`). Being in a different city no longer ages your home network's predictions.

### Fixed
- **All SMS replies silently dropped** (`sms.js`): The idempotency fix in b385882 added a `processedMessages/{MessageSid}` write to `sms.js` before calling `dispatch()`. But `checkIdempotency()` in the dispatcher already does the same atomic write — so every message's write succeeded in `sms.js`, then `checkIdempotency` got `ALREADY_EXISTS` and returned `true` (duplicate), dropping every message with no reply. Fixed by removing the redundant write from `sms.js`. The dispatcher's `checkIdempotency` is the single source of truth for deduplication.
- **Twilio webhook retry creates duplicate trips**: When the Cloud Function took too long to respond, Twilio retried the webhook and the system processed the same message twice — creating phantom trips with garbled stop names. Fixed by atomically writing a `processedMessages/{MessageSid}` document before dispatching. If the document already exists (Firestore `create` throws ALREADY_EXISTS), the request is a retry and returns an empty TwiML response immediately.

## [1.24.0] - 2026-04-20

### Added
- **NetworkEngine v1** (`functions/lib/network.js`): New prediction engine that learns the transit graph from completed trips. Each trip end records an edge `fromStop → toStop` with duration to Firestore (`networkGraph` collection). At trip start, the graph for the current route is loaded and used as a higher-priority directional filter than topology.json — so any network (BART, Muni, LA Metro, future cities) builds itself automatically without manual stop-sequence curation. Falls back to topology.json when fewer than 3 trips have been observed on an edge. Reverse-edge inference: a B→A westbound trip also confirms A is reachable from B eastbound.
- **Network graph backfill script** (`Tools/backfill-network-graph.js`): One-time script to seed the graph from all existing trips so NetworkEngine has data immediately on deploy.
- **Route-aware stop disambiguation**: When a stop name matches multiple library entries, candidates are filtered by the trip's route before prompting. If only one candidate serves that route, it is selected automatically with no user prompt. If multiple candidates serve the route, only those are shown — narrowing the list. Falls back to all candidates when no route data exists yet for any match.
- **Stop route back-write**: Every time a trip start resolves a stop successfully, the route is written to the stop's `routes` array in the background. Stops learn which routes serve them automatically over time — no manual maintenance needed.

---

## Older Releases
Historical changes can be found in the [Changelog Archive](./CHANGELOG_ARCHIVE.md).

---
*See [migrations/](./migrations/) for scripts to address technical debt.*
