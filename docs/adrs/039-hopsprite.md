# ADR-039: Hopsprite File Format and Export Pipeline
**Date:** 2026-10-16
**Status:** Implemented

## Context

Hopsprite is a pixel art and animation editor ([brainstorm](../brainstorm/2026-10-16_hopsprite.md)). It needs its own document format, because layers, frames, durations and tags don't survive a PNG, and an export path that turns a sprite into files other apps and sites can use. The owner chose an indexed colour model and SVG-only exports for the first pass; GIF is deferred.

## Decision

**Document.** A sprite is immutable: `{ width, height, palette, layers, frames, cels, tags }`. `palette` holds `#rrggbbaa` strings with index 0 fixed to transparent, at most 256. Cels are full-canvas `Uint8Array`s of palette indices in a map keyed `layer_id/frame_id`; a missing key is an empty cel. Every edit returns a new sprite that shares every cel it didn't change, so `History<Sprite>` undo costs only the replaced cels, and the byte cap counts exactly those (`added_bytes`).

**File.** `.hopsprite`, UTF-8 JSON, one cel per line:

```json
{
  "format": "hopsprite",
  "version": 1,
  "width": 32,
  "height": 32,
  "palette": ["#00000000", "#1a1c2cff", "…"],
  "layers": [{ "name": "Layer 1", "visible": true, "locked": false, "opacity": 1 }],
  "frames": [{ "duration": 100 }],
  "tags": [{ "name": "walk", "from": 0, "to": 3, "direction": "pingpong" }],
  "cels": [
    { "layer": 0, "frame": 0, "x": 4, "y": 2, "w": 9, "h": 12, "rle": [[3, 0], [2, 5], …] }
  ]
}
```

- `layer` and `frame` are array positions; layers run bottom to top.
- A cel is trimmed to the bounding box of its non-transparent pixels and stored as `[count, index]` runs, row-major.
- Parsing validates with zod, then checks what zod can't: runs add up to `w × h`, cels stay inside the canvas, indices stay inside the palette, cels name real layers and frames. Index 0 is forced to transparent. A `version` above the reader's is refused with "made by a newer Hopsprite".
- Ids are not stored; they're made on load.

**Render.** `composite(sprite, frame)` blends visible layers with their opacity into straight-alpha RGBA. The editor and every export use it, so what is exported is what is shown.

**Exports.**

- *SVG, current frame.* Pixels merge into rectangles: runs along each row, extended down while the row below has the identical run. Each colour is one `<path>` of `M x y h w v h h -w z` subpaths, with `fill-opacity` for translucent entries. `viewBox` is the sprite size, `width`/`height` the size times the scale, `shape-rendering="crispEdges"`. Written directly.
- *Animated SVG.* The frame order comes from the range (all frames or a tag) and direction (forward, reverse, ping-pong unrolled without repeating its ends). Identical composites are deduped. Each unique frame is a `<symbol>`, shown by one `<g>` whose `<animate attributeName="visibility" calcMode="discrete">` lists `keyTimes` at the frame's step boundaries over `dur` = the sum of durations, `repeatCount="indefinite"` (or once with `fill="freeze"`). SMIL is used because it plays inside `<img>`. It runs on TasksService: one task per frame step (composite and path data), then "Write file".

**Import.** PNG, JPEG, WebP and GIF open as a new untitled sprite. GIF frames and delays come from WebCodecs `ImageDecoder`. Pixels below half alpha become index 0; other colours reuse an exact palette match, are added while the palette has room, then map to the nearest entry (the user is told how many).

## Alternatives Considered

- **Base64 PNG per cel.** Smaller for photos, but opaque, async to read and write, and it stores RGBA where the model is indexed.
- **Zip container.** No base64 bloat, but File Explorer and the Text Editor can't look inside, and sprite files are small.
- **Region-patch undo (Paint).** Least memory, but every structural operation would need a hand-written inverse.
- **CSS keyframes for the animated SVG.** Per-frame durations need percentage maths per frame, and SMIL is the more reliable choice inside `<img>`.
- **GIF now.** Deferred by the owner. The indexed palette is already a valid GIF colour table, so the encoder only has to do LZW.

## Consequences

- A sprite file is readable and diffable, and roughly as big as its runs.
- Palette edits recolour every frame, which is the point of indexed art; art can't hold more than 255 colours.
- A big sprite (say 1024×1024) costs 1 MB of history per stroke, so the byte cap shortens its undo history.
- Two windows on one file don't sync; the last save wins.
- Adding PNG, sprite sheet or GIF export reuses `composite` and the task pipeline.
