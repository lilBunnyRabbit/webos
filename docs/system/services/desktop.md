# DesktopService

Key `desktop` · Depends on: `files`, `apps` · ADR: [ADR-022](../../adrs/022-desktop-folder.md) (desktop folder, shortcuts; implemented, see its revision note), [ADR-011](../../adrs/011-desktop-enhancements.md) (`fit()`, multi-select moves, Sort by; icon settings not built), [ADR-034](../../adrs/034-app-extension-points.md) (widgets) · Source: `src/lib/core/api/services/desktop/` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

The desktop is the folder `/home/Desktop`. Every visible entry in it is an icon. The service lists the folder, turns entries into grid items, places them using saved positions from `/var/lib/desktop/layout.json`, and fits them to the measured grid. It also opens, pins, moves and removes items. Rendering and drag are in [shell/desktop.md](../shell/desktop.md).

| File | Contents |
|------|----------|
| `type.ts` | `DesktopService` (base), `GridDesktopService`, `MobileDesktopService` interfaces, `DesktopGrid`, `DesktopItem` |
| `folder.svelte.ts` | `DesktopFolder`: the folder state and operations both layouts share, `DEFAULT_SHORTCUTS`, `write_var_lib()` |
| `service.svelte.ts` | Desktop implementation (`GridDesktopService`) |
| `mobile.svelte.ts` | Mobile home implementation (`MobileDesktopService`), see [Mobile home](#mobile-home) |
| `helper.ts` | `DesktopHelper.arrange()`, `fit()`, `resolve_moves()`, `resize_target()` and `sort_moves()`, all pure; `snap_cells()`, `item_span()`, `grid_items()`, `ResizeTarget`, `DesktopMove`, `DesktopSort`. `index.ts` exports `DesktopHelper` and `DesktopSort` for the desktop's Sort by |
| `layout.ts` | `LAYOUT_DIRECTORY_NAME` (`desktop`), `LAYOUT_DIRECTORY` (`/var/lib/desktop`), `LAYOUT_FILE` (`layout.json`), `LAYOUT_PATH`, `parse_layout()`, `serialize_layout()`, `Positions`, `take_v0_pins()` |
| `additions.ts` | Default widgets: `default_widgets()`, `pending_widgets()`, `ADDITIONS_FILE` (`additions.json`), `ADDITIONS_PATH`, `parse_additions()`, `serialize_additions()` |
| `home-layout.ts` | Mobile home model: `HOME_LAYOUT_FILE` (`home-layout.json`), `HOME_LAYOUT_PATH`, `HomeLayout`, `parse_home_layout()` (with the dock migration), `serialize_home_layout()`, `arrange_home()` |
| `inspector.svelte`, `mobile-inspector.svelte` | Kernel app inspectors for each implementation |

Shortcut files themselves (`.desktop`) are an apps concept: `services/apps/shortcut.ts`, see [apps.md](apps.md#shortcuts-desktop-files).

## Interfaces

Same split as [windows](windows.md#public-api) (ADR-016, owner 2026-10-12, [brainstorm](../../brainstorm/2026-10-12_mobile-shell.md)):

- **`DesktopService`**, the platform-neutral base. Items are addressed by **entry name**: `items()`, `names()`, `remove_item(name)`, `rename_item(name, new_name)`, `create_folder`, `pin`, `pin_widget`, `set_widget_style`, `open`. Shared callers type against it: the start menu (`pin`) and `desktop-actions.ts` (rename, delete, properties, menus).
- **`GridDesktopService`** adds the desktop shell's grid: `container`, `set_container`, `list()`, `has_item_in_position`, `move_items(moves)`, `resize_target`, `resize_widget`. The desktop shell (`desktop.svelte`) and this inspector use it.
- **`MobileDesktopService`**: the mobile home: one ordered list. See [Mobile home](#mobile-home).

Both implementations own a `DesktopFolder` (composition, not a base class). It holds `entries`, the revision watch, reload, seeding trigger, and the file operations. The owner passes `read_layout`, `seed` and `loaded` callbacks, so each layout file stays with its service.

## Model

```ts
type DesktopGrid = Array<Array<DesktopItem | undefined>>; // grid[y][x], sparse; a widget sits in every cell it covers

type DesktopItem =
  | { kind: "shortcut"; name: string; label: string; app_id: AppId; props?: AppProps }
  | { kind: "widget"; name: string; label: string; app_id: AppId; props?: AppProps; size: { w: number; h: number }; style: WidgetStyle }
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
| `.widget` file that parses (`{ app, props?, w, h, style? }`, spans 1–8, `apps/widget.ts`) | `widget` (ADR-034): `label` is the name without `.widget`, `size` is `{ w, h }` in cells, clamped into the app's `widget_size` (the file keeps its value until the user resizes); `style` is `card`, `glass` or `clear`, `card` when the file has none or an unknown value (the rest of the file still parses) |
| `.widget` file that doesn't parse | `file` |
| Any other file | `file`, `type` = the browser's MIME for it (`""` when unknown) |

- `name` is the entry's file name and the key for everything: positions, removal, identity.
- `app_id` isn't checked against the registry when listing. An unknown app shows "(missing app)" on the icon.
- Entries come in `files.list()` order (folders first, then natural name order).

Three layers of state turn the folder into a grid:

| Layer | What |
|-------|------|
| `entries` + `positions` | Raw: what's in the folder and the saved cells (`positions` is `$state.raw`, only ever replaced) |
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
| `resize_target` | `(name, size) => ResizeTarget \| null` | `{ size, valid }` for resizing the widget `name` to `size`, from `DesktopHelper.resize_target` against the visible grid. `null` when `name` isn't a widget on the grid or its app has no `widget_size` |
| `resize_widget` | `(name, size) => Promise<boolean>` | Resolves `false` when the target isn't valid. Otherwise pins every visible item to its shown cell (as a move does, so an unplaced widget grows from where it is), sets the entry's size in memory at once and rewrites `w`/`h` in its `.widget` file (`DesktopFolder.write_widget_size`, queued so quick resizes land in order; app and props kept, a file that no longer parses is left alone) |
| `move_items` | `(moves: { name, to }[]) => void` | Resolves targets with `DesktopHelper.resolve_moves` (a taken or off-grid target becomes the nearest free cell; earlier moves claim first; an item with nowhere to go is left out), rewrites `positions` (below) and saves the layout once, without awaiting. Nothing resolved: no-op. Names not yet in the grid (just moved into `/home/Desktop`) get a position that applies when they load |
| `remove_item` | `(name) => Promise<void>` | Deletes the entry from `/home/Desktop` (folders recursively); an unknown name does nothing. The caller confirms first (`desktop-actions.ts`, ADR-025). The deletion bumps the folder's revision, which reloads the desktop. |
| `rename_item` | `(name, new_name) => Promise<void>` | Saves the cell (if it has one) under the new name first, then `files.rename_entry`, so the icon keeps its cell. Throws if the name is taken |
| `create_folder` | `(name) => Promise<void>` | Creates a folder in `/home/Desktop` |
| `names` | `() => string[]` | Entry names on the desktop, for name validation |
| `pin` | `(app_id, props?) => Promise<string \| null>` | Writes `{manifest.name}.desktop` (`{ app_id, props }`) into `/home/Desktop`, auto-renamed on a clash (`Settings (1).desktop`). Returns the file name, or `null` for an unknown app id. No position is saved: the icon takes the first free cell. |
| `pin_widget` | `(app_id, { label, props?, size? }) => Promise<string \| null>` | Writes `{label}.widget` into `/home/Desktop` (`/ \ :` in the label become spaces), auto-renamed on a clash. `size` defaults to the manifest's `widget_size.default` (2×2 without one) and is clamped into its range (`initial_widget_size`). `null` when the app has no `widget`. No position is saved: it takes the first place it fits. The entry is in `items()` as soon as the promise resolves, before the reload the write triggers, so a caller checking for an existing widget right after (pinning twice from the shell) sees it. Same on mobile, where it lands at the end of the home |
| `set_widget_style` | `(name, style: WidgetStyle) => Promise<boolean>` | Sets the entry's style in memory at once and writes `style` into its `.widget` file (`DesktopFolder.write_widget_style`, on the same queue as size writes; everything else in the file kept). `false` when `name` isn't a widget. Same on mobile, and both platforms read the same file (ADR-034 revision 2026-10-21) |
| `open` | `(item, options?: OpenOptions) => void` | `shortcut`, `widget` and `file` → `apps.open("/home/Desktop/{name}", options)`, so a shortcut re-reads its file and a missing target app gets the "Broken shortcut" (or "Broken widget") toast, as in File Explorer; a rejection goes to `console.error`. `directory` → `apps.launch("file-explorer", { path: "/home/Desktop/{name}" })`. |
| `init` / `destroy` | IService | See Lifecycle |
| `name`, `description`, `to_string()` | IService | `to_string()` says "`N` items", counting `entries` (hidden-by-size items included, dotfiles not). |

## State

- `folder.entries`: `$state.raw<DesktopItem[]>` on the `DesktopFolder`, replaced wholesale by its `reload()` (unchanged entries keep their object), by `write_widget()` (appends the new widget), `write_widget_size()` and `write_widget_style()`. Never mutated in place.
- `positions`: `$state<Positions>`, replaced by the folder's `loaded` callback and `move_items()`.
- `arranged`, `grid`: `$derived`, as in the Model table.
- `container`: `$state.raw`, replaced wholesale.
- `files_service`, `apps_service`: `$derived(kernel.service(...))` set in the constructor.
- `reload_id`, `dispose_watch`: plain fields on the `DesktopFolder`.

## Lifecycle

`init()` and `destroy()` forward to the `DesktopFolder`. Its `init()`, async:

1. `await reload()`.
2. Start an `$effect.root` with one effect that reads `files.revision("/home/Desktop")`. Its first run only subscribes (`init()` already loaded). Every later change calls `reload()`; a rejection goes to `console.error`.

`destroy()` disposes the effect root.

`reload()` runs `read()` and retries it up to 3 times (50, 100, 150 ms apart) when it fails with `NotFoundError` or `NotReadableError`: a shortcut moved or rewritten between listing and reading. That change bumps the revision too, so the failed read was stale anyway. Anything else, or a fourth failure, goes to `console.error`.

`read()`:

1. Take `id = ++reload_id`.
2. `files.get_directory("/home/Desktop")`. Missing → throws `/home/Desktop is missing` (FilesService recreates it at boot, so this means it was deleted this session).
3. List it and, in parallel, **only until the layout has been handed over once**, read the layout through `read_layout()` (here `/var/lib/desktop/layout.json`; `null` when missing). After that the owner's in-memory layout is the truth: re-reading the file raced the owner's own writes (a drop onto the desktop imports, which reloads, while `move_items` rewrites the file: `NotReadableError` / `NotFoundError`, and a stale file could overwrite a fresh move in memory).
4. **Seed** (the owner's `seed()`), on the first load only, when there's no layout file and no visible entry, then `return this.reload()` to read what was written (see Behaviour). The seeded layout file stops it from seeding twice.
5. Build `entries`. Every `.desktop` and `.widget` file is read in parallel (`Promise.all`, folder order kept) and parsed here, so listing costs one read per shortcut or widget (and opening one reads it again in `apps.open`). An entry equal to the current one with the same name (same parsed content, compared as JSON) keeps the current object, so icons and widgets don't get new props when something else on the desktop changes.
6. If `reload_id` moved on meanwhile, drop the result. Otherwise assign `entries`, and the first time only call `loaded(layout)`, where this service runs `parse_layout()` (or `{}`) into `positions` in the same tick. Tested in `folder.browser.test.ts`.

A failure in step 2 or 3 during `init()` rejects it and fails the boot ([kernel.md](../kernel.md#failed-init)).

## Persistence

| | |
|-|-|
| Icons | The entries of `/home/Desktop` themselves (OPFS). Shortcuts are `.desktop` JSON files: `{ "app_id": "settings" }`, optionally `"props"`, pretty-printed |
| Positions | `/var/lib/desktop/layout.json`: `{ "version": 1, "positions": { "Settings.desktop": { "x": 0, "y": 0 } } }`, pretty-printed |
| Version | `LAYOUT_VERSION = 1` (private to `layout.ts`) |
| Default widgets | `/var/lib/desktop/additions.json`: `{ "version": 1, "applied": ["game-hub"] }`, the default widget ids already placed. See Default widgets below |
| Mobile home | `/var/lib/desktop/home-layout.json`, written by `MobileDesktopService`. See [Mobile home](#mobile-home) |
| Load | zod: `version` literal `1`, `positions` a record of `{ x, y }` non-negative integers. Wrong version, bad shape or bad JSON → `{}` (every icon takes a free cell), no error logged |
| Written | Seeding, every `move_items()`, `rename_item()` (the cell moves to the new name) and `resize_widget()` (visible items pinned). `/var/lib/desktop` is created on first write (`files.create_directory` under `/var/lib`, which `ensure_hierarchy` guarantees). Write errors: `console.error("[DesktopService] Failed to save the layout")` |

Positions are keyed by entry name, so renaming an entry in File Explorer loses its position.

## Behaviour & invariants

**Seeding.** A new default reaches only new devices: existing desktops already have a layout file, so the seed never runs again (owner's call, 2026-10-14). An empty folder (dotfiles don't count) with no layout file is treated as never set up. `seed()` first takes the v0 React pins (`take_v0_pins()` in `layout.ts`: localStorage `desktop`, read and removed) and writes one shortcut per pin at its v0 grid cell. Without v0 pins it writes one shortcut per `DEFAULT_SHORTCUTS` (`getting-started`, `settings`, `file-explorer`, `terminal`) at `{ x: i, y: 0 }`. Shortcuts are named after the manifest (`Settings.desktop`, `File Explorer.desktop`); then it saves the layout. Unknown ids are skipped. A user who empties the desktop keeps an empty desktop, because the layout file still exists. Deleting the layout file too, or `files.clear()`, seeds again.

**Default widgets** (`additions.ts`, owner 2026-10-14). Apps flagged `default_widget: true` in their manifest (today: Game Hub, at its `widget_size.default`) reach every desktop once, new or existing, unlike shortcuts. Deleting the app drops it from the list, so core names no user app. After the folder loads, `init()` starts, without awaiting it so boot doesn't wait, a pass that reads `/var/lib/desktop/additions.json` (`{ version: 1, applied: string[] }`), writes each pending widget with `write_widget` unless that app already has a widget on the desktop, then records every default id. A removed widget stays removed; a missing or invalid file counts as nothing applied. It takes the first free cells. Desktop only: `MobileDesktopService` doesn't run the pass.

**Spans** (ADR-034). `item_span(item)` is `size` for a widget and 1×1 for everything else. Every step below works on the whole span: a widget is placed only where all its cells are free (and, when fitting or moving, on the grid). The grid holds the widget in each cell it covers; `grid_items(grid)` lists each item once with its top-left cell, which is what positions store and what the shell renders.

**Arrange** (`DesktopHelper.arrange(entries, positions)`): in entry order, each entry with a saved position takes that cell if it's still free. Entries with no position, or whose cell an earlier entry already took, go to `unplaced`. `layout` may contain cells outside the current grid.

**Fit** (`DesktopHelper.fit(dimensions, layout, unplaced)`, re-run whenever the size, entries or positions change):

1. Every `layout` item inside `columns × rows` is shown at its cell.
2. Out-of-range `layout` items (row-major), then `unplaced` (entry order), take the first free cells, row-major.
3. Whatever is left when no free cell remains is **hidden**, not dropped.

Unplaced items are never written back. Their cell is recomputed on every fit, so a new or removed entry, or a resize, can shift them.

**Move** (`move_items(moves)`, ADR-011 revision) builds a fresh `positions`:

1. Resolve the targets (`DesktopHelper.resolve_moves(grid, dimensions, moves)`): cells held by items that aren't moving are taken; each move takes its target when it's on the grid and free, else the nearest free cell by distance (scan order breaks ties, so an item may land back in its own vacated cell). Tested in `helper.test.ts`.
2. Start from the current `positions`, minus names no longer in `entries` (stale names are pruned here and only here).
3. Pin every item **visible** in `grid` to the (top-left) cell it's shown in. Relocated and unplaced icons become real positions, so they don't jump when a cell changes hands.
4. Set each resolved item to its cell.
5. Assign `positions` (the grid updates at once), then write the file in the background.

Hidden items keep whatever position they had.

**Refresh.** Any mutation of `/home/Desktop` made through FilesService in this tab (File Explorer, `pin()`, `remove_item()`, an app saving there) bumps its revision and reloads the desktop. Writing `layout.json` bumps `/var/lib/desktop`, which nothing watches, so a move doesn't reload. Overlapping reloads resolve to the newest (`reload_id`).

**Coordinates.** `container.bounds` is viewport space. The shell's drag handler subtracts `bounds.x/y` from `clientX/Y` and divides by `cell` to get a grid cell, so the two stay consistent as long as the element doesn't move without resizing. Moves without a resize aren't observed (ResizeObserver only reports size).

**Sort** (`sort_moves`) leaves widgets out: they keep their place and the sorted icons flow around them when the moves resolve.

**Widgets on the desktop** (`components/desktop/desktop-widget.svelte`). A frame spanning its cells, inset 4px. Its 24px title strip is the handle: a button carrying `data-desktop-name`, so selection, drag, Enter/F2/Delete, the item menu ("Remove widget") and double-click to open (launches the app with the widget's props, through `apps.open`) all work as for icons. The body (`data-widget-body`) belongs to the app's `manifest.widget` component, which gets `{ props, size, name, style }` with props validated against the manifest's `props`. The desktop ignores pointer-down, right-click and keys that come from inside a body, so a sticky's Mod+A selects its text, not the desktop. A missing app, an app without a widget, or props that fail validation show a one-line message instead.

**Widget styles** (ADR-034 revision 2026-10-21). The frame's surface comes from `widget_surface(style)` in `components/desktop/widget-style.ts`, shared with the phone home: `card` is `bg-background-light`, `shadow-raised` and a `foreground/10` ring; `glass` is `bg-background-light/50` with `backdrop-blur-lg` and a `foreground/8` ring, no shadow; `clear` has none of them. On `clear` the title strip is transparent and `opacity-0` until the widget is hovered, has focus inside or is selected, so it still takes drags, clicks and the keyboard; revealed, it gets a `bg-background-light/70` blurred backing so the label reads on any wallpaper. The grip already follows the same rule and gets the `.bare-text` shadow. Selection keeps its `primary/40` ring in every style, and a dragged widget dims as before. The widget's menu (`item_menu` in `desktop-actions.ts`) has Style › Card / Glass / Clear for a single widget, the current one marked with a check icon (`style_item`, `apply_style_choice`, shared with the phone's long-press menu). `.bare-text` (`app.css`) is the shadow for content sitting straight on the wallpaper: a soft dark drop shadow, plus a `--background` halo on a photo wallpaper.

**Resizing widgets** (ADR-034 revision 2026-10-15). Only for apps with a manifest `widget_size`. A grip button sits on the frame's bottom-right corner (24px, outside the body, out of the tab order); it shows on hover, focus inside the widget, while selected and while resizing. Pointer-down on it selects the widget alone, focuses the desktop and captures the pointer. Each move adds `snap_cells(travel, cell)` (the pointer's travel rounded to whole cells) to the starting size and asks `resize_target`: the size is cut at the grid's right and bottom edge, clamped to `min`/`max`, and valid only if the widget still fits the grid and covers no other item. The target shows as an outline over the widget's cells with a `w × h` chip: `foreground/30` ring on `foreground/6` when valid, `error/60` on `error/10` with a solid `error` chip when refused. Losing capture (release, or anything else) writes a valid, changed size through `resize_widget`; a refused size writes nothing. Escape cancels.

Keyboard: with the widget's title strip focused, Shift+→/← grows or shrinks the width by one cell and Shift+↓/↑ the height, through the same `resize_target`. A refused step flashes the red outline for 600ms. Pure math (`snap_cells`, `resize_target`) is tested in `helper.test.ts`; `clamp_widget_size`, `initial_widget_size` and `widget_size_schema` in `apps/widget.test.ts`. The loaded component is kept per app in a module-level map: moving any item hands every widget a new item object, and re-awaiting a fresh import promise each time showed the loading spinner for a frame (owner, 2026-10-15). Only the very first render of an app's widget awaits.

## Mobile home

`MobileDesktopService` (`mobile.svelte.ts`, model in `home-layout.ts`, inspector `mobile-inspector.svelte`) is registered under `desktop` on mobile (ADR-016 revisions 2026-10-12 and 2026-10-25). Same folder, same `DesktopFolder`, its own layout: one ordered list of entries and widgets. No dock and no pages since the list home (2026-10-25, [brainstorm](../../brainstorm/2026-10-25_niagara-home.md)). Rendering is in [shell/mobile.md](../shell/mobile.md#home).

| Member | Signature | Notes |
|--------|-----------|-------|
| `home` | `() => DesktopItem[]` | Every entry in the saved order, then entries the order doesn't know in folder order |
| `move_item` | `(name, before: string \| null) => void` | Puts the entry just before `before` in the home order (`null` or unknown: the end) |
| `set_widget_style` | `(name, style) => Promise<boolean>` | Same as the desktop's: writes `style` through `DesktopFolder.write_widget_style`; `false` when `name` isn't a widget |
| `rename_item` | `(name, new_name)` | Swaps the name in the order and saves before renaming, so the entry keeps its place |
| base members | | Forward to `DesktopFolder` |

No resize on the phone: a widget shows full width, `size.h` rows of 104px tall, and its size is set on the desktop.

**Layout file** `/var/lib/desktop/home-layout.json`: `{ "version": 1, "order": ["Settings.desktop", …] }`. zod-validated; anything invalid is an empty layout (folder order), not an error. Every change rebuilds the order from what's shown, so stale names drop out, assigns the state at once and writes in the background (`[MobileDesktopService] Failed to save the home layout`).

**Dock migration** (2026-10-25): a file from the grid home still has `"dock": [...]`. `parse_home_layout()` appends those names to the end of the order (duplicates dropped) and reports `migrated`; the service then writes the file back without `dock`, once, right after the first load. The old dock items show at the end of the list.

**Arrange** (`arrange_home(entries, layout)`, pure, unit-tested): the saved order minus stale and duplicate names, then every other entry in folder order.

**Seeding** runs for an empty folder with no `home-layout.json`. If the desktop's `layout.json` exists, the desktop was set up and emptied on purpose, so only an empty home layout is written. Otherwise it writes the `DEFAULT_SHORTCUTS` and saves them as the home order. A folder the desktop already filled isn't seeded: those items show in folder order.

## Divergence from ADR

ADR-022's body puts positions in `/home/Desktop/.layout.json` and writes back the cell of every unplaced entry. The code uses `/var/lib/desktop/layout.json` and saves only on move; the ADR's 2026-10-11 revision note records both, plus the seed condition, broken-shortcut handling, `ShortcutIcon`, File Explorer's `{ path }` and Enter to open. ADR-022 says seeding happens when "the folder was just created"; the code's test is "empty and no layout file".

ADR-011's revisions are built: multi-select (selection is local to the desktop surface, moves go through `move_items`), the wallpaper (on [SettingsService](settings.md)) and the one-shot Sort by. Icon size, label and spacing settings aren't.

## Shell

Contributes no commands.

## Known gaps

- Widgets resize only from the bottom-right corner, growing right and down; there's no resize from the other edges. On the phone they show full width and don't resize ([shell/mobile.md](../shell/mobile.md#home)).
- The context menu has no Resize item; the keyboard path is Shift+arrows on the title strip.
- Hidden items (more entries than cells) can't be seen, opened or removed until the grid grows. Nothing tells the user they exist.
- Unplaced icons aren't stable: adding a file that sorts earlier shifts every unplaced icon after it.
- `pin()` doesn't dedupe. The start menu ignores its `null` and its errors beyond `console.error`.
- Layout changes made in another tab aren't picked up until a page reload (the file is read once).
- Changes from other tabs, or OPFS writes that bypass FilesService, show up only after a reload.
- If `/home/Desktop` itself is deleted, nothing reloads (the bump is on `/home`), and the next reload throws `/home/Desktop is missing` to `console.error`; the desktop keeps the old icons until the next boot recreates the folder.
- A 0-column grid would make `cell` `Infinity`/`NaN`; the shell guards against rendering that.
