# Context menus and window dialogs

**Date:** 2026-10-11
**Participants:** Owner, Claude

## Context

File Explorer still uses the browser's `prompt()` (new folder) and `confirm()` (delete). The desktop can't delete real files without a confirm (ADR-022). There's no right-click anywhere, so rename, copy, move, "Open with…" and properties have no entry point.

Earlier work:
- ADR-003 sketched window-scoped, promise-based overlays on the WindowHandle: `confirm`, `prompt`, `pick_file`, `pick_directory`, rendered over the calling window only ([2026-01-31 window API](2026-01-31_window-api-actions.md)).
- ADR-011 lists a desktop context menu (sort, auto-arrange, new folder, wallpaper) and an icon menu (open, remove, properties), with multi-selection.
- ADR-019 / DialogsService: promise-based system dialogs above all windows, native `<dialog>`, anchor positioning, `dismissible` (2026-10-11), and a shared scrim.
- The design pass: a kit with no `Menu` yet. Floating layers sit on `background-lighter` over `--overlay`.

Constraints from the code:
- Window frames clip (`overflow: hidden`, `contain: paint`). A menu inside a window must render in the top layer (popover or dialog) to escape.
- Only one context menu should be open at a time, and it must close on Esc, an outside click, a scroll or window blur.

## Topics

### Round 1

| Question | Decision | Rejected |
|----------|----------|----------|
| How menus are built | **Data-driven, through DialogsService**: `dialogs.menu(items, { anchor })` with one shared menu component | Kit `<Menu>` markup per call site; a dedicated ContextMenuService |
| Where confirm and prompt appear | **Window-scoped sheets**: `window.confirm()` / `window.prompt()` over the calling window only; the shell uses system dialogs | System dialogs only; inline editing |
| First-pass file operations | Rename (F2), delete with confirm, copy/cut/paste, properties + Open with | |
| Multi-select | Later; menus act on the right-clicked item | Files now; files and desktop now |

**Owner note:** dialogs need a clear split between system and window-bound. Example: an app asks to open a file, and a File Explorer picker opens *inside that app's window* (the ADR-003 `pick_file` from the [window API brainstorm](2026-01-31_window-api-actions.md)). So the window-bound surface has to host real components (a picker), not only confirm and prompt.

### Round 2: structure

| Question | Decision | Rejected |
|----------|----------|----------|
| System vs window-bound dialogs | **One DialogsService, with a window scope**: `show(component, props, { window: id })`. The window component renders its entries as a sheet that blocks only that window. WindowHandle `confirm` / `prompt` / `pick_file` / `pick_directory` are thin wrappers. Closing the window resolves its sheets with `null`. | A separate per-window overlay system |
| File picker this pass | **Yes**, as a window sheet reusing File Explorer in a picker mode | Later |
| File clipboard | **A ClipboardService** | FilesService state; per File Explorer window |
| Context menu scope | **Always system level** (top layer, at the cursor, flips at screen edges) | Window-bound menus for apps |

### Round 3: clipboard

| Question | Decision | Rejected |
|----------|----------|----------|
| What ClipboardService holds | Files in memory (`copy` / `cut`, paths), and text written to the system clipboard | Files only; text kept in memory |
| A paste conflicts with an existing name | **Ask: Replace, Keep both, Skip.** The caller shows the sheet or dialog. | Auto-rename |

## Key takeaways

1. One dialog contract with two surfaces: the system host and per-window sheets.
2. Menus are data and always system level, so every menu behaves the same.
3. The file picker proves the window scope with a real component.
4. Written up as [ADR-025](../adrs/025-menus-sheets-clipboard.md).

## Action items

- [x] ADR-025, roadmap
- [x] Implemented in 5 steps (2026-10-11)

## Next session topics

- Multi-select for files and the desktop (ADR-011), and "apply to all" for paste conflicts.
- Desktop background menu items: sort, arrange, wallpaper (ADR-011).
