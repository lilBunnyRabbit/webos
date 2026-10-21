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
