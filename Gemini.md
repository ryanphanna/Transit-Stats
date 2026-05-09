# AI Guidelines & Context

## Operational Protocol (Strict)
- **Hard-Coded Authorization**: I will only execute `git push` if you use the specific phrase **"AUTHORIZE PUSH"**. I will only finalize a version bump/release if you use **"AUTHORIZE RELEASE"**.
- **Changelog Integrity**: Released sections in `CHANGELOG.md` are immutable. All post-release fixes must reside in the `[Unreleased]` section until the next authorized version bump.
- **Turn Partitioning**: I will not perform technical code changes and version management (editing changelog/bumping version) in the same conversational turn.

## Notion Synchronization
- Automatically add entries to the **NewTransitStatsLog** in Notion only when the work clearly meets the bar in `TRANSITSTATSLOG.md`.
- **NewTransitStatsLog Database ID**: `3589563c-9a49-8153-9c30-dee3bb00dc9c`
- Use the **NavigatorLog** structure for consistency; **NewTransitStatsLog** includes specific **Issue** and **Fix** fields.
- **Rocket Integration**: Development is logged in the main `NewTransitStatsLog`. No second research log is required.
- When logging entries, use the appropriate **Author** value for the active coding agent.
- Legacy migrated rows may leave `Author` blank if the old database did not track authorship.
- Follow `TRANSITSTATSLOG.md` for what belongs in the log, what does not, title format, workflow, and property usage.

## Git & Deployment
- **Commit Frequency**: Proactively commit changes after completing a logical block of work when it feels necessary or warranted (e.g., after fixing a set of related security alerts, landing a meaningful feature, or finishing a coherent batch of improvements).
- **NEVER** auto-push changes to GitHub. Always ask for permission before running `git push`.
- Always check `.gitignore` before performing large operations to ensure legacy or system-generated files are excluded.
- **Changelog**: Always keep the `CHANGELOG.md` up to date by adding changes to the `[Unreleased]` section as they are completed. **NEVER** edit a versioned section (e.g. `## [1.28.0]`) once it has been dated and pushed. Do not add version numbers in the `[Unreleased]` section. In final release commits (version bumps), **always remove** the empty `[Unreleased]` section to maintain a clean record.

## Security & Maintenance
- Address CodeQL and Dependabot alerts proactively but explain the fix clearly.
- Maintain the "Clean Repository" state by keeping `_legacy_v1` and other junk out of the active Git status.
## Feature Flags & Status
- **RCS Support**: Currently **PAUSED**. Do not attempt to configure or discuss implementation details.
- **Rocket**: Standalone research instrument available at `transitstats.fyi/rocket`.
- **Organization**: Rocket is strictly decoupled from the SMS handler. It writes raw event streams to `rocket_trips` and summary badges to `trips`.

## Domain Context
- **Stop Sign Parsing**: Stop codes vary by city/agency. Never assume a specific length (e.g., TTC uses 5-digit surface codes and 3-digit station codes). If unsure, check real-world patterns in the `stops` collection. Stop IDs are often found on small 'Next Vehicle' stickers or text-to-track instructions.
- **MMS Logic**: MMS trips use the webhook arrival time as `startTime` to ensure accurate boarding records even if AI processing is delayed.
