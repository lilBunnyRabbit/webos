# ExtractService

Key `extract` · Depends on: `windows`, `dialogs`, `notifications` · Desktop only · ADR: [043](../../adrs/043-window-extraction.md) · Source: `src/lib/core/api/services/extract/`, `src/lib/core/components/window/window-mini.svelte` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

Pops one window out of the tab into an always-on-top Document Picture-in-Picture window (the "mini window"), so a Clock, a Pomodoro or a video stays in view while the user works in another tab ([brainstorm](../../brainstorm/2026-10-16_window-extraction.md)). PiP shares the tab's JS realm, so the kernel, files and settings stay live with no sync layer. The app remounts there: moving the live DOM would leave it dead, because Svelte 5 delegates events to the main `document`.

Registered only on desktop (`platform_services` in `kernel/init.ts`). Phones have no Document PiP. Shared code checks `kernel.services.has("extract")` first, since `kernel.service()` throws for a missing key.

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `supported` | `readonly boolean` | `documentPictureInPicture` exists. Fixed for the page's life |
| `current` | `readonly WindowId \| null` | The window that's out. Reactive |
| `document` | `readonly Document \| null` | The mini window's document while one is out. Reactive (`$state.raw`) |
| `input_inside` | `readonly boolean` | The last pointerdown or keydown (capture) happened in the mini window rather than the tab. Listeners on the tab's `window` (added in `init()`) and on the PiP window. Plain field, read at dialog `show()` time |
| `can_pop` | `(id) => boolean` | Supported, the window exists and isn't dirty |
| `pop` | `(id) => Promise<boolean>` | See below. `false` when refused or the browser said no |
| `bring_back` | `() => Promise<boolean>` | Closes the mini window; the app returns to its frame. A dirty window asks "Discard changes to “{name}”?" first, as a window sheet (so it shows in the mini window); `false` when kept out |
| `focus` | `() => void` | `pip.focus()` |

`documentPictureInPicture` is declared in `document-pip.d.ts`: TypeScript's DOM lib doesn't have it yet.

## Behaviour & invariants

### `pop(id)`

1. Already out: focus the mini window, `true`.
2. `can_pop` false: `false`. A dirty window is refused because the remount drops in-memory state.
3. `requestWindow({ width, height })` at the window's bounds. It needs user activation: a click, or the keydown of a shortcut or of Enter in the Terminal or palette. Refused (no activation, inside an iframe) logs and returns `false`.
3a. The window that's out is dirty: it only runs `bring_back()` (the question) and resolves `false`. On Discard a toast says "{name} is back" / "Pop out again to open the other window.": the question spent the click's user activation, so the new mini window can't open in the same click.
4. Any window already out is released and its PiP window closed (Chrome closes it itself, not every build does).
5. Mirror the tab into the new document: `<html>` and `<body>` attributes (the theme's inline custom properties, `color-scheme`), and a clone of every `<style>` and stylesheet `<link>` in `<head>`. Two `MutationObserver`s keep following: `<html>` attributes (theme changes) and `<head>` children (lazy apps add stylesheets later).
6. `pagehide` on the PiP window releases it, if it's still the current one.
7. Sets `current` and `document`.

### Mounting

`window.svelte` reads `current`. While `current === id` it mounts `WindowMini` into `document.body` with `getAllContexts()` (the window's app context: handle, storage), and unmounts it when that changes. Zoom is passed through a getter, so it stays live. The frame gets `hidden` and skips `WindowContent` and `WindowSheets`, so the app runs once. The focus effect and the view-transition name skip it too.

`WindowMini` renders `WindowContent`, `WindowSheets` (inert content behind a sheet, as in the frame) and a `DialogsHost` with `origin` set to the window and `view` set to the mini window. A pointerdown or focusin inside focuses the window in WindowsService.

### Overlays

- **Sheets** are bound to their window (ADR-025), so they render in the mini window with no change.
- **System dialogs and menus** opened when the last click or key press was in the mini window (`input_inside`) get `origin` set ([dialogs](dialogs.md#origin)) and render in its host. Their anchor points are mini-window coordinates already, since they come from events there.
- **Kit popovers** live in the component tree, so they open in the mini window.
- **Toasts** stay in the tab.

### Coming back

- `bring_back()`, `win back` or the taskbar item's Bring back: asks first when dirty.
- The user closes the mini window: `pagehide`.
- The window closes: an `$effect.root` started in `init()` sees `current` no longer exists and closes the mini window (no question: the close guard already asked).
- Another window pops out: asks first when the one that's out is dirty (above).

The app remounts in its frame. In-memory state that isn't stored resets, on the way out and on the way back.

### Visibility

`windows.is_visible(id)` returns `true` for the window that's out, even while the tab is hidden: the mini window is still on screen, so apps that pause when hidden (ADR-035) keep running ([windows](windows.md)).

## State

`current`, `document`: `$state`. The PiP `Window` and the observers are plain fields. Nothing is persisted: [SessionService](session.md) saves a popped-out window as a normal window, since PiP can't reopen without user activation.

## Lifecycle

`init()` starts the watcher for closed windows and the tab's `pointerdown` / `keydown` listeners behind `input_inside`. `destroy()` removes them, disposes the watcher and closes the mini window without asking.

## Shell

`shell.ts`. Desktop only, since the service is.

| Command | Args | Does |
|---------|------|------|
| `win pop` | `[window]` (`arg.window()`, focused by default) | Pops it out. Errors: no single match, unsaved changes, the browser refused. Available while supported and a window is open |
| `win back` | none | `bring_back()`, asking first when dirty. Available while one is out |

Shortcut `window.pop`, Alt+Shift+P, runs `win pop` ([shortcuts](shortcuts.md)).

## UI

- Titlebar: a Pop out button (Phosphor `PictureInPicture`) while `supported`, disabled while dirty ("Save first to pop out") ([window](../shell/window.md)).
- Taskbar item: a `PictureInPicture` mark while out; click focuses the mini window; the menu has Bring back while out, else Pop out ([taskbar](../shell/taskbar.md)).

## Testing

`service.browser.test.ts` covers refusals (dirty, missing window, the browser refusing) and that dialogs stay in the tab with nothing out. Vitest runs tests in an iframe, where Chrome refuses PiP, so the popped-out path is checked by hand with Playwright against the dev server.

## Known gaps

- OS shortcuts typed inside the mini window don't fire: ShortcutsService listens on the tab's document.
- Unsaved changes made while out are lost if the user closes the mini window itself: PiP closing can't be cancelled. Every other way back asks first.
- Code that uses the global `document` or `window` (document listeners, `document.activeElement`, `<svelte:window>` / `<svelte:document>` key bindings like Calculator's) still talks to the tab, so it doesn't see the mini window. The kit's menu and Open with keyboard handling read their own element's `ownerDocument` instead.
