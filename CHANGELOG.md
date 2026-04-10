# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed
- **Rocket Control Labels**: Updated Rocket instrument control language to plain, user-facing terms in `Tools/Rocket/index.html` (`Interlock` → `Doors Closed`, `Aspect` → `Red Light`, `Traction State` → `In Motion`).

## [1.19.2] - 2026-04-08

### Fixed
- **Map Rendering**: Resolved a critical layout issue where the map container had zero height due to missing CSS classes.
- **Admin Synchronization**: Patched a data mismatch in the Admin Triage engines by correctly exposing `Trips` to the global scope and ensuring the initialization sequence waits for Firestore synchronization.
- **Rocket Instrumentation**: Fixed a breakage in the Rocket research instrument where control buttons were non-functional due to a missing event listener registration block.
- **Rocket Recovery**: Corrected a state restoration bug in `recoverActiveSession` that caused instrument states to reset on page refresh.
- **Shared UI Support**: Restored missing header and navigation layout styles for the new MPA architecture.

### Security
- **Global XSS Hardening**: Neutralized high-severity DOM XSS vulnerabilities in `TripFeed`, `TripStatsView`, and `PredictionView` by replacing unsafe `innerHTML` interpolation with `textContent` and `Utils.hide()` sanitization.

## [1.19.1] - 2026-04-08

### Security
- **Insecure Randomness (CodeQL #33)**: Replaced `Math.random()` with `crypto.getRandomValues` in the Rocket instrument for cryptographically strong session identifiers.
- **DOM XSS Remediation (CodeQL #35)**: Neutralized an XSS vector in the GTFS administration panel by replacing unsafe `innerHTML` interpolation with secure textContent and DOM element creation.

## [1.19.0] - 2026-04-08

### Added
- **Account Personalization**: Implemented a `Display Name` configuration in Account settings. Users can now set a custom handle, overriding the default email-prefix identity in the header and dashboard.
- **Self-Service Security**: Integrated a `Reset Password` trigger within the Account settings grid, leveraging Firebase's secure recovery flow.
- **Centralized Modal Management**: Deployed a project-wide `ModalManager` to orchestrate all backdrop, focus, and state transitions for system dialogs.

### Changed
- **Modular Administrative Architecture**: Deconstructed the monolithic `js/admin.js` into specialized, testable sub-engines: `GTFSEngine` (registry syncing), code-named `AdminTriage` (inbox management), and `AdminLibrary` (stop indexing).
- **Decoupled Trip Ecosystem**: Refactored the core `js/trips.js` into an orchestrator that delegates to new high-performance engines: `TripController` (data/Firestore), `TripFeed` (visual rendering), `TripStatsView` (analytics), and `PredictionView` (intelligence).
- **Tripartite Settings Interface**: Redesigned the primary configuration modal into a high-density `Account | Settings | Beta` architecture. Groups security, environment configuration, and "Laboratory" experimental features into distinct visual sectors.
- **Satin-Zinc UI Refinement**: Hardened the platform's visual language with modern CSS grid utilities and premium card styles, ensuring the new modular components maintain a cohesive, technical aesthetic.

### Fixed
- **Identity Fallback**: Resolved a regression where users were stuck with an email-handle identity. The system now prioritizes Firestore-linked display names with a clean fallback to the local email part.
- **Reference Integrity**: Standardized all modal calls to use unified IDs, eliminating race conditions during multi-step triage workflows.
- **Technical Debt**: Significant reduction in technical debt by slashing monolithic file sizes and moving logic to specialized, reusable shared modules.

## [1.18.0] - 2026-04-07

### Changed
- **MPA Migration**: Converted the app from a single-page app to a multi-page architecture. Each view (`/dashboard`, `/insights`, `/map`, `/admin`, `/users`, `/rocket`) is now its own HTML page with clean URLs and proper browser history. `main.js` retired; replaced by `js/pages/` entry files and `js/shared/` infrastructure (`auth-guard.js`, `header.js`). Vite config updated to 7-entry build.
- **Shared Header**: Nav bar and settings modal are now injected at runtime by `header.js` and shared across all pages. Logo links to `/dashboard`. Nav items are `<a>` links with active-page highlighting. Rocket link visible to admins only.
- **Rocket Integration**: Rocket is now a full member of the app — shared header, shared auth guard (admin-only), consistent branding. Custom "ROCKET RESEARCH" header and "Active Researcher" auth banner removed.
- **Rocket Fixes**: Replaced `prompt()` for end stop with an inline input form. Replaced all `alert()` calls with `UI.showNotification()`. Added session recovery on page load (detects in-progress Firestore session and restores instrument state). GPS permission requested upfront at page load rather than at finalize; GPS failures are always graceful and non-blocking.
- **URL Cleanup**: Added `cleanUrls: true` to Firebase Hosting config and a catch-all SPA rewrite. Magic link continue URL fixed to always use `/` instead of `window.location.pathname`, preventing `/index.html` appearing in post-login URLs. `completeMagicLinkSignIn()` now called on boot so the Firebase query params are stripped from the URL immediately after sign-in.

## [1.17.5] - 2026-04-07

### Security
- **Rocket Auth Shield**: Implemented a mandatory authentication gate for the Rocket Research Instrument (`/Tools/Rocket`). Rocket now requires a valid Transit Stats profile to start a session, redirecting unauthenticated users to the main login.
- **Data Integrity**: Removed legacy `rocket_guest` fallback logic. All high-precision research data and summary badges are now strictly attributed to the authenticated user's `uid`.

### Changed
- **Rocket UI Overhaul**: Redesigned the Rocket instrument with a premium "Atlas" aesthetic. Replaced the standalone black-theme layout with the core Transit Stats design language, featuring glassmorphism, Inter typography, and improved mobile-first controls.
- **Rocket Researcher Profile**: Added a persistent auth banner to the Rocket interface to confirm the active research identity.


## [1.17.4] - 2026-04-07

### Added
- **Rocket Restoration**: Fully restored the Rocket research instrument to `/Tools/Rocket/` after it was lost in a git rebase. Implemented the standalone high-precision state machine (Doors, Signal, Motion) with GPS anchoring.
- **Rocket Architecture**: Implemented a dual-collection strategy for research integrity. Heavy event streams go to `rocket_trips`, while lightweight summary "badges" (linked via `rocketTripId`) are written to the main `trips` collection for dashboard visibility.
- **Rocket Hosting**: Defined `/rocket` rewrite in `firebase.json` for direct access via `transitstats.fyi/rocket`.

### Fixed
- **Repository**: Terminated three stuck `git rebase --continue` processes that had been hung for >100 minutes, resolving index locks and performance issues.

## [1.17.3] - 2026-04-07

### Security
- **XSS — admin.js inline onclick handlers**: Replaced all inline `onclick="window.Admin.*"` handler patterns in `renderConsolidation`, `renderLibrary`, `renderInbox`, `openLinkModal`, and `loadRouteLibrary` with `data-action` / `data-*` attributes and event delegation set up in `setupListeners`. Eliminates injection risk from Firestore-sourced stop names and route IDs interpolated into HTML attribute strings.
- **XSS — users.js inline onclick handler**: Replaced `onclick="window.Users.togglePremium(...)"` on premium toggle buttons with `data-action` attributes and a delegated listener on `#users-list` initialized in `Users.init()`.
- **XSS — Rocket `updateTripLabel`**: Replaced `label.innerHTML` with DOM element creation (`createElement` + `textContent`) to prevent injection from Firestore-sourced route/direction strings.

## [1.17.2] - 2026-04-07

### Fixed
- **Security**: Patched five high-severity Vite vulnerabilities (#38-43) including Arbitrary File Read via WebSocket, Path Traversal in Optimized Deps .map handling, and `server.fs.deny` bypass. Enforced global upgrade to Vite 8.0.6.

## [1.17.1] - 2026-04-07

### Fixed
- **Deployment**: Made `TWILIO_MESSAGING_SERVICE_SID` an optional secret in `functions/sms.js`. This prevents "missing secret" errors from blocking Firebase deployments when RCS isn't fully configured.

## [1.17.0] - 2026-04-07

### Added
- **Rocket** — a new high-precision research instrument (`/Tools/Rocket`) for decomposing transit journeys into dwell time, signal delay, and running time with millisecond accuracy.
- **`rocket_trips` Firestore collection** — stores full event streams (GPS-anchored state changes) per research session, separate from the standard `trips` history.
- **Rocket → Transit Stats sync** — finalizing a Rocket session automatically writes a summary entry to the `trips` collection (route, direction, start/end stop, duration, `rocketTripId`).
- **Research badge on trip cards** — Transit Stats trip cards display a technical badge when the trip was recorded via the Rocket instrument.
- **RCS Support**: Messages are now sent via a Twilio Messaging Service when `TWILIO_MESSAGING_SERVICE_SID` is configured. Twilio automatically upgrades delivery to RCS for supported devices and falls back to SMS transparently.

### Security
- **Firestore rules for `rocket_trips`** — public read for research transparency; authenticated owner-only write and delete.

## [1.16.0] - 2026-04-02

### Changed
- **SMS Trip Start Message**: "Heading to" replaced with "Predicted end:" for clarity. End shortcut numbers now reflect actual prediction count (e.g. `END 1` instead of `END 1/2/3` when only one prediction exists).

### Added
- **Coordinate Fallback Policy**: Implemented a stop-library lookup in the Map Engine to ensure trips logged via SMS (often missing point coordinates) populate as dots by using their stop names.
- **Content Deduplication**: Incoming messages with identical phone+body within 60 seconds are dropped — catches iPhone carrier retries that arrive with a new MessageSid.
- **Outbound Loop Detection**: Outbound SMS bodies are hashed on send; if the same body arrives as an incoming message within 2 minutes, it is silently dropped — prevents the app from processing its own replies as commands.
- **Self-Loop Guard**: Incoming messages where `From` equals the app's own Twilio number are dropped immediately before any processing.

### Fixed
- **Map Initialization Race Condition**: Patched a timing issue where map markers wouldn't render if the stops library finished loading after the initial trip data fetch.
- **Stop Alias Correction**: Removed incorrect `FINCH WEST` alias from Lawrence West Station; added Finch West Station and 27 other missing TTC subway stations with proper aliases derived from submitted trip history.
- **Gemini Direction Validation**: AI-parsed trip starts now validate direction against canonical values (Northbound, Southbound, etc.) — prevents hallucinated direction strings like `Northq` from being stored.

## [1.15.0] - 2026-03-31

### Added
- **STATS Command Refinement**: Upgraded the `STATS` SMS command to provide 7-day, 30-day, and month-to-date comparisons with trend indicators for premium users.

### Changed
- **Expanded Settings**: Added a new profile management section in the Settings modal with transit agency selection, beta feature toggles, and linked phone number visibility.
- **Preference UI Polish**: Updated the Settings modal layout with a clean, high-contrast design for the new preference controls and custom toggle switches.
- **Internal Optimization**: Decoupled user profile logic into a dedicated `Profile` module for better maintainability.

### Security
- **Strict SMS Rate Limiting**: Implemented a sliding window request throttle in `db.js`. Limits users to **8 messages per 1-minute window** to protect against accidental SMS loops and malicious flooding.
- **URL Spam Blocking**: Added a regex-based rejection layer in `dispatcher.js` that silently drops incoming texts containing URLs (`http`, `www`, etc.).
- **Vulnerability Remediation**: Performed a critical security audit on Cloud Functions dependencies (`npm audit fix`), patching `node-forge`, `path-to-regexp`, and `brace-expansion`.
- **Enhanced Idempotency Guards**: Hardened the SMS entry point to ensure duplicate Twilio signals are ignored at the atomic database level.

## [1.14.1] - 2026-03-31

### Added
- **Trip destination predictions in SMS (admin only)**: When a trip is started, admins now see up to 3 ranked destination predictions in the confirmation SMS. Reply `END 1`, `END 2`, or `END 3` to end at a predicted stop.
- **`PredictionEngine.guessTopEndStops()`**: New method returning an array of top-N ranked exit stop predictions.

### Fixed
- **Auth button stuck in "Sending..."**: Fixed a bug where the "Send Magic Link" button remained disabled after successfully sending an email. Added `finally` blocks to reset button states.
- **Missing loading state on password reset**: Added "Sending..." loading state to the "Forgot Password?" button for better user feedback.

## [1.14.0] - 2026-03-30

### Changed
- **`setTheme()` crash-proofed**: Added optional chaining to `DOM.modals` guards.
- **Removed redundant inline HTML handlers**: Cleaned up legacy `oninput`/`onclick` workarounds in favor of module-based listeners.

### Fixed
- **Critical: Silent JS module crash on boot**: Fixed a `TypeError` where `setTheme()` was called before DOM initialization, which previously killed all event listeners.
- **Auth step transition broken**: Defined the `.hidden` CSS utility class which was previously missing.
- **Stats/Map/RouteTracker initialization**: Fixed a race condition where analytics modules wouldn't initialize correctly after login.

## [1.13.0] - 2026-03-28

### Added
- **Trip review banner**: Internal flagging for trips with unrecognized routes, allowing inline triage in the feed.

### Fixed
- **Login Flow and Boot Sequence**: Implemented a robust `readyState` check for application initialization and hardened 'Continue' button logic.
- **Route tracker broken**: Fixed incorrect reference to `allTrips` preventing route completion stats from rendering.
- **Profile view crash**: Replaced non-existent `UI.fadeInSection()` with direct opacity assignment.

### Security
- **Dependency updates**: Fixed 3 vulnerabilities (brace-expansion, node-forge, picomatch) via `npm audit fix`.

## [1.12.0] - 2026-03-26

### Added
- **AI Analytics Tools**: Gemini can now answer detailed questions about specific dates, date ranges, route stats, riding streaks, and average trip durations via direct Firestore queries.

### Changed
- **`INCOMPLETE` renamed to `FORGOT`**: Command renamed for clarity; all SMS messages updated.
- **Removed `LINK` command**: Journey linking is now handled automatically.
- **Route display**: Standardized SMS messages by removing redundant "Route" prefixes.

### Fixed
- **Confirm-start DISCARD/FORGOT**: Improved state transitions when resolving active trip conflicts.
- **Day-of-week year filter**: Fixed string-to-number coercion in AI query tools.
- **Natural language misclassification**: Tightened `isValidRoute` logic to prevent long questions from being parsed as trip starts.

## [1.11.0] - 2026-03-25

### Added
- **Query logging**: Every natural language query is now logged to `queryLogs` for administrative auditing.
- **Admin user tier**: Profiles with `isAdmin: true` bypass Gemini rate limits; premium users increased to 50 queries/hr.
- **Day-of-week query support**: Added all-time day-of-week breakdown tools for the AI.

### Changed
- **SMS query fallback**: Improved AI intent classification to catch multi-word questions that Gemini previously missed.

### Fixed
- **Firestore index**: Added composite index on `userId ASC + endTime ASC` for AI query tools.

## [1.10.0] - 2026-03-24

### Added
- **UI Heatmap**: Implemented a GitHub-style Activity Grid on the dashboard to visualize ridership patterns.
- **AI Search Tools**: GEMINI now has direct database search capabilities for all-time stats.

### Changed
- **Journey Linking**: Removed redundant "Reply LINK" suggestions.

### Security
- **ReDoS Protection**: Fixed backtracking vulnerabilities in `utils.js` and `predict.js` identified by CodeQL.
- **Dynamic Method Safety**: Secured the command dispatcher with strict whitelisting.

## [1.9.12] - 2026-03-22

### Changed
- **STATS command formatting**: Reformatted reply to a cleaner sentence structure; period comparisons (↑/↓ %) are now premium-only.
- **Security Dependency Correction**: Bumped `vitest` and `@vitest/ui` to 4.0.18 to resolve prototype pollution.

## [1.9.11] - 2026-03-22

### Added
- **Premium AI Stats**: Gated natural-language queries behind `isPremium: true`.
- **`ASK` command**: Added explicit entry point for AI Stats.
- **Users admin page**: Web-based administration for managing premium status.

### Changed
- **Error notifications**: Replaced remaining `alert()` calls with `UI.showNotification()`.
- **Destructive confirmations**: Converted sensitive actions to the two-step button pattern.
- **Initialization Polish**: Pinned dependency versions and updated GitHub Actions.

### Fixed
- **Firestore listener cleanup**: Ensuring listeners are disposed of on signout.

### Security
- **XSS Hardening**: Applied `escapeForJs` and `Utils.hide()` across all dynamic admin and template elements.
- **XSS remediation**: Hardened inline HTML handlers in `admin.js` and `templates.js`.

## [1.9.10] - 2026-03-22

### Added
- **Prediction Test Suite**: Added 137 unit tests covering parsing, utility exports, and the full prediction engine logic.

---

## Older Releases
Historical changes can be found in the [Changelog Archive](./CHANGELOG_ARCHIVE.md).

---
*See [migrations/](./migrations/) for scripts to address technical debt.*
