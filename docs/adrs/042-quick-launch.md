# ADR-042: Taskbar Quick Launch and Drag to Pin
**Date:** 2026-10-16
**Status:** Implemented

## Context

Apps could be pinned only through menus, and only to the desktop (`desktop.pin`, ADR-022). The taskbar lists one item per window and nothing else, so an app you open daily needs the start menu every time. The owner asked for drag and drop pinning, onto the desktop and a taskbar quick launch, with icons that move to make space ([brainstorm](../brainstorm/2026-10-16_quick-launch-and-random-theme.md)).

## Decision

**State.** `Taskbar` gains `pinned: AppId[]`, persisted in `/etc/settings.json` with the rest of `settings.taskbar`. Empty by default. Pure helpers in `settings/taskbar.ts` (`with_pin(pinned, id, index?)`, `without_pin(pinned, id)`) are the one way to change it; callers assign the result.

**Quick launch zone.** Between Start and the window list on the desktop taskbar, every position, icon only. A dot shows when the app has a window. Click focuses the app's most recent window (restoring it if minimized), else launches; Shift-click or middle-click launches a new one. Right-click: Open, New window, Unpin from taskbar. Hidden on mobile.

**Drag.** A new native drag type `application/x-webos-app` carries an app id. Start menu tiles, App Library cards and quick launch icons set it; quick launch icons also set `application/x-webos-quick-launch`.
- Over the zone an insertion index follows the pointer and a placeholder opens there; the other icons slide with `animate:flip`. Drop pins at that index (installing the app first, as any UI open does, ADR-040) or reorders.
- A quick launch icon dragged out of the taskbar closes its gap; its dragend outside the taskbar unpins it.
- The desktop accepts an app drag: `desktop.pin(id)`, then moves the new shortcut to the drop cell. It ignores quick-launch drags.

**Menus.** "Pin to taskbar" / "Unpin from taskbar" in the start menu tile menu, App Library details, and a new context menu on a window's taskbar item (with Close window).

**Uninstall** (`apps.uninstall`) unpins.

**Shell** (AppsService `shell.ts`, since it needs the registry and settings can't depend on apps): `taskbar pin <app>` (installed apps only, else the App Library hint), `taskbar unpin <app>`, `taskbar list` yielding `app` values.

## Alternatives Considered

- **Desktop only:** no new state, but no way to keep an app one click away while windows cover the desktop.
- **Merged dock** (pinned icon is the running app's item): needs grouping by app, parked in ADR-014.
- **Pointer-event drag** instead of native drag and drop: works on touch, but the desktop and Explorer already speak native DnD, and mobile keeps its menus.

## Consequences

- A pinned app with a window open shows twice: launcher and window item.
- `Taskbar` is a public shape change; the settings parser defaults `pinned` to `[]` and drops non-strings, unknown ids are skipped when rendering.
- Drag off to unpin also unpins when a drag cancelled with Esc ends outside the taskbar.

## Revision 2026-10-16 (implementation)

- **The source stays in the DOM.** A quick launch icon being reordered goes `absolute opacity-0` a frame after `dragstart`; hiding it inside `dragstart` or removing it from the keyed list loses the drag in Chromium.
- **Menus opened mid-press.** The taskbar's right-click menus flip above the pointer, so the release landed outside them and `closedby="any"` closed them at once. `dialogs-host.svelte` now opens a dialog that appears while a pointer button is held only after the release. That applies to every menu; desktop menus already opened under the pointer and look the same.
- The window item menu also has Close window.
