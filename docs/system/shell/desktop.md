# Desktop

Source: `src/lib/core/components/desktop/` · Services: [desktop](../services/desktop.md), [apps](../services/apps.md) · ADR: [ADR-022](../../adrs/022-desktop-folder.md) (desktop folder, shortcuts), [ADR-011](../../adrs/011-desktop-enhancements.md) (multi-select built, wallpaper and auto-arrange not), [ADR-057](../../adrs/057-live-wallpapers.md) (live wallpapers)

| File | Role |
|------|------|
| `desktop.svelte` | The CSS grid, the wallpaper and the grid preset's dots, measurement, keyboard, rendering of selection, marquee, drag targets and resize preview |
| `desktop.handler.svelte.ts` | `DesktopHandler`: selection, marquee, widget resize and native drag and drop, exposed as `pointer_attachment()` and `drop_attachment()` like `window.handler.svelte.ts`. Takes a getter for the grid cells |
| `wallpaper.svelte` | The wallpaper layer, shared with the phone home; mounts a live wallpaper's background layer |
| `live/` | Live wallpapers (ADR-057), see [below](#live-wallpapers) |
| `desktop-item.svelte` | One icon: a draggable button showing selected, dimmed and drop-target states; reports clicks, menus and drag start/end up |
| `desktop-item-face.svelte` | Icon + label |
| `desktop-widget.svelte` | One widget (ADR-034): a frame spanning `size.w × size.h` cells, a title strip as its handle and the app's lazy widget component as the body |
| `widget-style.ts` | `widget_surface(style)`: the frame's background, ring and shadow for Card, Glass and Clear, shared with the phone home |
| `desktop-actions.ts` | The desktop's menus, questions and actions: open, copy/cut/paste, delete, new folder, rename, properties, sort ([Context menus](#context-menus-adr-025)) |

## Responsibilities

- Measure itself into `desktop.set_container()` (ResizeObserver) and render a CSS grid with `repeat(columns, minmax(64px, 1fr))` × `repeat(rows, …)`, with padding from `container.config.padding` (12px). Cells are at least 88px (`cell_size`), so the 64px floor never bites.
- Paint the surface: the [wallpaper](#wallpaper), and for the grid preset a dot at every cell corner (`.desktop-surface[data-dots]::before`: `foreground` at 14%, a 1px `radial-gradient` sized to `container.cell` and offset by the padding, so the dots sit on the cell corners). The cell size reaches CSS as `--cell-width` / `--cell-height` (88px until measured), the padding as `--grid-offset`.
- Flatten `desktop.list()` into `cells` (`{ item, x, y }`, reading order: rows top to bottom, cells left to right) and render each at `grid-column: x+1; grid-row: y+1`, keyed by entry name: a `DesktopItem`, or a `DesktopWidget` spanning its size for a widget.
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
| Live | The glow, then the entry's `background` layer ([live wallpapers](#live-wallpapers)). On the phone, the grid preset |
| Image | The file at `path` as an object URL (revoked on change), `background-size` cover / contain / auto (tile repeats, center doesn't), `filter: blur()` with the layer grown by twice the blur so the edges don't fade, then `background-darkest` at `dim` opacity on top. A missing file draws the glow |

The surface gets `data-wallpaper-image` while an image is set. An unlayered rule in `app.css` then gives every `[data-wallpaper-label]` (desktop and phone home labels) a `background/72` backing, so labels stay readable on any photo.

Set from Settings › Appearance › Wallpaper, or "Set as wallpaper" on an image file (desktop, File Explorer, Media Preview), which calls `set_wallpaper()` in `components/files/file-actions.ts` → `settings.set_wallpaper_image(path)` with an error toast.

## Live wallpapers

ADR-057. A `Wallpaper` of `{ kind: "live", id }` draws one of the OS's built-in live wallpapers: animated, aware of the pointer and the windows. Desktop only: on the phone `wallpaper.svelte` draws the grid preset in its place, and Settings hides the section.

Code in `components/desktop/live/`:

| File | Contents |
|------|----------|
| `registry.ts` | `LIVE_WALLPAPERS` (id → `LiveWallpaperEntry`), `live_options_of(id, saved)`, the `LiveContext`, `LiveProps`, `LiveSettingsProps`, `LiveLayer` types. Imported by settings persistence, so it's in the boot chunk: names, authors, zod option schemas and `import()` stubs only |
| `context.svelte.ts` | `LiveContextState`, the `LiveContext` a layer hands its component |
| `live-layer.svelte` | Mounts one layer: loads the entry's `background` or `overlay` component, builds the context, parses the options from `settings.live_options` |
| `geometry.ts` | `dot_cells()` (the grid dots' cells), `tile_cells()` (the thumbnail grid), `centre()`, `contains()` |
| `theme.ts` | `read_tokens()` resolves tokens to colours a canvas can parse (a probe's computed `color`, since a token can be `oklch(from var(--primary) …)`); `watch_theme()` calls back when `<html>`'s `style` changes |
| `turrets/` | Pew Pew: `options.ts` (schema), `sim.ts` (pure simulation), `impacts.ts` (shield hits from the background layer to the overlay), `damage.ts` (damage model and store), `sound.ts` (WebAudio synth), `turrets-canvas.svelte`, `turrets-background.svelte`, `turrets-overlay.svelte`, `turrets-settings.svelte` |

An entry:

```ts
interface LiveWallpaperEntry<T> {
  name: string;
  authors?: AppAuthor[];               // the Settings byline, through app-byline
  options: ZodType<T>;                 // a .catch per field, so parse({}) is the defaults
  background: () => Promise<{ default: Component<LiveProps<T>> }>;
  overlay?: () => Promise<{ default: Component<LiveProps<T>> }>;
  settings?: () => Promise<{ default: Component<LiveSettingsProps<T>> }>;
}
```

**Layers.** `wallpaper.svelte` imports `live/live-layer.svelte` with `import()` only while the wallpaper is live, and mounts the `background` layer above the preset glow (`data-preset="glow"`), so it sits behind the icons and windows. `desktop-shell.svelte` mounts the `overlay` layer, when the active entry has one, in a `pointer-events-none relative z-0` wrapper in the window manager's grid cell, after the window manager: above every window, below the toast area and taskbar (`z-1`) and the dialogs host (top layer). Both layers load lazily, so a desktop without a live wallpaper downloads none of this.

**Context.** Coordinates are the page's (`clientX`, `getBoundingClientRect()`); a component subtracts its own rect.

| Field | Source |
|-------|--------|
| `pointer` | `pointermove` on `window` (passive), `null` after `pointerleave` on `<html>`. Moves over an iframe don't arrive |
| `windows` | `{ id, rect }[]`, back to front (by window `order`). Measured on read: for each window that isn't minimized or popped out (ExtractService), the `[data-window-id]` element in `windows.container.element`; `id` is the window id. Measured rather than read from `bounds`, because a dragged window lives in the window's local move state and a snapped or maximized one in CSS |
| `widgets` | `{ id, rect }[]`, always behind the windows. Measured on read: every `[data-desktop-widget]` element (the widget's root in `desktop-widget.svelte`) in `desktop.container.element`; `id` is the attribute's value, the widget's file name in `/home/Desktop` (`Notes.widget`). Empty in a preview |
| `cells` | `dot_cells(desktop.container.bounds, .cell, .grid)`: `(columns + 1) × (rows + 1)` cells centred on the grid line crossings, the same points the `[data-dots]` CSS paints. A preview tiles its host in 14px cells instead |
| `paused` | A preview, `document.hidden`, `document.fullscreenElement`, or any visible maximized window (not minimized, not popped out) |
| `preview` | `wallpaper.svelte` got a `value` (Settings' thumbnails) |

**Options.** `live_options_of(id, settings.live_options[id])`: invalid fields fall back to their defaults, a missing entry is all defaults.

### Pew Pew

Id `turrets`, by LaxDOTexe and lilBunnyRabbit. Every grid dot is a turret: a `foreground` dot (30%) with a short barrel (45%) that turns toward the cursor at 9 rad/s, the short way round. Sizes scale with the cell (`unit` = cell / 40, clamped 0.5–1).

| Option | Values | Default |
|--------|--------|---------|
| `mode` | `shield`: windows and widgets are shields. Bolts fly on the background canvas, behind them; a bolt entering a shield's rect stops at its edge with a spark drawn on the overlay, above the shield. A cursor inside a shield is hidden: turrets still aim and fire at it, but no bolt can hit it. Turrets under a shield hold fire. `follow`: bolts on the overlay canvas, hitting the cursor anywhere, clicks still pass through | `shield` |
| `pace` | `chill` every ~1.5 s, 1 turret, 260 px/s; `normal` every ~0.5 s, 3 turrets, 460 px/s; `frantic` every ~0.14 s, 6 turrets, 760 px/s. Intervals ±25% | `normal` |
| `sound` | Off by default | `false` |
| `volume` | 0–1 (the form shows 0–100) | `0.5` |
| `damage` | Shield hits chip the window or widget they struck ([damage](#damage)). The switch is disabled in follow mode, where nothing is a shield | `false` |

Shooters are drawn by weight `1 / (1 + (d / 260)²)` from the cursor, so nearer turrets fire more (`pick_shooters()`). A bolt is a 14px `primary` line with a `primary` glow, starting at the barrel's tip. Hit: a bolt's step passes within 6px of the cursor → a puff of 10 `accent` particles for 300 ms. A cursor inside any wall is sheltered and skips the hit test, so a bolt stopping just short of a shield's edge can't reach a cursor just inside it. Wall: `first_wall_hit()` clips the step against each wall (window and widget rects, Liang–Barsky); `update()` returns the entry points as `impacts` (`WallHit`: the point, the wall's `id` and the `edge` it came through, `nearest_edge()`), the background layer emits them in page coordinates through `shield_impacts`, and the overlay bursts 8 glowing `primary` sparks there for 280 ms. Bolts leaving the canvas are dropped. Bolts and particles live in fixed pools (256 and 512) reused in place. `dt` is capped at 50 ms.

The background layer always draws the turrets and fires in shield mode; the overlay layer fires in follow mode, and in shield mode only draws the shield sparks, its loop running only while they live. Each layer has one canvas sized to `devicePixelRatio`, colours read through `read_tokens()` and re-read on a theme change. The `requestAnimationFrame` loop runs only while not paused and while the pointer is on the page or something still moves (bolts, particles, a turret turning); otherwise one still frame is drawn on resize, theme or option change. A pause also clears bolts in flight, so none hang over a maximized window. A mode or pace change starts clean. Destroy cancels the frame and closes the audio.

Sound (`sound.ts`, `PewSynth`): the AudioContext is made on the first `pointerdown` or `keydown` after sound is turned on, or at once when the page already had a gesture (`navigator.userActivation.hasBeenActive`). A pew is a square oscillator sweeping from 1400 Hz to 220 Hz over 0.13 s (times the pace's pitch: 0.8, 1, 1.3, ±6%) under a 5 ms attack and exponential decay; at most 3 per frame. A hit is a pop: 0.15 s of white noise through a lowpass falling from 1600 Hz to 300 Hz, decaying over 0.12 s.

The thumbnail draws the turrets aimed at a point right of centre, and in shield mode three bolts on their way.

#### Damage

Cosmetic only; the window's DOM is never touched. `turrets/damage.ts` holds the pure model and one module-level store, `damage_store`, shared by the overlay (which chips, prunes and draws) and the settings form (Repair). Memory only: a reload repairs everything.

- **Model.** `Map<id, { window, bites }>`. A `Bite` is `{ edge, offset, depth, seed }`: `offset` along its edge from that edge's start (left for top and bottom, top for left and right), `depth` inward, so a bite moves and resizes with its target.
- **Chip.** The overlay queues each `shield_impacts` hit and applies the queue at its next frame, against the rects read once for that frame. A hit within a bite's half-width + 4px on the same edge digs it 2.5px deeper and steers it up to 3px (20% of the gap) toward the cursor's position along the edge. It never digs deeper than the cursor sits inside the target, nor past the cap of 18% of the short side or 60px, whichever is smaller. Any other hit opens a 4px bite, up to 64 per target. Half-width is `4 + depth × 0.75`.
- **Prune.** Each damage frame drops widgets no longer on the desktop. Windows missing from the context are kept, since a minimized or popped-out window comes back with its damage; the 16 most recently chipped hidden windows are kept and older ones dropped. Window ids are fresh UUIDs, so a closed window's damage can't show again and only ages out.
- **Draw.** On the overlay, back to front: widgets, then windows. For each target with bites, a clip to its rect, a 2px `foreground` rim at 35%, then the bites filled in `background_darkest` over it, so overlapping bites keep only the outer half of the rim. Then every window above that target is `clearRect`ed, so a bite on a window never shows through one in front. Sparks are drawn after. The outline is a seeded jagged arch (8 steps, ±jag), built once into a `Path2D` per bite list and target size (a chip replaces the list) and drawn translated to the target.
- **Loop.** While there is damage and the pointer is on the page, the overlay redraws every frame so bites follow a dragged window; without the pointer it draws only on resize, theme, option change or Repair. Measured at 64 bites on each of 3 windows and a widget, with frantic fire, the damage pass costs about 0.07 ms a frame (0.4 ms before the path cache).
- **Repair.** "Repair everything" in the Damage row calls `damage_store.clear()`, which tells the overlay to draw a clean still frame.

## Desktop item

Each icon is an entry of `/home/Desktop` ([services/desktop.md](../services/desktop.md#model)). `DesktopItemFace` draws it:

Apps and files look different without a badge: an app shortcut sits in a 44px `rounded-xl` tile (`bg-background-light`, `shadow-raised`, hairline ring) with a 24px glyph; files and folders are a bare 40px glyph (`.bare-glyph` in `app.css`: a soft `background-darkest` drop shadow, and on a photo wallpaper a 1px `background` halo too):

| Kind | Glyph | Label |
|------|-------|-------|
| `shortcut` | `ShortcutIcon` (`components/files/shortcut-icon.svelte`) with `badge={false}`: the target app's icon, or a generic `AppWindow` glyph when the app isn't registered. File Explorer rows keep the arrow badge (the default) | `item.label` (file name without `.desktop`), plus " · missing" in `text-error` when the app isn't registered |
| `file` | `FileIcon` by MIME, then extension, duotone at `foreground/85` | File name |
| `directory` | `FileIcon` folder, `fill` in `primary` | Folder name |
| `widget` | Not an icon: `desktop-widget.svelte` draws a `rounded-xl` frame over its cells in the widget's style (`widget_surface`: Card is `bg-background-light shadow-raised`, Glass translucent and blurred, Clear bare with the strip and grip shown only on hover, focus or selection; [desktop service](../services/desktop.md)). The 24px title strip (app icon, `item.label`) is the button that selects, drags, opens and takes the menu; `[data-widget-body]` holds the app's `widget()` component (loaded once per app) with `{ props, size, name, style }`. The menu's Style submenu switches the style. Apps with `widget_size` get a resize grip (pointer) and Shift+arrows on the strip. A missing app, a broken file or an app without a widget shows a line of text instead; a widget chunk that fails to import shows the compact `update/load-failed.svelte` (update check, Update and reload) | `item.label` in the strip |

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
| `drop` of an app (`application/x-webos-app`, ADR-042) from a start menu tile or an App Library card | `apps.install(id)`, `desktop.pin(id)`, then `move_items` to the drop cell. Folders under the pointer don't highlight for it. Drop effect `copy`. Quick launch drags (`application/x-webos-quick-launch`) are ignored, so dropping one here unpins it from the taskbar |
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
