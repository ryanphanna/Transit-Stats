# Changelog

## [Unreleased]

### Added

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

### Bug Fixes
- **Dashboard**: Fixed "Take your first trip" banner incorrectly showing for users with existing trips.
- **Streak Logic**: Improved streak calculation to handle non-indexed Firestore queries and ensured stats update on login.

## [1.1.2] - 2026-02-22

### Documentation
- **Roadmap**: Added `ROADMAP.md` to outline future development phases, including "Wrapped" visualizations and PRESTO data integration.

## [1.1.1] - 2026-02-12

### Bug Fixes
- **Crash Prevention**: Fixed critical crashes in `calculateFounderStats` and `generateTimeOfDayStats` by adding null checks for missing DOM elements.
- **Admin Panel**: Fixed HTML attribute injection vulnerability in the stop editor that caused syntax errors when editing stops with aliases.

### Reliability
- **Map Interaction**: Improved stability of map interactions by preventing re-initialization errors.

## [1.1.0] - 2026-01-25

### Security
- **Authentication Hardening**: Fixed whitelist bypass vulnerability in password authentication.
- **Role-Based Access Control**: Added admin privilege verification for admin panel access.
- **XSS Protection**: Implemented comprehensive HTML sanitization across all user-generated content.
- **Input Validation**: Added validation for stop data, trip data, and user inputs.
- **Firestore Rules**: Enhanced security rules with detailed data model documentation.

### Reliability
- **Gemini Retry Logic**: Automatic retry with exponential backoff for AI parsing failures.
- **Configuration Validation**: Cold-start validation of all required environment variables.
- **Error Handling**: Improved error logging and user-friendly error messages.

### Code Quality
- **Migration Scripts**: Added database migration tools for legacy field cleanup.
- **Documentation**: Comprehensive security model and setup guides (`SECURITY.md`, `setup-admin.md`).

---
*See [migrations/](./migrations/) for scripts to address technical debt.*

