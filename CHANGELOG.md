# Changelog
- **Web App**: `v1.9.6`

## [1.9.6] - 2026-03-18

### Security
- **Patched `fast-xml-parser`**: Upgraded to `v5.5.6` to address a high-severity vulnerability where numeric entity expansion could bypass all entity expansion limits, causing excessive memory and CPU consumption (incomplete fix for GHSA-8gc5-j5rx-235r).
- **CodeQL Remediation**: Fixed multiple security alerts identified by CodeQL:
  - **Unvalidated Dynamic Method Call**: Secured the SMS command dispatcher in `functions/lib/dispatcher.js` by using `hasOwnProperty` to prevent unexpected method invocation.
  - **Polynomial ReDoS**: Refined the "and" to "&" normalization regex in `functions/lib/utils.js` to eliminate backtracking risks.
  - **Incomplete String Escaping**: Hardened `js/admin.js` by properly escaping backslashes and single quotes in the `escapeForJs` helper, preventing potential script injection.
  - **Subresource Integrity (SRI)**: Added cryptographic `integrity` hashes and `crossorigin="anonymous"` attributes to all external Leaflet and MarkerCluster scripts/styles in `index.html` to ensure asset authenticity.
- **Dependency Hardening**: Resolved critical vulnerabilities in `flatted` and `fast-xml-parser` transit dependencies via `npm audit fix` in both root and Cloud Functions.

## [1.9.5] - 2026-03-18

### Fixed
- **Deployment**: Resolved `npm ci` failures in CI/CD by syncing `package-lock.json` with the `undici` and `@tootallnate/once` version overrides in `package.json`.
- **Build**: Fixed Vite build failures related to missing entry points and module resolution.

### Refactor
- **Node.js**: Standardized Node.js engine to version 22 across the project for consistency.
- **SMS System**: Modularized the monolithic `functions/sms.js` by extracting command dispatching into a dedicated `dispatcher.js` module.
- **Frontend Architecture**: Refactored `js/main.js` to modularize DOM initialization and event listener setup, improving maintainability and reducing the size of the `initDOM()` function.
- **Error Handling**: Improved error logging and reliability for SMS request dispatching.

## [1.9.4] - 2026-03-18

### Changed
- **Build Optimization**: Simplified Vite configuration by removing missing entry points (`admin.html`, `public.html`) that are now integrated into the single-page application structure.
- **Project Structure**: Restored the root `functions/` directory from `_legacy_v1` to enable proper Firebase deployments.

### Fixed
- **Deployment**: Resolved build failures where Vite could not find `admin.html`.
- **Module Dependencies**: Restored missing utility scripts (`visuals.js`, `ui-utils.js`, `public.js`, etc.) to the `js/` directory to satisfy module imports in the V2 architecture.

## [1.9.3] - 2026-03-17

### Added
- **AI Guidelines**: Established `Gemini.md` to standardize project workflows, including Notion synchronization patterns and Git commit strategies.
- **Activity Sparkline**: Added a daily trip frequency trend visualization (last 28 days) to the dashboard sidebar for at-a-glance riding patterns.
- **Enhanced UI**: Added `prediction-card` with premium glassmorphism/gradient styling.

### Changed
- **Emerald & Slate Design Theme**: Shifted the primary color palette from indigo/purple to a sophisticated emerald and slate theme for a more grounded, premium feel.
- **Dedicated Insights View**: Extracted dashboard analytics (Commute Highlights, Peak Times, Top Lists) to a standalone view with specialized report containers.
- **Enhanced Insights View**: Fully relocated analytics cards (Commute Highlights, Peak Riding Times, Popular Routes/Stops) from the primary dashboard to a dedicated "Insights" view for a cleaner homepage experience.
- **Simplified Navigation**: Renamed "Data Manager" to "Data" and tightened header spacing (removed redundant gaps and backgrounds) for a more professional toolbar feel.
- **Streamlined Dashboard**: Refined the dashboard to a focused two-column layout (Profile/Streak + Trip Feed), eliminating sidebar clutter while restoring the functional stats column.
- **Refined Data Fetching**: Optimized stops library loading for intelligent fuzzy matches.
- **Refined Data Labeling**: Softened UI tone by standardizing analytics labels to sentence-case.
- **Repository Optimization**: Resolved "too many active changes" Git warnings by properly ignoring legacy system-generated directories.
- **Mathematical Parity**: Standardized streak and time-of-day bucket logic to match legacy V1 nuances exactly.

### Fixed
- **REDoS Vulnerabilities**: Patched multiple regular expressions across the SMS parsing engine and utility libraries to prevent catastrophic backtracking.
- **CSS Selector Protection**: Fixed an attribute injection vulnerability in the admin panel by properly escaping backslashes and quotes in dynamic selectors.
- **Optimized Rendering**: Drastically improved scroll performance (restored 60fps) by identifying and removing expensive `backdrop-filter` and `animation` bottlenecks.
- **Map Engine Stability**: Hardened `MapEngine` against re-initialization crashes, invalid coordinate data, and integrity hash failures in CDN scripts.
- **Layout Parity Fix**: Resolved a critical layout bug where a stray `</div>` tag was breaking the 3-column dashboard grid.
- **Improved Chart Scaling**: Refined the Peak Riding Times normalization and handled empty datasets more gracefully.
- **Insights Loading Parity**: Resolved a bug where analytics data failed to render in the dedicated view due to mismatched DOM target IDs.
- **Scroll Lag**: Removed `backdrop-filter` and heavy background animations that were causing frame drops during interaction.
- **Missing Environment Variables**: Restored `.env` configuration file containing Firebase SDK keys to resolve a critical app startup block.
- **Auth Initialization**: Refactored `js/main.js` to ensure DOM elements are strictly cached within the `init()` lifecycle, preventing null-reference crashes on varying network speeds.

### Security
- **Recursive Sanitization**: Implemented recursive HTML tag stripping in `gemini.js` to prevent sanitization bypasses.
- **Dependency Overrides**: Enforced secure versions of `undici` and `@tootallnate/once` via `package.json` overrides to address critical vulnerabilities.
- **Workflow Permissions**: Hardened GitHub Actions by implementing explicit least-privilege permissions for the `GITHUB_TOKEN`.

---

## [1.9.2] - 2026-03-14

### Added
- **Route Tracker** (`js/route-tracker.js`): Per-agency completion tracker that shows ridden vs. missing routes as an animated progress bar, with a toggle between "Ridden" and "Missing" views. Integrated into the main dashboard right column.
- **GTFS Route Library** (`js/admin.js`, `admin.html`): Import routes from a `routes.txt` file via the Data Manager. Supports batch deletion and per-agency filtering; routes are stored in a new `routes` Firestore collection.
- **GTFS Stop→Route Mapping** (`js/admin.js`, `admin.html`): Two-step import in the Data Manager — upload `trips.txt` to build a trip→route lookup, then upload `stop_times.txt` (streamed in 100k-row batches to keep the browser responsive) to derive which routes serve each stop. Results are stored in the new `stopRoutes` Firestore collection.
- **Prediction Route Filter** (`functions/lib/predict.js`, `js/predict.js`): `PredictionEngine.guess()` now accepts an optional `routesAtStop` array in its context. When present, candidates are hard-filtered to only routes known to serve the boarding stop, eliminating impossible predictions. Falls back to unfiltered if no candidates survive (guards against stale GTFS data).
- **`getRoutesAtStop()`** (`functions/lib/db.js`): New Firestore helper that looks up the `stopRoutes` document for a given stop code and agency, returning the routes array or `null` if no mapping exists.

### Changed
- **SMS prediction at trip start** (`functions/lib/handlers.js`): Both `handleTripLog` and `handleConfirmStart` now fetch `stopRoutes` in parallel with trip history and the stops library, then pass the result as `routesAtStop` to the prediction engine. Adds one Firestore read per trip start; no latency impact because the read is parallel.
- **Firestore security rules** (`firestore.rules`): Added `stopRoutes` collection — authenticated users can read; admin-only writes.

---

## [1.5.3] - 2026-03-14 (Cloud Functions only)

### Added
- **Journey / Trip Linking** (`functions/lib/handlers.js`, `functions/sms.js`): Sequential trips can now be chained into a multi-leg journey via the new `LINK` SMS command.
  - When a new trip starts at (or near) the stop where the previous trip ended within 45 minutes, the START confirmation includes a prompt: *"Continues your Route X trip — Reply LINK to join as a journey."*
  - `LINK` command: links the last completed trip → current active trip (Case A), or the last two completed trips (Case B). A UUID `journeyId` is written to both trip documents; if either leg already belongs to a journey, that ID is reused so journeys can grow leg by leg.
  - Validates the gap is ≤ 60 min before linking; reports the gap in the confirmation reply (e.g., *Route 510 → Route 504 linked as a journey (8 min transfer)*).
  - `LINK` is now listed in the `INFO` / `HELP` command reference.

---

## [1.9.1] - 2026-03-13

### Added
- **Dashboard Insights**: Integrated a new "Insights" section on the main dashboard that surfaces personal records (Average, Fastest, Slowest) for frequent trips, grouped by Route and Stop pair. Includes premium hover animations and refined grouping logic.
- **Mastery Rows Visualization**: Overhauled the "Top Routes" section with a frequency-based visualization system using animated progress bars, replacing "Mastery Cards".
- **Top Stops & Peak Riding Analytics**: Added new visualizations to the dashboard for most visited stops and usage distribution throughout the day.
- **Intelligent Route Icons**: Implemented context-aware emoji assignment for transit routes (e.g., subway line colors, train styles) based on route names.
- **Dynamic Bar Animations**: Introduced smooth CSS animations for all dashboard statistics bars, providing a more refined interface feel.
- **Route Analytics Documentation**: Created [ANALYTICS_PREVIEW.md](file:///Users/ryan/Desktop/Production/Transit%20Stats/ANALYTICS_PREVIEW.md) to provide a guide for using the new performance and accuracy dashboards.
- **Performance Indexing**: Implemented a high-performance Map-based index for verified stops, reducing resolution time across the entire application.
- **Stop Normalization Cache**: Introduced a memoization layer for intersection stop names to prevent redundant parsing and title-casing.
- **Text-Based Map Controls**: Redesigned map filter buttons to be minimalist, text-based tabs with accent gradient highlights.
- **Header Alignment**: Aligned the app header with the main content container in both `index.html` and `admin.html`.
- **`deleteTrip()` Function**: Implemented the missing `deleteTrip()` handler in `js/trips.js` to enable trip deletion from the edit modal.
- **`saveSettings()` Alias**: Linked the settings "Save" button to the `Profile.save()` handler.

### Changed
- **Insights Terminology**: Standardized terminology for trip performance analytics under the "Insights" brand to ensure consistency with navigation elements.
- **Minimalist Aesthetic Reversion**: Removed all glassmorphism (backdrop-filter) and all-caps text transformations (`text-transform: uppercase`) for a cleaner, more readable UI.
- **Throttled Analytics**: Increased the profile stats update debounce from 300ms to 1000ms to significantly reduce main-thread blocking during initial synchronization.
- **Enhanced Streak Robustness**: Improved riding streak calculations to handle invalid date formats and fall back to `endTime` when `startTime` is missing.
- **Dynamic Agency Status**: The profile header now reflects the user's default agency or active status based on real-time trip frequency.
- **Text-Based Header Navigation**: Stripped backgrounds and borders from header navigation links for a minimal appearance.
- **Emoji-Only Map & Settings Buttons**: Compacted secondary header actions into emoji-only icons with accessibility titles.
- **Map Engine Optimization**: Limited 'Spider Lines' to the most recent 150 trips to maintain 60fps performance with large histories.
- **Initialization Batching**: Deferred heavy calculations until after login transitions complete to ensure a smooth authentication experience.
- **Admin Panel Efficiency**: Optimized fuzzy-match logic in the Data Manager with an internal lookup cache.
- **Unified Prediction Access**: Relocated "Prediction Logs" to the Data Manager header for improved dashboard clarity.
- **Login Navigation Optimization**: Updated login flow to surface the dashboard directly, preventing UI overlap with the map.
- **Layout Standardization**: Refined global spacing and padding in `styles/layout.css` for consistent module alignment.
- **Firestore Read Reduction**: Consistently reuse `Trips.allCompletedTrips` for stats and map layers, reducing login reads from 4 to 1.
- **Eliminated Redundant Snapshot Listener**: Removed duplicate `onSnapshot` attachment from the trip save/end flow.
- **Staggered Module Initialization**: Deferred `Stats` and `MapEngine` initialization to allow the primary trip snapshot to settle first.
- **Autocomplete Debounced**: Added 120ms delay to stop name suggestions to prevent linear scan overhead on every keystroke.
- **Infinite Scroll Management**: Fixed `IntersectionObserver` accumulation by properly disconnecting previous observers before re-attaching.
- **Templates Refactored**: Optimized trip template loading to use a single read-through cache for both modals and quick-actions.
- **`predict.js` Double-Execution Removed**: Consolidated prediction logic into a single module import, removing redundant script tags.
- **Map Layer Scoped to Active State**: Optimized GPU usage by restricting the fixed map container to its visible state.

### Removed
- **Presto/Importer Integration**: Completely removed the experimental Presto CSV importer and local data visualization logic to focus on the core authenticated experience.
- **Standalone PRESTO Explorer**: Deleted `presto.html` and associated logic in `js/importer.js` and `js/main.js`.
- **Local Data Heatmap Overlays**: Removed the ability to overlay amber markers from local CSV reports on the main map.
- **Client-Side Prediction Script**: Removed `js/predict.js` script tag from `index.html` as logic is now consolidated in the module system.
- **Web-Based Trip Logging**: Deprecated the "Start Trip" action card and associated log/end modals from the dashboard in favor of SMS-based logging.
- **Active Trip Monitoring**: Removed real-time background listeners for active trips to optimize client-side battery and performance.
- **Duplicate Method Definitions**: Cleaned up ~100 lines of dead code in `js/trips.js` caused by redundant function definitions.

### Fixed
- **Dashboard Buttons Unresponsive (Critical)**: All interactive elements on the dashboard (Data Manager, Insights, Map, Settings, theme toggles, emoji selectors, trip edit/delete, etc.) were completely non-functional after login. Root cause: the Content Security Policy `script-src` directive in `firebase.json` did not include `'unsafe-inline'`, causing the browser to silently block all 30+ inline `onclick` handlers across `index.html`. Added `'unsafe-inline'` to `script-src` to restore full interactivity.
- **Indexing Storm Guard**: Introduced an `isIndexing` flag in `js/trips.js` to prevent multiple concurrent index builds, resolving a performance bottleneck when triggering rapid stop library lookups.
- **Map Render Stability**: Refactored `js/map-engine.js` to reuse the existing Leaflet map instance instead of destroying and recreating it on every filter change, eliminating UI flickering and significantly improving responsiveness.
- **Invalid Coordinate Protection**: Added defensive checks to prevent map crashes when processing trips with malformed or missing latitude/longitude data (`NaN` protection).
- **UI Freezing & Performance Lag**: Resolved critical performance bottlenecks that caused the application to freeze during data loading and autocomplete interactions:
  - **Progressive Indexing**: Rebuilt the stops library indexer to use non-blocking batch processing (`requestIdleCallback`), preventing UI lockup when loading thousands of transit stops.
  - **Pre-Normalized Search**: Optimized the autocomplete engine to use pre-calculated normalized stop names, reducing per-keystroke overhead from thousands of regex operations to simple cached lookups.
  - **Heuristic Optimization**: Refined the `normalizeStopName` helper with a faster title-casing algorithm and enhanced memoization.
- **Dashboard Syntax Error / UI Freeze**: Resolved a critical syntax error in the stats module that caused the site to become unresponsive on load.
- **Infinite Scroll Re-attachment**: Fixed a bug where "Load More" would stop functioning after the first batch of trips.
- **Zombie Listener Cleanup**: Hardened logout flow to dispose of all global listeners, preventing memory leaks and background collisions.
- **Active Trip Lifecycle**: Improved error resilience for the real-time trip observer when user contexts are missing.
- **Navigation Button Intercept**: Resolved a layout issue where the hidden map container blocked clicks on interactive header elements.
- **Delete/Save Modal Crashes**: Fixed `ReferenceError` crashes when attempting to delete trips or save user settings.
- **Profile UI Sync Fix**: Resolved an issue where the profile card would show "Syncing transit activity..." indefinitely by ensuring the UI updates as soon as trip data is loaded.
- **Streak Algorithm Accuracy**: Fixed the "Best Streak" initialization logic and added protection against invalid/NaN date formats in the riding streak calculation.

### Security & Infrastructure
- **Prediction Engine Tests**: Added 48 unit tests for `js/predict.js` covering `guess`, `evaluate`, `guessEndStop`, stop canonicalization, direction normalization, route family grouping, day/time/duration similarity scoring, and trip validation. All 58 project tests passing.
- **PRESTO Importer Retired**: Formally retired the PRESTO CSV importer feature. Source files were previously removed; roadmap updated to reflect TTC-only legacy import scope going forward.
- **Gemini API Key Rotated**: Replaced compromised key (exposed in v1.4.2 `.env` commit) with a new key stored in Cloud Secret Manager. Natural language SMS parsing restored.
- **Phone Number Redaction**: SMS Cloud Functions now route all phone number logging through the masked logger (`lib/logger.js`), replacing plaintext `console.log` calls in `lib/db.js`.
- **Firestore Read Amplification Fixed**: Denormalized `isPublic` from user profiles onto trip documents, eliminating a per-trip profile `get()` in the security rule. A one-time migration (`migrations/add-isPublic-to-trips.js`) backfilled all existing trips.
- **Email Case Normalization**: Auth flows (`signInWithPassword`, `sendMagicLink`, `sendPasswordReset`) now lowercase the email before passing it to Firebase Auth, ensuring consistency with the whitelist check.
- **Client-Side Auth Rate Limiting**: Sign-in form now locks for 15 minutes after 5 consecutive failed password attempts, tracked via localStorage. Server-side enforcement planned.
- **Removed Exposed Service Account Key**: Deleted `serviceAccountKey.json` from the project directory; key has been revoked in Firebase Console.
- **Duplicate Firestore Rule Removed**: Eliminated a duplicate `geminiRateLimits` rule block that had accumulated in `firestore.rules`.
- **Firestore Index Field Name Corrected**: Fixed a `userID` (capital D) typo in `firestore.indexes.json` that was causing a trips index to be ineffective; the broken index has been deleted and replaced.
- **Admin Write Rule Optimized**: Consolidated the redundant `exists()` + `get()` double-read in the stops write rule into a single `get()` call, reducing Firestore read costs.
- **Promise-Based Module Initialization**: Replaced fragile `setTimeout` delays (500ms/800ms) for `Stats` and `MapEngine` startup with a proper Promise that resolves after the first Trips snapshot, ensuring these modules always initialize on real data.
- **SMS Idempotency Guard**: Added a null check for `MessageSid` before the idempotency lookup in the SMS handler to prevent unexpected failures if the field is absent.

## [1.9.0] - 2026-03-12

### Changed
- **UI Refinement**: Removed redundant branding footer and layout glitches (stray arrow/characters) for a cleaner, more focused landing page.
- **Privacy Hardening**: Simplified the access request text to "Invite only." to reduce confusion.
- **Dynamic Admin Tools**: The "Prediction Logs" monitoring link is now dynamically hidden and only revealed to verified administrators after login.

### Fixed
- **Authentication Glitch**: Resolved a malformed HTML body tag that caused rendering artifacts on the login screen.
- **Cloud Security**: Hardened Firestore security rules for prediction data, ensuring users can only access their own accuracy metrics.

## [1.8.3] - 2026-03-10

### Added
- **Trip Comparison Dashboard** (`trips_comparison.html`): Introduced a new specialized view for correlating trip durations and identifying transit corridor trends over time.

### Changed
- **Dashboard Design Reversion**: Reverted the map-centric floating panel layout back to the stable, structured 3-column grid design for improved density and clarity.
- **Navigation Architecture**: Restored the classic header and navigation structure, moving the interactive map to a dedicated view (`#mapPage`).
- **Architectural Stability**: Preserved the transition to modular JavaScript (Vite + ESM) during the layout reversion, ensuring a faster and more maintainable codebase compared to the original monolithic version.

## [1.8.2] - 2026-03-10

### Added
- **Diagnostic Logging**: Added verbose console logs to `js/stats.js` and `js/trips.js` to track Firestore data retrieval and pinpoint the "0 trips" data loading issue.
- **Dashboard Profile Header**: Integrated user profile data (avatar and display name) directly into the dashboard card in `index.html` to provide immediate feedback on authentication state.

### Changed
- **UI Layout Overhaul**: Refactored the dashboard from a centered card to a floating sidebar panel (`.dashboard-floating-panel`) in `styles/layout.css`, improving map visibility and flow.
- **Improved Interaction**: Updated pointer-event rules in CSS to ensure the Admin, Settings, and Filter buttons are consistently responsive.
- **Responsive Dashboard Positioning**: Added media queries to ensure the dashboard panel adapts correctly on mobile devices.

### Fixed
- **Navigation Button Dead-Zone**: Resolved a layout issue where the dashboard container was overlapping and blocking interactive header elements.
- **Centering Logic**: Fixed rigid centering constraints that caused UI jumps between login and authenticated states.


### Added
- **PRESTO Importer (Local-First)** (`js/importer.js`): Standalone client-side CSV parser that transforms PRESTO transaction reports into map-ready spatial points.
- **Standalone PRESTO Importer** (`presto.html`): Extracted the client-side CSV parser and visualization into its own dedicated entry point rather than cluttering the main login screen.
- **Privacy-First Storage** (`js/importer.js`): Imported data is stored exclusively in the browser's `localStorage`. No data is uploaded to Firestore, ensuring public users can explore their history without creating an account or leaking personal data.
- **Vite Configuration** (`vite.config.js`): Added `presto.html` as a formal build entry point for the production output bundle.
- **Heatmap Layering** (`js/visuals.js`): Updated the visualization engine to overlay local import data (in Amber) with manual cloud trips. Includes a toggle to show/hide imported activity independently.
- **Decoupled Initialization** (`js/main.js`): Refactored the app lifecycle to load canonical stops and initialize the map engine before login, enabling unauthenticated tool usage.

### Removed
- Removed the PRESTO drag-and-drop zone from the unauthenticated state of `index.html`. Users must now visit `/presto` directly.

## [1.8.1] - 2026-03-10

### Fixed
- **Authentication UI Crash**: Resolved `TypeError` where `UI.showLoading` was called but not defined in `js/ui-utils.js`, causing the login wall to hang with a generic error toast.
- **Unified Loading States**: Implemented `showLoading` and `hideLoading` in `UI` utilities and refactored `Auth` module to use them consistently across all sign-in flows.
- **Improved Error Clarity**: Updated error handling to ensure buttons are re-enabled if a Firebase request fails (e.g., due to domain restrictions).

## [1.8.0] / [1.5.0] - 2026-03-10

### Added
- **End Stop Prediction** (`functions/lib/predict.js`, `js/predict.js`): `guessEndStop()` predicts the most likely exit stop at trip start using route family, boarding stop, direction, and time-of-day/recency weighting. Stored as `endStopPrediction` on the trip document and graded at end time.
- **Duration-Informed End Stop Prediction** (`functions/lib/handlers.js`): A second end stop prediction runs at trip end using elapsed duration as an additional signal via `_durationSimilarity()` (σ = 5 min). Tracked separately in `predictionAccuracy` (`durationEndStopTotal` / `durationEndStopHits`) so duration's marginal contribution can be measured independently.
- **`_durationSimilarity()`** (`functions/lib/predict.js`, `js/predict.js`): Gaussian similarity function over trip duration difference. Used by `guessEndStop()` when duration context is provided.
- **Intersection separator normalization** (`functions/lib/predict.js`, `js/predict.js`): `_canonicalizeStop()` now strips spaces around `/`, `&`, and `@` separators and replaces ` at ` before comparing, so `"Spadina / Nassau"` and `"Spadina/nassau"` resolve to the same canonical form.
- **`DISCARD` direct keyword** (`functions/sms.js`): `DISCARD` was only reachable via Gemini AI fallback. Added as a direct keyword handler alongside `STATUS`, `STATS`, and `INCOMPLETE`.

### Changed
- **`guessEndStop()` direction filtering** (`functions/lib/predict.js`, `js/predict.js`): Candidates are now narrowed to direction-matching trips before voting. Falls back to all directions if no direction-matched candidates exist, so sparse data doesn't produce null predictions unnecessarily.

### Fixed
- **Continue Button Responsiveness (Critical)**: Resolved a recurring issue where the "Continue" button on the login screen was non-responsive in production. Root cause was missing environment variables in the CI/CD pipeline.
- **CI/CD Build Pipeline**: Updated GitHub Action merge workflow to inject `VITE_` secrets during the build process, ensuring production assets are correctly configured with Firebase credentials.
- **Login UX Resilience**: Defaulted the "Continue" button to `disabled` in HTML to prevent premature interaction. Added explicit configuration validation and safety wrappers in `main.js` and `firebase.js` to provide immediate notification if initialization fails.
- **Module Initialization Safety**: Hardened `admin.js` and `public.js` with robust Firebase initialization checks and error reporting.
- **Admin Deployment Fix**: Corrected `admin.html` which was missing critical script tags, rendering the data manager inoperable in production.
- **Refactored Infrastructure**: Consolidated Firebase configuration into a single shared `js/firebase.js` module, removing redundant/fragile redefinitions in `admin.js` and `public.js`.
- **Global Auth Lifecycle**: Implemented `clearAppContext()` and integrated it into the logout flow to ensure real-time listeners and shared global state (like `activeTrip`) are properly disposed of on logout.
- **Security Utility Centralization**: Moved `escapeHtml` and `escapeForJs` to `js/ui-utils.js` for consistent sanitization across all application modules.
- **Developer Bypass Logic**: Added a `window.bypassLogin()` helper available only on `localhost` to allow testing the dashboard and map without triggering real Firebase authentication or secondary verification emails, ensuring production services remain "clean."

## [1.4.0] - 2026-03-09

### Added
- **Stops library injection** (`functions/lib/handlers.js`, `functions/lib/db.js`): `getStopsLibrary()` fetches all stops from Firestore and injects them into `PredictionEngine.stopsLibrary` before each `guess()` call. Stop canonicalization (v3 feature) is now active on the SMS path — previously `stopsLibrary` was always empty on the server.

### Changed
- **Prediction committed at trip start** (`functions/lib/handlers.js`): `guess()` now runs at the moment a trip starts and the result is stored on the trip document. `handleEndTrip` grades the stored prediction against the actual trip instead of reconstructing a hypothetical at end time. This makes accuracy scores meaningful — the engine has to commit before knowing the answer.
- **`handleConfirmStart` prediction ordering** (`functions/lib/handlers.js`): History is now fetched before the previous trip is marked incomplete, so the candidate pool isn't contaminated by the trip being closed out.
- **Prediction Engine v3 synced to server** (`functions/lib/predict.js`): Server-side engine was on v2. Synced with client-side v3: trip validity filter (`_isValidTrip`), stop canonicalization (`_canonicalizeStop`, `_stopMatch`), distance-based weekday similarity, direction normalization (`nb/sb/eb/wb`), and the `Line 1` base route fix.

### Fixed
- **Missing Firestore composite index** (`firestore.indexes.json`): `getRecentCompletedTrips` queries `userId + endTime != null ORDER BY endTime DESC` but only an `endTime ASC` index existed. Every prediction history fetch was failing silently. Added the `userId ASC + endTime DESC` index.
- **Incomplete trips polluting prediction history** (`functions/lib/db.js`): `getRecentCompletedTrips` filtered on `endTime != null`, but incomplete trips have `endTime = startTime` (not null) and were included in the candidate pool. Added a post-fetch filter to exclude trips with `incomplete: true`.
- **Variable name typo** (`functions/lib/handlers.js`): `handleEndTrip` passed `history` (undefined) instead of `historyBeforeEnd` to `PredictionEngine.evaluate()`, causing every SMS prediction evaluation to silently fail and write nothing to `predictionStats`.

## [1.3.1] - 2026-03-09

### Fixed
- **Parsing Heuristics** (`functions/lib/parsing.js`): Fixed multiple edge cases in the natural language SMS parser:
  - Addressed an issue where spaces within stop codes (e.g., "123 45") were not properly ignored, causing them to be incorrectly parsed as stop names.
  - Fixed a logical flow issue where sending *only* an agency name (e.g., "TTC") with no other message body would fail to identify the override correctly.
  - Added `TO` and `ROUTE` to the list of unlikely conversation starters to prevent legitimate user inputs (e.g., "To the Beach", "Route 66") from being improperly rejected by the conversational filters.

### Documentation
- **Vulnerability Reporting** (`SECURITY.md`): Updated the security policy to direct all vulnerability reports to the secure GitHub Private Vulnerability Reporting tool, replacing the previous manual process.

### Fixed
- 

## [1.7.0] / [1.3.0] - 2026-03-08

### Fixed
- **END Trip Crash (Critical)** (`functions/lib/handlers.js`): `handleEndTrip` was crashing before updating Firestore because `getRecentCompletedTrips` (used for silent prediction evaluation) requires a composite index that did not exist. Moved the history fetch inside the prediction `try-catch` block so a missing index or query failure can never prevent a trip from being ended or the reply from being sent.
- **Idempotency Race Condition** (`functions/lib/db.js`): `checkIdempotency` used a read-then-write pattern that allowed two simultaneous Twilio retries to both slip through, creating duplicate trips. Replaced with an atomic `create()` call that fails with `ALREADY_EXISTS` if another request already claimed the message.
- **Gemini Field Confusion** (`functions/lib/gemini.js`): Gemini was confusing route numbers and stop codes when both appeared in the same message (e.g. stop code landing in the route field). Improved the prompt to explicitly instruct Gemini to never infer or guess a route, and to only treat a number as a stop_id when it is explicitly labeled as a stop in the message text. Removed the previous digit-count heuristic ("4-digit") which was incorrect for many cities where stop codes are 3–5+ digits.

### Changed
- **CI/CD: Auto-deploy Functions** (`.github/workflows/firebase-hosting-merge.yml`): Added a functions deployment step to the merge workflow. Cloud Functions were previously never auto-deployed on push to `main`, meaning every function change since GitHub Actions was set up had silently gone unshipped.

### Added
- **Trip Validity Filter** (`js/predict.js`): `_isValidTrip()` screens the candidate pool before voting. Trips with null stop names, sentence-length stop names (> 60 chars), SMS-sentence patterns (`"just boarded"`, `"headed northbound"`, etc.), or word-only route fragments (`"St"`, `"Station"`, `"Park"`) are excluded. Catches all known bad-parse trips without affecting legitimate routes including alphanumeric variants like `52g`.
- **Stop Canonicalization** (`js/predict.js`): `PredictionEngine.stopsLibrary` property and `_canonicalizeStop()` helper added. `_stopMatch` now resolves both stop names through the library before comparing, so alias variants like `"SPADINA"`, `"Spadina"`, and `"Spadina Station"` are treated as the same stop.
- **Stop Library Aliases** (Firestore `stops` collection): Expanded aliases for York University (`Yorku`, `YORKU`), Sheppard-Yonge, Lawrence West, Spadina Station, Queen's Park, St George, St Andrew, St Patrick, and Union Station to cover common SMS-parsed variants.
- **Direction Field** (`js/trips.js`, `index.html`): The trip logging form already had a direction input but it was never read or saved. `start()` now reads `directionInput`, normalizes the value through `_normalizeDirection`, and writes it to the trip document.
- **Stop Autocomplete** (`js/trips.js`): Context-aware stop suggestion dropdown on the boarding and exit stop inputs. Suggestions are drawn from trip history and the verified stops library, ranked by relevance to the currently entered route, direction, and (for exits) the active boarding stop. History stops are deduplicated using the intersection normalizer so `"Spadina & Nassau"` and `"Spadina / Nassau"` appear as one suggestion. Library stops are marked with a ★ badge; route-boosted stops show a route or "frequent exit" hint chip. Arrow keys, Enter, and Escape are supported.
- **Intersection Stop Normalizer** (`js/trips.js`, `js/admin.js`): `normalizeStopName()` / `normalizeIntersectionStop()` canonicalizes free-form intersection inputs to a consistent `Street A / Street B` format, handling `/`, `&`, and `at` separators with proper title-casing. Stop code prefixes are preserved. The normalizer is intentionally non-destructive — it powers suggestions and clustering but does not silently rewrite saved data.
- **Admin Inbox Clustering** (`js/admin.js`): Pending stops are now grouped by their normalized intersection form before display. Variant spellings of the same stop collapse into one inbox entry with an "Also seen as:" row, and their trip counts are summed. A `pendingVariantsMap` is maintained so that linking or accepting any clustered entry automatically resolves all variants at once — adding each spelling as an alias and verifying all affected trips in a single action.

### Changed
- **Prediction Engine v3** (`js/predict.js`): Bumped version to 3. Four improvements shipped together:
  - **Trip validity filtering** — `_isValidTrip()` excludes malformed SMS-parse trips from the candidate pool before voting.
  - **Stop canonicalization** — `_stopMatch` resolves names through the stops library so alias variants collapse to one canonical form. Library is injected at load time via `PredictionEngine.stopsLibrary`.
  - **Distance-based day similarity** — weekday similarity is now graduated by calendar distance (`Mon vs Tue = 0.85`, `Mon vs Fri = 0.40`) instead of a flat `0.5` for all weekday pairs. Weekend days score `0.7` vs each other.
  - **Direction normalization on votes** — votes now store the normalized direction string rather than the raw trip value, so the returned prediction direction is consistent regardless of how the original trip was logged.
- **Route family grouping** (`js/predict.js`, `functions/lib/predict.js`): `510`, `510a`, `510b`, and `510 Shuttle` now pool their votes into a single bucket keyed by base route number. The most weight-heavy specific variant is returned as the prediction.
- **Stops library wired to engine** (`js/main.js`): After loading the stops library, `PredictionEngine.stopsLibrary` is set so the engine can resolve stop names immediately without a separate call.
- **Trip history filter** (`js/trips.js`): `allCompletedTrips` was filtering on `endStop != null`, which excluded all SMS-imported trips (which use `endStopName` instead). Filter now accepts either field.
- **Enhanced Stop Library Lookup** (`js/trips.js`): `lookupStopInLibrary()` now tries the normalized intersection form alongside exact matching, so stops entered with different separators or casing still resolve to a verified library entry.
- **HTML Structure** (`index.html`): Moved `appContent` and `mapPage` out of `authSection` to be siblings at the container level, matching the original pre-redesign structure.
- **Auth State Management** (`js/auth.js`): `showApp()` now explicitly shows `appContent` and `mapPage` on login; `showAuth()` hides `mapPage` on logout.
- **Dead Code Removal** (`js/trips.js`): Removed event listener setup for `stopInput`, `routeInput`, `startBtn`, `endBtn`, and `cancelTrip` — all removed from the UI when web trip logging was dropped in favour of SMS-only entry.
- **Documentation**: Updated `ROADMAP.md` format to match the hybrid layout used in the Navigator project.

### Fixed
- **Prediction Engine blind spot** (`js/trips.js`): `allCompletedTrips` was always empty for SMS-based users because the filter checked `endStop` (web schema) while SMS trips use `endStopName`. The prediction engine was evaluating against zero history on every trip.
- **Direction comparison bug** (`js/predict.js`): `evaluate()` compared raw direction strings — `"SOUTH" === "Southbound"` returned false, causing hits to be logged as misses. Both sides now pass through `_normalizeDirection()` before comparison.
- **Direction abbreviations** (`js/predict.js`): `_normalizeDirection()` now handles `nb/sb/eb/wb` and `"eastward"` in addition to existing cardinal and full-word forms.
- **Direction input not cleared on modal close** (`js/trips.js`): `closeLogTripModal()` now resets the direction field alongside the other inputs.
- **Prediction Route Family Bug** (`js/predict.js`, `functions/lib/predict.js`): `_baseRoute()` was stripping word-based route names entirely — `"Line 1"` collapsed to an empty string, causing Line 1 and Line 2 trips to pool their votes together. Fixed by only applying suffix stripping to routes that begin with a digit.
- **Critical Layout Bug** (`index.html`, `js/auth.js`): `appContent` and `mapPage` were nested inside `authSection`. On login, hiding `authSection` also hid the dashboard and map controls. Resolved by restructuring the DOM and updating `showApp()`/`showAuth()`.
- **App Content Never Shown** (`js/auth.js`): `showApp()` was setting `appContent.style.display = 'none'` immediately before calling `fadeInSection()`, which only transitions opacity. Content was never made visible.
- **Malformed HTML** (`js/map-engine.js`): Removed duplicate opening `<div>` in the "No location data" placeholder, which left an unclosed element in the DOM.
- **Login Button Responsiveness**: Resolved an issue where the "Continue" button could be unresponsive during hot-reloads by updating initialization logic in `js/main.js` to check `document.readyState`.
- **Form Submission**: Added `e.preventDefault()` to the "Continue" button in `js/auth.js` to prevent unintended form submissions.

## [1.6.0] - 2026-03-08

### Added
- **Password Reset Flow**: Implemented a fully functional password reset system in `js/auth.js`, allowing users to securely recover account access from the login screen.
- **Flat ESLint Configuration**: Migrated the Cloud Functions module from the deprecated `.eslintrc.js` to the modern, faster `eslint.config.js` format (Flat Config).

### Changed
- **Authentication UX Hardening**:
  - Overhauled the login and "Check your email" screens with improved visual feedback and micro-interactions.
  - Standardized button states and validation logic to prevent premature form submission.
- **Dependency Refresh**: Synchronized frontend and backend dependencies, including critical updates for `firebase-functions`, `express`, and `twilio`.

### Fixed
- **Login Resilience**: Resolved several edge cases where the authentication flow could hang during network transitions.
- **Cloud Function Security**: Modernized secret retrieval patterns to ensure high-performance access to Twilio and Gemini credentials in 2nd Gen functions.


## [1.5.1] - 2026-03-07

### Fixed
- **Login UX (Critical)**: Resolved a critical issue where the login button was completely non-responsive on both local and hosted environments. Fixed by adding the missing `signInBtn` DOM element to `index.html` and properly exposing required authentication helper functions (`goBackToEmail`, `sendPasswordReset`) in `js/auth.js`.
- **Production Sync**: Synchronized the build and hosting pipeline to ensure production assets correctly reflect the latest security and UI fixes.

## [1.5.0] / [1.2.0] - 2026-03-07

### Changed
- **Cloud Functions Migration (Critical)**: Fully migrated Cloud Functions from **1st Generation** to **2nd Generation** (v2). This modernization improves cold-start performance, increases request concurrency (up to 50 simultaneous requests per instance), and ensures long-term compatibility with the Firebase platform.
- **SDK Upgrade**: Upgraded `firebase-functions` and `firebase-admin` to the latest stable versions.
- **Modern Secret Handling**: Unified all sensitive credentials (Twilio, Gemini) under the 2nd Gen `defineSecret` pattern, completely removing dependency on deprecated environment variable and `functions.config()` access methods.

### Security
- **Twilio Signature Validation**: Re-enabled and hardened Twilio signature validation using secure Secret Manager tokens. This ensures all inbound SMS webhooks are cryptographically verified to be from Twilio, protecting against unauthorized request forgery.
- **Secret Isolation**: Moved all secrets to Google Cloud Secret Manager with explicit per-function access control.
- **Subresource Integrity (SRI)**: Added cryptographic integrity hashes to all external CDN resources (Leaflet, Leaflet.markercluster, and Firebase SDKs) in `index.html`, `public.html`, and `admin.html`. This ensures the browser verifies the authenticity of fetched assets, mitigating risks from CDN compromise and resolving the CodeQL `functionality-from-untrusted-source` security alert.
- **Incomplete String Escaping**: Addressed a security vulnerability in `js/admin.js` where backslashes and quotes were not properly escaped in dynamic strings interpolated into inline HTML event handlers. Replaced legacy `.replace(/'/g, "\\'")` with a dedicated `escapeForJs()` helper that properly escapes backslashes, quotes, and newlines, resolving CodeQL alert #5 and preventing potential Cross-Site Scripting (XSS) and injection attacks.

## [1.1.9] - 2026-03-07

### Security
- **Secret Migration (Critical)**: Migrated all cloud function secrets (`TWILIO_AUTH_TOKEN`, `TWILIO_ACCOUNT_SID`, `TWILIO_PHONE_NUMBER`, `GEMINI_API_KEY`) from deprecated `functions.config()` to the modern `defineSecret` (Firebase params module). This resolves critical "500 Internal Server Error" crashes in newer Node.js 20 environments where the legacy config object is no longer available.
- **Webhook Hardening**: Re-implemented Twilio signature validation with a robust fallback mechanism that accounts for Firebase Functions' URL path rewriting (stripping `/sms`). The system now intelligently validates signatures against both the original reconstructed URL and a strict `/sms` suffix.

### Fixed
- **Observability**: Added verbose request body logging and validation audit logs to help diagnose delivery issues without exposing PII.

## [1.4.9] - 2026-03-07

### Security
- **Complete String Escaping (High)**: Addressed a CodeQL `incomplete-sanitization` vulnerability in `js/admin.js` where backslashes and double quotes were not properly escaped in dynamic strings interpolated into inline HTML event handlers. Implemented a robust `escapeForJs()` helper to securely sanitize all dynamic JavaScript variables injected into DOM attributes, preventing potential Cross-Site Scripting (XSS) and injection attacks via maliciously crafted stop names or aliases.

### Fixed
- **Maps**: Corrected tile server SSL validation for `memomaps.de` and `openstreetmap.org` in `js/map-engine.js` and `js/public.js`. Resolved "Mixed Content" and SSL certificate errors that caused the map layer to fail to load in several regions.
- **Testing**: Added `take_screenshot.js` utility for automated UI auditing.

## [1.1.8] - 2026-03-07

### Security
- **Hardening (Critical)**: Enforced `fast-xml-parser@^5.4.2` via `overrides` in Cloud Functions to resolve a stack overflow vulnerability in `XMLBuilder` (CVE-2026-27942 / GHSA-fj3w-jwp8-x2g3). This ensures all primary and transitive dependencies use the patched version, clearing a Dependabot block caused by version conflicts in the dependency tree.


## [1.4.8] - 2026-03-07

### Fixed
- **SMS Outage (Critical)**: Fixed a complete SMS outage caused by Twilio webhook signature validation always failing. Firebase strips the function name (`/sms`) from `req.originalUrl` before passing to Express, so the constructed validation URL was `https://.../` instead of `https://.../sms`. Every inbound message returned 403, silently dropping all replies.
- **Login**: Removed hardcoded `disabled` attribute on the Continue button that prevented login when the email field was autofilled by the browser. The `input` event doesn't fire on autofill so the button was never re-enabled.
- **Deploy**: Removed orphaned `postinstall: patch-package` script from `functions/package.json`. No patches directory exists, causing every deploy to fail with `sh: patch-package: not found`.

### Changed
- **Prediction Engine v2** (`functions/lib/predict.js` + `js/predict.js`): Complete rewrite from additive point scoring to stop-first filtering with multiplicative weighted voting. Each past trip votes for its (route, direction) pair with weight = `recency × time_similarity × day_similarity`. Sequence boost applies when the last trip ended at the current stop. Versioned as `VERSION: 2`.
- **Prediction Accuracy**: Added `isPartialHit` to evaluation — base route correct but variant wrong (e.g. predicted `510`, actual `510a`) counts as partial credit rather than a full miss.
- **Prediction Normalization**: Added `_normalizeDirection()` helper to both predict.js files. Vote keys now normalize direction variants (`"SOUTH"`, `"Southbound"`, `"SB"` → `"Southbound"`) and lowercase route names (`"510A"` = `"510a"`) so fragmented data doesn't split vote weight.
- **History Contamination Fix**: In `handlers.js`, trip history is now fetched *before* the active trip's `endTime` is written, so the current trip is never included in its own prediction evaluation.

## [1.1.7] - 2026-03-07

### Security
- **Incorrect Control Flow Scoping (Critical)**: Upgraded `@tootallnate/once` to `^3.0.1` via `overrides` in Cloud Functions to resolve a vulnerability where promises could hang indefinitely when an `AbortSignal` was used. This prevents potential control-flow leaks that could lead to stalled requests or degraded application availability.
- **Dependency Update (Critical)**: Upgraded `minimatch` to `^3.1.5` via `overrides` in Cloud Functions to resolve a high-severity Regular Expression Denial of Service (ReDoS) vulnerability (CVE-2026-27903).
- **Hardening (Critical)**: Upgraded `fast-xml-parser` to `^5.4.2` in Cloud Functions to resolve multiple vulnerabilities:
    - **CVE-2026-26278 / GHSA-jmr7-xgp7-cmfj**: Denial of Service (DoS) via unlimited entity expansion.
    - **CVE-2026-25896 / GHSA-p7r7-862r-f24w**: Entity encoding bypass via regex injection in DOCTYPE entity names.
- **Dependency Update (High)**: Upgraded `axios` to `^1.13.5` in Cloud Functions to resolve a Denial of Service vulnerability via `__proto__` key in configuration objects.
- **Hardening (Critical)**: Addressed a Denial of Service (DoS) vulnerability in the `qs` library (CVE-2025-15284 bypass) where `arrayLimit` was not enforced for comma-separated values.
- **Dependency Audit**: Performed a comprehensive security audit on Cloud Function dependencies and implemented `overrides` in `package.json` to enforce secure versions of transitive dependencies.

## [1.4.6] - 2026-03-05

### Added
- **Automation**: Implemented **GitHub Actions** for seamless CI/CD. The application now automatically builds and deploys to Firebase Hosting on every push to the `main` branch.
- **Automation**: Added a secondary GitHub Action for **Preview Deployments** on Pull Requests, allowing verification of changes before they hit production.
- **Infrastructure**: Configured **Vite** as the primary build engine to generate optimized production assets in the `/dist` directory.

### Changed
- **UI/UX**: Complete dashboard refactor to a "Centered Card" layout, focusing data density and improving visual hierarchy.
- **UI/UX**: Modularized the monolithic CSS architecture into a scalable system: `base.css`, `components.css`, `layout.css`, `features.css`, and `modals.css`.
- **Hosting**: Updated Firebase Hosting configuration to serve exclusively from the optimized `/dist` folder for enhanced performance and security.

## [1.4.5] - 2026-03-04

### Fixed
- **SMS Security**: Fixed a critical issue where inbound SMS requests were being rejected with a 403 Forbidden error due to Twilio signature validation failures. The validation now robustly checks both Secret Manager and legacy config tokens if both are present.
- **SMS Debugging**: Added explicit URL logging to failure conditions to help diagnose environment-specific webhook misconfigurations.

### Security
- **Repository Scanning Settings**: Fully enabled Private vulnerability reporting, Dependabot updates (version & security), and CodeQL scanning via newly created configuration files (`.github/dependabot.yml` and `.github/workflows/codeql.yml`).

## [1.4.4] - 2026-03-04

### Documentation
- **Manifest Header**: Added explicit version tracking for both the Web App and Cloud Functions at the top of the changelog to clarify the independent versioning of the frontend and backend projects.

## [1.4.3] - 2026-03-04

### Added
- **Modular Architecture**: Refactored the monolithic `sms.js` into a clean, modular structure under `functions/lib/`. New modules include `db.js`, `handlers.js`, `parsing.js`, `gemini.js`, `twilio.js`, `utils.js`, `logger.js`, and `config.js`.
- **PII-Safe Logger**: Added a dedicated `lib/logger.js` utility that automatically masks phone numbers (e.g., `+1647***4567`) and redacts message bodies in system logs to prevent accidental PII leaks.
- **Centralized Trip Creation**: Added a reusable `createTrip` helper in `db.js` to ensure consistent data schema and meta-tagging across all trip logging flows.
- **Parsing Test Suite**: Created a comprehensive test suite in `tests/parsing.test.js` (verified via `/tmp/test_parsing.js`) covering edge cases for stop codes, multi-line formats, agency overrides, and unicode/emoji support.

### Changed
- **SMS Reliability**: Fixed Twilio credential retrieval to support both Secret Manager (`twilioAuthToken`) and legacy `functions:config`. This ensures the rotated token is correctly identified.
- **Login UX**: Fixed a bug where the "Continue" button remained disabled during email autofill. Added `change` event listener and immediate validation on load to handle pre-filled states.
- **Code Quality**: Fixed over 1,000 linting issues (indentation, quotes, long lines) and consolidated redundant logic across the SMS service.
- **Firebase Initialization**: Unified Firebase Admin SDK initialization into a single point of entry in `db.js`, reducing cold-start overhead.
- **Robust Heuristic Parsing**: Significant improvements to `lib/parsing.js`:
    - **Regex Overrides**: Migrated agency detection to regex to support overrides separated by spaces, tabs, or **newlines**.
    - **Flexible Multi-line**: Added support for the `Route\nStop\nAgency` format (detecting agency on line 3 if direction is omitted).
    - **Whitespace Resilience**: `toTitleCase` now collapses multiple spaces/tabs into a single space and handles empty/whitespace-only inputs gracefully.
    - **Natural Language Filtering**: Refined heuristics to prioritize transit-related "The" and "Route" names while still blocking common conversational starters.

### Security
- **PII Redaction (High)**: Automated redaction of sensitive user data from all `logger.info` calls.
- **AI Rate Limiting (High)**: Implemented a dedicated Gemini AI rate limit (10 calls/hour per user) to protect against resource abuse and cost exhaustion. Added `isGeminiRateLimited` check to all AI-powered handlers.
- **Verification Security (High)**: Migrated verification code generation from `Math.random()` to Node's cryptographically secure `crypto.randomInt()`.
- **Secret Management (High)**: Migrated `TWILIO_AUTH_TOKEN` from environment variables to Google Cloud Secret Manager via `defineSecret`.

### Reliability & Resilience
- **AI Fail-Safe (Medium)**: Added comprehensive error handling to Gemini Q&A and parsing modules. The system now falls back to standard heuristic responses if the AI service is unavailable, preventing function crashes.
- **Resource Capping (Medium)**: Added a 100-trip history limit to AI queries and a 500-character cap on AI responses to optimize token usage and prevent excessive Twilio costs.

## [1.4.2] - 2026-03-04

### Security

- **Twilio Webhook Forgery (Critical)**: Added `validateTwilioSignature` middleware to the SMS Cloud Function. All inbound `POST /sms` requests are now verified against the `X-Twilio-Signature` header using `twilio.validateRequest()`. Requests that fail validation are rejected with HTTP 403. Validation is bypassed only in the Firebase emulator (`FUNCTIONS_EMULATOR=true`).
- **Auth Bypass on Firestore Error (High)**: The `catch` block in the whitelist check (`js/auth.js`) previously allowed users through when the Firestore check threw an error. It now signs the user out and surfaces an error message instead, closing the silent bypass.
- **`allowedUsers` Over-Read (High)**: Any authenticated user could previously read the entire `allowedUsers` collection, exposing every registered user's email and admin status. The Firestore rule now restricts reads to the user's own document only (`request.auth.token.email.lower() == email`). The `auth.js` whitelist check was simplified to a direct `doc.get()` to match the tighter rule.
- **Email Enumeration (Medium)**: `auth/wrong-password` and `auth/user-not-found` returned distinct error messages, allowing attackers to determine whether an email address exists. Both now return the same message: *"Incorrect email or password."*
- **Missing HTTP Security Headers (Medium)**: Added `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: geolocation=self, camera=(), microphone=()` to all hosted pages via `firebase.json`.
- **Credentials in Git (Low)**: `functions/.env` and `functions/.env.*` added to `.gitignore` to prevent future accidental commits. **Twilio Auth Token successfully rotated** and manual rotation steps documented in **[Credential Exposure Incident](SECURITY.md#credential-exposure-incident-march-2026)**.

## [1.4.1] - 2026-03-04

### Added
- Security hardening for Gemini API integration.
- Automated API key auditing guidelines in `SECURITY.md`.

### Changed
- Migrated Gemini API key management to Google Cloud Secret Manager.
- Refactored `functions/sms.js` to use `defineSecret` for enhanced environment isolation.
- Strictly restricted the frontend API key to ONLY Cloud Firestore and Identity Toolkit services.

## [1.4.0] - 2026-03-03

### Added
- **UI/UX**: Professional SVG iconography system replacing legacy emojis across all modals, headers, and navigation.
- **UI/UX**: Premium brand identity on the login portal featuring a custom SVG transit icon with a vibrant gradient container.
- **UI/UX**: New `--accent-gradient` design token for consistent high-end branding.
- **UI/UX**: Professional empty-state layouts with improved descriptive text and minimalist styling.
- **Map**: Complete redesign of the background map using an "Apple Maps" inspired aesthetic. Transitioned to a "No-Labels" base layer with a permanent transit-focused OpenRailwayMap overlay.
- **Map**: Intelligent map theme switching—automatically toggles between minimalist Light and Dark base tiles based on application theme.
- **Map**: Refined visual paths (Spider Map) with subtler dashed indigo lines and high-contrast, premium stop markers.
- **Map**: New `MapEngine.refresh` logic to ensure the map updates immediately when switching themes or filters.
- **UI/UX**: Added smooth CSS transitions for map markers and interactive elements.

### Changed
- **UI/UX**: Premium High-Contrast redesign of the landing page and authentication portal.
- **UI/UX**: Depth-layered surface system with custom elevation shadows and solid-contrast borders.
- **UI/UX**: Subtle dot-grid background pattern with radial glow effect for a more immersive feel.
- **UI/UX**: Removed simulated vehicle emojis from the login map to ensure a cleaner, more professional presentation.
- **Map**: Enhanced transit network visibility by increasing the opacity of the OpenRailwayMap architectural layer.
- **UI/UX**: Enabled interactive panning and zooming on the dashboard map while maintaining a static background for the login screen.
- **UI/UX**: Transitioned primary action buttons to "Electric Indigo" with glow-effect shadows.
- **UI/UX**: Improved visual feedback for disabled button states (gray-out + not-allowed cursor).
- **UI/UX**: Modernized typography across the sign-in flow using high-contrast 'Inter' weights.
- **Auth**: Hardened the whitelist check to attempt both collection queries and direct document lookups, ensuring compatibility with strict Firestore rules.
- **Admin**: Streamlined admin access by unifying the magic-link authentication flow across the entire platform.
- **Build**: Optimized Vite configuration to exclude heavy Firebase dependencies from pre-bundling, improving dev server start times.
- **Build**: Set `server.open: false` in Vite to prevent intrusive browser auto-opening during development.

### Fixed
- **Auth**: Resolved "Missing or insufficient permissions" errors on the login screen by deferring metadata loading until after successful authentication.
- **UI/UX**: Fixed a state management bug where the `user-logged-in` body class was not correctly toggled during the sign-out flow.
- **UI/UX**: Resolved an issue where the "Continue" button appeared active but was non-responsive when opened via the `file://` protocol.
- **UI/UX**: Improved mobile experience by hiding map attribution tiles on screens smaller than 480px.
- **Map**: Optimized geolocation performance by removing redundant high-accuracy overhead when not required.

## [1.3.0] - 2026-02-28

### Added
- **SMS**: AI-powered natural language Q&A — ask any question about your trip history and get an answer via SMS (e.g. "How long does my commute usually take?").
- **SMS**: `STATS` command — returns a 30-day rolling summary (trips, routes, hours) with a percentage comparison vs. the previous 30 days and a month-to-date trip count.
- **SMS**: `INCOMPLETE` command — marks an active trip as incomplete when you forgot to send END. Keeps the trip start but leaves the end unknown.

### Changed
- **SMS**: `DISCARD` now permanently deletes the active trip (for when you never actually boarded). Previously it soft-deleted with `discarded: true`.
- **SMS**: Consolidated `HELP`, `INFO`, `COMMANDS`, and `?` into a single shared function so the message is always consistent.
- **SMS**: Updated trip confirmation and STATUS messages to mention both `INCOMPLETE` and `DISCARD` with clear descriptions.
- **SMS**: Removed `LOG_PAST_TRIP` intent — logging past trips via SMS was too tedious and is better handled elsewhere.

## [1.2.0] - 2026-02-25

### Added
- **Admin**: "Divvy Up" feature for resolving ambiguous stop names by assigning individual trips to specific stops.
- **Admin**: "Delete Stop" functionality for verified stops.
- **Admin**: Instant "un-verification" of historical trips when an alias is unlinked from a stop.
- **Map**: "Spider Map" visualization (path lines between stops) is now enabled by default.
- **SMS**: Support for `sentiment`, `tags`, and `parsed_by` in `LOG_PAST_TRIP` (backfill) commands.
- **SMS**: Standardized `parsed_by: 'ai'` metadata for all Gemini-processed trips.

### Changed
- **UI/UX**: Single, integrated Dashboard/Map view (removed the sidebar-hiding toggle for a more stable experience).
- **UI/UX**: Slimmed down the Dashboard sidebar to 280px to maximize map visibility.
- **UI/UX**: Modernized navigation bar with minimalist SVG icons for Settings and Log Out.
- **UI/UX**: Improved Dashboard layout with left-aligned title and 4-column statistics grid.
- **UI/UX**: Full-color, high-contrast map and permanent marker interactivity.
- **Admin**: Removed confirmation popups for common actions (deleting stops/aliases) to enable a faster workflow.

### Fixed
- **SMS**: Resolved critical bug in `handleConfirmStart` where AI-extracted metadata (`sentiment`, `tags`) was lost during trip confirmation.
- **SMS**: Optimized TwiML responses to return a clean `<Response/>` when no reply is sent, preventing ghost SMS messages.
- **SMS**: Improved stability by upgrading `firebase-functions` to `^7.0.5`.
- **SMS**: Removed redundant and inefficient database updates after trip creation.

### Security
- **Firestore**: Updated security rules to allow administrators to manage the stops library directly from the web interface.

## [1.1.3] - 2026-02-23

### Fixed
- **Dashboard**: Fixed "Take your first trip" banner incorrectly showing for users with existing trips.
- **Streak Logic**: Improved streak calculation to handle non-indexed Firestore queries and ensured stats update on login.

## [1.1.2] - 2026-02-22

### Added
- **Enhanced Mapping**: Added `js/map-engine.js` for dedicated map management.
- **Roadmap**: Added `ROADMAP.md` to outline future development phases, including "Wrapped" visualizations and PRESTO data integration.

## [1.1.1] - 2026-02-12

### Fixed
- **Crash Prevention**: Fixed critical crashes in `calculateFounderStats` and `generateTimeOfDayStats` by adding null checks for missing DOM elements.
- **Admin Panel**: Fixed HTML attribute injection vulnerability in the stop editor that caused syntax errors when editing stops with aliases.

### Changed
- **Map Interaction**: Improved stability of map interactions by preventing re-initialization errors.

## [1.1.0] - 2026-01-25

### Security
- **Authentication Hardening**: Fixed whitelist bypass vulnerability in password authentication.
- **Role-Based Access Control**: Added admin privilege verification for admin panel access.
- **XSS Protection**: Implemented comprehensive HTML sanitization across all user-generated content.
- **Input Validation**: Added validation for stop data, trip data, and user inputs.
- **Firestore Rules**: Enhanced security rules with detailed data model documentation.

### Changed
- **Gemini Retry Logic**: Automatic retry with exponential backoff for AI parsing failures.
- **Configuration Validation**: Cold-start validation of all required environment variables.
- **Error Handling**: Improved error logging and user-friendly error messages.

### Added
- **Migration Scripts**: Added database migration tools for legacy field cleanup.
- **Documentation**: Comprehensive security model and setup guides (`SECURITY.md`, `setup-admin.md`).

---
*See [migrations/](./migrations/) for scripts to address technical debt.*
