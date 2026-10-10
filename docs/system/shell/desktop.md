# Desktop

Source: `src/lib/core/components/desktop/` · Services: [desktop](../services/desktop.md), [apps](../services/apps.md) · ADR: [ADR-011](../../adrs/011-desktop-enhancements.md) (accepted, not built)

| File | Role |
|------|------|
| `desktop.svelte` | The CSS grid, the dot background, measurement |
| `desktop-item.svelte` | One icon: launch, delete, drag visuals |
| `desktop-item.handle.svelte.ts` | `ItemHandler`: mouse-driven drag to another cell |

## Responsibilities

- Measure itself into `desktop.set_container()` (ResizeObserver) and render a CSS grid with `repeat(columns, minmax(64px, 1fr))` × `repeat(rows, …)`, with padding from `container.config.padding`.
- Draw the cell dots: a `radial-gradient` of `var(--foreground)` sized to `container.cell`.
- Render each non-empty cell of `desktop.list()` as a `DesktopItem` at `grid-column: x+1; grid-row: y+1`. Rows are keyed by row index and items by column index, so a component is tied to its cell, not to its item.
- Render nothing until the grid has at least 1×1.

It sits in `os.svelte` under the [window manager](window-manager.md), inside a `p-4` wrapper. The `bg-background-dark` fill is the desktop background. There's no wallpaper yet (ADR-011).

## Desktop item

- Shows the manifest icon and name from `apps.get(item.app_id)`, or "Unknown (app_id)" when the app isn't registered.
- It's a `<button>`, so focus is its only selection state: an `accent` outline and tint on `:focus`. There's no multi-select.

## Drag (`ItemHandler`)

It uses **mouse** events, not pointer events. CONVENTIONS calls this older code.

| Phase | What happens |
|-------|--------------|
| `mousedown` on the item | Records the pointer offset inside the icon. State becomes `start`. `mousemove`/`mouseup` go on `document`. |
| `mousemove` | Moves the fixed-position preview with the pointer. Below an 8px threshold (`DRAG_THRESHOLD`) nothing else happens. After that, the state becomes `move` and the target cell is `floor((client − container.bounds) / cell)`, clamped to the grid. |
| `mouseup` | If the state is `move` and the target cell is empty (`!is_blocked`), it calls `desktop.move_item(from, to)`. Then it clears the state. |

While moving, the original icon fades to 50%. A target-cell highlight appears whenever the target isn't the current cell, in `error` tint if the cell is occupied. A ghost copy, one cell in size (`container.cell` in px), follows the cursor.

## User interactions

| Input | Result |
|-------|--------|
| Double-click icon | `apps.launch(app_id, item.props)`. Unknown apps do nothing. |
| Click icon | Focuses it, nothing else. |
| `Delete` (keyup, icon focused) | `desktop.remove_item()`. It unpins with no confirm. |
| Drag icon (> 8px) | Moves it to the cell under the cursor. Dropping on an occupied cell is refused. |
| `Enter` / `Space` | Nothing. There's no `onclick`, so **there's no keyboard way to launch**. |
| Right-click | Browser default (no context menu, ADR-011). |

Pinning happens from the [start menu](taskbar.md#start-menu) ("Pin to Desktop").

## Platform APIs

`ResizeObserver`, CSS grid with `grid-auto-flow: dense`, document-level mouse listeners.

## Known gaps

- Mouse events only, so there's no touch drag (ADR-016) and no pointer capture. Dropping outside the window still ends the drag via the document `mouseup`.
- On the first move past the threshold, the target is the item's *current* cell rather than the cell under the pointer (`desktop-item.handle.svelte.ts:105-114`). It catches up on the next `mousemove`.
- `ItemHandler` captures `{x, y}` at construction. That's fine only because components are keyed by cell. Reusing a component across cells would break the move.
- No keyboard launch, no context menu, no multi-select, no persistence (see [services/desktop.md](../services/desktop.md)).
