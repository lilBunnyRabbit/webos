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

- GIF export: hand-written GIF89a (LZW, palette straight from the sprite) or a dependency. Pending the owner's call.
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
