# Mobile home: a Niagara-style list

**Date:** 2026-10-25 · **Participants:** owner, Claude

## Context

The owner wanted to try a Niagara Launcher feel on the phone: a vertical list instead of icon pages, and an alphabet rail on the right to find apps. Widgets must keep working. Built quick on branch `niagara-launcher`, then three design variations were built in parallel (A: recent icon row + rail glyph, B: text-first recent rows + rail tap, C: recent/all as rail pseudo-entries). B was picked: closest to Niagara, text-first, and the only one that kept the 24-hour clock from the design docs.

## Decisions

- **Replace the grid home outright.** No flag or setting; `mobile-home.svelte` is the list home.
- **Letter rail.** Holding the rail shows only the held letter's apps at a fixed spot (30% down); an empty letter says so. Sliding left onto an app and letting go launches it. Letting go on the rail fills in the other letters above and below without moving the held one, and the list then scrolls normally. A short tap opens the full list at that letter.
- **No search on home.** The rail's search glyph is gone. The full list (browse mode) gets a type-to-filter field at its top instead.
- **Filter matches like the old drawer** (owner, PR review). The first build matched names only; the owner wants an app found by its keywords too, so the filter is `search_apps` (name, keywords, description, category) with the Not installed section and the drawer's Related row. `search_app_names` is gone.
- **Recent apps on home.** Up to four text rows under the clock from `apps.recent`, skipping apps already pinned; hidden when empty or in edit mode.
- **All apps.** A quiet "All apps" row at the end of the home list, plus the rail tap.
- **The full list is `UiOverlay.LAUNCHER` on mobile** (owner). Back, Home and an app taking focus close it through `ui` like every other layer (ADR-028). The old mobile app drawer (`app-drawer.svelte`) is deleted; desktop uses the start menu and is unaffected. The held-scrub state stays local to the rail, since it only lives while a finger is down. Rejected: a new `UiOverlay` value next to the drawer (two app browsers on a phone), keeping it local (Back would leave WebOS with the list open).
- **`ui launcher` over an app goes home** (owner, PR review). The full list is part of the home and sits under the windows, so opening it with Mod+K or the command while an app is up would show it behind the app; the shell's effect calls `windows.go_home()` instead.
- **Widgets still resize on the phone** (owner, PR review). `MobileDesktopService.resize_widget` stays with its old contract (clamped to `widget_size`, written to the `.widget` file, shared with the desktop). The list shows widgets full width and `size.h` rows tall, so edit mode gives each a second grip, level with its bottom edge, that changes the height in rows; `w` stays as the desktop set it. Arrow keys on the handle for the keyboard.
- **Hold to edit, iOS-style** (owner, after 3.69.0: "The widget placement is strange and i cant mive them. Cant we do it like apple has it that if you hold them for a while they start shaking and i can move everything up/down/edit... This still barely works on Samsung internet"). Holding any home item ~450ms opens edit mode at once with a jiggle and a vibration, and the same touch carries on as a drag; the item's other actions stay a tap away in edit mode (its menu) plus a "−" badge for remove. Edit mode drags whole items, no grips: a 200ms press then move drags, a quick swipe scrolls; neighbours slide aside to open the gap, the list autoscrolls near its edges. Widgets resize from a corner handle (keyboard arrows kept). Done, Back, Home, Escape and a tap on empty space leave. Recent and All apps stay in the layout, dimmed, so nothing moves under the held finger when edit mode opens; the clock gives its place to Add widget and Done for the same reason. Reuses `UiOverlay.HOME_EDIT`; no new service, state layer or persistence.
  - **Samsung Internet, at the cause:** the browser claimed the still finger as a pan and sent `pointercancel` before the hold fired; pointer events never come back after that. The gesture runs on touch events (they do), with a non-passive `touchstart` on the list, every `touchmove` inside the slop cancelled while the hold is pending and every one cancelled after it, listeners on the touched node, `touchcancel` as the end. Build calls: Move up / Move down in the edit-mode item menu as the keyboard path for reordering (the old grips had none); the drop spot uses the dragged item's leading edge against each neighbour's middle so a tall widget can reach the end.
- **The dock is dropped** (owner). `MobileDesktopService` loses `dock()`, `set_docked`, `dock_full`, `DOCK_SIZE`, `pages()`, `paginate_spans` and `HomeSlot`. A saved layout's dock items are appended to the end of the home order once, on load; `home-layout.json` keeps only the home order. Against: going back to a grid home means rebuilding it.

## Key takeaways

- Niagara's trick is that the held section never moves: switch the content in place while held, and compensate the scroll on release.
- Back must know about every layer a user can see; local state that covers the screen breaks the OS back.

## Action items

- [x] Browse panel as `UiOverlay.LAUNCHER`, delete `app-drawer.svelte`, filter field in browse mode
- [x] Drop the dock from `MobileDesktopService`, migrate saved dock items into the home order, tests
- [x] Docs: shell/mobile.md, design/shell.md, services/desktop.md, services/ui.md, persistence.md, offline.md, apps.md, system README, ADR-016 revision, roadmap
- [x] Changelog entry and version bump
- [x] PR review: old drawer matching back in the filter, widget resize back, scrub cancel leaves an open list alone, focus lands on the panel after a release
- [x] Hold to edit: hold enters edit mode and drags in one touch, jiggle, whole-item drag with gap and autoscroll, remove badge, tap menu, corner resize, touch-event gesture for Samsung Internet (3.69.1)
- [ ] Check hold-then-drag on the Samsung phone

## Next session topics

- Does the rail scrub feel right on the Samsung phone (edge back swipe, diagonal exits)?
- Should a "Recent" pseudo-letter on the rail (variation C) come back?
