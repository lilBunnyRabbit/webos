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
