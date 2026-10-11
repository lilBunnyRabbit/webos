# ADR-025: Context Menus, Window Sheets and Clipboard
**Date:** 2026-10-11
**Status:** Accepted (steps 1–4 implemented 2026-10-11)

## Context

File Explorer uses the browser's `prompt()` and `confirm()`. There's no right-click, so rename, copy, move, Open with and properties have no entry point. The desktop can't delete real files without a confirm (ADR-022). ADR-003 planned window-scoped `confirm` / `prompt` / `pick_file`; the owner wants a clear split between system dialogs and window-bound ones, so that a picker can open inside the app that asked for it. Brainstorm: [2026-10-11 Context menus](../brainstorm/2026-10-11_context-menus.md).

## Decision

### 1. DialogsService gets a window scope

```ts
show<T, P>(component, props, options?: { anchor?; dismissible?; window?: WindowId }): Promise<T | null>;
for_window(id: WindowId): DialogEntry[];   // sheets the window renders
```

- **System entries** (no `window`): the top-layer host, as today.
- **Window entries:** the window component renders them as a **sheet**. A scrim covers only that window's content, the sheet is centered in it, and focus stays inside the window. Other windows stay usable. The sheet moves, minimizes and maximizes with its window. Closing the window resolves its sheets with `null`.
- `WindowHandle` gains thin wrappers that pass the window id:

```ts
confirm(message: string, options?: { detail?; confirm_label?; danger? }): Promise<boolean>;
prompt(message: string, options?: { initial?; placeholder?; confirm_label?; validate? }): Promise<string | null>;
pick_file(options?: { accept?: string[]; start_path?: string }): Promise<string | null>;
pick_directory(options?: { start_path?: string }): Promise<string | null>;
```

These are required answers (`dismissible: false`), except that Esc still cancels a prompt or picker, which counts as Cancel.

### 2. Context menus: data-driven, always system level

```ts
menu(items: MenuItem[], options: { anchor: Position }): Promise<string | null>;

type MenuItem =
  | { id: string; label: string; icon?; shortcut?: string; danger?: boolean; disabled?: boolean }
  | { label: string; icon?; items: MenuItem[] }   // submenu
  | { separator: true };
```

- One shared `ContextMenu` component on the top-layer host, at the cursor. It flips at screen edges, uses the shared scrim, and dismisses on Esc or an outside click.
- Keyboard: arrow keys, Enter, → / ← for submenus, typeahead. Opened by right-click, the ContextMenu key or Shift+F10.
- It resolves the chosen item's `id`. The caller acts on it.

### 3. ClipboardService (new, depends on `files`)

```ts
content: { kind: "files"; mode: "copy" | "cut"; paths: string[] } | null;  // in memory, cleared on reload
copy_files(paths: string[]): void;
cut_files(paths: string[]): void;
paste_files(target: string, on_conflict: (name: string) => Promise<"replace" | "keep_both" | "skip">): Promise<string[]>;
copy_text(text: string): Promise<void>;   // writes navigator.clipboard
```

- Files stay inside WebOS: the Clipboard API can't carry OPFS handles. Text goes to the system clipboard, so it also works outside WebOS.
- Cut items are shown dimmed until a paste moves them. Paste after a cut clears the clipboard.
- **Conflicts ask.** The caller supplies `on_conflict`: File Explorer shows a window sheet (Replace / Keep both / Skip), and the desktop shows a system dialog. "Keep both" uses the auto-rename rule.

### 4. First-pass file operations

- Rename (menu and F2), through a prompt sheet.
- Delete, with a confirm sheet. The desktop can now delete real files too.
- Copy, cut and paste (Ctrl+C / X / V).
- Properties sheet: name, kind, size, type, modified, path.
- An Open with submenu that reuses the association candidates (ADR-018).
- FilesService gains `rename_entry` and a recursive `copy_directory`.

Single item only; multi-select comes later (ADR-011).

## Alternatives Considered

- **A kit `<Menu>` in markup per call site:** flexible, but each call site manages state and anchoring, and menus drift.
- **A dedicated ContextMenuService:** it overlaps DialogsService.
- **System dialogs only:** one question blocks every window.
- **A separate per-window overlay system:** two dialog contracts to keep aligned.
- **Window-bound menus:** clipped to the window, while menus should extend past its edge.
- **Clipboard in FilesService or per window:** less general; text has no home.
- **Auto-rename on paste:** the owner wants to choose replace, keep both or skip.

## Consequences

### Positive
- Every menu and dialog in the OS looks and behaves the same.
- Apps get a picker and dialogs scoped to their own window for free.
- The native `prompt()` and `confirm()` are gone.

### Negative
- DialogsService's API grows (`window` scope, `menu`), and the window component renders sheets.
- One more service (`clipboard`).
- Conflict prompts need care once multi-select exists ("apply to all").

## Implementation order

1. Window scope in DialogsService, sheet rendering in the window, `ConfirmDialog` / `PromptDialog`, WindowHandle `confirm` / `prompt`; replace `prompt()` / `confirm()` in File Explorer.
2. `dialogs.menu` and `ContextMenu` (keyboard, submenus); right-click on File Explorer rows, its background and the desktop.
3. Rename, delete, properties, Open with; `rename_entry`, `copy_directory`.
4. ClipboardService; copy, cut and paste with the conflict sheet.
5. `pick_file` / `pick_directory` as a picker-mode File Explorer sheet; "Open…" in Text Viewer, Media Preview and PDF Viewer.

## Related
- ADR-003, ADR-011, ADR-018, ADR-019, ADR-022
