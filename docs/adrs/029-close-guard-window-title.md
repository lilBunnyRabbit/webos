# ADR-029: Close Guard and Window Titles
**Date:** 2026-10-12
**Status:** Accepted

## Context

Document apps (Paint, later Text Editor, Image Editor) lose unsaved work on every close path, and can't show which file they have open. `windows.close(id)` removes a window synchronously; ADR-003's `set_title()` was never built. [Brainstorm](../brainstorm/2026-10-12_close-guard.md).

## Decision

- **Dirty flag with an optional save.** `WindowHandle.set_dirty(dirty: boolean, options?: { save?: () => Promise<boolean> })`. The window state in WindowsService holds it (never persisted).
- **Guarded close.** `WindowsService.close(id): Promise<boolean>` asks a dirty window first with an OS sheet over it: "Save changes to {title}?" with Cancel / Don't save / Save (Save only when `save` was given; a `save` that resolves `false` keeps the window open). Resolves `false` on Cancel. `force_close(id): boolean` skips the guard.
- **Every close path is guarded except Activity Monitor's End** (`force_close`). Tab close / reload with any dirty window triggers `beforeunload`.
- **`close_all()`** closes clean windows at once, then asks each dirty window in turn, bringing it forward; Cancel stops the rest.
- **Titles.** `WindowHandle.set_title(title: string | null)`. The titlebar shows the title alone (app identified by its icon) with a dot when dirty; the taskbar tooltip reads "{title} — {app}"; the mobile switcher card and Activity Monitor show the title. `null` restores the app name. Not persisted.

- **Who prompts.** DialogsService registers the sheet on WindowsService at init (`set_close_prompt`), keeping the dependency direction dialogs → windows. With no prompt registered, a dirty window refuses to close.

## Alternatives Considered

1. **Discard / Cancel only** — smaller API, but the user has to cancel, save in the app and close again.
2. **`on_close` handler stack** like `on_back` — flexible, but every app re-implements the sheet and the OS can't show a dirty dot or answer `beforeunload` synchronously.
3. **Keep `close` as force, add `request_close`** — no signature churn, but a caller that forgets loses work silently.
4. **"Title — App" in the titlebar** — clearer with many windows, truncates sooner.

## Consequences

### Positive
- One consistent unsaved-changes flow, a dirty dot and a tab-close warning for free.
- Guarded by default: new close paths can't forget the guard.

### Negative
- `close` becomes async across the service interface, the mobile service, session and tests.
- The sheet can't carry app-specific wording.
- Many dirty windows on Close all means one sheet each.
