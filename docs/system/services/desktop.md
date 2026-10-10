# DesktopService

Key `desktop` · Depends on: `apps` (declared, never used) · ADR: [ADR-011](../../adrs/011-desktop-enhancements.md) (accepted, not built) · Source: `src/lib/core/api/services/desktop/`

## Purpose

Holds the desktop icon grid: which app shortcut sits in which cell. It also holds the measured grid geometry that the shell needs to place and hit-test icons. Rendering and drag are in [shell/desktop.md](../shell/desktop.md).

| File | Contents |
|------|----------|
| `type.ts` | `DesktopService` interface, `DesktopGrid`, `DesktopGridItem` |
| `service.svelte.ts` | Implementation |
| `helper.ts` | `DesktopHelper`: free-cell search and re-layout on grid resize |

## Model

```ts
type DesktopGrid = Array<Array<DesktopGridItem | undefined>>; // grid[y][x], sparse
type DesktopGridItem = { app_id: AppId; props?: AppProps };  // `type`, not `interface` (convention says interface)
```

- Row-major and sparse. Rows can be missing, and cells can be `undefined` holes.
- An item is a shortcut to an app id, with optional launch props. Nothing ever sets `props` today.
- Ids aren't validated against the registry. Unknown ids render as "Unknown (id)".
- The initial grid is hard-coded to `[[settings, file-explorer]]`.

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `container` | `readonly { bounds, cell, grid: { columns, rows }, config: { cell_size, padding }, element }` | `$state.raw`. `bounds` is the element's viewport rect minus `padding` on every side. `cell` is the actual cell size (`bounds / columns`), so it's ≥ `cell_size`. `grid` is the column and row count. |
| `set_container` | `(element?, options?: { cell_size?, padding? }) => void` | Measures the element. `columns = floor(width / cell_size)`, same for rows. Defaults are `cell_size 64`, `padding 4`. If the column or row count changed, it re-lays the grid (below). A falsy element resets to the viewport size with a 0×0 grid. |
| `add_item` | `(app_id) => Position \| null` | First free cell, row-major (`calculate_item_position`). Returns `null` with a `console.warn` when the grid is full or not measured yet (0×0). No dedupe: the same app can be pinned many times. |
| `remove_item` | `(position) => void` | Writes `undefined` into the cell. |
| `move_item` | `(from, to) => Position` | No-op when `from` equals `to`. **Overwrites** whatever is at `to`; the shell is what prevents dropping onto an occupied cell. |
| `has_item_in_position` | `(position) => boolean` | |
| `list` | `() => DesktopGrid` | The live `$state` grid. |
| `name`, `description`, `to_string()` | IService | `to_string()` says "`N` items" but `N` is the row count (`grid.length`). |

## State

- `grid`: deep `$state`, mutated in place by `set_item`.
- `container`: `$state.raw`, replaced wholesale.

## Lifecycle

No `init()` or `destroy()`. The constructor reads `window.innerWidth/innerHeight` for the initial container.

## Persistence

None (`// TODO: persist` at the top of `service.svelte.ts`). Pins and positions reset on reload.

## Behaviour & invariants

**Placement.** `calculate_item_position` scans row by row, left to right, and takes the first `undefined` cell. A missing or empty row yields `{ x: 0, y }`. ADR-011's auto-arrange says column by column, but that isn't built.

**Re-layout on grid resize** (`recalculate_grid_positions`, which runs only when `columns` or `rows` change):

1. Walk the old grid in order. An item whose cell is still in range and free keeps its cell.
2. Out-of-range items, and in-range items whose cell an earlier spill already took, go to the first free cell, row-major.
3. **If there's no free cell, the item is silently dropped.** `add_from_start` returns without placing it. Shrink the window enough and pins are gone for good, since nothing is persisted.

Original positions aren't remembered. Growing the grid again doesn't move spilled items back (`// TODO: … persist original position for restore`). `add_from_start` also logs every spilled item to the console.

**Coordinates.** `container.bounds` is viewport space. The shell's drag handler subtracts `bounds.x/y` from `clientX/Y` and divides by `cell` to get a grid cell, so the two stay consistent as long as the element doesn't move without resizing. Moves without a resize aren't observed (ResizeObserver only reports size).

## Divergence from ADR

ADR-011 is *Accepted* and none of it is built: multi-selection, wallpapers, context menu, auto-arrange, icon settings. The dependency on `apps` is declared in `kernel/init.ts`, but the service never resolves it.

## Known gaps

- Not persisted.
- Items get dropped when the grid shrinks below the item count.
- `add_item` doesn't dedupe and fails silently, with only a `console.warn` and no notification.
- `move_item` overwrites the target. The service doesn't enforce the "one item per cell" invariant itself.
- `DesktopGridItem` is a `type` object shape, against CONVENTIONS. A 0-column grid would make `cell` `Infinity`/`NaN`; the shell guards against rendering that.
