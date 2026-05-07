# TransitStatsLog — Logging Rules

TransitStatsLog is a **portfolio tracker**, not a dev log. The goal is a running catalogue of skills and technical work worth mentioning in an interview, case study, or resume.

**Notion DB**: https://www.notion.so/3589563c9a4981539c30dee3bb00dc9c?v=3589563c9a4981ca82f3000c9d1dc215

## What belongs here

- Major feature or capability launched end-to-end
- Meaningful prediction, AI, or analytics improvement
- Significant architecture or infrastructure change
- Substantial security hardening or reliability work
- Major product-facing UX improvement with real scope
- Roadmap-worthy follow-up that is important enough to preserve before shipment

## What does NOT belong here

- Patch-note debris
- Minor bug fixes
- One-off data cleanup or backfills
- Small copy or layout tweaks
- Narrow normalization fixes
- Anything that is mostly maintenance

If you wouldn't mention it in a job interview, don't log it.

## Entry title format

Lead with the skill or outcome, not the task.

- Good: "Built Rocket research instrument for GPS-anchored dwell and signal analysis"
- Good: "Implemented route-aware stop disambiguation and GTFS-backed prediction filtering"
- Bad: "Fixed stop lookup bug" or "510 trip stop name backfill from GTFS"

## Workflow

TransitStatsLog should normally be updated **after the work is committed and pushed upstream**.

- Default flow: do the work, push it upstream, then add the TransitStatsLog entry
- Log only work that is real and shipped, not tentative or partially rewritten work
- Use Notion AI only for tone/consistency cleanup, not for deciding what belongs in the log or inventing technical content
- Before creating a Notion entry, make sure the title, `Issue`, `Fix`, `Status`, `Shipped`, and `Version` are already in their final intended form
- Do **not** create "good enough for now" entries that will need immediate cleanup afterward
- If the available Notion tools in the current session cannot update existing rows, treat creation as effectively write-once and do the editorial pass first
- If an entry still feels incomplete, ambiguous, or uneven, fix the wording before creating it rather than asking Ryan to clean it up afterward
- If needed, draft or stage the entry locally in the repo first, then copy the finalized version into Notion once the wording and metadata are settled

## Property usage

- `Status`: Use `Shipped` for entries added after the work is upstream. Use `Backlog` or `In Progress` only for genuinely roadmap-worthy open work.
- `Shipped`: Set this to the ship date when the work is added to TransitStatsLog.
- `Version`: Set this when the shipped work is associated with a release/version. Leave it blank only if no version has been cut yet.

## AI assistant rule

If something clearly meets the bar above **and it has already been pushed upstream**, **add the entry directly** — don't ask Ryan to approve it. The goal is zero overhead for him. If it's a borderline call, skip it rather than interrupting to ask.
