# Changelog

**Current Project Versions:**
- **Web App**: `v1.5.1`
- **Cloud Functions**: `v1.2.0`

---

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
