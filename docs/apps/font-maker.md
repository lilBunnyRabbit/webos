# Font Maker

Id `font-maker` · Source: `src/lib/apps/user/font-maker/` · [brainstorm](../brainstorm/2026-10-20_font-maker.md) · [ADR-055](../adrs/055-font-maker.md), [ADR-039](../adrs/039-hopsprite.md) (file pattern)

## What it does

Turns handwriting into a font family. Each character of the picked sets has a box; draw in it with a pen, finger or mouse, or print a template, fill it in by hand, photograph it and trace over the scanned letter. One drawing gives every weight (Light, Regular, Bold, any of 100–900) and an italic; any letter can be redrawn for any face, upright or italic. A sample line previews the face you pick as it grows, kerned: pairs like AV and To close up on their own, and tapping between two letters there adjusts that pair. Export writes the family as a `.ttc`, one face as a `.ttf`, or a variable font, and "Use as app font" makes it the UI or code font. Burrow, the font WebOS ships, is a Font Maker project in the samples. Idea from LaxDOTexe.

## How it works

### Coordinates

Everything is in font units, y up from the baseline, `units_per_em` 1000. The drawing box is fixed: x 0…1000, y 950…−250 (`model.ts:106`), the same rectangle as a template box and a guide crop, so a stroke, a printed box and a scanned crop line up without any per-project mapping. `metrics.cap`, `x` and `descender` only place the guide lines (on screen and on the template) and go into `OS/2` as `sCapHeight` / `sxHeight`; the font's ascent and descent are always 950 / 250, so lines are 1.2 em tall.

### Strokes to outlines

`outline.ts`. A stroke is `[x, y, pressure][]`. The width is per font: `project.stroke.width`, 20–160, default 70 (`STROKE_WIDTH`), and it feeds the canvas, the live stroke, the grid and filmstrip thumbnails (the same pressure outlines as the canvas, through `glyph_contours`), the preview and the export, so changing it restyles everything already drawn. At export, and live while drawing so the canvas shows what ships:

| Step | What | Where |
|------|------|-------|
| Clean | Drop points closer than 3 units, resample to an even count along the stroke (its length over 12 % of the project width, at least 3 points), then three 1-2-1 smoothing passes over position and radius. Every weight of a glyph gets the count the regular strokes set | `outline.ts:138` |
| Radius | `width / 2 × (0.25 + 1.5 p)`: 35 units at p = 0.5 and width 70, 9–61 over the pressure range | `outline.ts:27` |
| Split | RDP the centreline at 6 units; every vertex turning more than 80° cuts the stroke there, so a V becomes two overlapping pieces instead of a self-intersecting offset | `outline.ts:101` |
| Offset | Each point moves ± its radius along the averaged normal. An offset point that would step backwards against the centreline is pinned to the last good one, which removes the swallowtails on the inner side of tight curves and keeps the point count the same at every weight | `outline.ts:192` |
| Caps | Half circles of 6 steps at both ends; a stroke shorter than half its radius is a dot (8 points) | `outline.ts:117`, `outline.ts:126` |
| Simplify | RDP each side at 1.5 units, per weight; a point any weight keeps is kept in all of them | `outline.ts:222` |
| Quadratics | Points are rounded to integers and wound clockwise; every point is off-curve, so TrueType's implied midpoints make the outline a quadratic B-spline, except vertices turning more than 70°, which stay on-curve | `outline.ts:265` |

Why resample and smooth three times: mouse and touch points sit on a pixel grid, so a slow stroke is a staircase of 2-unit steps. Offsetting that by a 50-unit radius swings each normal by up to 45° and beads the edges (seen on a slow, thick L). Even spacing tied to the width plus the passes flatten the steps before any offset; the RDP corner split still sees a real corner because it compares long chords. `outline.test.ts` checks that a pixel-staircase line keeps both long sides monotone and within 4 units of parallel.

### Pressure

`pressure.ts`, `font-maker-canvas.svelte`. A pen always sends its real `event.pressure`. Mouse and touch follow the app's Even / Speed toggle:

- **Even:** 0.5 everywhere.
- **Speed** (default): the PDF Tools signature-pad model, copied rather than shared. Speed between samples in font units per ms maps to a target pressure, 0.8 when still down to 0.1 at `max_speed` 5 or faster, and the value eases 35 % of the way toward each target, starting at 0.45. 5 units/ms is the signature pad's 2.2 scaled by the drawing box being about 2.2× its 600-unit width, so a stroke looks as thin and thick here as there.

The canvas keeps each sample's `event.timeStamp` only while the pointer is down; the live stroke and the committed one are the same `speed_pressures` output, rounded to 0.01 and written into each point's pressure. No timestamps reach the file, so switching the toggle changes only new strokes.

Why a B-spline over a least-squares quadratic fit: the offset polygon is already dense and smooth, the implied-midpoint rule is native to `glyf`, and it costs nothing. The curve passes slightly inside convex vertices (by a fraction of the 1.5-unit tolerance). Overlapping contours (strokes crossing, pieces of a split stroke) all wind the same way, so the nonzero fill rule unions them; no boolean path operations.

### Spacing

`build.ts:30`. `advance = ink width + 2 × bearing + lsb + rsb`, with the ink shifted so its left edge sits at `bearing + lsb`. The project bearing (default 60, about 6 % of the em) applies on each side; `lsb` and `rsb` are the per-glyph nudges, ±400. The handles and the − / + buttons appear only with the "Edit spacing" toggle on (app storage, off by default), so drawing near the box edges never grabs a handle; with it off the nudges still apply. With it on, both edges show as dashed handles: dragging one changes that side's nudge, the − / + buttons step it by 10, and "Reset to auto" (shown when a nudge exists) drops both. Space (and U+00A0) is a fixed 260.

### Kerning

`kerning.ts`, `build.ts` (`kern_pairs`), `font-maker-preview.svelte`. Auto kerning is measured per face at build time from the placed outlines (after the italic shear, at that weight's width), so every face gets its own pairs and nothing auto is stored.

- **Profiles.** Each glyph's contour points, as a closed polygon, are cut into 20-unit horizontal bands from y −1000 up; each band keeps the ink's leftmost and rightmost x, or nothing. The polygon includes off-curve points, which lie at most the 1.5-unit RDP tolerance outside the curve.
- **Pair.** Only bands where both glyphs have ink count: gap(y) = the left glyph's advance − its right edge + the right glyph's left edge. With `closest` the smallest gap and `mean` the mean of the gaps each capped at `closest + 80` (`DEPTH`, so a round side's hollow doesn't drag the pair in), `seen = 0.6 × closest + 0.4 × mean`, and the kern is `0.7 × (target − seen)` (`STRENGTH`: closes most of the difference, not all), never letting the closest ink come nearer than `0.6 × target` (`CLEARANCE`), clamped to ±120 and rounded. `target = 2 × bearing`, the gap two straight stems have. Kerns under 10 are dropped. "To" can tuck the o under the T's bar because the bar's bands have no o ink; glyphs sharing no band ("'" and ".") aren't kerned.
- **Which pairs.** Drawn letters, decimal digits and punctuation without a Unicode decomposition (`kerning_candidate`): accented letters would mostly repeat their base's pairs. Digit–digit pairs are skipped so tabular figures stay tabular, and punctuation–punctuation pairs so they don't crowd out letter pairs. Burrow's Regular measured 8411 auto pairs (17 ms in Node, 2026-10-21). Over the cap the strongest win.
- **Manual.** `kerning.pairs["AV"]` adds to the auto value (or stands alone with auto off) and may name any two drawn characters, accented ones included. A pair whose sum is 0 is dropped.
- **Table.** A legacy `kern` table, version 0, one format 0 subtable (coverage 0x0001, horizontal), pairs sorted by left then right glyph id. The subtable's length is a u16, so at most 10920 pairs (`MAX_KERN_PAIRS`), about 64 KB per face at the cap. `font-maker.browser.test.ts` proves Chromium applies it: "AV" with a −200 pair measures 100 px at 100 px against 120 px without the table. The table can't vary by weight, so a variable font carries its regular weight's pairs (GPOS would be needed for more; out of scope).
- **Editor.** The preview line is one text node; a tap or click finds the gap with `caret_at_point` (`$kit/utils/caret`: `caretPositionFromPoint`, or `caretRangeFromPoint` in Safari before 26.2), the two letters get a CSS Custom Highlight (`font-maker-kern`, one `Highlight` shared by all Font Maker windows, each adding only its own range), and ← → move the gap when the line has focus; Esc drops the picked pair. Under it: an Auto kerning switch, the pair with − / + (10 units, 44 px on touch), the total in use, "Auto n" and Reset (drops the manual value). The total comes from `auto_kern_of`, the same measurement the face writes. Every change is one undo step.

### TrueType writer

`ttf.ts`. Hand-written, about 570 lines, ten tables in tag order: `OS/2 cmap glyf head hhea hmtx loca maxp name post`, plus `kern` when the project kerns and `fvar` and `gvar` for a variable font.

| Table | Notes |
|-------|-------|
| `glyf` | Simple glyphs only. Flags without the repeat bit; deltas use the short form (1 byte with a sign flag) below 256, the same-as-previous bit for 0. Each glyph padded to 4 bytes |
| `loca` | Long offsets (`indexToLocFormat` 1) |
| `cmap` | One (3, 1) format 4 subtable; runs of consecutive codepoints with consecutive glyph ids share a segment through `idDelta`, `idRangeOffset` is always 0. BMP only, which every preset is |
| `hmtx` | One metric per glyph; `lsb` = the glyph's `xMin` (head flag bit 1) |
| `OS/2` | Version 4, `usWeightClass` = the face's weight, `fsSelection` ITALIC / BOLD (700 only) / REGULAR (upright and not 700) plus `USE_TYPO_METRICS`, typo and win metrics from the ascent and descent, Unicode range bits for the blocks the presets touch, code pages 1252 and 1250 |
| `name` | Windows (3, 1, 0x409). Regular, Italic, Bold and Bold Italic: ID 1 = project name, ID 2 = the style. Other weights: ID 1 = "Name Light", ID 2 = Regular or Italic, ID 16 = project name, ID 17 = the style. ID 4 full name, ID 6 PostScript name (ASCII letters, digits and `-`, then `-LightItalic` and so on). A variable font adds 256 "Weight" and one name per instance |
| `post` | Version 3, no glyph names; `italicAngle` = −slant for italic faces |
| `kern` | Version 0, one format 0 subtable; see Kerning. Left out when no pair is kerned |
| `head` | `macStyle` bold (700) and italic bits; `checkSumAdjustment` = `0xB1B0AFBA` − the whole font's checksum, written last. `hhea` caret slope 1000 : 1000·tan(slant) for italic |

Glyph 0 is `.notdef` (a box), glyph 1 the space; then every drawn character of the picked sets in set order. Empty boxes are left out, so text falls back to another font for them.

Checked by `build.test.ts` (Font Viewer's `read_font` reads family, style, weight, glyph count and codepoints back; every table checksum and the whole-font checksum hold; style bits per face) and `font-maker.browser.test.ts` (Chromium's `FontFace` loads it, which runs the font through its sanitizer, and `measureText` matches the advance). The collection and variable fonts were also read with fontTools 4.60 (every table decompiles; `instantiateVariableFont` at 300, 400, 550 and 700 gives growing advances and bounds), on 2026-10-21, not in CI.

### Weights and italic

`model.ts`, `build.ts:63`. A project lists its weights (`{ weight, scale }`, 100–900, scale 0.3–3 × the stroke width) and an optional italic slant. The **regular weight** is the listed weight nearest 400: its faces use the plain strokes, the canvas draws it by default, and a variable font's default instance sits there.

- **Redraws.** The editor's face picker lists every face: the weights, then their italics (Light 300 … Bold Italic 700). In any face but the regular one, the canvas shows what that face uses at its width; the first stroke drawn there copies the strokes it showed into a redraw and adds the new one. The regular weight's italic face draws `glyph.italic`, the shared italic redraw; every other weight draws `glyph.weights["700"]` upright and `glyph.italics["700"]` italic. A face uses its weight's italic redraw, else the shared italic redraw, else its weight's redraw, else the regular strokes (`face_strokes`, `model.ts`), so the shared italic serves every italic face that has none of its own. The reset button drops the redraw and names what the face falls back to ("Use Italic", "Use Bold", "Use regular"; `fallback_layer`). Clear in a redraw leaves an empty redraw, so that face has no ink for the letter until something is drawn or the redraw is dropped.
- **Italic.** Every italic face is the upright outline sheared by the slant around half the x-height, after spacing (`build.ts:48`), so italic advances equal upright ones and the letters lean about their middle. Italic redraws are drawn upright on the same canvas and slanted the same way.
- **Outlines line up across weights.** `outline_weights` outlines a glyph at all weights in one go (`glyph_masters` → `stroke_masters`, `outline.ts:287`): the regular strokes decide each stroke's sample count, where it splits at corners, whether it's a dot, its winding and which points stay on-curve. Every weight then has the same contours with the same point counts, so a static face and the variable font's instance at that weight are the same outline. A redraw with the same number of strokes stays compatible; a different count (or an empty redraw) doesn't, and those letters block the variable font.

### Families, collections and variable fonts

- **Family (`.ttc`).** `build_family` (`build.ts:174`) writes one face per weight, upright then italic, and packs them with `write_collection` (`$lib/core/utils/font-collection.ts`): a `ttcf` header, every face's table directory, then each face's tables. Tables aren't shared between faces.
- **One face (`.ttf`).** `build_face`; the preview uses it for the picked weight and italic toggle.
- **Variable font.** `build_variable` (`build.ts:192`), upright or italic. `fvar`: one `wght` axis from the lightest to the heaviest weight, default at the regular weight, an instance per listed weight. `gvar` (`gvar_table`, `ttf.ts:323`): for each glyph, one tuple per non-default weight with an embedded peak at its normalized position and an intermediate region reaching to its neighbours (or 0), so weights in between interpolate between the two nearest masters. Deltas cover every point (shared point numbers "all") plus the four phantom points, where the second carries the advance change. No `HVAR`, `avar` or `STAT`. `variable_blockers` lists letters that block it; Export says which.
- **Chromium loads only the first face of a collection.** Measured in `font-maker.browser.test.ts`: a `FontFace` from the `.ttc` renders the first (Light) face whatever weight is asked. `split_collection` rebuilds each face as a standalone font, byte for byte what `build_face` writes; Settings registers each with `FontFace(family, bytes, { weight, style })`.
- **Use as app font.** Export › Use as app font › UI font or Code font builds the family and calls `SettingsService.use_font(role, file)`, which copies `{Name}.ttc` to `/etc/fonts/` and applies it. Applying again after editing replaces the copy.

### Burrow

WebOS's own font: a monoline, rounded-cap family (Light 300, Regular 400, Bold 700, each upright and italic) drawn as a real `.fontmaker` project (`src/lib/core/api/services/version/samples/Burrow.fontmaker`, seeded into `Samples` on first boot) and built by this code into `src/assets/fonts/burrow/burrow.ttc`, `burrow-vf.ttf` and `burrow-italic-vf.ttf` (imported with `?url`, so the deployed names are content-hashed; `burrow.browser.test.ts` reads them the same way). Metrics: cap 700, x-height 520, descender 210, ascender ink 745, bearing 62, stroke width 76 with Light × 0.62 and Bold × 1.58, slant 9°.

- The strokes came from a generator script (kept out of the repo): centrelines of lines, superellipse arcs and cubics. Every letter of Light and Bold is a redraw with the same strokes moved inward by the weight's half-width, so x-height, cap height and baseline stay put as the line gets thicker (scaling the width alone would push Bold ink 21 units past every guide). The redraws keep the stroke counts, so the variable font builds.
- Character: round caps everywhere, dots 18 % heavier than the stroke (`i`, `j`, punctuation, diaeresis), a tail on `l` and `t`, a double-storey `a` upright and a single-storey `a` as the only italic redraw, with Light Italic and Bold Italic versions moved inward like the weight redraws (before them the Bold Italic `a` stood 22 units above and 23 below the Bold Italic `o`, the Light Italic one 15 and 14 inside; now 0 to 1). Digits are tabular within a unit at Regular (nudges set from each digit's ink width); the `1` has a foot so it fills that width instead of floating in it. Superscripts, ordinals, fractions and `™` are scaled-down letters drawn at pressure 0.3 (a line about 0.7× as wide), so they stay open at Bold instead of filling in. Bold `ª` and `º` go lighter still (pressure 0.22) with their underline lowered to y=292, so the bar's top ink stays at 327 as in Regular and the gap to the bowl is 49–51 units (Regular 44, Light 56); moved with the bowl's inward shift alone, the Bold bar sat 27 units under it and the two merged.
- Covers all four sets (283 characters). Accented letters are the base strokes plus mark strokes from the Unicode decomposition (`ı` and `ȷ` under marks on i and j; ď ľ ť Ľ get an apostrophe).
- **Byte check.** `burrow.browser.test.ts` builds the sample with the date `2026-10-21` and compares it with the three shipped files. Builds are deterministic per JavaScript engine, not across them: Bun (JavaScriptCore) rounds some `Math.sin` / `Math.tan` results differently from V8, which moves a few rounded points. The shipped files are built under V8 (Vitest in Node or Chromium), the same engine the app runs in.

### Template and scan

`template.ts`, `scan.ts`, `scan-image.ts`, `font-maker-scan.svelte`; the shared math is in `$kit/utils/perspective` and the corner step's handles are the kit's `QuadFrame`.

- **Sheet.** A4, one sheet per set, 10 columns of 16.4 × 19.7 mm boxes with the character above each and the guide lines inside. Four solid 8 mm squares sit 10 mm in from the corners; the top-left one has a white hole a third of its size, so a photo taken sideways or upside down still reads in the right order. Printed through `print_html`, or saved as a 150 dpi PNG drawn on a canvas from the same layout.
- **Find the marks** (`find_marks`, `scan.ts:17`). The photo is scaled to at most 1600 px and turned grayscale. Adaptive threshold (`dark_mask` in the kit): dark is below 72 % of the mean over a window of 1/8 of the long side (from an integral image), so uneven light doesn't matter and the inside of an 8 mm square still counts as dark. Connected blobs (the kit's `regions`, a 4-neighbour flood fill); keep the ones not touching the image edge (the table around the sheet), between 1.2 % and 15 % of the short side across, roughly square, at least 40 % filled. The biggest in each quadrant is a mark; their areas must be within 5× of each other. The one whose centre is light is the top left.
- **Straighten** (`homography` in `$kit/utils/perspective`). A hand-written homography from the four mark centres in mm to the photo, solved as the 8 × 8 linear system with Gaussian elimination.
- **Crop** (`crop_box`, `scan.ts:46`). Each box is sampled bilinearly through the homography into 100 × 120 px, then stretched so the 90th-percentile pixel (the paper) becomes white. A box counts as written when over 0.3 % of its inner 88 % is below half grey; printed guide lines are light enough to stay above that. Written boxes become WebP data URLs (quality 0.6) in `guide`.
- **Fallback.** The corner step (`QuadFrame`) always shows the photo with four 44 px handles on the found corners, or 8 % in from the image corners when finding failed; drag or arrow-key them onto the squares.

Guides show at 40 % behind the canvas and the grid cells through an SVG mask with an inverting filter, so the ink takes the theme's `foreground` in light and dark themes alike. Scans are never traced automatically (ADR-055).

### Editing

`editor.svelte.ts`. One `History<FontProject>` (`$kit/utils/history`, 200 entries): every stroke, clear, nudge, width change, guide import and settings change is one step, and undo works across characters. The width slider shows a draft while it's dragged and commits one step on `change`. Undo is in the top toolbar, as a labelled button next to Clear, and on touch as a two-finger tap on the canvas: the second finger cancels the first finger's live stroke, and both lifting within 350 ms of the first touch, each moved less than 12 px, undoes.

- **Filmstrip** (`font-maker-filmstrip.svelte`): every character of the sets in a scroll-snapped row under the canvas, 40 × 48 px tiles. The current one is highlighted and scrolled to the middle on change; swipe or scroll to browse, tap to jump. ‹ › and `[` `]` still step.
- **Ghost:** an empty box shows its character in `--font-sans` at low opacity on the baseline, its font size set to the cap height with `font-size-adjust: cap-height 1` so its capitals match the project's cap height; lowercase and digits follow the font's own proportions (one size for everything, no per-case heuristic). A scan guide replaces it. Empty filmstrip tiles use the same ghost through `font-maker-glyph.svelte`, which also draws the grid thumbnails. The project is immutable and unchanged glyphs are shared between entries. Dirty is "current entry is not the saved one", so undoing back to the saved state clears the dot.

## Data

- **`.fontmaker`**, UTF-8 JSON, format version 3: `{ version: 3, name, sets, metrics: { em: 1000, cap, x, descender, bearing }, stroke?: { width }, weights: { weight, scale }[], italic: { slant } | null, kerning?: { auto, pairs?: { "AV": -20 } }, glyphs: { [char]: { strokes, lsb?, rsb?, guide?, weights?: { "700": strokes }, italic?: strokes, italics?: { "700": strokes } } } }`. `stroke` is optional (older files have none and draw at 70) and is an integer 20–160; weights are 100–900 in hundreds, unique, scale 0.3–3; slant 0–25°. `kerning` is written by new projects as `{ auto: true }`; a file without it (every file from before kerning, Burrow's sample included) builds no `kern` table until Auto is switched on or a pair is set. Pair keys are two characters, values integers ±400. Version 1 files (no `weights`, no `italic`) open with Regular 400 × 1, Bold 700 × 1.7 and a 10° italic; version 1 and 2 files save as version 3. Version 3 added `italics` and `kerning`; the bump exists so an older Font Maker refuses the file instead of dropping the new fields on save. Stroke points are rounded to 0.1 unit and pressure to 0.01 on save. Parsed with zod (`format.ts:44`): a newer `version` is refused ("made by a newer Font Maker"), keys must be one character, `x` may not exceed `cap`. Opened through the `.fontmaker` association (`FILE_PROPS`, `path`); Save / Save as / the dirty close guard follow Hopsprite.
- **Export**: Font family (`.ttc`, `font/collection`), One face (`.ttf`, named `{Name}-BoldItalic.ttf` and so on), Variable font (`{Name}-VF.ttf`, `{Name}-Italic-VF.ttf`), each asking where, starting next to the project. Use as app font writes nothing in `/home`: Settings keeps its copy in `/etc/fonts/`.
- **App storage:** `app.font-maker.sample` (the preview text), `app.font-maker.show-guide`, `app.font-maker.pressure` (`even` | `speed`), `app.font-maker.edit-spacing`.
- One B guide measured 1.7 KB as a data URL (2026-10-20, Chromium, the template PNG warped and re-photographed in a test page); a full sheet of guides is unmeasured.

## Dependencies & licences

None. zod is already approved (ADR-008).

## Limits

- One stroke width per face, not per stroke; OTF/CFF, hinting, `HVAR`/`STAT`, GPOS and auto-trace are out (ADR-055).
- Kerning can't vary by weight in a variable font (regular weight's pairs throughout), and at the 10920-pair cap a face carries about 64 KB of `kern`. Auto kerning reads only horizontal bands both letters share, so it doesn't see diagonal closeness between bands; the clearance and the ±120 cap bound the damage.
- A redraw with a different number of strokes blocks the variable font for that style; static faces always build.
- CSS asking for a weight the family doesn't have (500 between 400 and 700) gets the nearest face, not an interpolation, unless the variable font is used.
- Characters outside the four presets can't be added, and only BMP codepoints fit the format 4 `cmap`.
- No hinting: small sizes rely on the rasteriser.
- Corner finding was checked on synthetic photos (tilted, rotated 180°, rotated 4.6° on a grey table) only; real phone photos with shadows and glare are untested. Detection fails over to manual corners.
- A sheet scanned as the wrong set puts guides on the wrong characters: the set is picked by hand in the corner step.
- Two windows on one file don't sync; the last save wins.

## Decisions

- [Brainstorm 2026-10-20](../brainstorm/2026-10-20_font-maker.md): hand-written writer, draw plus scan, guides not auto-trace, presets, open-only shell.
- [ADR-055](../adrs/055-font-maker.md): file format, writer, stroke expansion, scan guides, and its implementation revision.
- [Brainstorm 2026-10-21](../brainstorm/2026-10-21_font-maker-pen.md): line width in the file, speed pressure, Edit spacing, Undo, filmstrip, ghost, bead fix.
- [Brainstorm 2026-10-21, kerning](../brainstorm/2026-10-21_font-maker-kerning.md): Bold ordinals, italics per weight, format 3, kerning.
- [Brainstorm 2026-10-21, app font](../brainstorm/2026-10-21_app-font.md): Use as app font, families (weights, italic, `.ttc`, variable), Burrow; ADR-055 revision of the same day.
