# UiService

Key `ui` · Depends on: windows, dialogs · ADR: [ADR-028](../../adrs/028-ui-service.md) · Source: `src/lib/core/api/services/ui/` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

The shell's overlay state, so a service (shortcuts now, a command palette later) can open what used to be component state: the launcher (the desktop start menu, the mobile app drawer), the mobile running-apps switcher and the notification center. It also owns back: one chain for the phone's nav bar, the device's back gesture and the desktop browser's Back ([brainstorm](../../brainstorm/2026-10-14_os-back.md)).

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `overlay` | `readonly UiOverlay \| null` | `"launcher"`, `"switcher"` or `"notifications"`. One at a time |
| `open` | `(overlay) => void` | Replaces whatever was open |
| `close` | `() => void` | |
| `toggle` | `(overlay) => void` | Opens it, or closes it when it's the open one |
| `armed` | `readonly boolean` | A back-guard history entry is above the page |
| `back` | `() => boolean` | One step back (below). `false` when nothing took it |

## Back

`back()` takes the first that applies:

1. An overlay is open: close it (in a view transition).
2. A system dialog or menu is on top (`dialogs.system`): resolve it `null` if it's dismissible. A non-dismissible one (Restore, the introduction) swallows back.
3. The focused window has a sheet (`dialogs.for_window`): the same.
4. The focused window's app claims it (`windows.back(id)`, its `on_back` handlers).
5. Mobile: `go_home()` in a view transition. Desktop: `false`.

Sheets come before the app's own back, so an app can't navigate behind its sheet.

**History guard.** The browser reports back only through `popstate`, which needs an entry above the page. On a `pointerup` or `keydown` (capture) while not `armed`, it calls `history.pushState({ webos: "back-guard" }, "")` on the same URL and sets `armed`. Chrome skips entries pushed without user activation, so the guard is never pushed at boot or from `popstate`. On `popstate` it sets `armed = false` and runs `back()`, unless the new hash starts with `#/` (a pasted deep link, the [router](router.md)'s). It always re-arms on the next gesture, even at home with nothing open, so WebOS doesn't leave while the user is interacting. Two backs with no tap between them do leave. Forward lands on the guard and runs `back()` once more.

## State

`overlay`, `armed`: `$state`. Not persisted; start `null` and `false`.

## Lifecycle

| Hook | Does |
|------|------|
| `init()` | `pointerup` and `keydown` (capture) arm the guard; `popstate` runs back |
| `destroy()` | Removes the three listeners. The guard entry stays in history |

## Who reads it

| Where | How |
|-------|-----|
| `taskbar/start-menu.svelte` | Mirrors both ways: the popover's `toggle` event writes `open` / `close` (light dismiss and Esc included), and an effect calls `showPopover()` / `hidePopover()` when `overlay` changes. The popover keeps its own open state too, for mounting the contents |
| `taskbar/taskbar-tray.svelte` | The same two-way mirror for `notifications` and the notification center popover |
| `mobile/mobile-shell.svelte` | `overlay` is its layer: `launcher` renders the app drawer; `switcher` and `notifications` both show the switcher, which lists notifications above the cards. It closes the overlay when an app comes on screen |
| ShortcutsService | Mod+K toggles `launcher`, Alt+Shift+N toggles `notifications` |
| `mobile/nav-bar.svelte` via `mobile-shell.svelte` | Back calls `back()`; Esc with an overlay open too |

## Known gaps

- Desktop has no switcher; `"switcher"` does nothing there.
