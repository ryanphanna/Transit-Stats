# AI Guidelines & Context

## Notion Synchronization
- Periodically update the **TransitStatsLog** in Notion with significant changes (Infrastructure, UX/UI, Refactors, Fixes).
- **TransitStatsLog Database ID**: `3269563c-9a49-80d4-b39b-eef09d8227e2`
- Use the **NavigatorLog** structure for consistency; **TransitStatsLog** includes specific **Issue** and **Fix** fields.
- **Rocket Integration**: Development is logged in the main `TransitStatsLog`. No second research log is required.

## Git & Deployment
- **Commit Frequency**: Proactively commit changes after completing a logical block of work (e.g., after fixing a set of related security alerts or implementing a major feature).
- **NEVER** auto-push changes to GitHub. Always ask for permission before running `git push`.
- Always check `.gitignore` before performing large operations to ensure legacy or system-generated files are excluded.
- **Changelog**: Always keep the `CHANGELOG.md` up to date by adding changes to the `[Unreleased]` section as they are completed. Do not add version numbers in the `[Unreleased]` section. In final release commits (version bumps), **always remove** the empty `[Unreleased]` section to maintain a clean record.

## Security & Maintenance
- Address CodeQL and Dependabot alerts proactively but explain the fix clearly.
- Maintain the "Clean Repository" state by keeping `_legacy_v1` and other junk out of the active Git status.
## Feature Flags & Status
- **RCS Support**: Currently **PAUSED**. Do not attempt to configure or discuss implementation details.
- **Rocket**: Standalone research instrument available at `transitstats.fyi/rocket`.
- **Organization**: Rocket is strictly decoupled from the SMS handler. It writes raw event streams to `rocket_trips` and summary badges to `trips`.
