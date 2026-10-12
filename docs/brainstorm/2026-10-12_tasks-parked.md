# Tasks service: parked

**Date:** 2026-10-12
**Participants:** owner, Claude

## Context

Roadmap block 4 was the Tasks service (ADR-013), wrapping `@lilbunnyrabbit/task-manager` (approved, never installed). Owner: "the current system doesn't need it. what would?"

## Topics

### Who needs it today
Nobody. Every slow job is short and lives in one window. Two apps hand-roll progress (`sprite-extract` `exporting { done, total }`, `image-split` `progress`), and File Explorer pastes and uploads item by item. Closing the window mid-job silently stops them halfway, but they take seconds, so it's tolerable.

### What would need it
Work that outlives its window or needs to be seen outside it, with cancel and retry:
- Zip / unzip in File Explorer (new dependency).
- Batch image tools over many files: task groups, per-file retry, one overall progress.
- Terminal background commands (ADR-007): `cp -r`, `&`, `jobs`, `kill`.
- Importing a real disk folder into OPFS (thousands of files).
- Worker-based encoders and model downloads.

### Open questions for when it's picked up
- Check ADR-013's `TaskHandle` against the package's real API before building; expose the package's own types rather than a second API on top.
- Cancel needs an `AbortSignal` in `execute`, which ADR-013 lacks.
- A task's notification vs a plain progress notification for small jobs.
- Mobile has no tray: the badge needs a home (likely beside notifications in the switcher).
- A history cap, like notifications' 50.

## Decision

**Parked** (owner). Build it together with its first real consumer, most likely the terminal or zip in File Explorer.

## Action items

- [x] ADR-013 revision, ROADMAP: block 4 parked, block 5 next
