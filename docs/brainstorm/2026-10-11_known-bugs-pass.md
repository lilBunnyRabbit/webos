# Known bugs pass

**Date:** 2026-10-11
**Participants:** Owner, Claude

## Context

Writing the system reference (`docs/system/`) turned up a list of bugs, tracked in ROADMAP "Known bugs". Most were plain fixes. Two needed a decision.

## Topics

### Service worker vs ADR-004

ADR-004 rejected a service worker, but VitePWA was already registered in production.

| Decision | Rejected |
|----------|----------|
| Keep the service worker and revise ADR-004. The owner: a standalone PWA is the main goal. | Remove VitePWA to follow ADR-004 (no install, no offline) |

Follow-up done in the same pass:
- `apply_update()` now updates the service worker and reloads, instead of unregistering it and wiping caches.
- Manifest `background_color` set to Brand Dark.

The production update flow (build A → build B → check → apply) was tested end to end in a browser.

### Desktop icons lost when the grid shrinks

| Decision | Rejected |
|----------|----------|
| Keep the arrangement as `layout` and derive the visible `grid` per size. Icons return to their cells when the grid grows. | Keep a single grid and leave non-fitting items out of view (loses the arrangement); a scrolling desktop |

## Key takeaways

1. The PWA is a core goal. Update handling has to cooperate with the service worker, never tear it down.
2. Desktop state now splits into the arrangement and the view. When the arrangement gets persisted, persist `layout`.

## Action items

- [x] ADR-004 and ADR-011 revisions, ADR-018 dotfile note
- [x] All ROADMAP "Known bugs" fixed

## Next session topics

- Desktop arrangement persistence (ADR-011 / session persistence).
- VersionService: an update toast and the changelog (ADR-004 items still open).
