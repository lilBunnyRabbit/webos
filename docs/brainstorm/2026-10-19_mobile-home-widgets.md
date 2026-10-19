# Mobile home: moving icons and widgets

**Date:** 2026-10-19 · **Participants:** owner, Claude

## Context

The owner wants to rearrange the phone home and have widgets there, Shopping List's first. Icon drag was removed on 2026-10-13 (`4d01523`): on Samsung Internet the hold fired but the icon never moved. `MobileDesktopService` filters widgets out because home is an ordered flow with no cells (`mobile.svelte.ts`), and App Library hides "Add widget" on mobile.

Likely cause of the Samsung failure: `long_press` leaves the touch to the browser until the 450ms hold fires. A still finger on Samsung drifts a few pixels, those `touchmove`s go out uncancelled, the browser claims the pan and sends `pointercancel`, so the drag never starts. `touch-action` is fixed at pointer-down, so it can't be switched mid-gesture.

## Decisions

- **Moving icons: edit mode.** "Edit home screen" in the item and empty-space menus. In edit mode icons wiggle and carry `touch-action: none`, so a drag starts on press and the browser never claims it. Holding at a side edge turns the page; dragging onto the dock docks. Taps don't open; Done (or back) leaves. State is local to `mobile-home`; the service's existing `move_item` / `set_docked(before)` do the moves. Rejected: menu "Move earlier/later" (clunky), retrying hold-then-drag (same Samsung failure).
- **Widgets: spans in the flow.** A widget takes `min(w, columns) × h` cells inside the same ordered flow; icons wrap around it. Pages are cut by a pure packer (`paginate_spans`) instead of a fixed count. No dense backfill, so the order stays what the user set; a widget that doesn't fit the rest of a row leaves a gap. `home-layout.json` is unchanged; the size comes from the `.widget` file. Rejected: a separate widget page (widgets never beside icons), a real cell grid (breaks on rotation, a second grid model).
- **Resize on the phone:** yes, a corner grip in edit mode, snapping to cells within `widget_size` and capped at the column count; writes `w`/`h` to the `.widget` file like the desktop, so the size is shared.
- **Ways to add a widget:** App Library "Add widget" on mobile too; an "Add widget" picker in edit mode (every app with a widget); Shopping List's per-list "Add widget". No shell commands.
- **Shopping List widget: only add + camera.** No item list: the list name, colour and count left, an add field (the app's smart parse) and a camera button that opens the app's photo read into that list. Prop `list` (id; none = first list). Tapping the header opens the app on that list.

## Action items

- [ ] `paginate_spans` + tests, widgets back in `MobileDesktopService`
- [ ] Edit mode in `mobile-home`: drag, page turn, dock, resize, Add widget picker
- [ ] App Library Add widget on mobile
- [ ] Shopping List widget, app props `list` and `photo`, per-list Add widget
- [ ] Docs: shell/mobile.md, services/desktop.md, docs/apps/shopping-list.md, ADR-016 and ADR-034 revision notes, roadmap

## Next session topics

- Does the edit mode drag work on the Samsung phone? If not, capture a touch log there.

## Follow-up: Back and edit mode (later the same day)

Back (nav bar, back gesture, browser back) skipped edit mode: `editing` was local to `mobile-home.svelte` and `ui.back()` knew only overlays, dialogs, sheets and windows. Options: edit mode as a `UiOverlay`, a generic `ui.add_back_handler`, or leave it. **Decision (owner): `UiOverlay.HOME_EDIT`.** `back()` already closes overlays; the cost is one overlay at a time, so opening the drawer or switcher ends edit mode, which is fine.
