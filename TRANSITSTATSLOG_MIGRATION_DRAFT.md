# TransitStatsLog Migration Draft

Source export:
- `/Users/ryan/Desktop/efe1f5a3-8d3d-427e-9e99-0486d25a94fc_ExportBlock-ee826fb0-8d17-450d-aac4-d6056a936907.zip`
- Use `TransitStatsLog ..._all.csv` only. The plain `.csv` contains only the `Name` column.

Target:
- `NewTransitStatsLog` in Notion

## Working assumptions

- Import shipped work that is meaningful enough to preserve historically.
- Keep original `Author` where present.
- Rows with blank `Author` need an explicit decision before import because the new database uses a constrained select.
- `Backlog` and `In Progress` rows are not auto-imported until they are intentionally confirmed as still useful.
- Near-duplicate rows should not be blindly imported twice.
- Normalize titles away from internal sequencing labels like `Phase 1`, `Phase 4-A`, `v1.x.y`, or similar framing when a skill/outcome title is stronger.

## Import-ready

These rows look safe to migrate as-is or with minor title cleanup only.

### Claude

- `Clean Repository Architecture & Git Optimization` — blank author in source; import with `Author` unset
- `Security Hardening & Repository Optimization` — blank author in source; import with `Author` unset
- `Security Hardening & Conflict Resolution` — blank author in source; import with `Author` unset
- `Security Hardening & GTFS Enrichment` — blank author in source; import with `Author` unset
- `Fix Deployment and Satisfy Module Dependencies` — blank author in source; import with `Author` unset
- `Fix npm ci deployment failures via lockfile sync` — blank author in source; import with `Author` unset
- `Modularization and Stability Refactor (v1.9.5)` — blank author in source; import with `Author` unset
- `Stop Library UX Improvements`
- `Auto-Journey Linking`
- `UX Polish: Dialogs, Trip Direction, Insights Header, Sparkline Fix`
- `XSS Hardening in Trip Feed`
- `SMS Message Polish & Stop Name Normalization`
- `Consolidation Panel — surface and merge stop name variants in admin view`
- `SMS message polish — remove emojis, strip Stop prefix, shorten instruction tail`
- `Normalization fixes — slash casing, stop display, route letter casing at storage and display`
- `Add test suite — parsing, utils, prediction engine`
- `Fix SMS query classification + improve AI query context`
- `Prediction Engine V4 (Logistic Regression) — Shadow Mode`
- `Prediction Engine V5 (Shadow Mode)` — import the shipped V5 row, not the older in-progress benchmark row
- `Prediction engine v3.1 — topology filter + LA/SF networks`
- `Settings full page + map/insights/users bug fixes`
- `Admin inbox rebuilt — per-trip linking to normalized stops`
- `V4.1 / V5.1 end stop prediction + V3.1.1 pre-filter fix`
- `v1.20.9 — Fix auth logout on transient Firestore error`
- `v1.20.10 — CSS refactor, admin inbox redesign, header fixes`
- `v1.22.0 — TransferEngine, single-line trips, UNLINK, db refactor`
- `Disambiguation timing + Unknown stop display fix`
- `Direction bleeding fix — V3 topology filter`
- `Route-aware stop disambiguation + automatic route back-write`
- `NetworkEngine v1 — self-learning transit graph`
- `Mass stop normalization — 121 stops, 30 trip corrections`
- `Twilio webhook idempotency — deduplicate retries via MessageSid`
- `V3.3.0 — ride-count recency decay replaces calendar-time decay`
- `SMS reply bug — all messages silently dropped`
- `LA Metro G Line + J Line added to topology`
- `STATS — Top route on its own line`
- `Stop disambiguation starts trip immediately`
- `Prediction direction fixes — direction bleeding and Union Station pivot`
- `toTitleCase capitalizing ordinal suffixes`
- `Explicit agency ignored when it matches default agency`
- `Cross-agency stop fallback scoped to same city`
- `Retroactive verification pass (retro-verify.js)`
- `Unknown agencies accepted on line 3/4 without pre-registration`
- `MTS, SMART, Golden Gate Transit, Amtrak, LA DOT not recognized as agencies`
- `Stop agencies array self-expands from trip data`
- `Agency disambiguation asks by city, not agency name`
- `Shared transit hub stops not found under operator agency`
- `Stops library uses agencies array for multi-agency support`
- `V4/V5 models retrained on 560 fresh trips`
- `GTFS-correction filter for V4/V5 route predictions`
- `v2 homepage map: real GTFS geometry + correct TTC line colours`
- `Global NetworkGraph dual-write`
- `Route + direction-aware stop disambiguation`
- `510 trip stop name backfill from GTFS` — use this versioned shipped row and skip the looser duplicate

### Gemini

- `Security Hardening & CodeQL Remediation`
- `Lucide Icon Integration & Changelog Refresher`
- `Changelog Maintenance & Standardization`
- `1.9.11 Release - Premium AI Stats & QoL`
- `SMS Logic Refactor & AI Stats Enhancement`
- `Release v1.10.0: Heatmap & AI Stats Upgrade`
- `Hardened Login Flow & Boot Sequence`
- `Login Flow — Silent Module Crash & Auth Refactor`
- `Auth Button Stuck State Fix`
- `Phase 4-A: User Preferences UI & SMS STATS Refinement`
- `Rocket Research Instrument — Initial Build`
- `Hardening Rocket Security & UI Overhaul`
- `Restore Stop Name Normalization Formatting`
- `Fix Admin Users Page Loading`
- `Map Performance Optimization`
- `Reduce Trip Timeout to 6h`
- `Dashboard Performance & Stability Overhaul (6hr Rule, Map Cluster, Rocket UI)`
- `Settings UI/UX Overhaul & Technical Dashboard`
- `v1.19.0 Modularization & Personalization Release`
- `v1.19.1 Security Hardening & Version Correction`
- `Stability Patch v1.19.2`
- `Application-Wide Security Hardening (v1.19.2)`
- `SMS Transit Achievements`
- `MMS Stop Code Extraction Fix`

### Codex

- `Wire up public profile page end to end`
- `Normalize Gemini stats bucketing to requested timezone`

## Open items to keep

These are still genuinely open enough to preserve as `Backlog` / `In Progress` rows in the new database.

- `Fix uppercase route letters being converted to lowercase in SMS responses` — `Backlog`
- `SMS & Backend Security Hardening` — `In Progress` (rename from `Phase 1: ...` on import)
- `Make profile visibility authoritative` — `Backlog`
- `Dynamic stale-trip handling` — `Backlog`

## Skip

These rows should be skipped from the new database because they are duplicates, superseded placeholders, or old pre-shipped states of work that already has a better final row.

- `Prediction Engine V5 (XGBoost) — Benchmark`
- `LA Metro G Line and J Line added to topology`
- `SMS reply bug fix — redundant MessageSid write dropped all messages`
- `NetworkEngine v1 — self-learning transit graph`
- `MMS snap-to-start, agency gate, fillPredictions, predictionStats agency field`
- `Stop Name Consolidation Panel` — duplicate of the more specific shipped consolidation panel row
- `510 trip stop name backfill` — duplicate of the versioned shipped GTFS backfill row

## Proposed next pass

1. Generate a final import file from the approved `Import-ready` and `Open items to keep` sections.
2. Write to Notion once.

## Strict Rebuild

This is the corrected bar for `NewTransitStatsLog`.

Keep:
- major feature launches
- meaningful product-facing improvements
- architecture or infrastructure changes that materially changed the system
- security work with real scope
- major prediction / network / data-model changes
- open backlog items only if they are still strategically important

Remove:
- narrow backfills
- one-off data cleanup
- tiny copy or layout tweaks
- single-bug patch-note debris
- low-scope normalization fixes
- rows that only make sense as granular release notes

### Strict keep set

- `Security Hardening & Repository Optimization`
- `Security Hardening & Conflict Resolution`
- `Modularization and Stability Refactor (v1.9.5)`
- `Security Hardening & CodeQL Remediation`
- `Premium AI Stats & QoL Release`
- `Heatmap & AI Stats Upgrade Release`
- `Fix SMS query classification + improve AI query context`
- `Hardened Login Flow & Boot Sequence`
- `User Preferences UI & SMS STATS Refinement`
- `Rocket Research Instrument — Initial Build`
- `Hardening Rocket Security & UI Overhaul`
- `Dashboard Performance & Stability Overhaul (6hr Rule, Map Cluster, Rocket UI)`
- `Modularization & Personalization Release`
- `Prediction Engine V4 (Logistic Regression) — Shadow Mode`
- `Prediction engine v3.1 — topology filter + LA/SF networks`
- `V4.1 / V5.1 end stop prediction + V3.1.1 pre-filter fix`
- `TransferEngine, single-line trips, UNLINK, and DB refactor`
- `NetworkEngine v1 — self-learning transit graph`
- `Stops library uses agencies array for multi-agency support`
- `V4/V5 models retrained on 560 fresh trips`
- `GTFS-correction filter for V4/V5 route predictions`
- `Global NetworkGraph dual-write`
- `Route + direction-aware stop disambiguation`
- `Wire up public profile page end to end`
- `Normalize Gemini stats bucketing to requested timezone`
- `SMS & Backend Security Hardening`
- `Make profile visibility authoritative`
- `Dynamic stale-trip handling`

### Strict remove examples

- `510 trip stop name backfill from GTFS`
- `STATS — Top route on its own line`
- `toTitleCase capitalizing ordinal suffixes`
- `Stop disambiguation starts trip immediately`
- `Retroactive verification pass (retro-verify.js)`
- `MTS, SMART, Golden Gate Transit, Amtrak, LA DOT not recognized as agencies`
- `Fix uppercase route letters being converted to lowercase in SMS responses`
