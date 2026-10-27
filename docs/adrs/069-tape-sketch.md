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

## Revision 2026-10-25: 3D view replaces the box
The owner dropped the box after using it and picked the rejected alternative, an extruded 3D view ([brainstorm, session 2](../brainstorm/2026-10-25_tape-sketch.md)).
- **Format `version: 2`:** `paths[].height: number | null` (mm), no `boxes`. A v1 file opens; boxes in it are left out with a toast.
- **Height on any path**, open (fence, wall) or closed (room, drawer, box), measured on the numpad after the path's edges.
- **3D view** behind a 2D / 3D toggle: each path rebuilt to scale from its lengths, placed at its first corner's drawn position, extruded by its height; dimensions and markers on the floor. Orbit, pinch, view chips. Measuring (lengths and heights) works in 3D; drawing and moving stay 2D. Hand-written projection drawn as SVG, no dependency.

Built the same day ([internals](../apps/tape-sketch.md#the-3d-view)). Details the revision left open, decided in the build:
- **Unmeasured height:** "a placeholder shown as `?`" and "flat on the floor" are one thing: a path with no height lies flat, with a `↑ ?` handle (a short dashed stub and a label) at its first corner.
- **Height in 2D:** a `↑ 250 cm` / `↑ ?` label by the path's first corner, placed with the other labels after the path's edges; the summary card shows it and its Measure button reaches it.
- **Projection:** orthographic; the floor is the sketch plane, so Top at yaw 0 reads as the 2D sketch. Pitch clamped to 4°–90°. Chips: ¾ (yaw −30°, pitch 32°), Top, Front (from the bottom of the page), Side (from the left).
- **End-on:** an edge projecting under 24 px has no label unless it's the one being measured. **Hit radius:** 22 px on touch, 10 with a mouse; a label counts first, padded by half the radius.
- **Refit:** entering 3D, picking a chip and a double tap fit the model; so does closing the numpad when a new height has grown it past the view.
- **Also in 3D:** dimensions are tappable like edges; Delete and the tool keys do nothing; the system Back leaves 3D after closing the numpad.
- **Version 1 boxes:** left out with a notification, not the app's own transient notice, since it has to outlast the open.

## Revision 2026-10-27: back to 2D, check toggle, magnet sets, rotation
The owner, after using the 3D view: "i would drop 3d in the way it is now its too complex. i would rather have better support to draw the 3d axis shapes without the tool prompting me to adjust it - the adjusting prompt is good but i want to opt out as well since that would break my manual 3d of it." Also: "vibrate api on the keyboard, option to rotate canvas (with fingers i can only zoom now)" and "optional angle defs would be nice" ([brainstorm](../brainstorm/2026-10-27_tape-sketch-2d.md)).
- **3D view and heights removed.** No 2D / 3D toggle, no `paths[].height`, no height targets. A 3D box is drawn by hand as a flat outline.
- **Format `version: 3`:** `paths[].check: boolean` and `snap: number[]`, no `height`. A version 2 file opens: `check: true`, the 45° set, and each non-null height becomes a marker note `↑ {height}` on its path's first corner, appended to a marker already there. Version 1 still opens through the same path.
- **Check lengths, per shape, default on.** Off: no closure gap, no implied lengths (summary card and numpad), no Redraw to scale, no area; the perimeter stays.
- **Magnet angle set per sketch.** Degrees, each also meaning its opposite (closed under +180°). Presets 45° (0, 45, 90, 135, the default and today's behaviour), Iso (0, 30, 90, 150), 15° (every 15°), and Custom (typed angles). Magnet Off stays. `snap_45` became `snap_dir(from, to, directions)`. Corner-drag alignment unchanged.
- **Two-finger rotate**, app-local (the kit `View` untouched): from the pinch angle while zooming, snapping to 0 / 90 / 180 / 270 within 8°; labels upright; taps un-rotated before mapping; a compass button turns back to 0°. View state only, not saved.
- **Numpad keys vibrate** for 8 ms on a touch press.

Built the same day ([internals](../apps/tape-sketch.md)). Details the revision left open, decided in the build:
- **Rotation is folded into the screen mapping, not an SVG group `transform`.** Each sketch point is turned, then scaled and offset; the scene is built from the turned screen positions. With a group transform the labels, placed in unrotated screen space and counter-rotated, would no longer be checked against the lines they end up next to; folding it in keeps placement exact and the labels upright with no counter-rotation.
- **Walk with a set other than 45°: a direction ring.** A disc with a tick per direction; press, slide to the nearest direction (it lights up with its angle), lift to walk. The 45° set keeps the 8 buttons. Buttons, ring and arrow keys mean screen directions: each is turned back by the rotation and matched to the nearest direction of the set.
- **Magnet menu** in the toolbar for Corners and Walk: Off, the presets with a short description, Custom… as a prompt prefilled with the current set. Picking a set is an undoable sketch edit and turns the magnet on; on / off stays per device. A new sketch keeps the last set, as it keeps the unit.
- **Check lengths** is a switch on the summary card of a closed path, hidden while the numpad is open; flipping it is undoable.
- **Vibration** covers every numpad key including Clear and ✓, touch presses only.
- **Version 2 heights** are announced with a notification that counts them, like version 1 boxes.
- **No mouse gesture for rotation** and export is always upright.
