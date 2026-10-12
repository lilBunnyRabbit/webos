# DesktopService

Key `desktop` · Depends on: `files`, `apps` · ADR: [ADR-022](../../adrs/022-desktop-folder.md) (desktop folder, shortcuts; implemented, see its revision note), [ADR-011](../../adrs/011-desktop-enhancements.md) (accepted, not built; only the `fit()` revision is) · Source: `src/lib/core/api/services/desktop/` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

The desktop is the folder `/home/Desktop`. Every visible entry in it is an icon. The service lists the folder, turns entries into grid items, places them using saved positions from `/var/lib/desktop/layout.json`, and fits them to the measured grid. It also opens, pins, moves and removes items. Rendering and drag are in [shell/desktop.md](../shell/desktop.md).

| File | Contents |
|------|----------|
| `type.ts` | `DesktopService` (base), `GridDesktopService`, `MobileDesktopService` interfaces, `DesktopGrid`, `DesktopItem` |
| `folder.svelte.ts` | `DesktopFolder`: the folder state and operations both layouts share, `DEFAULT_SHORTCUTS`, `write_var_lib()` |
| `service.svelte.ts` | Desktop implementation (`GridDesktopService`) |
| `helper.ts` | `DesktopHelper.arrange()` and `DesktopHelper.fit()`, both pure |
| `layout.ts` | `LAYOUT_DIRECTORY` (`/var/lib/desktop`), `LAYOUT_FILE` (`layout.json`), `LAYOUT_PATH`, `parse_layout()`, `serialize_layout()`, `Positions` |

Shortcut files themselves (`.desktop`) are an apps concept: `services/apps/shortcut.ts`, see [apps.md](apps.md#shortcuts-desktop-files).

## Interfaces

Same split as [windows](windows.md#public-api) (ADR-016, owner 2026-10-12, [brainstorm](../../brainstorm/2026-10-12_mobile-shell.md)):

- **`DesktopService`**, the platform-neutral base. Items are addressed by **entry name**: `items()`, `names()`, `remove_item(name)`, `rename_item(name, new_name)`, `create_folder`, `pin`, `open`. Shared callers type against it: the start menu (`pin`) and `desktop-actions.ts` (rename, delete, properties, menus).
- **`GridDesktopService`** adds the desktop shell's grid: `container`, `set_container`, `list()`, `has_item_in_position`, `move_item(from, to)`. The desktop shell (`desktop.svelte`, `desktop-item.svelte`, the drag handle) and this inspector use it.
- **`MobileDesktopService`**: the mobile home. Not built yet.

Both implementations own a `DesktopFolder` (composition, not a base class). It holds `entries`, the revision watch, reload, seeding trigger, and the file operations. The owner passes `read_layout`, `seed` and `loaded` callbacks, so each layout file stays with its service.

## Model

```ts
type DesktopGrid = Array<Array<DesktopItem | undefined>>; // grid[y][x], sparse

type DesktopItem =
  | { kind: "shortcut"; name: string; label: string; app_id: AppId; props?: AppProps }
  | { kind: "file"; name: string; type: string }
  | { kind: "directory"; name: string };

type Positions = Record<string, Position>; // entry name → saved cell
```

| Folder entry | Item |
|--------------|------|
| Name starts with `.` | Hidden, not an item |
| Folder | `directory` |
| File whose `file_extension()` is `.desktop` and whose body parses as a shortcut | `shortcut`: `label` is the name without `.desktop`, plus `app_id` and `props` from the file |
| `.desktop` file that doesn't parse | `file` (shown with a file icon) |
| Any other file | `file`, `type` = the browser's MIME for it (`""` when unknown) |

- `name` is the entry's file name and the key for everything: positions, removal, identity.
- `app_id` isn't checked against the registry when listing. An unknown app shows "(missing app)" on the icon.
- Entries come in `files.list()` order (folders first, then natural name order).

Three layers of state turn the folder into a grid:

| Layer | What |
|-------|------|
| `entries` + `positions` | Raw: what's in the folder and the saved cells |
| `arranged` | `DesktopHelper.arrange(entries, positions)` → `{ layout, unplaced }` |
| `grid` | `DesktopHelper.fit(container.grid, layout, unplaced)`, what's shown |

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `container` | `readonly { bounds, cell, grid: { columns, rows }, config: { cell_size, padding }, element }` | `$state.raw`. `bounds` is the element's viewport rect minus `padding` on every side. `cell` is the actual cell size (`bounds / columns`), so it's ≥ `cell_size`. `grid` is the column and row count. |
| `set_container` | `(element?, options?: { cell_size?, padding? }) => void` | Measures the element. `columns = floor(width / cell_size)`, same for rows. Defaults are `cell_size 88`, `padding 12` (`DEFAULT_CONFIG`; the shell passes no options). A new size re-derives `grid`. A falsy element resets to the viewport size with a 0×0 grid. |
| `list` | `() => DesktopGrid` | The derived visible `grid`. |
| `has_item_in_position` | `(position) => boolean` | Against the visible grid |
| `items` | `() => DesktopItem[]` | Folder entries in folder order |
| `move_item` | `(from, to) => Position` | No-op (returns `from`) when `from` equals `to` or `from` shows nothing. Otherwise rewrites `positions` (below), saves the layout file without awaiting, returns `to`. Doesn't check `to`; the shell refuses occupied cells. |
| `remove_item` | `(name) => Promise<void>` | Deletes the entry from `/home/Desktop` (folders recursively); an unknown name does nothing. The caller confirms first (`desktop-actions.ts`, ADR-025). The deletion bumps the folder's revision, which reloads the desktop. |
| `rename_item` | `(name, new_name) => Promise<void>` | Saves the cell (if it has one) under the new name first, then `files.rename_entry`, so the icon keeps its cell. Throws if the name is taken |
| `create_folder` | `(name) => Promise<void>` | Creates a folder in `/home/Desktop` |
| `names` | `() => string[]` | Entry names on the desktop, for name validation |
| `pin` | `(app_id, props?) => Promise<string \| null>` | Writes `{manifest.name}.desktop` (`{ app_id, props }`) into `/home/Desktop`, auto-renamed on a clash (`Settings (1).desktop`). Returns the file name, or `null` for an unknown app id. No position is saved: the icon takes the first free cell. |
| `open` | `(item, options?: OpenOptions) => void` | `shortcut` and `file` → `apps.open("/home/Desktop/{name}", options)`, so a shortcut re-reads its file and a missing target app gets the "Broken shortcut" toast, as in File Explorer; a rejection goes to `console.error`. `directory` → `apps.launch("file-explorer", { path: "/home/Desktop/{name}" })`. |
| `init` / `destroy` | IService | See Lifecycle |
| `name`, `description`, `to_string()` | IService | `to_string()` says "`N` items", counting `entries` (hidden-by-size items included, dotfiles not). |

## State

- `folder.entries`: `$state<DesktopItem[]>` on the `DesktopFolder`, replaced wholesale by its `reload()`.
- `positions`: `$state<Positions>`, replaced by the folder's `loaded` callback and `move_item()`.
- `arranged`, `grid`: `$derived`, as in the Model table.
- `container`: `$state.raw`, replaced wholesale.
- `files_service`, `apps_service`: `$derived(kernel.service(...))` set in the constructor.
- `reload_id`, `dispose_watch`: plain fields on the `DesktopFolder`.

## Lifecycle

`init()` and `destroy()` forward to the `DesktopFolder`. Its `init()`, async:

1. `await reload()`.
2. Start an `$effect.root` with one effect that reads `files.revision("/home/Desktop")`. Its first run only subscribes (`init()` already loaded). Every later change calls `reload()`; a rejection goes to `console.error`.

`destroy()` disposes the effect root.

`reload()`:

1. Take `id = ++reload_id`.
2. `files.get_directory("/home/Desktop")`. Missing → throws `/home/Desktop is missing` (FilesService recreates it at boot, so this means it was deleted this session).
3. List it, and read the owner's layout through `read_layout()` (here `/var/lib/desktop/layout.json`; `null` when missing).
4. **Seed** (the owner's `seed()`) when there's no layout file and no visible entry, then `return this.reload()` to read what was written (see Behaviour). The seeded layout file stops it from seeding twice.
5. Build `entries`. Each `.desktop` file is read and parsed here, so listing costs one read per shortcut (and opening one reads it again in `apps.open`).
6. If `reload_id` moved on meanwhile, drop the result. Otherwise assign `entries` and call `loaded(layout)`, where this service runs `parse_layout()` (or `{}`) into `positions` in the same tick.

A failure in step 2 or 3 during `init()` rejects it and fails the boot ([kernel.md](../kernel.md#failed-init)).

## Persistence

| | |
|-|-|
| Icons | The entries of `/home/Desktop` themselves (OPFS). Shortcuts are `.desktop` JSON files: `{ "app_id": "settings" }`, optionally `"props"`, pretty-printed |
| Positions | `/var/lib/desktop/layout.json`: `{ "version": 1, "positions": { "Settings.desktop": { "x": 0, "y": 0 } } }`, pretty-printed |
| Version | `LAYOUT_VERSION = 1` (private to `layout.ts`) |
| Load | zod: `version` literal `1`, `positions` a record of `{ x, y }` non-negative integers. Wrong version, bad shape or bad JSON → `{}` (every icon takes a free cell), no error logged |
| Written | Seeding, and every `move_item()`. `/var/lib/desktop` is created on first write (`files.create_directory` under `/var/lib`, which `ensure_hierarchy` guarantees). Write errors: `console.error("[DesktopService] Failed to save the layout")` |

Positions are keyed by entry name, so renaming an entry in File Explorer loses its position.

## Behaviour & invariants

**Seeding.** An empty folder (dotfiles don't count) with no layout file is treated as never set up. `seed()` first takes the v0 React pins (`take_v0_pins()` in `layout.ts`: localStorage `desktop`, read and removed) and writes one shortcut per pin at its v0 grid cell. Without v0 pins it writes one shortcut per `DEFAULT_SHORTCUTS` (`settings`, `file-explorer`) at `{ x: i, y: 0 }`. Shortcuts are named after the manifest (`Settings.desktop`, `File Explorer.desktop`); then it saves the layout. Unknown ids are skipped. A user who empties the desktop keeps an empty desktop, because the layout file still exists. Deleting the layout file too, or `files.clear()`, seeds again.

**Arrange** (`DesktopHelper.arrange(entries, positions)`): in entry order, each entry with a saved position takes that cell if it's still free. Entries with no position, or whose cell an earlier entry already took, go to `unplaced`. `layout` may contain cells outside the current grid.

**Fit** (`DesktopHelper.fit(dimensions, layout, unplaced)`, re-run whenever the size, entries or positions change):

1. Every `layout` item inside `columns × rows` is shown at its cell.
2. Out-of-range `layout` items (row-major), then `unplaced` (entry order), take the first free cells, row-major.
3. Whatever is left when no free cell remains is **hidden**, not dropped.

Unplaced items are never written back. Their cell is recomputed on every fit, so a new or removed entry, or a resize, can shift them.

**Move** (`move_item(from, to)`) builds a fresh `positions`:

1. Start from the current `positions`, minus names no longer in `entries` (stale names are pruned here and only here).
2. Pin every item **visible** in `grid` to the cell it's shown in. Relocated and unplaced icons become real positions, so they don't jump when this cell changes hands.
3. Set the moved item to `to`.
4. Assign `positions` (the grid updates at once), then write the file in the background.

Hidden items keep whatever position they had. If `to` is somehow occupied, both names point at one cell and `arrange()` gives it to the first in entry order; the other becomes unplaced.

**Refresh.** Any mutation of `/home/Desktop` made through FilesService in this tab (File Explorer, `pin()`, `remove_item()`, an app saving there) bumps its revision and reloads the desktop. Writing `layout.json` bumps `/var/lib/desktop`, which nothing watches, so a move doesn't reload. Overlapping reloads resolve to the newest (`reload_id`).

**Coordinates.** `container.bounds` is viewport space. The shell's drag handler subtracts `bounds.x/y` from `clientX/Y` and divides by `cell` to get a grid cell, so the two stay consistent as long as the element doesn't move without resizing. Moves without a resize aren't observed (ResizeObserver only reports size).

## Divergence from ADR

ADR-022's body puts positions in `/home/Desktop/.layout.json` and writes back the cell of every unplaced entry. The code uses `/var/lib/desktop/layout.json` and saves only on move; the ADR's 2026-10-11 revision note records both, plus the seed condition, broken-shortcut handling, `ShortcutIcon`, File Explorer's `{ path }` and Enter to open. ADR-022 says seeding happens when "the folder was just created"; the code's test is "empty and no layout file".

ADR-011 is still *Accepted* and unbuilt: multi-selection, wallpapers, context menu, auto-arrange, icon settings.

## Known gaps

- Hidden items (more entries than cells) can't be seen, opened or removed until the grid grows. Nothing tells the user they exist.
- Unplaced icons aren't stable: adding a file that sorts earlier shifts every unplaced icon after it.
- `pin()` doesn't dedupe. The start menu ignores its `null` and its errors beyond `console.error`.
- A move saved while a reload is reading `layout.json` can be overwritten in memory by the older file contents.
- Deleting a file or folder from the desktop silently does nothing.
- Changes from other tabs, or OPFS writes that bypass FilesService, show up only after a reload.
- Until `/home/Desktop` has been bumped once this session, `revision()` returns `0` for a missing `SvelteMap` key, which tracks the map's version. Any revision bump anywhere (a settings save to `/etc`, a File Explorer upload) then re-runs the watcher and reloads the desktop. Harmless but wasteful.
- If `/home/Desktop` itself is deleted, nothing reloads (the bump is on `/home`), and the next reload throws `/home/Desktop is missing` to `console.error`; the desktop keeps the old icons until the next boot recreates the folder.
- A 0-column grid would make `cell` `Infinity`/`NaN`; the shell guards against rendering that.
