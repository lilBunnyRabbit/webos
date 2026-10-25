# ADR-069: Tape Sketch
**Date:** 2026-10-25
**Status:** Implemented

## Context
The owner measures around the house (rooms, drawers, lamp positions, a fence) and records it in a phone notes app as a freehand outline with handwritten numbers. The result is hard to make and hard to read: wobbly lines, numbers that float near their edge, corrections written over each other. Nothing in WebOS stores measured lengths. Discussion: [brainstorm](../brainstorm/2026-10-25_tape-sketch.md).

## Decision
A new user app, **Tape Sketch** (`tape-sketch`), mobile first.

- **The core idea.** A length belongs to an edge, not to a spot on the canvas. Lines are clean by construction, and numbers are typed into a numpad.
- **Not to scale.** The shape stays as drawn and the numbers win. A closure check flags lengths that can't all be true, so a wall can be remeasured on the spot. **Redraw to scale** rebuilds a path from its lengths when you ask for it.
- **Project file.** JSON `.tapesketch`, opened through a file association (the Hopsprite pattern, ADR-039):
  ```ts
  interface TapeSketch {
    version: 1;
    unit: "mm" | "cm" | "m" | "in";       // display unit; lengths are stored in mm
    points: { id: string; x: number; y: number }[]; // sketch coordinates, not to scale
    paths: { id: string; points: string[]; closed: boolean; lengths: (number | null)[] }[]; // one length per segment
    dims: { id: string; a: string; b: string; length: number | null; offset: number }[];  // a dimension between any two points
    markers: { id: string; point: string; note: string }[];  // lamp, socket, hook
    notes: { id: string; x: number; y: number; text: string }[];
    boxes: { id: string; x: number; y: number; w: number | null; d: number | null; h: number | null; note: string }[];
  }
  ```
- **Drawing has two modes on one model.**
  - **Tap corners:** each tap drops a corner, and segments snap to 45° steps unless the snap is off. Tap the first corner to close, or finish open. Drag a corner to move it.
  - **Walk:** start from a point, then type a length and tap one of 8 directions. Each step draws the segment from its length.
- **Numbers.** Tapping an edge or a dimension opens a numpad sheet with big keys. ← / → step through the unmeasured lengths. Keyboard digits work on desktop.
- **Closure check.** It works on a closed path. Each measured length is projected on its drawn direction, and the sum per axis should be zero. The app then:
  - shows the gap per axis;
  - when exactly one edge on an axis is unmeasured, offers its implied value.
- **Area and perimeter** for a closed path with every edge measured. The perimeter is the sum of the lengths. The area comes from the shoelace formula on the path rebuilt from its lengths, shown with ≈ when the closure gap is over the tolerance.
- **Box** for simple 3D (furniture, a fence section): a cuboid drawn in oblique projection, labelled W × D × H.
- **Export** PNG and SVG. Canvas: pinch and pan, undo and redo.
- **Shell.** Only `open` through the association; no commands.

## Alternatives Considered
- Freehand strokes, auto-straightened: fitting guesses wrong on wobbly strokes, and fixing them is slower than tapping corners.
- Always to scale: the shape jumps while it's half measured, and contradictions have to be resolved on the spot.
- App storage instead of files: sketches couldn't be opened from Explorer, backed up as files, or shared.
- System keyboard for numbers: it covers half the sketch and its keys are small to use one-handed.
- A real 3D view (extruded room, rotatable): heavy for a rare need.

## Consequences
- A new file type and association, `.tapesketch`.
- The sketch is a diagram, not a plan: coordinates carry no meaning beyond direction.
- No dependency, no new service.

## Revision 2026-10-25: built
Implemented as specified. Details the ADR left open, decided in the build ([internals](../apps/tape-sketch.md)):
- **Closure tolerance:** 5 mm or 0.2 % of the measured perimeter, whichever is larger. An unmeasured edge counts on an axis only when its drawn direction has more than 0.05 of it (about 3°), so a nearly square wall doesn't block the implied value on the other axis.
- **Rebuild from lengths** (behind the area and Redraw to scale): edges follow their drawn directions; the leftover that keeps a closed path from closing goes to the unmeasured edges when there are any, else over every edge in proportion to its length (the compass rule). Redraw keeps the first corner and the path's own drawn-to-measured ratio, so the path stays about the size it was.
- **Walk scale:** a step is drawn at the sketch's median drawn-to-measured ratio; with nothing measured yet, the first step sets it at 120 sketch units. A step that lands within the tolerance of its path's first corner closes the path.
- **Box:** cabinet oblique projection, depth at 45° and half length, drawn from its own W, D and H relative to the largest (each at least a quarter, an unmeasured side at 0.6), not to the sketch's scale.
- **Numpad:** ✓ (Enter) commits and closes, ← / → (also Tab) commit and step; Clear unmeasures. Walk keys on a keyboard: arrows, and Home / PgUp / End / PgDn for the diagonals (a numpad's 7, 9, 1, 3 with Num Lock off).
- **Labels:** placed in screen pixels each time the view changes, greedily: edge lengths first (outside a closed path by a point-in-polygon test), then dimensions, box sides, marker and box notes; each takes the nearest spot that crosses no line and no earlier label.
- **Export:** the theme's colours at the time of export, as sRGB hex; the PNG is the SVG drawn at 2×.
