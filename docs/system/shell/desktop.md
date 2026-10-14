# Desktop

Source: `src/lib/core/components/desktop/` · Services: [desktop](../services/desktop.md), [apps](../services/apps.md) · ADR: [ADR-022](../../adrs/022-desktop-folder.md) (desktop folder, shortcuts), [ADR-011](../../adrs/011-desktop-enhancements.md) (multi-select built, wallpaper and auto-arrange not)

| File | Role |
|------|------|
| `desktop.svelte` | The CSS grid, the wallpaper and the grid preset's dots, measurement, keyboard, rendering of selection, marquee, drag targets and resize preview |
| `desktop.handler.svelte.ts` | `DesktopHandler`: selection, marquee, widget resize and native drag and drop, exposed as `pointer_attachment()` and `drop_attachment()` like `window.handler.svelte.ts`. Takes a getter for the grid cells |
| `wallpaper.svelte` | The wallpaper layer, shared with the phone home |
| `desktop-item.svelte` | One icon: a draggable button showing selected, dimmed and drop-target states; reports clicks, menus and drag start/end up |
| `desktop-item-face.svelte` | Icon + label |

## Responsibilities

- Measure itself into `desktop.set_container()` (ResizeObserver) and render a CSS grid with `repeat(columns, minmax(64px, 1fr))` × `repeat(rows, …)`, with padding from `container.config.padding` (12px). Cells are at least 88px (`cell_size`), so the 64px floor never bites.
- Paint the surface: the [wallpaper](#wallpaper), and for the grid preset a dot at every cell corner (`.desktop-surface[data-dots]::before`: `foreground` at 14%, a 1px `radial-gradient` sized to `container.cell` and offset by the padding, so the dots sit on the cell corners). The cell size reaches CSS as `--cell-width` / `--cell-height` (88px until measured), the padding as `--grid-offset`.
- Flatten `desktop.list()` into `cells` (`{ item, x, y }`, reading order: rows top to bottom, cells left to right) and render each as a `DesktopItem` at `grid-column: x+1; grid-row: y+1`, keyed by entry name.
- Render nothing until the grid has at least 1×1.

It sits in `desktop-shell.svelte` under the [window manager](window-manager.md), in a wrapper with no padding, so the surface runs to the screen edge and behind the floating taskbar strip. The OS grid behind it is `bg-background-darkest` too.

## Wallpaper

`wallpaper.svelte` (ADR-011 revision) draws `settings.wallpaper`, or its `value` prop (Settings' previews). It's an `absolute inset-0 -z-10` layer on `bg-background-darkest`, so its parent is `isolate`: the layer stays above the parent's background and below the icons.

| Kind | Drawn as |
|------|----------|
| Preset `grid` | The glow; the desktop adds the dots (above). The phone home has no cells, so it shows the glow alone |
| Preset `glow` | A `background-dark` ellipse glowing from the top: shades of one surface, which the brand allows |
| Preset `tint` | The glow plus one `primary` ellipse (30%) fading in from the bottom right: one brand colour into the surface, never a blend of two |
| Preset `plain` | `background-darkest` only |
| Image | The file at `path` as an object URL (revoked on change), `background-size` cover / contain / auto (tile repeats, center doesn't), `filter: blur()` with the layer grown by twice the blur so the edges don't fade, then `background-darkest` at `dim` opacity on top. A missing file draws the glow |

The surface gets `data-wallpaper-image` while an image is set. An unlayered rule in `app.css` then gives every `[data-wallpaper-label]` (desktop and phone home labels) a `background/72` backing, so labels stay readable on any photo.

Set from Settings › Appearance › Wallpaper, or "Set as wallpaper" on an image file (desktop, File Explorer, Media Preview), which calls `set_wallpaper()` in `components/files/file-actions.ts` → `settings.set_wallpaper_image(path)` with an error toast.

## Desktop item

Each icon is an entry of `/home/Desktop` ([services/desktop.md](../services/desktop.md#model)). `DesktopItemFace` draws it:

Apps and files look different without a badge: an app shortcut sits in a 44px `rounded-xl` tile (`bg-background-light`, `shadow-raised`, hairline ring) with a 24px glyph; files and folders are a bare 40px glyph (`.bare-glyph` in `app.css`: a soft `background-darkest` drop shadow, and on a photo wallpaper a 1px `background` halo too):

| Kind | Glyph | Label |
|------|-------|-------|
| `shortcut` | `ShortcutIcon` (`components/files/shortcut-icon.svelte`) with `badge={false}`: the target app's icon, or a generic `AppWindow` glyph when the app isn't registered. File Explorer rows keep the arrow badge (the default) | `item.label` (file name without `.desktop`), plus " · missing" in `text-error` when the app isn't registered |
| `file` | `FileIcon` by MIME, then extension, duotone at `foreground/85` | File name |
| `directory` | `FileIcon` folder, `fill` in `primary` | Folder name |

- The label is up to two lines (`line-clamp-2`, `text-2xs`, `break-words`), with the full entry name as its `title`.
- It's a `<button>` filling its cell (`rounded-xl`, `draggable`, `data-desktop-name`, `aria-pressed` when selected). Hover tints the cell `foreground/6` and lifts the tile or glyph 2px (`group-hover:-translate-y-0.5`). Selected: `primary/14` with an inset `primary/40` ring. Drop target (a folder under a drag): `primary/18`, inset `primary/70` 2px ring. Dragged or cut: 40% opacity. Keyboard focus: `foreground/8` plus the global cottontail outline.

## Selection (ADR-011 revision)

[Brainstorm](../../brainstorm/2026-10-12_multi-select.md). Selection is the desktop's own state, held by `DesktopHandler`: a set of names and a range anchor (`$state.raw`), pruned to visible entries, never persisted. Click rules come from `$lib/core/utils/selection.ts` (`click_select`, tested): click selects one, Ctrl/Cmd+click toggles, Shift+click selects the range from the anchor in reading order, Ctrl+Shift adds it.

- **Marquee.** A primary-button drag on empty desktop (not on an icon) focuses the surface (`tabindex=-1`), clears the selection unless Ctrl/Cmd is held, captures the pointer and draws a `primary/12` rectangle with a `primary/60` hairline. Icons whose **cell** intersects it are selected, by cell math from `container.bounds` and `container.cell` (no DOM reads), once per animation frame; the selection is only replaced when its members change. Widget resize moves are coalesced the same way. `selectstart` is cancelled while it runs. `lostpointercapture` ends it, applying the last pending move first. A click on empty desktop is a zero-size marquee, so it clears the selection.
- **Acting on it.** An action on a selected icon applies to the whole selection; on an unselected icon (right-click, a key with it focused) it first selects just that icon. Rename, Properties and Save to disk need exactly one.

## Drag and drop (ADR-011 revision)

Native HTML drag and drop (`components/files/drag.ts`), shared with File Explorer.

| Phase | What happens |
|-------|--------------|
| `dragstart` on an icon | Selects it if it isn't selected. Sets the dragged paths (`/home/Desktop/{name}` for every selected icon) and remembers the group and the grabbed icon's cell. Dragged icons fade to 40%; the browser draws the ghost |
| `dragover` the surface | Accepted for a drag from here or one carrying WebOS paths. Over a folder icon that isn't being dragged, that folder highlights. Otherwise, for a drag from here, an outline (`foreground/6`, `foreground/20` inset ring) marks each icon's target: its offset from the grabbed icon, applied to the cell under the pointer |
| `drop` on a folder icon | `drop_paths(paths, /home/Desktop/{folder})`: moved into the folder, keeping both on a clash |
| `drop` elsewhere, drag from here | `desktop.move_items(...)`: the group keeps its shape, and taken or off-grid targets take the nearest free cell |
| `drop` of real files from the OS | `import_dropped(...)` into the folder under the pointer, or into `/home/Desktop` and then `move_items` to the drop cell. Drop effect `copy` |
| `drop` elsewhere, drag from Explorer | `drop_paths(paths, /home/Desktop)`, then `move_items` places the moved entries at the drop cell (and the nearest free ones) |
| `dragend` / leaving the surface | Clears the drag and the hover state |

A drop on another window or an Explorer list is that surface's to handle; dragging icons into an Explorer folder moves them off the desktop.

## User interactions

| Input | Result |
|-------|--------|
| Click icon | Select it (Ctrl/Cmd toggles, Shift ranges) |
| Double-click icon | `desktop.open(item, { anchor: pointer })`: shortcut and file → `apps.open` (a shortcut launches its target, or toasts "Broken shortcut" when the app is missing; the Open-with dropdown anchors at the pointer), folder → File Explorer there. Only that icon |
| Drag on empty desktop | Marquee selection |
| Drag icon(s) | Move the group to other cells, into a desktop folder, or out to an Explorer window |
| Ctrl/Cmd+A, Esc | Select all, clear |
| `Enter` (icon focused) | Open every target icon, anchored under the focused one; Alt+Enter → Properties (one) |
| `F2`, Ctrl/Cmd+C, Ctrl/Cmd+X, Delete / Cmd+Backspace | Rename (one), copy, cut, delete the targets (one confirm for many) |
| Ctrl/Cmd+V | Paste into `/home/Desktop` |
| Right-click icon, ContextMenu, Shift+F10 | The icon menu for the targets |
| Right-click empty desktop | The background menu |

Pinning happens from the [start menu](taskbar.md#start-menu) ("Pin to Desktop" → `desktop.pin(id)`). Anything else that writes into `/home/Desktop` through FilesService (File Explorer, an app) shows up on the desktop right away.

## Platform APIs

`ResizeObserver`, CSS grid with `grid-auto-flow: dense`, layered `radial-gradient` backgrounds, Pointer Events with pointer capture (marquee), native HTML drag and drop (`draggable`, `DataTransfer`).

## Known gaps

- No touch drag on the desktop: native drag and drop is pointer-only, and the desktop shell isn't used on phones and tablets anyway (ADR-016).
- No arrow-key selection.
- The drop outlines show where icons would go before nearest-free resolution, so a target on a taken cell shows the outline there even though the icon will land elsewhere.

## Context menus (ADR-025)

`desktop-actions.ts` holds the desktop's menus and questions. The desktop is the shell, so they're system dialogs:

| Where | Menu |
|-------|------|
| An icon (right-click, ContextMenu key, Shift+F10) | For one: Open; Cut (Ctrl+X); Copy (Ctrl+C); Rename (F2); Save to disk… (files, folders); Set as wallpaper (`image/*` files); Remove shortcut (shortcuts) or Delete (files, folders); Properties (Alt+Enter). For a selection of N: Open N items, Cut, Copy, Delete N items |
| Empty desktop | New folder (system prompt, validated against desktop names); Paste (Ctrl+V; conflicts ask in a system dialog); Sort by ▸ Name, Kind, Date modified (only when the desktop service has `move_items`, so not on the phone home; see below); Gather windows (Alt+Shift+G: every visible window moved fully on screen, `windows.gather()` in a view transition; disabled with no windows; only when the windows service has `gather`); Open Terminal here (a Terminal in `~/Desktop`, hint Alt+Shift+↵); Change wallpaper or theme (opens Settings) |

Delete (menu or the Delete key) asks first with a system confirm (`dismissible: false`): "Remove the “X” shortcut?" for shortcuts, "Delete “X”?" (recursive for folders) for real entries, "Delete N items?" once for a selection. `DesktopService.remove_item` now deletes any entry; the caller confirms. New: `create_folder(name)`, `names()`, and `rename_item(name, new_name)`, which moves the saved cell to the new name before renaming so the icon doesn't jump.

**Sort by** (`sort_items(by)` in `desktop-actions.ts`, ADR-011 revision) is one-shot: `DesktopHelper.sort_moves(items, by, rows, modified)` orders every entry and lays it out column by column from the top left, and `move_items` writes the layout once inside a view transition. Icons stay free to drag afterwards; new ones still take the first free cell.

- Name: the shown name (a shortcut's label), `Intl.Collator` with `numeric` and base sensitivity, so "notes 2" comes before "notes 10" and case is ignored.
- Kind: folders, app shortcuts, then files by extension, each by name.
- Date modified: folders first (OPFS folders have no modified time), then files and shortcuts newest first by `File.lastModified`, read with `files.get_file` only for this sort.

Cut icons are dimmed like a drag (`clipboard.is_cut`).
