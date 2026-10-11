# Window state

**Date:** 2026-10-11
**Participants:** Owner, Claude

## Context

Owner's bug: with two Settings windows open, switching the tab in one switches the other.

Cause: ADR-003 deliberately shares `storage.persisted()` cells across every window of an app. Settings keeps its open section in `persisted("section")`, so a tab change writes the shared cell. The same applied to Activity Monitor and Style Guide (`section`), Kernel (`expanded`) and Text Viewer (`wrap`). App data (Tic-Tac-Toe stats, QR entries, Example count) is correctly shared.

## Topics

| Question | Decision | Rejected |
|----------|----------|----------|
| Approach | Window-scoped storage API: `storage.window(key, initial, schema?)`, saved with the session | Local `$state` seeded from the last-used value via `get`/`set` (a restored window would get the last tab anyone used, not its own); plain local state, not remembered |
| Where it lives | `AppInstance.state` next to `props`; session snapshots it | `WindowInstance.state` (WindowsService holding app data it doesn't understand); a module map in the app-context module (SessionService would have to reach into the app layer) |
| New window | Starts at `initial` | Last used from any window (two stores per key) |
| Session format | Optional `state` field, still version 1 | Bump to v2 (every saved session dropped once) |
| Keys moved | Settings, Activity Monitor and Style Guide `section`, Kernel `expanded`, Text Viewer `wrap` (all five, wrap included) | Keeping `wrap` as a shared preference |

## Key takeaways

- `persisted()` is for app data shared across windows. `window()` is for view state.
- A restored window's saved state wins over its saved props. This fixes Settings reopening on What's new after a session restore.

## Action items

- [x] Implement, migrate the five keys, ADR-003 and ADR-023 revisions, system docs
- [x] Changelog 0.8.1

## Next session topics

- Clean up the orphaned `app.{id}.*` localStorage keys? They're harmless.
