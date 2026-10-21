# Font Maker

Id `font-maker` · Source: `src/lib/apps/user/font-maker/` · [brainstorm](../brainstorm/2026-10-20_font-maker.md) · [ADR-055](../adrs/055-font-maker.md), [ADR-039](../adrs/039-hopsprite.md) (file pattern)

## What it does

Turns handwriting into a TrueType font. Each character of the picked sets has a box; draw in it with a pen, finger or mouse, or print a template, fill it in by hand, photograph it and trace over the scanned letter. A sample line previews the font as it grows, and Export writes a `.ttf` that Font Viewer, documents and other apps can use. Idea from LaxDOTexe.

## How it works

### Coordinates

Everything is in font units, y up from the baseline, `units_per_em` 1000. The drawing box is fixed: x 0…1000, y 950…−250 (`model.ts:54`), the same rectangle as a template box and a guide crop, so a stroke, a printed box and a scanned crop line up without any per-project mapping. `metrics.cap`, `x` and `descender` only place the guide lines (on screen and on the template) and go into `OS/2` as `sCapHeight` / `sxHeight`; the font's ascent and descent are always 950 / 250, so lines are 1.2 em tall.

### Strokes to outlines

`outline.ts`. A stroke is `[x, y, pressure][]`. The width is per font: `project.stroke.width`, 20–160, default 70 (`STROKE_WIDTH`), and it feeds the canvas, the live stroke, the grid and filmstrip thumbnails (the same pressure outlines as the canvas, through `glyph_contours`), the preview and the export, so changing it restyles everything already drawn. At export, and live while drawing so the canvas shows what ships:

| Step | What | Where |
|------|------|-------|
| Clean | Drop points closer than 3 units, resample at even spacing of 12 % of the width (at least 3 units), then three 1-2-1 smoothing passes over position and radius | `outline.ts:115` |
| Radius | `width / 2 × (0.25 + 1.5 p)`: 35 units at p = 0.5 and width 70, 9–61 over the pressure range | `outline.ts:27` |
| Split | RDP the centreline at 6 units; every vertex turning more than 80° cuts the stroke there, so a V becomes two overlapping pieces instead of a self-intersecting offset | `outline.ts:101` |
| Offset | Each point moves ± its radius along the averaged normal. An offset point that would step backwards against the centreline is dropped, which removes the swallowtails on the inner side of tight curves | `outline.ts:134` |
| Caps | Half circles of 6 steps at both ends; a stroke shorter than half its radius is a dot (8 points) | `outline.ts:117`, `outline.ts:126` |
| Simplify | RDP each side at 1.5 units | `outline.ts:149` |
| Quadratics | Points are rounded to integers and wound clockwise; every point is off-curve, so TrueType's implied midpoints make the outline a quadratic B-spline, except vertices turning more than 70°, which stay on-curve | `outline.ts:186` |

Why resample and smooth three times: mouse and touch points sit on a pixel grid, so a slow stroke is a staircase of 2-unit steps. Offsetting that by a 50-unit radius swings each normal by up to 45° and beads the edges (seen on a slow, thick L). Even spacing tied to the width plus the passes flatten the steps before any offset; the RDP corner split still sees a real corner because it compares long chords. `outline.test.ts` checks that a pixel-staircase line keeps both long sides monotone and within 4 units of parallel.

### Pressure

`pressure.ts`, `font-maker-canvas.svelte`. A pen always sends its real `event.pressure`. Mouse and touch follow the app's Even / Speed toggle:

- **Even:** 0.5 everywhere.
- **Speed** (default): the PDF Tools signature-pad model, copied rather than shared. Speed between samples in font units per ms maps to a target pressure, 0.8 when still down to 0.1 at `max_speed` 5 or faster, and the value eases 35 % of the way toward each target, starting at 0.45. 5 units/ms is the signature pad's 2.2 scaled by the drawing box being about 2.2× its 600-unit width, so a stroke looks as thin and thick here as there.

The canvas keeps each sample's `event.timeStamp` only while the pointer is down; the live stroke and the committed one are the same `speed_pressures` output, rounded to 0.01 and written into each point's pressure. No timestamps reach the file, so switching the toggle changes only new strokes.

Why a B-spline over a least-squares quadratic fit: the offset polygon is already dense and smooth, the implied-midpoint rule is native to `glyf`, and it costs nothing. The curve passes slightly inside convex vertices (by a fraction of the 1.5-unit tolerance). Overlapping contours (strokes crossing, pieces of a split stroke) all wind the same way, so the nonzero fill rule unions them; no boolean path operations.

### Spacing

`build.ts:12`. `advance = ink width + 2 × bearing + lsb + rsb`, with the ink shifted so its left edge sits at `bearing + lsb`. The project bearing (default 60, about 6 % of the em) applies on each side; `lsb` and `rsb` are the per-glyph nudges, ±400. The handles and the − / + buttons appear only with the "Edit spacing" toggle on (app storage, off by default), so drawing near the box edges never grabs a handle; with it off the nudges still apply. With it on, both edges show as dashed handles: dragging one changes that side's nudge, the − / + buttons step it by 10, and "Reset to auto" (shown when a nudge exists) drops both. Space (and U+00A0) is a fixed 260.

### TrueType writer

`ttf.ts`. Hand-written, about 400 lines, ten tables in tag order: `OS/2 cmap glyf head hhea hmtx loca maxp name post`.

| Table | Notes |
|-------|-------|
| `glyf` | Simple glyphs only. Flags without the repeat bit; deltas use the short form (1 byte with a sign flag) below 256, the same-as-previous bit for 0. Each glyph padded to 4 bytes |
| `loca` | Long offsets (`indexToLocFormat` 1) |
| `cmap` | One (3, 1) format 4 subtable; runs of consecutive codepoints with consecutive glyph ids share a segment through `idDelta`, `idRangeOffset` is always 0. BMP only, which every preset is |
| `hmtx` | One metric per glyph; `lsb` = the glyph's `xMin` (head flag bit 1) |
| `OS/2` | Version 4, weight 400, `USE_TYPO_METRICS`, typo and win metrics from the ascent and descent, Unicode range bits for the blocks the presets touch, code pages 1252 and 1250 |
| `name` | Windows (3, 1, 0x409) IDs 1–6: family = project name, "Regular", a unique id, full name, "Version 1.000", a PostScript name (ASCII letters, digits and `-`, plus `-Regular`) |
| `post` | Version 3, no glyph names |
| `head` | `checkSumAdjustment` = `0xB1B0AFBA` − the whole font's checksum, written last |

Glyph 0 is `.notdef` (a box), glyph 1 the space; then every drawn character of the picked sets in set order. Empty boxes are left out, so text falls back to another font for them.

Checked by `build.test.ts` (Font Viewer's `read_font` reads family, style, weight, glyph count and codepoints back; every table checksum and the whole-font checksum hold) and `font-maker.browser.test.ts` (Chromium's `FontFace` loads it, which runs the font through its sanitizer, and `measureText` matches the advance).

### Template and scan

`template.ts`, `scan.ts`, `scan-image.ts`.

- **Sheet.** A4, one sheet per set, 10 columns of 16.4 × 19.7 mm boxes with the character above each and the guide lines inside. Four solid 8 mm squares sit 10 mm in from the corners; the top-left one has a white hole a third of its size, so a photo taken sideways or upside down still reads in the right order. Printed through `print_html`, or saved as a 150 dpi PNG drawn on a canvas from the same layout.
- **Find the marks** (`scan.ts:108`). The photo is scaled to at most 1600 px and turned grayscale. Adaptive threshold: dark is below 72 % of the mean over a window of 1/8 of the long side (from an integral image), so uneven light doesn't matter and the inside of an 8 mm square still counts as dark. Connected blobs (4-neighbour flood fill); keep the ones not touching the image edge (the table around the sheet), between 1.2 % and 15 % of the short side across, roughly square, at least 40 % filled. The biggest in each quadrant is a mark; their areas must be within 5× of each other. The one whose centre is light is the top left.
- **Straighten** (`scan.ts:137`). A hand-written homography from the four mark centres in mm to the photo, solved as the 8 × 8 linear system with Gaussian elimination.
- **Crop** (`scan.ts:182`). Each box is sampled bilinearly through the homography into 100 × 120 px, then stretched so the 90th-percentile pixel (the paper) becomes white. A box counts as written when over 0.3 % of its inner 88 % is below half grey; printed guide lines are light enough to stay above that. Written boxes become WebP data URLs (quality 0.6) in `guide`.
- **Fallback.** The corner step always shows the photo with four 44 px handles on the found corners, or 8 % in from the image corners when finding failed; drag or arrow-key them onto the squares.

Guides show at 40 % behind the canvas and the grid cells through an SVG mask with an inverting filter, so the ink takes the theme's `foreground` in light and dark themes alike. Scans are never traced automatically (ADR-055).

### Editing

`editor.svelte.ts`. One `History<FontProject>` (`$kit/utils/history`, 200 entries): every stroke, clear, nudge, width change, guide import and settings change is one step, and undo works across characters. The width slider shows a draft while it's dragged and commits one step on `change`. Undo is in the top toolbar, as a labelled button next to Clear, and on touch as a two-finger tap on the canvas: the second finger cancels the first finger's live stroke, and both lifting within 350 ms of the first touch, each moved less than 12 px, undoes.

- **Filmstrip** (`font-maker-filmstrip.svelte`): every character of the sets in a scroll-snapped row under the canvas, 40 × 48 px tiles. The current one is highlighted and scrolled to the middle on change; swipe or scroll to browse, tap to jump. ‹ › and `[` `]` still step.
- **Ghost:** an empty box shows its character in `--font-sans` at low opacity on the baseline, its font size set to the cap height with `font-size-adjust: cap-height 1` so its capitals match the project's cap height; lowercase and digits follow the font's own proportions (one size for everything, no per-case heuristic). A scan guide replaces it. Empty filmstrip tiles use the same ghost through `font-maker-glyph.svelte`, which also draws the grid thumbnails. The project is immutable and unchanged glyphs are shared between entries. Dirty is "current entry is not the saved one", so undoing back to the saved state clears the dot.

## Data

- **`.fontmaker`**, UTF-8 JSON, the ADR's shape: `{ version: 1, name, sets, metrics: { em: 1000, cap, x, descender, bearing }, stroke?: { width }, glyphs: { [char]: { strokes, lsb?, rsb?, guide? } } }`. `stroke` is optional (older files have none and draw at 70) and is an integer 20–160. Stroke points are rounded to 0.1 unit and pressure to 0.01 on save. Parsed with zod (`format.ts:38`): a newer `version` is refused ("made by a newer Font Maker"), keys must be one character, `x` may not exceed `cap`. Opened through the `.fontmaker` association (`FILE_PROPS`, `path`); Save / Save as / the dirty close guard follow Hopsprite.
- **`.ttf`**: Export asks where, starting next to the project.
- **App storage:** `app.font-maker.sample` (the preview text), `app.font-maker.show-guide`, `app.font-maker.pressure` (`even` | `speed`), `app.font-maker.edit-spacing`.
- One B guide measured 1.7 KB as a data URL (2026-10-20, Chromium, the template PNG warped and re-photographed in a test page); a full sheet of guides is unmeasured.

## Dependencies & licences

None. zod is already approved (ADR-008).

## Limits

- One stroke width per font, not per stroke; kerning, OTF/CFF and auto-trace are out (ADR-055).
- Characters outside the four presets can't be added, and only BMP codepoints fit the format 4 `cmap`.
- No hinting: small sizes rely on the rasteriser.
- Corner finding was checked on synthetic photos (tilted, rotated 180°, rotated 4.6° on a grey table) only; real phone photos with shadows and glare are untested. Detection fails over to manual corners.
- A sheet scanned as the wrong set puts guides on the wrong characters: the set is picked by hand in the corner step.
- Two windows on one file don't sync; the last save wins.

## Decisions

- [Brainstorm 2026-10-20](../brainstorm/2026-10-20_font-maker.md): hand-written writer, draw plus scan, guides not auto-trace, presets, open-only shell.
- [ADR-055](../adrs/055-font-maker.md): file format, writer, stroke expansion, scan guides, and its implementation revision.
- [Brainstorm 2026-10-21](../brainstorm/2026-10-21_font-maker-pen.md): line width in the file, speed pressure, Edit spacing, Undo, filmstrip, ghost, bead fix.
