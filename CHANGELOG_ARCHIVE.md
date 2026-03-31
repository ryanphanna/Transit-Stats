# Changelog Archive

All notable changes prior to those in [CHANGELOG.md](./CHANGELOG.md) are documented in this file.
For recent changes, see [CHANGELOG.md](./CHANGELOG.md).

## [1.9.9] - 2026-03-22

### Added
- **Consolidation Panel**: New section in the admin view that scans trip history for stop name variants and allows batch-merging.

### Changed
- **SMS Message Polish**: Removed emojis and redundant "Stop" prefixes from SMS replies for a cleaner tone.
- **Instruction Tail Shortened**: Condensed the per-trip instruction footer to "END [stop] to finish. INFO for help."

### Fixed
- **Slash Intersection Casing**: `toTitleCase` now normalizes spaces around `/` and capitalizes each part.
- **Route Letter Casing**: Added `normalizeRoute` to uppercase trailing variant letters (e.g. "510a" → "510A").

## [1.9.8] - 2026-03-21

### Added
- **Auto-Journey Linking**: Sequential trips are now linked automatically if they occur within 60 minutes at the same stop.
- **Journey Feed Connector**: Visual connector in the trip feed showing transfer gaps.
- **Direction on Trip Cards**: Added abbreviated direction (NB, SB, EB, WB) to trip cards.

### Changed
- **Journey Linking UX**: Moved linking detection from trip start to trip end.
- **DISCARD Cleanup**: Discarding linked trips now removes dangling journey references.

### Fixed
- **XSS in Trip Feed**: Hardened `renderTripCard` and other list renders with `Utils.hide()`.
- **Sparkline Average Line**: Fixed coordinate space mismatch for the average riding line.

## [1.9.7] - 2026-03-20

### Added
- **Lucide SVG Icon System**: Replaced emojis with a consistent SVG icon set across the entire dashboard.
- **Integrated Notification System**: Replaced browser `alert()` dialogs with an internal toast system.

### Changed
- **Formalized Trip Initialization**: Introduced `Trips._readyPromise` to ensure data settles before rendering modules.

### Fixed
- **Lucide Rendering Robustness**: Implemented `refreshIcons` with retry logic for CDN resilience.
- **UI Aesthetic Refinement**: Adjusted icon alignment and stroke weights for dark mode compatibility.

## [1.9.6] - 2026-03-18

### Security
- **Patched `fast-xml-parser`**: Upgraded to `v5.5.6` to address high-severity numeric entity expansion vulnerabilities.
- **CodeQL Remediation**: Fixed unvalidated dynamic method calls, polynomial ReDoS, and SRI token integrity.

## [1.9.5] - 2026-03-18

### Fixed
- **Deployment**: Resolved `npm ci` failures by syncing overrides in `package-lock.json`.
- **Build**: Fixed Vite build failures related to missing entry points.

### Changed
- **Node.js**: Standardized on Node 22 for both frontend and backend.
- **SMS System**: Modularized `functions/sms.js` with a new `dispatcher.js` module.

## [1.9.4] - 2026-03-18

### Changed
- **Build Optimization**: Simplified Vite configuration for single-page architecture.

### Fixed
- **Deployment**: Restored `functions/` directory and missing utility scripts required for deployment.

## [1.9.3] - 2026-03-17

### Added
- **Activity Sparkline**: Daily trip frequency trend visualization on the dashboard.
- **Enhanced UI**: Added glassmorphism/gradient styling for premium prediction cards.

### Changed
- **Emerald & Slate Theme**: Shifted primary color palette to emerald/slate.
- **Dedicated Insights View**: Extracted analytics to a standalone view.
- **Repository Optimization**: Resolved Git performance issues by refining `.gitignore`.

### Fixed
- **REDoS Vulnerabilities**: Patched multiple regular expressions in the parsing engine.
- **Scroll Lag**: Removed expensive CSS filters to restore 60fps performance.
- **Map Engine Stability**: Hardened `MapEngine` against re-initialization crashes.

## [1.9.2] - 2026-03-14

### Added
- **Route Tracker**: agency completion tracker with animated progress bars.
- **GTFS Library**: Import routes and stop-route mappings from standard GTFS files.
- **Prediction Route Filter**: Engine now hard-filters candidates based on known stop-route serving data.

## [1.5.3] - 2026-03-14 (Cloud Functions only)

### Added
- **Journey Linking**: Introduced the `LINK` command for manual chaining of sequential trips.

## [1.9.1] - 2026-03-13

### Added
- **Dashboard Insights**: Grouped trip performance records (Average, Fastest, Slowest) on the dashboard.
- **Mastery Rows**: Frequency-based visualization for top routes.
- **Initial SVG Icons**: Early transitions to SVG systems.

### Changed
- **Minimalist Aesthetic Reversion**: Removed all glassmorphism and all-caps text for enhanced readability.
- **Initialization Batching**: Deferred heavy calculations to post-login.

### Fixed
- **Dashboard Buttons Unresponsive (Critical)**: Restored interactivity by fixing CSP `'unsafe-inline'` script restrictions.
- **Indexing Storm Guard**: Prevented concurrent index builds during rapid interactions.

## [1.9.0] - 2026-03-12

### Changed
- **UI Refinement**: Removed branding footer and layout glitches for a cleaner landing page.

### Fixed
- **Authentication Glitch**: Resolved malformed HTML tags on the sign-in screen.

## [1.8.3] - 2026-03-10

### Added
- **Trip Comparison Dashboard**: Specialized view for correlating trip durations and identifying corridor trends.

## [1.8.2] - 2026-03-10

### Added
- **Diagnostic Logging**: Verbose console logs in `stats.js` and `trips.js`.
- **PRESTO Importer (Local-First)**: Standalone CSV parser for transaction reports.
- **Privacy-First Storage**: LocalStorage-only imports for public users.

### Changed
- **UI Layout Overhaul**: Transitioned to a floating sidebar panel architecture.

### Removed
- Removed the PRESTO drag-and-drop zone from the unauthenticated landing page.

### Fixed
- **Navigation Button Dead-Zone**: Resolved container overlap blocking header elements.

## [1.8.1] - 2026-03-10

### Fixed
- **Authentication UI Crash**: Resolved missing `UI.showLoading` reference.
- **Unified Loading States**: Standardized spinner logic across all auth flows.

## [1.8.0] / [1.5.0] - 2026-03-10

### Added
- **End Stop Prediction**: Stored predictive exit stop at trip start; graded at end time.
- **Duration-Informed Prediction**: Secondary prediction run at trip end using elapsed duration.
- **`DISCARD` direct keyword**: Added explicit command alongside fallback logic.

### Changed
- **Direction Filtering**: Engine now narrows candidates to direction-matched trips first.

### Fixed
- **Continue Button Responsiveness**: Injected secrets during CI/CD to resolve uninitialized production assets.
- **Module Initialization Safety**: Hardened Admin and Public deployments with robustness checks.

## [1.4.0] - 2026-03-09

### Added
- **Stops library injection**: Server-side stop canonicalization powered by Firestore stops collection.

### Changed
- **Prediction Timing**: Engine now commits at trip start for meaningful accuracy scoring.
- **Prediction Engine v3**: Synced cloud functions with the improved client-side logic.

### Fixed
- **Missing Firestore composite index**: Added `userId + endTime DESC` index for history queries.
- **Incomplete trips polluting history**: Excluded trips with `incomplete: true` from the candidate pool.

## [1.3.1] - 2026-03-09

### Fixed
- **Parsing Heuristics**: Resolved edge cases for spaces in stop codes and bare agency overrides.

### Documentation
- **Vulnerability Reporting**: Migrated to GitHub Private Vulnerability Reporting.

## [1.7.0] / [1.3.0] - 2026-03-08

### Added
- **Stop Canonicalization**: Integrated stop library aliases into the core prediction engine.
- **Stop Autocomplete**: Context-aware dropdowns for boarding and exit stops.
- **Admin Inbox Clustering**: Grouped pending stops by normalized intersection form for faster triage.

### Changed
- **Auto-deploy Functions**: Integrated functions into the GitHub Actions merge workflow.
- **Weight Graduated Similarity**: Moved from flat day similarity to calendar-distance weighting.

### Fixed
- **END Trip Crash (Critical)**: Wrapped prediction evaluation in safety guards to prevent index-failure crashes on trip end.
- **Idempotency Race Condition**: Implemented atomic `create()` for SMS message IDs.

## [1.6.0] - 2026-03-08

### Added
- **Password Reset Flow**: Secure account recovery from the login screen.

### Changed
- **Authentication UX Hardening**: Overhauled transition screens with micro-interactions.

### Fixed
- **Cloud Function Security**: Modernized secret retrieval patterns for 2nd Gen functions.

## [1.5.1] - 2026-03-07

### Fixed
- **Login UX (Critical)**: Resolved non-responsive sign-in buttons by restoring missing DOM elements.

## [1.5.0] / [1.2.0] - 2026-03-07

### Changed
- **Cloud Functions Migration (Critical)**: Migrated to Firebase 2nd Generation (v2) for improved concurrency and performance.
- **Secret Manager Integration**: Fully removed legacy environment variables in favor of `defineSecret`.

### Security
- **Twilio Signature Validation**: Hardened webhook verification using Secret Manager tokens.
- **Subresource Integrity (SRI)**: Added integrity hashes to Leaflet and MarkerCluster CDNs.

## [1.1.9] - 2026-03-07

### Fixed
- **Observability**: Added verbose audit logs for request validation.

### Security
- **Secret Migration**: Resolved crashes in Node 20 environments by migrating to `defineSecret`.

## [1.4.9] - 2026-03-07

### Fixed
- **Maps**: Resolved SSL "Mixed Content" errors for OpenStreetMap layers.

### Security
- **Complete String Escaping (High)**: Implemented robust sanitization for dynamic JavaScript variables.

## [1.1.8] - 2026-03-07

### Security
- **Hardening (Critical)**: Enforced `fast-xml-parser` patch for stack overflow vulnerability.

## [1.4.8] - 2026-03-07

### Fixed
- **SMS Outage (Critical)**: Fixed signature validation logic after Firebase URL path rewriting.
- **Login Autofill**: Resolved issue where autofilled forms remained locked.

### Changed
- **Prediction Engine v2**: Shifted from point scoring to multiplicative weighted voting.

## [1.1.7] - 2026-03-07

### Security
- **Vulnerability Remediation**: Patched multiple DoS and ReDoS vulnerabilities in `minimatch`, `fast-xml-parser`, and `axios`.

## [1.4.6] - 2026-03-05

### Added
- **CI/CD Automation**: Implemented GitHub Actions for auto-deployment to production and PR previews.
- **Vite Build Engine**: Optimized asset generation and bundling.

### Changed
- **UI/UX**: Centered-card layout redesign and modular CSS architecture.

## [1.4.5] - 2026-03-04

### Security
- **Automated Scanning**: Enabled Dependabot and CodeQL security scanning workflows.

## [1.4.4] - 2026-03-04

### Documentation
- **Manifest Header**: version tracking Clarification for frontend vs backend projects.

## [1.4.3] - 2026-03-04

### Added
- **Modular Architecture**: Extracted monolithic SMS code into clean libraries (parsing, handlers, gemini, etc).
- **PII-Safe Logger**: Automated masking of phone numbers in system logs.

### Changed
- **Parsing Robustness**: Significant improvements to whitespace and multi-line SMS parsing.

### Security
- **AI Rate Limiting (High)**: Capped Gemini API usage to 10 calls/hour per user.
- **Secure Verification**: Migrated to `crypto.randomInt` for magic codes.

## [1.4.2] - 2026-03-04

### Security
- **Twilio Webhook Verification**: Closed the open webhook forgery vulnerability.
- **Auth Bypass Fix**: Hardened Whitelist check logic on Firestore failure.
- **HTTP Security Headers**: Enforced HSTS and restrictive Referrer policies.

## [1.4.1] - 2026-03-04

### Changed
- **Secret Management**: Migrated Gemini keys to Cloud Secret Manager.

## [1.4.0] - 2026-03-03

### Added
- **SVG Branding**: Custom-designed transit iconography and premium gradient accents.
- **Spider Map Visualization**: high-contrast path lines between stop history.

### Changed
- **Modernized Map aesthetic**: "Apple Maps" inspired no-labels base layer with OpenRailwayMap overlay.

## [1.3.0] - 2026-02-28

### Added
- **AI SMS Q&A**: Natural language history queries via Gemini.
- **`STATS` and `INCOMPLETE` commands**: Added 30-day reporting and partial trip closure.

## [1.2.0] - 2026-02-25

### Added
- **Admin Tools**: Added "Divvy Up" ambiguous stops and alias unlinking features.

### Changed
- **UI Refinement**: Slimmed-down dashboard and streamlined navigation bar.

## [1.1.3] - 2026-02-23

### Fixed
- **Status Banners**: Corrected "First trip" display logic for active users.

## [1.1.2] - 2026-02-22

### Added
- **Roadmap**: Initial development plan established for PRESTO integration and analytics.

## [1.1.1] - 2026-02-12

### Fixed
- **Admin Panel**: Resolved syntax errors when editing stops containing special characters.

## [1.1.0] - 2025-01-25

### Added
- **Initial Security Model**: Role-based access control and comprehensive Firestore rules established.
