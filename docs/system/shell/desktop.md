# Desktop

Source: `src/lib/core/components/desktop/` · Services: [desktop](../services/desktop.md), [apps](../services/apps.md) · ADR: [ADR-022](../../adrs/022-desktop-folder.md) (desktop folder, shortcuts), [ADR-011](../../adrs/011-desktop-enhancements.md) (accepted, not built)

| File | Role |
|------|------|
| `desktop.svelte` | The CSS grid, the surface (dot grid + glow, scoped `<style>`), measurement |
| `desktop-item.svelte` | One icon: open, delete, drag visuals |
| `desktop-item-face.svelte` | Icon + label, shared by the item and its drag ghost |
| `desktop-item.handle.svelte.ts` | `ItemHandler`: mouse-driven drag to another cell |

## Responsibilities

- Measure itself into `desktop.set_container()` (ResizeObserver) and render a CSS grid with `repeat(columns, minmax(64px, 1fr))` × `repeat(rows, …)`, with padding from `container.config.padding` (12px). Cells are at least 88px (`cell_size`), so the 64px floor never bites.
- Paint the surface (`.desktop-surface`): `background-darkest`, a dot at every cell corner (`foreground` at 14%, a 1px `radial-gradient` sized to `container.cell` and offset by the padding, so the dots sit on the cell corners), and a soft `background-dark` ellipse glowing from the top. Both gradients are shades of one surface, which the brand allows. The cell size reaches CSS as `--cell-width` / `--cell-height` (88px until measured), the padding as `--grid-offset`.
- Render each non-empty cell of `desktop.list()` as a `DesktopItem` at `grid-column: x+1; grid-row: y+1`. Rows are keyed by row index and items by column index, so a component is tied to its cell, not to its item.
- Render nothing until the grid has at least 1×1.

It sits in `os.svelte` under the [window manager](window-manager.md), in a wrapper with no padding, so the surface runs to the screen edge and behind the floating taskbar strip. The OS grid behind it is `bg-background-darkest` too. There's no wallpaper yet (ADR-011).

## Desktop item

Each icon is an entry of `/home/Desktop` ([services/desktop.md](../services/desktop.md#model)). `DesktopItemFace` draws it:

The icon sits in a 44px `rounded-xl` tile (`bg-background-light`, `shadow-raised`, hairline ring) with a 24px glyph:

| Kind | Glyph | Label |
|------|-------|-------|
| `shortcut` | `ShortcutIcon` (`components/files/shortcut-icon.svelte`): the target app's icon with an arrow badge in the bottom-right corner, or a generic `AppWindow` glyph when the app isn't registered | `item.label` (file name without `.desktop`), plus " · missing" in `text-error` when the app isn't registered |
| `file` | `FileIcon` by MIME, then extension (duotone) | File name |
| `directory` | `FileIcon` folder (duotone) | Folder name |

- The label is up to two lines (`line-clamp-2`, `text-2xs`, `break-words`), with the full entry name as its `title`.
- It's a `<button>` filling its cell (`rounded-xl`). Hover tints the cell `foreground/6` and lifts the tile 2px (`group-hover:-translate-y-0.5`). Focus is its only selection state: a `foreground/8` tint, plus the global cottontail `:focus-visible` outline for keyboard focus. There's no multi-select.

## Drag (`ItemHandler`)

It uses **mouse** events, not pointer events. CONVENTIONS calls this older code.

| Phase | What happens |
|-------|--------------|
| `mousedown` on the item | Records the pointer offset inside the icon. State becomes `start`. `mousemove`/`mouseup` go on `document`. |
| `mousemove` | Moves the fixed-position preview with the pointer. Below an 8px threshold (`DRAG_THRESHOLD`) nothing else happens. After that, the state becomes `move` and the target cell is `floor((client − container.bounds) / cell)`, clamped to the grid. |
| `mouseup` | If the state is `move` and the target cell is empty (`!is_blocked`), it calls `desktop.move_item(from, to)`. Then it clears the state. |

While moving, the original icon fades to 40%. A target-cell highlight (`foreground/6` fill, `foreground/20` inset ring) appears whenever the target isn't the current cell, `error/10` with an `error/50` ring if the cell is occupied. A ghost copy (`pointer-events-none`, `z-50`), one cell in size (`container.cell` in px), follows the cursor.

## User interactions

| Input | Result |
|-------|--------|
| Double-click icon | `desktop.open(item, { anchor: pointer })`: shortcut and file → `apps.open` (a shortcut launches its target, or toasts "Broken shortcut" when the app is missing; the Open-with dropdown anchors at the pointer), folder → File Explorer there. |
| `Enter` (keyup, icon focused) | Same as double-click, anchored at the icon's bottom-left corner. |
| Click icon | Focuses it, nothing else. |
| `Delete` (keyup, icon focused) | `desktop.remove_item()`: deletes a shortcut file with no confirm. Files and folders: nothing happens. Errors go to `console.error`. |
| Drag icon (> 8px) | Moves it to the cell under the cursor and saves the layout. Dropping on an occupied cell is refused. |
| `Space` | Nothing. There's no `onclick`. |
| Right-click | Browser default (no context menu, ADR-011). |

Pinning happens from the [start menu](taskbar.md#start-menu) ("Pin to Desktop" → `desktop.pin(id)`). Anything else that writes into `/home/Desktop` through FilesService (File Explorer, an app) shows up on the desktop right away.

## Platform APIs

`ResizeObserver`, CSS grid with `grid-auto-flow: dense`, layered `radial-gradient` backgrounds, document-level mouse listeners.

## Known gaps

- Mouse events only, so there's no touch drag (ADR-016) and no pointer capture. Dropping outside the window still ends the drag via the document `mouseup`.
- On the first move past the threshold, the target is the item's *current* cell rather than the cell under the pointer (`desktop-item.handle.svelte.ts:105-114`). It catches up on the next `mousemove`.
- `ItemHandler` captures `{x, y}` at construction. That's fine only because components are keyed by cell. Reusing a component across cells would break the move.
- No context menu, no multi-select, no way to delete a real file or folder from the desktop (see [services/desktop.md](../services/desktop.md#known-gaps)).
