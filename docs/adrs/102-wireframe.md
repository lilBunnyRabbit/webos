# ADR-102: Wireframe
**Date:** 2026-11-09
**Status:** Implemented

## Context
The owner plans furniture, rooms and fences as 3D line drawings in Inkscape, at real lengths in a cavalier oblique projection. In those drawings X is horizontal, Z is vertical and Y runs at 30° at true length, with 1 unit = 1 mm. Once a drawing is made, it can't be turned to look from another side, and lengths in depth are hard to read off. A college project (points and lines → a rotatable 3D object) had the other half of the idea. Discussion, the analysis of the owner's files and research into how other tools solve it: [brainstorm](../brainstorm/2026-11-09_line-sketch-3d.md).

Tape Sketch (ADR-069) stays the phone-first, not-to-scale measuring pad; its 3D view was dropped on 2026-10-27. This is a separate tool for planning at the desk.

## Decision
A new user app, **Wireframe** (`wireframe`), desktop first and usable on mobile.

- **The model is a 3D line graph.** Points have x, y, z in mm. A line joins two points. Two lines touch when they share a point and never at a crossing on screen. What is in front follows from depth; the user never draws it.
- **Editor: axis walk.** Every stroke starts at an existing point, or at the origin for the first one.
  - A stroke follows X, Y or Z. Its axis and sign come from the screen direction nearest the drag: in a parallel projection the six axis directions are distinct on screen.
  - Its length is typed in the unit, so the geometry is always exact and to scale.
  - A stroke can end on an existing point; that point's position decides, which handles the case of two points on the same pixel.
  - **Slopes:** a line between any two existing points.
  - **Floating parts:** a new point at a typed x, y, z offset from an existing one.
  - Points can be moved by a typed offset along an axis. A line whose ends no longer share two coordinates simply becomes a slope.
- **Repeat tools in v1:**
  - **Box:** from a point, W × D × H gives 8 points and 12 lines.
  - **Extrude:** the selected lines are copied a typed length along an axis, with a line joining each copied point to its original.
  - **Copy along an axis × n:** a step and a count.
- **Lengths are always shown.** Every line has a label with its length, upright and in screen space. A label whose line is very short on screen is hidden.
- **Colour per line.** A line's colour is a user colour (a theme token name or `#rrggbb`, as in Design › User colours). There are no groups or layers in v1.
- **View.** An orbit camera with parallel projection (yaw and pitch, no perspective), plus presets:
  - Cavalier (the owner's Inkscape view),
  - Isometric,
  - Front, Side and Top.
  Mouse: right-drag or middle-drag orbits, the wheel zooms. Touch: two fingers orbit, pan and pinch. Drawing in a view where two axis directions nearly overlap on screen is refused, with a hint to turn the view.
- **Renderer.** SVG, using the app's own projection math, with no dependency. Points are projected each frame, then lines and labels are drawn in screen space.
- **File.** A JSON `.wire` file in `/home`, opened through a file association (the Tape Sketch pattern). It has a versioned zod schema:
  ```ts
  interface Wire {
    version: 1;
    unit: "mm" | "cm" | "m";
    points: { id: string; x: number; y: number; z: number }[]; // mm
    lines: { id: string; a: string; b: string; color: string | null }[];
  }
  ```
  The view is not saved in the file.
- **Export:** SVG and PNG of the current view.
- **Undo and redo** over whole sketches.
- **Mobile:** open, orbit, read and light edits. Those use a direction ring with six axis spokes, drawn along their projected directions, and a numpad.
- **Shell:** only `open` through the association; no commands.

## Alternatives Considered
- **Inside Tape Sketch:** it is for one hand on the go and isn't drawn to scale; its 3D view was dropped as too complex.
- **Draw flat, then lift to 3D:** two modes, and errors such as floating parts or loops that don't close show up only at lift time.
- **Work planes (Shapr3D, Onshape):** you have to manage planes, vertical lines need their own tool, and it is close to the dropped extrude model.
- **Freehand drawing with automatic reconstruction:** a solver can be wrong without saying so, and typed lengths don't fit.
- **three.js:** a dependency for wireframes that don't need faces or lighting.
- **Groups or layers in v1, and importing the owner's Inkscape SVGs:** deferred. Importing is feasible: 85–100 % of the lines in those files lie on an axis, and the 3D positions follow by walking from the origin.

## Consequences
- A new file type and association, `.wire`.
- No dependency, no new service.
- Projection, orbit and label placement are the app's own code. A second app that needs them moves them to the kit.

## Revision 2026-11-10 (build)
Decided within scope while building; nothing changes a shape outside the app. Details in [the app's page](../apps/wireframe.md).
- **Cavalier is a blend, not an orbit.** The orbit carries `oblique` from 0 to 1 and the basis blends the orthographic orbit (yaw 30°, pitch 20°) with the cavalier shear. Orbiting out of Cavalier fades the shear over the first 160 px of drag instead of jumping. Isometric is yaw 45°, pitch asin(tan 30°); Front, Side and Top are plain orbits. Presets animate for 260 ms (Alt+1 to Alt+5).
- **Axis inference.** An axis whose screen length is under 0.2 of the longest isn't offered (seen end-on); drawing is refused when two other axes are within 14° on screen. A drag suggests a length rounded to the smallest of 1, 5, 10, 50, 100, 500, 1000, 5000 mm that is at least 8 px, or the exact distance when it ends over a point on that ray; the first typed key replaces the suggestion.
- **Same point.** Points within 0.005 mm are one point; every edit reuses a point already there, so a walk, a box corner or a copy that lands on a point ends on it. Coordinates are rounded to 0.01 mm.
- **Line colours** are `null` (the foreground), one of `primary`, `secondary`, `tertiary`, `accent`, `info`, `success`, `warning`, or `#rrggbb`, as Soundboard's pads. Axis colours in the gizmo, ring and preview: X `accent`, Y `secondary`, Z `tertiary`.
- **Floating points and boxes** take their three numbers in a text prompt (`80 x 40 x 200`, `0, -12.5, 30`), not on the numpad. Move also moves the ends of selected lines. Extrude and Copy leave the new lines selected. Deleting lines drops their ends no other line holds; a lone anchor point stays. Copy along counts 1 to 99. Merge coincident points is in the File menu.
- **Labels** are placed greedily, longest line first, away from the drawing's centre; a line under 30 px on screen gets none, lines lying on top of each other on screen get one, and a label with no spot clear of other labels is left out rather than stacked.
- **Input.** Left-drag on empty space pans, right- or middle-drag orbits (Shift pans), the wheel zooms about the pointer; on touch one finger pans or strokes, two fingers orbit and pinch. Zoom is clamped to 0.002–40 px per mm. Orbit turns about the drawing's centre.
- **Export** writes theme tokens as sRGB hex, so the file opens anywhere; the PNG is the SVG at 2×.
