# Close guard and window titles

**Date:** 2026-10-12
**Participants:** Owner, Claude

## Context

Paint (0.19.0) loses unsaved work on every way a window closes, and the planned Text Editor, Image Editor and Markdown → PDF would too. Paint also can't show its file name: the titlebar always shows the manifest name. ADR-003 planned `set_title()`, never built.

Today `WindowHandle.close()` → `windows.close(id)` removes the window synchronously (`windows/service.svelte.ts`). The only hook of this kind is `on_back`, a handler stack for the mobile Back button.

Ways a window closes: titlebar ×, Alt+Shift+W, the mobile switcher (card flick, Close all), Activity Monitor's End, a crashed app's "Close window", and tab close / reload (no prompt at all).

## Decisions

| Question | Decision | Rejected |
|----------|----------|----------|
| How an app says it has unsaved work | **Dirty flag with an optional save**: `window.set_dirty(dirty, { save? })`. The OS owns one sheet (Save / Don't save / Cancel; Save only when the app gave `save`, which resolves `true` once saved), the titlebar dot and the tab-close warning | Dirty flag with Discard / Cancel only (one extra step); an `on_close` handler stack (every app re-implements the sheet; the OS can't show a dot or ask an async handler from `beforeunload`) |
| Which closes ask | **All but Activity Monitor's End**: ×, Alt+Shift+W, card flick, Close all, crashed app's Close window, and tab close / reload through `beforeunload` (the browser's own prompt). End is Force Quit | Guarding End too; not guarding tab close |
| Closing several at once with dirty windows | **Clean ones close at once; each dirty window comes forward and asks in turn.** Cancel stops the rest and leaves that one open | One summary sheet with Discard all; skipping dirty windows |
| What the titlebar shows | **The document title alone**, the app shown by its icon (macOS). `set_title(null)` goes back to the app name. Taskbar tooltip "Untitled.png — Paint". Not persisted: the app sets it again on restore | "Title — App" everywhere |
| `close()` semantics | **`close(id)` is guarded and returns `Promise<boolean>`; `force_close(id)` skips the guard.** Callers get the guard by default | Keeping `close` as force and adding `request_close` (a caller that forgets loses work) |

| Who shows the sheet | **DialogsService registers a close prompt** on WindowsService at init (`set_close_prompt`); dependency direction stays dialogs → windows. No prompt registered → a dirty window refuses to close | WindowsService calling dialogs lazily (hidden cycle); the guard outside WindowsService (breaks "close is guarded") |

Against the picks, recorded: the OS sheet can't carry app-specific wording; five dirty windows mean five sheets; `close` turning async ripples through the interface, the mobile service, session and tests.

## Action items

- [x] ADR-029
- [x] WindowsService: `title` / `dirty` on window state, `set_title`, `set_dirty`, guarded `close` / `close_all`, `force_close`; mobile service too (`CloseGuard`)
- [x] OS sheet, titlebar title + dot, taskbar tooltip, switcher card, Activity Monitor name and End → `force_close`, `beforeunload`
- [x] WindowHandle `set_title` / `set_dirty`
- [ ] Paint adopts both (after the kit pass merges)
