# ADR-055: Font Maker
**Date:** 2026-10-20
**Status:** Implemented

## Context
L4X asked for a font maker in the style of the old online tools: write each letter into a box and get a working font back. Nothing in WebOS writes fonts or keeps vector strokes. Font Viewer parses TTF by hand and can check the output. Discussion: [brainstorm](../brainstorm/2026-10-20_font-maker.md).

## Decision
A new user app, **Font Maker** (`font-maker`).

- **Project file.** JSON `.fontmaker`, opened through a file association (the Hopsprite pattern, ADR-039):
  ```ts
  interface FontProject {
    version: 1;
    name: string;
    sets: CharSetId[];               // basic-latin | central-european | latin-1 | symbols
    metrics: { em: 1000; cap: number; x: number; descender: number; bearing: number };
    glyphs: Record<string, Glyph>;  // key = the character
  }
  interface Glyph { strokes: Stroke[]; lsb?: number; rsb?: number; guide?: string } // guide = WebP data URL
  type Stroke = [x: number, y: number, pressure: number][];
  ```
- **Input.** Draw in each box with pen, finger or mouse, on baseline, x-height and cap guides. A printable template (`print_html` or PNG) is filled in by hand, then scanned (camera or gallery on mobile). Corner marks are found, the page is straightened, and each box's crop is stored as that glyph's faded `guide`. Scans are traced by hand, never automatically.
- **Outlines.** At export each stroke is offset by a pressure-based width, given round caps, simplified (RDP) and fitted to quadratic contours. Overlapping contours are allowed.
- **Spacing.** `advance = bbox + bearing + lsb/rsb nudges`; space has a fixed width.
- **Export.** A hand-written TrueType writer (`head hhea maxp OS/2 name cmap post glyf loca hmtx`, with checksums). Empty glyphs are left out of `cmap`. The output `.ttf` opens in Font Viewer.
- **Shell.** Only `open` through the association; no commands.

## Alternatives Considered
- opentype.js for writing: a dependency (~50 KB gz) when only a small subset of the format is needed.
- Automatic tracing of scans (hand-written or potrace wasm): more code, blobbier results; tracing by hand over a guide is enough.
- Sidecar folder for guides: moving one file without the other breaks it.
- Monospace box widths: proportional text looks wrong.

## Consequences
- No new dependencies. The TTF writer and stroke expansion live in the app, tested in Node, with round-trip tests through Font Viewer's parser.
- A project with guides is about 0.5 MB.
- Kerning, OTF/CFF, auto-trace and variable weight are left for later.

## Revision 2026-10-20: implementation

Built as decided ([app page](../apps/font-maker.md)). Choices the decision left open, and where the code differs:

- **Fixed drawing box.** Strokes live in a fixed box, x 0…1000 and y 950…−250 in font units, shared by the canvas, the template boxes and the guide crops. The font's ascent and descent are always 950 / 250; `metrics.cap`, `x` and `descender` place the guide lines and fill `OS/2` cap and x-height, but don't move the box.
- **Bearing on both sides.** `advance = bbox + 2 × bearing + lsb + rsb`: the project bearing applies left and right, the nudges are per side (±400).
- **Quadratic fit.** The RDP-simplified offset outline is written with every point off-curve, so TrueType's implied midpoints make it a quadratic B-spline; only vertices turning more than 70° stay on-curve. Strokes are also split at corners sharper than 80° into overlapping pieces, so no contour intersects itself.
- **Stroke weight.** One fixed weight: radius 35 units at mid pressure, scaled 0.25–1.75× by pen pressure; mouse and touch draw at mid pressure.
- **Extra glyphs.** Glyph 0 is a box `.notdef`; space also maps U+00A0.
- **Orientation mark.** The template's top-left mark has a white hole, so a sideways or upside-down photo still maps to the right corners.
- **Camera.** "Take a photo" calls `pick_device_files({ accept: ["image/*"], capture: "environment" })` (the `capture` option was added on 2026-10-21, replacing a local copy).

## Revision 2026-10-21: width, speed pressure, spacing toggle
- `FontProject` gains an optional `stroke?: { width: number }` (20..160, default 70), still format version 1. It drives drawing, the preview and the export ([brainstorm](../brainstorm/2026-10-21_font-maker-pen.md)).
- Mouse and touch strokes can take pressure from speed, using the PDF Tools signature-pad model (fast is thin, smoothed). It is baked into each point's pressure value at draw time. A pen always uses real pressure. The Even / Speed choice is app storage.
- The side-bearing handles appear only in "Edit spacing" mode (app storage, off by default), which also offers Reset to auto. Nudges apply whether the mode is on or off.
- An "Undo" button sits next to Clear on the existing history; on touch, a two-finger tap on the canvas undoes too and cancels the stroke the first finger started.
- A filmstrip of every character in the sets sits under the canvas: scroll-snapped, the current one centred and highlighted, tap to jump.
- An empty box shows a ghost of its character in the UI font on the baseline, one size for all characters with its cap height at the project's cap height (lowercase follows the font's own proportions); a scan guide replaces it. Empty filmstrip tiles show the same ghost.
- Bead fix: slow mouse strokes sit on a pixel staircase, and offsetting it by a wide radius swung the normals and beaded the edges. Samples are now resampled at even spacing (12 % of the width) and smoothed three times before offsetting, so the canvas, preview and export stay smooth.
- Build notes: the speed range is pressure 0.1..0.8 (start 0.45), `max_speed` 5 font units per ms; the Left / Right nudge row shows only in Edit spacing mode, with Reset to auto there when a nudge exists; width slider drags preview live and commit one undo step on release.

## Revision 2026-10-21: families, weights, italic, app font
Decided in [the app-font brainstorm](../brainstorm/2026-10-21_app-font.md) (follow-up section). A project is now a family:

- **Format version 2.** `weights: { weight, scale }[]` (100–900, scale × the stroke width, default Regular 400 × 1 and Bold 700 × 1.7) and `italic: { slant } | null` (default 10°). A glyph may carry `weights: { "700": Stroke[] }` (a redraw for one weight) and `italic: Stroke[]` (one redraw for every italic face). Version 1 files open with the defaults and save as version 2; a version 3 file is refused.
- **Which strokes a face uses.** Italic redraw, else the weight's redraw, else the regular strokes. The regular weight is the listed weight nearest 400; its faces use the plain strokes and it's the variable font's default. Italic redraws are drawn upright and slanted with everything else (a shear around half the x-height, after spacing, so italic advances equal upright ones).
- **Point-compatible outlines.** Every weight of a glyph is outlined together: the regular strokes set each stroke's sample count, corner cuts, dots, winding and on-curve flags; samples are evenly spaced by count, offset points that would step backwards are pinned instead of dropped, and RDP keeps a point any weight needs. Same strokes at different widths therefore give the same points, and so does a redraw with the same number of strokes. A redraw with a different stroke count (or an empty one) blocks the variable font, and the export names those letters.
- **Build.** One face per weight and style with `usWeightClass`, `fsSelection`, `macStyle`, `post.italicAngle`, the caret slope and names (IDs 1/2 for Regular, Italic, Bold, Bold Italic; IDs 16/17 for other weights). The family is a TrueType Collection (`.ttc`); single faces export as `.ttf`; a variable font adds `fvar` (one `wght` axis, an instance per weight) and `gvar` (one tuple per non-default weight with an intermediate region to its neighbours, deltas for every point plus the advance phantom point). No `HVAR` or `STAT`: Chromium and fontTools take advances from the phantom points.
- **Chromium and collections.** `FontFace` loads a `.ttc` but only its first face (measured: a 700-weight lookup on the collection rendered the 300 face). `split_collection` in `$lib/core/utils/font-collection.ts` rebuilds each face as a standalone font; Settings registers each with its weight and style.
- **Use as app font.** Export › Use as app font › UI font / Code font builds the family and hands it to Settings, which copies it to `/etc/fonts/` (ADR-015 revision).
- **Burrow.** WebOS's own font is a Font Maker project (`Burrow.fontmaker` in the samples), built by this code into `public/fonts/` and checked byte for byte by `burrow.browser.test.ts`. Builds are deterministic per JavaScript engine: Bun (JavaScriptCore) rounds some `Math.sin` / `Math.tan` results differently from V8, so the shipped files are built under V8 (Node or Chromium).

## Revision 2026-10-21: italic redraw per weight, format 3
Decided in [the kerning brainstorm](../brainstorm/2026-10-21_font-maker-kerning.md) (item D). One italic redraw served every weight and won over the weight's own redraw, so Burrow's Bold Italic `a` sat 22 units above the x-height and below the baseline.

- **Format version 3.** A glyph may carry `italics: { "700": Stroke[] }`, an italic redraw for one weight, beside `italic`. A face takes `italics[w]`, else `italic`, else `weights[w]`, else the regular strokes. Version 1 and 2 files open and save as version 3; older Font Makers refuse a version 3 file ("made by a newer Font Maker") instead of dropping the redraws on save. Kerning adds an optional field to the same version 3.
- **Which layer draws what** (build decision). The face picker lists every face (Light 300 … Bold Italic 700). The regular weight's italic face draws `italic`, the shared redraw, so it keeps serving every italic face without its own; every other italic face draws `italics[w]`. An untouched layer shows what its face falls back to, the first stroke copies that, and the reset button names the fallback ("Use Italic", "Use Bold", "Use regular").
- **Variable font.** Unchanged rule: an italic redraw with the regular strokes' stroke count keeps the italic variable font.
- **Burrow.** Light Italic and Bold Italic `a` redraws: the italic `a` moved inward by the weight's half-width like the other weight redraws, so the ink sits on the x-height and baseline at every weight.

## Revision 2026-10-21: kerning
Decided in [the kerning brainstorm](../brainstorm/2026-10-21_font-maker-kerning.md) (item A).

- **Table.** A legacy `kern` table (version 0, one format 0 subtable) in every face, each `.ttc` face included. A browser test proved Chromium applies it before anything else was built. The variable fonts carry their regular weight's pairs: `kern` can't vary by weight, GPOS stays out.
- **Auto.** Measured per face at build time from the placed outlines (italic shear and weight width included), nothing stored: 20-unit band profiles, gap(y) over bands both glyphs share, kern = 0.7 × (2 × bearing − (0.6 × closest + 0.4 × depth-capped mean)), closest ink kept at 0.6 × the target or more, ±120, |k| ≥ 10 kept. Letters, digits and punctuation without a decomposition; no digit–digit or punctuation–punctuation pairs. At most 10920 pairs (the format 0 length is a u16); the strongest win.
- **Format.** `kerning?: { auto: boolean; pairs?: Record<string, number> }` in format 3, no further bump. Manual pairs add on top of auto. New projects write `{ auto: true }`; a file without the field builds no `kern` table, so the shipped Burrow fonts stay byte-identical (Burrow's own kerning isn't decided).
- **UI** (build decisions within the brainstorm's): the pair is picked with `caretPositionFromPoint` on the preview line and marked with a CSS Custom Highlight; ← → move it from the keyboard; the row shows the total in use and the auto part. Details in [the app page](../apps/font-maker.md#kerning).

## Revision 2026-10-21: hashed Burrow URLs (health pass)
The built files moved from `public/fonts/` to `src/assets/fonts/burrow/` and are imported with `?url`, so their deployed names carry a content hash. The service worker caches them CacheFirst, and an unversioned URL meant a rebuilt Burrow never reached an install that had cached it. `burrow.browser.test.ts` reads them through the same imports. `burrow.ttc` stays in the repo for the byte check and is no longer deployed (nothing linked it).
