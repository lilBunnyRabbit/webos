# Font Maker

**Date:** 2026-10-20
**Participants:** owner, Claude

## Context

App request from L4X (LaxDOTexe): a font maker like the old online tools where you hand-write letters into boxes and get a working font back (Calligraphr-style).

What exists today:
- Font Viewer (`font-viewer/font.ts`) parses TTF/OTF/WOFF by hand and previews with `FontFace`; it can check the output.
- No app writes fonts or captures vector strokes (Paint is raster).
- `print_html` exists for printing.

## Topics discussed

### Font writer: hand-written TTF (decided)
Owner: library if complex, manual if not. Assessment: a TrueType font with `glyf` outlines needs about ten fixed tables (`head`, `hhea`, `maxp`, `OS/2`, `name`, `cmap`, `post`, `glyf`, `loca`, `hmtx`). The fiddly parts are `glyf`/`loca` encoding and checksums, about 300 lines. Kerning and CFF output would be the complex part, and neither is in scope. So: manual, round-trip tested with Font Viewer's parser.
Rejected: opentype.js (new dependency, ~50 KB gz).

### Input: draw plus scan template (decided)
Draw each character in its box with pen, finger or mouse, on guides (baseline, x-height, cap height). Also: a printable template; fill it in by hand, photograph it, and the app finds the corner marks, straightens the page and crops each box.

### Scans are guides, not auto-traced (decided)
Owner: "image overlay so dont complicate it". Each box's crop shows faded behind the glyph canvas and you trace over it with strokes. No automatic tracer.
Rejected: auto-trace to contours (hand-written threshold, marching squares, RDP, quadratic fit); potrace as a wasm dependency.

### Strokes to outlines: expand strokes (decided)
Strokes are kept as `{x, y, pressure}` points. On export each is offset left and right by a pressure-based width, given round caps, simplified (RDP) and fitted to quadratics as a `glyf` contour. Overlapping contours are fine in TrueType. Editable with undo per stroke.
The glyph model holds strokes only (the "contours" kind was dropped with auto-trace):

```ts
interface Glyph { advance: number; strokes: Stroke[]; guide?: string }
```

### Project file plus export (decided)
A JSON `.fontmaker` file (strokes per character, metrics, name), opened through a file association (the Hopsprite pattern, ADR-039). Export writes a `.ttf`, which opens in Font Viewer.

### Character sets: presets (decided)
Ships Basic Latin (default), Central European, Latin-1 accents and Symbols. Empty boxes are left out of the font, so text falls back to another font.

### Shell: open only (decided)
`.fontmaker` opens through its association, so `open x.fontmaker` works. No commands.

### Guides stored in the project (decided)
Each box's crop is a small grayscale WebP data URL in `guide`, so one file holds everything (about 0.5 MB for 100 boxes). "Clear guides" removes them.
Rejected: a sidecar folder (moving one file without the other breaks it); not keeping them.

### Spacing: automatic plus nudges (decided)
`advance = ink bbox width + lsb + rsb`. The side bearing is a project setting (about 6 % of the em), each glyph has optional left and right nudges, and the editor shows width handles. Space has a fixed width.
Rejected: box width (monospace).

### Mobile (decided)
Drawing by finger works on both platforms. Desktop prints the template (`print_html`) or saves it as PNG. Mobile gets "Scan sheet", which opens the camera or gallery (`<input capture>`). One sheet per character set.

### Name (decided)
Font Maker, id `font-maker`.

## Key takeaways
- No dependencies: a hand-written TTF writer and stroke expansion.
- Scanning only helps you trace; every glyph ends up as strokes.

## Action items
- ADR-055 (Font Maker: `.fontmaker` format, TTF writer, stroke expansion, scan guides).
- Build: grid and editor, stroke expansion, TTF writer with round-trip tests through Font Viewer's parser, template print and save, scan (corner marks, perspective warp, crops), `docs/apps/font-maker.md`.

## Implemented

Built the same day: [ADR-055](../adrs/055-font-maker.md) (now Implemented, with a revision note on the choices it left open) and [docs/apps/font-maker.md](../apps/font-maker.md).

## Next session topics
- Kerning, auto-trace, OTF/CFF, variable weight from stroke width.
