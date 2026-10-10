# DesktopService

Key `desktop` · Depends on: `apps` (declared, never used) · ADR: [ADR-011](../../adrs/011-desktop-enhancements.md) (accepted, not built) · Source: `src/lib/core/api/services/desktop/` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

Holds the desktop icon grid: which app shortcut sits in which cell. It also holds the measured grid geometry that the shell needs to place and hit-test icons. Rendering and drag are in [shell/desktop.md](../shell/desktop.md).

| File | Contents |
|------|----------|
| `type.ts` | `DesktopService` interface, `DesktopGrid`, `DesktopGridItem` |
| `service.svelte.ts` | Implementation |
| `helper.ts` | `DesktopHelper`: free-cell search and `fit()`, which maps the layout onto the current grid size |

## Model

```ts
type DesktopGrid = Array<Array<DesktopGridItem | undefined>>; // grid[y][x], sparse
type DesktopGridItem = { app_id: AppId; props?: AppProps };  // `type`, not `interface` (convention says interface)
```

- Row-major and sparse. Rows can be missing, and cells can be `undefined` holes.
- An item is a shortcut to an app id, with optional launch props. Nothing ever sets `props` today.
- Ids aren't validated against the registry. Unknown ids render as "Unknown (id)".
- Two grids exist. `layout` is the user's arrangement and is never trimmed. `grid` is what's shown at the current size, derived from `layout` (see [Fitting](#behaviour--invariants)).
- The initial layout is hard-coded to `[[settings, file-explorer]]`.

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `container` | `readonly { bounds, cell, grid: { columns, rows }, config: { cell_size, padding }, element }` | `$state.raw`. `bounds` is the element's viewport rect minus `padding` on every side. `cell` is the actual cell size (`bounds / columns`), so it's ≥ `cell_size`. `grid` is the column and row count. |
| `set_container` | `(element?, options?: { cell_size?, padding? }) => void` | Measures the element. `columns = floor(width / cell_size)`, same for rows. Defaults are `cell_size 64`, `padding 4`. A new size re-derives `grid` (below); `layout` isn't touched. A falsy element resets to the viewport size with a 0×0 grid. |
| `add_item` | `(app_id) => Position \| null` | First free cell of the visible `grid`, row-major (`calculate_item_position`), written into `layout` at that cell. Returns `null` with a `console.warn` when the grid is full or not measured yet (0×0). No dedupe: the same app can be pinned many times. |
| `remove_item` | `(position) => void` | Looks up the item shown at `position` and clears it from wherever `layout` holds it. No-op for an empty cell. |
| `move_item` | `(from, to) => Position` | No-op (returns `from`) when `from` equals `to` or `from` shows nothing. Otherwise clears the item from its `layout` cell and writes it at `to`, so a relocated item gets `to` as its real cell. **Overwrites** whatever `layout` holds at `to`; the shell is what prevents dropping onto an occupied cell. |
| `has_item_in_position` | `(position) => boolean` | |
| `list` | `() => DesktopGrid` | The derived visible `grid`. Read-only in practice: writing into it doesn't reach `layout`. |
| `name`, `description`, `to_string()` | IService | `to_string()` says "`N` items", counting the visible grid (hidden items aren't counted). |

## State

- `layout`: deep `$state`, mutated in place by the private `place()` and `take_from_layout()`.
- `grid`: `$derived(DesktopHelper.fit(container.grid, layout))`.
- `container`: `$state.raw`, replaced wholesale.

## Lifecycle

No `init()` or `destroy()`. The constructor reads `window.innerWidth/innerHeight` for the initial container.

## Persistence

None (`// TODO: persist` at the top of `service.svelte.ts`). Pins and positions reset on reload.

## Behaviour & invariants

**Placement.** `calculate_item_position` scans row by row, left to right, and takes the first `undefined` cell. A missing or empty row yields `{ x: 0, y }`. ADR-011's auto-arrange says column by column, but that isn't built.

**Fitting** (`DesktopHelper.fit(dimensions, layout)`, re-run whenever the size or the layout changes):

1. Every `layout` item whose cell is inside `columns × rows` is shown at that cell.
2. The rest (out of range), in row-major `layout` order, take the first free cells, row-major.
3. Items left when no free cell remains are **hidden**, not dropped. They stay in `layout`.

Because `layout` is never trimmed, growing the window puts relocated and hidden items back in their own cells. Moving a relocated item writes its new cell into `layout`, so the move sticks. Removing one clears its `layout` cell, not the cell it was shown in.

Writes go through the state proxy (`if (!layout[y]) layout[y] = []`, not `??=`): `??=` returns the raw array, and writes to it aren't tracked.

**Coordinates.** `container.bounds` is viewport space. The shell's drag handler subtracts `bounds.x/y` from `clientX/Y` and divides by `cell` to get a grid cell, so the two stay consistent as long as the element doesn't move without resizing. Moves without a resize aren't observed (ResizeObserver only reports size).

## Divergence from ADR

ADR-011 is *Accepted* and none of it is built: multi-selection, wallpapers, context menu, auto-arrange, icon settings. The dependency on `apps` is declared in `kernel/init.ts`, but the service never resolves it.

## Known gaps

- Not persisted.
- Hidden items (more pins than cells) can't be seen, launched or removed until the grid grows. Nothing tells the user they exist.
- `add_item` doesn't dedupe and fails silently, with only a `console.warn` and no notification.
- `move_item` overwrites the target. The service doesn't enforce the "one item per cell" invariant itself.
- `DesktopGridItem` is a `type` object shape, against CONVENTIONS. A 0-column grid would make `cell` `Infinity`/`NaN`; the shell guards against rendering that.
