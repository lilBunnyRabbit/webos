# Font Maker: line width, speed pressure, spacing toggle
**Date:** 2026-10-21
**Participants:** owner, Claude

## Context
Owner, from using Font Maker on desktop:
- the line width can't be set;
- they want the signature pad's pressure system, plus pen pressure;
- they keep hitting the side borders by accident while drawing.

What exists today:
- The width is fixed at `STROKE_WIDTH = 70` (`font-maker/model.ts`).
- Mouse and touch strokes get a constant `DEFAULT_PRESSURE = 0.5`, and a pen sends its real pressure (`font-maker-canvas.svelte`).
- PDF Tools' signature pad (`pdf-tools/stroke.ts`, `stroke_widths`) uses pen pressure when there is any. Otherwise it maps speed to width (fast is thin) between a minimum and maximum, smoothed at 0.35.
- The side-bearing handles have an 80-unit-wide grab area down the full box height, always on.

## Decisions
- **Width, per font, in the file (decided).** An optional `stroke?: { width }` field on `FontProject`, 20..160, default 70, so old files still open and the format stays version 1. A toolbar slider sets it, and it restyles every glyph, the preview and the export. Rejected: per-stroke brush width (changes the stroke format, and the weight can't be changed later); an app preference (the same file would export differently).
- **Speed pressure, baked in at draw time (decided).**
  - Mouse and touch: speed becomes pressure (fast is thin) with the signature pad's smoothing, written into each point's existing pressure value.
  - A pen always uses its real pressure.
  - Toggle Even / Speed, as app storage. No format change; switching affects only new strokes.
  - Rejected: storing timestamps and working it out on screen (bigger files).
- **"Edit spacing" toggle, off by default (decided).**
  - Off: borders hidden and not grabbable, so you can draw edge to edge; spacing is automatic, and existing lsb/rsb nudges still apply.
  - On: borders show and drag as today, plus a Reset to auto for the glyph.
  - App storage. Rejected: off ignoring nudges (the toggle would change the export); grabbing only the knob (not a toggle).
- **Undo near the drawing (decided).** A labelled "Undo" button next to Clear, on the existing history; the top ↺ stays. On touch, a two-finger tap on the canvas undoes too (it must not leave a stroke). Rejected: moving the top buttons down; button only.
- **Filmstrip (decided).** Owner: stepping through letters on mobile is annoying. A horizontal strip of every letter in the sets sits under the canvas, scroll-snapped, with the current letter centred and highlighted. Swipe to browse, tap to jump; the ‹ › carets and `[` `]` stay. A tile shows the drawn glyph, or a ghost when the letter isn't drawn. Rejected: big side tiles (one step at a time); swiping the header (can't be discovered).
- **Ghost (decided).** A faint letter in the OS font sits behind the ink in the drawing box, on the baseline at cap height (x-height for lowercase), as a reference to trace. It shows while the glyph is empty and hides once drawn. Undrawn filmstrip tiles use the same ghost. Rejected: ghosts in the filmstrip only; the neighbouring glyph from your own font.
- **Bead artifact (fix).** Slow, thick strokes with a turn got scalloped edges; fixed in the outline.
- **Shell:** nothing, as before.

## Action items
- [x] Revision note on ADR-055; update `docs/apps/font-maker.md`.
- [x] Build: width slider plus the `stroke.width` field, speed pressure, the Even/Speed toggle, the Edit spacing toggle and Reset to auto. Check on desktop and mobile.
- [x] Build: Undo button and two-finger tap, filmstrip, ghost, bead fix.

## Next session topics
- A per-stroke brush, if mixing thick and thin turns out to matter.
