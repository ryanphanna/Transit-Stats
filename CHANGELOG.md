# Changelog

All notable changes to this project will be documented in this file.

## [1.9.11] - 2026-03-22

### Added
- **Premium AI Stats**: Natural-language trip queries are now a premium feature gated behind `isPremium: true` on the user's Firestore profile. Non-premium users who trigger a query receive a prompt to use `STATS` instead.
- **`ASK` command**: Registered users can send `ASK [question]` as an explicit entry point for AI Stats (e.g. "ASK what's my most used stop?"). Premium-only; returns an upsell message otherwise.
- **Richer AI context**: `aggregateTripStats` now includes most-boarded stops, most-exited stops, time-of-day breakdown, and a per-day trip count map, giving the AI enough to answer specific date queries (e.g. "how many trips on March 22?").
- **Users admin page**: New "Users" view in the web app (admin-only) listing all profiles with their premium status and linked phone number. Admins can grant or revoke premium access with a single click, without touching Firestore directly.
- **Prediction accuracy in Settings**: Settings modal now shows route and end-stop prediction accuracy (e.g. "Route: 73% (45/62) · End stop: 81% (50/62)") for admin users, pulled live from the `predictionAccuracy` collection.

### Changed
- **XSS hardening**: `admin.js` inline `onclick=` attributes for `openStopForm`, `acceptSuggestion`, `openLinkModal`, and `linkToStop` now use `UI.escapeForJs()` for JS-context escaping (previously `Utils.hide()` which is HTML-only and breaks on names containing single quotes). Stop library cards now escape `name`, `code`, `agency`, and alias pills via `Utils.hide()`.
- **XSS hardening**: `templates.js` template cards and quick chips converted from inline `onclick=` with raw data to `data-route`/`data-stop` HTML attributes with `Utils.hide()` escaping and `addEventListener` delegation.
- **Error notifications**: All remaining `alert()` calls replaced with `UI.showNotification()` — `map-engine.js` geolocation errors, `admin.js` `linkToStop` failure, GTFS import success/failure, and `deleteRoute` failure.
- **Destructive confirmations**: `importGtfsRoutes` and `deleteRoute` converted from `confirm()` to the two-step button pattern. `templates.delete()` `confirm()` removed since the swipe gesture already serves as confirmation UX.
- **Firestore listener cleanup**: `Trips.unsubscribe()` now called in the auth signout path before clearing user state, preventing stale snapshot listeners from firing post-signout.
- **Data safety**: `trips.js` `renderTripCard` now guards against `null`/`undefined` `startTime`, rendering `—` instead of "Invalid Date".

### Fixed
- **`ASK` with no question**: Bare `ASK` now returns a helpful example prompt instead of sending an empty string to Gemini.
- **AI Stats trip ordering**: `handleQuery` now fetches the 200 most recent trips ordered by `endTime desc` instead of an arbitrary 200.
- **No date context in AI prompt**: Today's date (Toronto timezone) is now injected into the Gemini prompt so time-relative questions ("this month", "last Friday", specific dates) work correctly.

### Removed
- **Dead code in `ui-utils.js`**: Removed `loadSavedTheme`, `setTheme`, `updateThemeButtons`, `fadeInSection`, `openSettings`, `closeSettings` and their `window.*` global exports — all used stale element IDs or approaches superseded by `main.js`.


## [1.9.10] - 2026-03-22

### Added
- **Test suite**: 137 passing tests across `tests/parsing.test.js` (40), `tests/utils.test.js` (37), and `tests/predict.test.js` (60). Covers all 5 parsing functions, all 9 utility exports, and the full prediction engine including all internal scoring methods (`_baseRoute`, `_normalizeDirection`, `_isValidTrip`, `_canonicalizeStop`, `_stopMatch`, `_daySimilarity`, `_timeSimilarity`, `_recencyWeight`, `_durationSimilarity`) and integration behaviour of `guess` and `guessEndStop`.

## [1.9.9] - 2026-03-22

### Changed
- **SMS Message Polish**: Removed all emojis (✅, ❌, ⚠️, 📊) from SMS replies for a cleaner, more professional tone.
- **SMS Stop Name Display**: Removed the redundant "Stop" prefix from stop names in confirmation messages (e.g. "from Spadina/King" instead of "from Stop Spadina/King").
- **Journey Note Formatting**: Added a blank line before the auto-linked journey note in end-trip confirmations so it reads as a separate thought.
- **Instruction Tail Shortened**: Condensed the per-trip instruction footer from four commands to "END [stop] to finish. INFO for help." to reduce noise for regular users.

### Fixed
- **Slash Intersection Casing**: `toTitleCase` now normalizes spaces around `/` and capitalizes each part, so "Spadina / Nassau" and "Spadina/king" both become "Spadina/Nassau" and "Spadina/King".
- **Stop Display Normalization**: `getStopDisplay` now applies `toTitleCase` on all returned values, fixing existing stored stop names that were saved in lowercase or with inconsistent slash spacing.
- **Route Letter Casing at Storage**: Added `normalizeRoute` helper that uppercases trailing route variant letters (e.g. "510a" → "510A") and applied it at parse time in `parseMultiLineTripFormat` and at the entry point of `handleTripLog`, so routes are stored correctly regardless of input source (manual or AI).
- **Route Letter Casing in Display**: `getRouteDisplay` now delegates to `normalizeRoute` internally for consistency.
- **Stop Separator Normalization**: `normalizeIntersectionStop` (client-side) now handles `-` and `and` as intersection separators alongside `/`, `&`, and `at`. Separator in output changed from ` / ` to `/` to match backend format. Added `canonicalizeForMatch` for comparison-only normalization.

### Added
- **Consolidation Panel**: New section in the admin view that scans trip history for stop name variants (e.g. "Spadina/Nassau", "Spadina & Nassau", "Spadina / Nassau") grouped by route and direction. Shows the canonical form (most frequent variant) alongside all others, with a Merge button that batch-updates affected trips in Firestore.

## [1.9.8] - 2026-03-21

### Added
- **Auto-Journey Linking**: When a trip ends, the system automatically checks if the previous completed trip ended at the same boarding stop within 60 minutes. If so, both trips are silently linked with a shared `journeyId` and a note is appended to the END confirmation SMS (e.g. "Linked to your Route 510 trip (8 min transfer)").
- **Journey Feed Connector**: Linked trip legs now display a visual connector in the Recent Trips feed showing the transfer gap and a break button to unlink them. The Firestore snapshot listener re-renders automatically on change.
- **Direction on Trip Cards**: Trip cards in the feed now show abbreviated direction (NB, SB, EB, WB, etc.) when present, making it easy to distinguish same-route trips in opposite directions.
- **Insights View Header**: Added a "Commute Highlights" card header with medal icon to the Insights view, which previously rendered as a blank unlabelled card.
- **One-Click Suggestion Accept**: Inbox items with a fuzzy-match suggestion now show an "Accept" button that links the stop alias in one click without opening the link modal.
- **Bulk Accept Suggestions**: When 2 or more inbox items have suggestions, an "Accept all X suggestions" button appears at the top of the inbox to batch-link them in a single Firestore write.

### Changed
- **Journey Linking UX**: Moved journey detection from trip start (SMS prompt) to trip end (auto-link). The LINK command remains as a manual fallback. This eliminates the need to reply to a suggestion mid-trip.
- **DISCARD Cleanup**: Discarding an active trip that was already linked into a journey now removes the `journeyId` from the partner trip, preventing dangling references.

### Fixed
- **XSS in Trip Feed**: Route names, stop names, and corridor keys injected into `innerHTML` in `renderTripCard`, `renderList`, and `renderHighlights` are now escaped via `Utils.hide()`.
- **Sparkline Average Line**: Fixed a coordinate space mismatch where `bottom: calc(20px + avgPct%)` resolved `%` against the full border-box height (64px) rather than the content area (40px), causing the avg line to float above the bars. Now scaled by `40/64`.
- **Native Dialog Removal**: Replaced remaining `confirm()` call for trip deletion in `main.js` and `alert()`/`confirm()` calls in `admin.js` with the app's toast notification system and a two-step button confirmation.

## [1.9.7] - 2026-03-20

### Added
- **Lucide SVG Icon System**: Replaced all platform-dependent emojis and character icons with a consistent, premium SVG icon set from Lucide across navigation, card headers, and the trip feed.
- **Integrated Notification System**: Replaced native `alert()` browser dialogs with the application's internal toast notification system for a more integrated and non-blocking user experience.

### Changed
- **Formalized Trip Initialization**: Introduced `Trips._readyPromise` to ensure the dashboard, map, and analytics modules wait for the primary Firestore data snapshot before initializing, preventing race conditions.
- **Synchronized Direction Normalization**: Updated the client-side prediction engine to match cloud functions, adding support for `Clockwise`, `Counterclockwise`, `Inbound`, and `Outbound` directions.

### Fixed
- **Lucide Rendering Robustness**: Implemented a `refreshIcons` utility with an automatic retry mechanism to handle race conditions during CDN script loading and ensure icons render correctly on all views.
- **Stop Metric Interpretation**: Documented the "Stops" count logic in `stats.js` to clarify that it represents the union of unique boarding and exiting locations.
- **UI Aesthetic Refinement**: Adjusted icon alignment, stroke weights, and brand-icon dimensions to ensure a polished look in both light and dark modes.

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
- **predict.js Double-Execution Removed**: Consolidated prediction logic into a single module import, removing redundant script tags.
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

---

## Older Releases
Historical changes can be found in the [Changelog Archive](./CHANGELOG_ARCHIVE.md).

---
*See [migrations/](./migrations/) for scripts to address technical debt.*
