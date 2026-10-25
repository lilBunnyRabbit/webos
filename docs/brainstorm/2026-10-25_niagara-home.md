# Mobile home: a Niagara-style list

**Date:** 2026-10-25 · **Participants:** owner, Claude

## Context

The owner wanted to try a Niagara Launcher feel on the phone: a vertical list instead of icon pages, and an alphabet rail on the right to find apps. Widgets must keep working. Built quick on branch `niagara-launcher`, then three design variations were built in parallel (A: recent icon row + rail glyph, B: text-first recent rows + rail tap, C: recent/all as rail pseudo-entries). B was picked: closest to Niagara, text-first, and the only one that kept the 24-hour clock from the design docs.

## Decisions

- **Replace the grid home outright.** No flag or setting; `mobile-home.svelte` is the list home.
- **Letter rail.** Holding the rail shows only the held letter's apps at a fixed spot (30% down); an empty letter says so. Sliding left onto an app and letting go launches it. Letting go on the rail fills in the other letters above and below without moving the held one, and the list then scrolls normally. A short tap opens the full list at that letter.
- **No search on home.** The rail's search glyph is gone. The full list (browse mode) gets a type-to-filter field at its top instead.
- **Recent apps on home.** Up to four text rows under the clock from `apps.recent`, skipping apps already pinned; hidden when empty or in edit mode.
- **All apps.** A quiet "All apps" row at the end of the home list, plus the rail tap.
- **The full list is `UiOverlay.LAUNCHER` on mobile** (owner). Back, Home and an app taking focus close it through `ui` like every other layer (ADR-028). The old mobile app drawer (`app-drawer.svelte`) is deleted; desktop uses the start menu and is unaffected. The held-scrub state stays local to the rail, since it only lives while a finger is down. Rejected: a new `UiOverlay` value next to the drawer (two app browsers on a phone), keeping it local (Back would leave WebOS with the list open).
- **The dock is dropped** (owner). `MobileDesktopService` loses `dock()`, `set_docked`, `dock_full`, `DOCK_SIZE`, `pages()`, `paginate_spans` and `HomeSlot`. A saved layout's dock items are appended to the end of the home order once, on load; `home-layout.json` keeps only the home order. Against: going back to a grid home means rebuilding it.

## Key takeaways

- Niagara's trick is that the held section never moves: switch the content in place while held, and compensate the scroll on release.
- Back must know about every layer a user can see; local state that covers the screen breaks the OS back.

## Action items

- [x] Browse panel as `UiOverlay.LAUNCHER`, delete `app-drawer.svelte`, filter field in browse mode
- [x] Drop the dock from `MobileDesktopService`, migrate saved dock items into the home order, tests
- [x] Docs: shell/mobile.md, design/shell.md, services/desktop.md, services/ui.md, persistence.md, offline.md, apps.md, system README, ADR-016 revision, roadmap
- [x] Changelog entry and version bump

## Next session topics

- Does the rail scrub feel right on the Samsung phone (edge back swipe, diagonal exits)?
- Should a "Recent" pseudo-letter on the rail (variation C) come back?
