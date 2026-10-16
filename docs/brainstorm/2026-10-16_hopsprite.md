# Hopsprite

**Date:** 2026-10-16
**Participants:** owner, Claude

## Context

The owner asked for a pixel art editor with animation, in the spirit of Aseprite but not named after it: a very good pixel editing experience with the usual tooling, an animation builder with onion skin ghosting, and exports to SVG, images, GIF and, if possible, animated SVG. Related code already in the repo: Paint (Bresenham line, scanline flood fill, region undo patches, zoom helpers, all RGBA and antialiased where it draws shapes), GIF Player (`ImageDecoder` frame decoding), Image Tools (sprite sheet slicing and export), `core/utils/history` (immutable undo) and `core/utils/image` (load and write). No GIF encoder exists anywhere, and browsers don't ship one.

## Decisions

| Topic | Decision | Rejected |
|---|---|---|
| Name | Hopsprite, id `hopsprite`, category Media | Sprite Studio, Dotwork, Pixloop |
| Colour model | Indexed: cels hold palette indices (`Uint8Array`), index 0 is transparent, up to 256 entries. Changing a palette colour recolours the art. Imports and pastes map RGBA to the nearest index, adding colours while there's room | RGBA cels with the palette as swatches only |
| File format | JSON `.hopsprite`: palette, layers, frames (duration in ms), tags, and cels as `{ layer, frame, x, y, w, h, rle: [[count, index], …] }` trimmed to their content. Versioned `format` / `version`, validated with zod. See [ADR-039](../adrs/039-hopsprite.md) | Base64 PNG per cel; a zip container; PNG only |
| Exports, first pass | SVG only: the current frame as merged colour runs, and an animated SVG with discrete SMIL visibility that plays inside `<img>`. Multi-frame export runs on TasksService | PNG, sprite sheet and GIF in the first pass |
| GIF encoder | Deferred, "to be decided": no GIF export and no `gifenc` | Hand-written LZW now; `gifenc` |
| Undo | Immutable sprite with cel-level structural sharing in `History<T>`, capped by the bytes each entry really adds | Paint-style region patches with an inverse per operation; full snapshots |
| Shared helpers | Copied into the app as index-based versions; Paint is not touched | Moving Paint's helpers to `core/utils/raster`; cross-app imports |
| Rendering | One canvas at sprite resolution, CSS-scaled with `image-rendering: pixelated`, fed by a pure `composite(sprite, frame)` that export uses too. Onion skin on an underlay canvas, grid, brush cursor and selection on a screen-resolution overlay. Chrome colours (grid, onion tint, checkerboard) come from theme tokens | One DOM canvas per layer; WebGL |
| Colour picker | App-local: native `<input type="color">`, hex field, alpha slider | A kit `ColorPicker` now |
| Mobile | Full touch editing: one finger draws, two fingers pan and pinch-zoom, a long press picks a colour. Container-query layout: tools in a bottom strip, Palette / Timeline tabs when narrow | View-only on phones |
| Shell | Association only: `.hopsprite` opens in Hopsprite, PNG and GIF list it under Open with (GIF frames and delays through `ImageDecoder`). No commands, only the standard `path` prop | `sprite new/export/info` commands |
| Release | 1.6.0 | |

## Key takeaways

- Indexed art makes a future GIF export exact for nearly every sprite: the palette is the GIF colour table, so quantization only matters for imports.
- Structural sharing keeps undo cheap for the common case (small sprites, one cel per stroke) and makes structural edits (frames, layers, palette) undo for free.
- The animated SVG is the first export because it needs no encoder and stays vector.

## Action items

- [x] Model, format, raster ops, composite, SVG export with tests
- [x] Editor: tools, palette, layers, timeline, onion skin, playback, tags, import, SVG export
- [x] ADR-039, roadmap, changelog 1.6.0

## Next session topics

Future features, none decided:

- ~~GIF export: hand-written GIF89a or a dependency.~~ Decided 2026-10-16: hand-written. Options weighed: hand-written, `gifenc` (MIT, 9 KB), `omggif`, gifski wasm (AGPL, photo quantizer that would dither pixel art), `gif.js`, ffmpeg.wasm, APNG instead. The owner: "if it is that simple to do it by hand do it by hand". APNG stays an idea for full-alpha exports. See the ADR-039 revision.
- PNG, PNG sequence and sprite sheet + JSON export; APNG (browser PNG chunks plus the core crc32)
- Linked cels, reference layer, tilemap mode, 9-slice
- Lasso and polygon selection, gradient fill, outline effect, shading ink, custom brushes from a selection
- Layer blend modes (multiply, screen, overlay)
- Import a sprite sheet (the Image Tools slicer) and `.aseprite` files; palette import and export (`.gpl`, `.hex`, Lospec)
- RotSprite / Scale2x scaling, arbitrary-angle rotation
- Tweens and onion skin "behind" vs "in front" option
- Shell commands (`sprite export`) once the owner wants them
- A kit `ColorPicker` (OKLCH) that Settings, Paint and Hopsprite share
- A File Explorer icon for `.hopsprite`

## UI pass

Owner feedback on 1.6.0: too little canvas, an Aseprite-style timeline that felt heavy for a one-frame sprite, rows of unlabeled icons, a duplicated colour block, a stray brush preview. Follow-ups asked for performance first, resizable panels and saving vertical space on short windows. All app-local; no core or kit changes.

| Area | Before | After |
|---|---|---|
| Top | Toolbar of 12 file/edit icons, then a separate tool-options bar | One toolbar: a File menu (new, open, device, save, save as, sprite size, flip and rotate, tile grid), undo, redo, the active tool's options inline, Export |
| Tools | Left rail | Same rail, wraps into two columns on short windows; a bottom dock with the colour wells on phones |
| Colours | 230px panel: big well, small well, hex, alpha, palette | Side panel: wells, hex, palette grid with a + tile, layers below. Hex, picker, alpha, presets and remove live in a popover on the primary well. On phones the popover also holds the palette |
| Animation | Transport row, loop/ping-pong/once, ghost, tag, ms field, layers × frames grid, an opacity row | One filmstrip row: play, onion toggle, live frame thumbnails, + (duplicates the frame), layers button (phones, or when the side panel is folded), a popover for timing (ms, fps presets, loop mode), tags and onion settings. Right-click a frame for the rest |
| Status bar | Size, cursor, frame, colour, counts | Gone: size and cursor in a small badge on the canvas, frame count at the strip's end |
| View | Zoom group in the toolbar | Floating pill on the canvas: grid, zoom, fit. Fit stays on through window and panel resizes until the user zooms or pans |

Resizing: the colour panel and the filmstrip have an app-local `resize-handle.svelte` (ARIA window splitter: arrows, Home folds, End, Enter toggles, double-click toggles, drag past half the minimum folds). Sizes persist in `app.hopsprite.side` / `app.hopsprite.strip`. During a drag only a CSS variable on the root changes, once per frame; the stage refits and never recomposites. The strip is capped at 30% of the window height, 18% below 45rem and 11% below 34rem, so persisted sizes shrink with the window. The owner moved the splitter into the UI kit as `ResizeHandle` (2026-10-16), shown in the Style Guide. Zoom gained a 75% step so a 512px sprite fits a phone at more than 50%.

Phone tool options (owner: compact controls, phone only, desktop unchanged): on `Platform.MOBILE` the brush size is a `3px` button opening a slider popover (with the round/square toggle), the pattern Select becomes one button that cycles Solid, 75%, 50% and 25%, and the two mirror toggles become one Mirror button opening a menu. The file name moved into the File button and gives up width first, so the pencil row fits a 412px phone; the select tool's longer row still scrolls.

Performance, measured on a 512×512 sprite with 8 layers and 30 frames (Chrome, main-thread time per event):

| | Before | After |
|---|---|---|
| Pointer move while drawing | 3.9 ms avg, 5.1 ms p95 | 0.3–0.4 ms avg, 0.8–0.9 ms p95 |
| Switching frame (stepping all 30) | 3.9 ms | 0.8 ms once composites are cached (4.4 ms on the first pass) |
| Parsing the 5.1 MB file | 258 ms | 68 ms |
| Thumbnail | n/a | 0.18 ms at 64 px, 0.40 ms at 128 px |

How:

- Strokes paint into one buffer in place (`paint.ts`): freehand dabs only the new points, pixel-perfect lifts corners through a per-pixel coverage count, shapes restore the rect their last preview covered. Each draft carries the rect it changed.
- The stage recomposites only that rect (`composite_into`) and puts just that region. A commit that stores the draft's buffer is recognised by identity and costs nothing. Whole-frame composites are cached per frame (copied, capped at 96 MB), so playback and frame stepping are a `putImageData`.
- Grid, tiles, border and mirror axes sit on their own canvas, redrawn only when the view changes; the cursor overlay no longer redraws them on every move. The cursor only updates when it enters a new pixel, and the status readout stopped copying the cel on every move.
- Thumbnails sample nearest pixels at thumbnail size (`composite_sampled`), only when visible, only when the frame's cels, layers or palette changed, and at power-of-two resolutions so resizing the strip rescales in CSS.
- Runs in a file are validated while decoding instead of by a zod tuple per run.

Layout share of the canvas (stage height over the app's height, default panel sizes): 1874×959 viewport 85%, 1320×677 78%, 1394×509 78%, phone width 74%.

