# Tape Sketch
Id `tape-sketch` · Source: `src/lib/apps/user/tape-sketch/` · [ADR-069](../adrs/069-tape-sketch.md) · [brainstorm](../brainstorm/2026-10-25_tape-sketch.md)

## What it does

A sketch pad for measuring around the house, built for one hand on a phone while the other holds the tape. You draw the shape (a room, a drawer, a fence) with clean lines, then type each length on a big numpad; the number sits on its edge, outside the shape. Dimension lines measure between any two points (lamp to wall), markers pin a note on a point (socket, hook), notes go anywhere. Any shape can get a height: a closed one becomes a room, a drawer or a box, an open one a fence or a wall. The 2D sketch is not to scale: the numbers win. A closed shape checks that its lengths can all be true, offers the missing one, and gives area and perimeter. A 2D / 3D toggle shows every shape rebuilt from its numbers and extruded by its height, to turn around and measure on.

## How it works

Pure logic is in `.ts` files with Node tests beside them: `model.ts` (types), `units.ts`, `geometry.ts` (snap, closure, rebuild, area), `edit.ts` (every edit as `Sketch → Sketch`, measuring targets, walking), `labels.ts` (placement), `scene.ts` (everything the 2D view draws, in screen pixels), `projection.ts` (the 3D camera: projection, orbit, depth sort, line hit-test), `solid.ts` (the 3D model and everything the 3D view draws), `format.ts` and `svg.ts`. `export.ts` (theme colours, PNG) has a browser test. Reactive state is one `Editor` in `editor.svelte.ts`: an immutable undo history of whole sketches (`$kit/utils/history`), a `preview` sketch while a drag is live, the tool, the selection and the numpad's typed text. `tape-sketch-canvas.svelte` draws the 2D scene as SVG and owns its pointer input; `tape-sketch-solid.svelte` does the same for 3D (orbit, pinch, taps); the app file maps taps to edits per tool and holds the 2D / 3D toggle, the orbit and a separate view for each.

### Model

Points carry sketch coordinates; paths list point ids and hold one length per edge (`lengths[i]` is the edge from `points[i]` to the next, wrapping on a closed path) and one `height`, how far the path rises off the floor. Dimensions, markers and paths can share points, so a dimension from a room corner moves with that corner. Lengths and heights are stored in mm; the sketch's `unit` only changes how they read and how typed numbers are read. Coordinates mean direction, nothing more.

### Drawing

| Mode | How |
|------|-----|
| Corners | Each tap adds a corner. With the magnet on, the corner snaps to the nearest of 8 directions from the last one and lands at the foot of the tap on that ray (`snap_45`, `geometry.ts:65`), so a sloppy thumb keeps its reach. Tapping the first corner of a path with 3+ corners closes it and opens the numpad on the first unmeasured edge. Tapping the end of an open path continues it; its start turns it round first. Finish leaves it open; a path left with one corner is dropped. |
| Walk | Start from a tapped corner or a new point, type a length, tap one of 8 directions (keyboard: arrows, Home / PgUp / End / PgDn for diagonals). `walk` (`edit.ts:266`) extends the open path that ends there or starts a new one. The step is drawn at the sketch's median drawn-to-measured ratio (`sketch_scale`, `geometry.ts:237`); with nothing measured yet the first step sets it at `FIRST_STEP` = 120 units. A step that lands within the closure tolerance of the path's first corner closes the path with that length. |

Dragging a corner moves it, pulled onto a neighbour's x or y within 8 px so walls stay straight. Dragging a dimension changes its offset, dragging a note moves it. Drags draw from `preview` and commit as one undo step when the pointer capture is lost; a second finger cancels the drag and pinches.

### Measuring

Every length is a target: per path its edges in order, then its height; then the dimensions (`measure_targets`, `edit.ts:181`). The numpad opens on the tapped edge or label, in 2D or 3D. ← and → (and Tab) commit and step; while anything is unmeasured they step only through those, otherwise through all (`step_target`, `edit.ts:219`). So once a path's edges are in, → lands on its height. ✓ (Enter) commits and closes, Clear unmeasures. A length is only rewritten when a key was typed, so stepping past a measured edge doesn't touch it. The current target is drawn in `primary` and the view pans just enough to keep its label out from under the sheet.

### Closure check

`closure` (`geometry.ts:153`), for a closed path with 3+ corners. Each edge's drawn direction is a unit vector `u`. For each axis, the measured lengths projected on their direction should sum to zero: `Σ Lᵢ·uᵢ.x = 0` and the same for y.

- An axis whose edges are all measured shows the leftover as the gap.
- An unmeasured edge counts on an axis only when its direction has more than 0.05 of it (`INVOLVED`, about 3°), so a square wall doesn't spoil the other axis.
- When exactly one unmeasured edge counts on an axis, its implied length is `−Σ / u`. If both axes imply it, the axis it runs along most wins, and the other axis then gets a gap of its own from that value. Non-positive values aren't offered.
- The tolerance is `max(5 mm, 0.2 % of the measured lengths)` (`closure_tolerance`, `geometry.ts:129`): a tape is good to a few mm, and the error grows with the distance walked.

The summary card shows the gap per axis (↔, ↕) when it's over the tolerance, "The lengths close" when everything is measured and agrees, and a button per implied length; the numpad offers the implied value for the edge it's on.

### Rebuild from lengths: area and Redraw to scale

`edge_vectors` (`geometry.ts:204`) turns each edge into a vector of its length along its drawn direction; an unmeasured edge keeps its drawn length through the scale. On a closed path the vectors rarely sum to zero, so the leftover is spread: over the unmeasured edges when there are any (they have nothing to contradict, so with one unmeasured edge it gets exactly its implied vector), else over every edge in proportion to its length, the surveyor's compass rule.

- **Area** (`measures`, `geometry.ts:282`) needs every edge measured: the shoelace formula on the corners rebuilt in mm. It reads `≈` when the closure is over the tolerance, since the spread leftover bent the shape. Perimeter is the sum of the lengths. Metric areas read in m² from 0.1 m², else cm²; inches in ft² from 1 ft², else in².
- **Redraw to scale** (`rebuild`, `geometry.ts:260`, `redraw_to_scale`, `edit.ts:236`) moves the corners to the rebuilt shape: the first corner stays, and the path's own drawn-to-measured ratio (`path_scale`) keeps it about the size it was drawn. It's one edit, so Undo puts it back. Anything on those corners (dimensions, markers) moves with them.

### Height in 2D

Each path's height is a label by its first corner, `↑ 250 cm`, or `↑ ?` dashed in `primary` while unmeasured, so a path without one shows how to add it: tap the label, or step onto it with →. It's placed like any other label, asked for after the path's edges and preferring the side away from the path's middle. The summary card shows it too, and its Measure button opens the height once the edges are all in.

### The 3D view

A 2D / 3D toggle in the toolbar. 3D draws; it doesn't edit geometry: the drawing tools give way to view chips, and drawing, moving and deleting stay in 2D. Measuring works the same in both.

- **Model** (`build_world`, `solid.ts:41`). Each path is rebuilt from its lengths with `edge_vectors`, the same rebuild as the area and Redraw to scale: unmeasured edges at the path's own drawn ratio (`path_scale`, else the sketch's), the closing leftover spread over the unmeasured edges or by the compass rule. It's set down at its first corner's drawn position, and its mm turn back into sketch units through the sketch's median scale (`sketch_scale`), so two shapes measured in one sketch keep their sizes relative to each other while sitting where they were drawn. A corner takes the rebuilt position of the first path it belongs to; a free point (a dimension's end off any corner) stays where it was drawn. The height goes through the same scale. A path with no height lies flat on the floor.
- **Projection** (`project`, `projection.ts:43`). Orthographic, hand-written. The floor is the sketch's own plane, x right and y down the page, z up. Yaw turns the floor about the vertical, then pitch tips it: `screen.y = y′·sin(pitch) − z·cos(pitch)`, `depth = y′·cos(pitch) + z·sin(pitch)`, larger depth nearer. Straight down at yaw 0 the floor reads exactly as the 2D sketch. The model is centred on its bounding box before projecting (`solid_projector`), so turning keeps it in place on screen; pan and zoom are a plain `$kit/utils/view` transform on top.
- **Shapes.** A closed path with a height is a prism: floor, top, and a wall quad per edge. An open path with a height is wall strips. Each floor edge has a top copy, and every corner a vertical edge. Faces are filled translucent and painter-sorted by mean depth, farthest first (`back_to_front`, `projection.ts:71`); all edges draw on top of all faces, so nothing hides a line and the sort only has to be roughly right.
- **Targets.** A floor edge and its top copy are the same length; every vertical edge of a path is its height. The current target draws in `primary` on every copy. A path without a height gets a `↑ ?` handle at its first corner: a short dashed stub (shorter as the view looks down) and a label, a full touch target.
- **Labels** (`build_solid_scene`, `solid.ts:140`) go through the same `place_labels` as 2D, in screen pixels. Each length once, on its floor edge, outward from the projected floor; the height once, on the vertical edge nearest the viewer (largest depth), beside it away from the path's middle. A label whose edge projects shorter than `END_ON` = 24 px (`solid.ts:115`), an edge seen nearly end-on, is left out unless it's the target being measured: from straight above the heights are hidden until tapped. Dimensions sit on the floor, their offset turned along the floor; markers are dots on the floor with their notes. Free notes are 2D only.
- **Hit-test** (`hit_solid`, `solid.ts:254`). Nothing in 3D is an SVG hit target; a tap is resolved in pure code. First a label under the finger (padded by half the radius), then the nearest line within the radius, 22 px on touch and 10 with a mouse (`nearest_line`, `projection.ts:89`), so a 2 px edge is easy to hit. A line shorter than 10 px, seen end-on, takes a 6 px penalty and loses a near tie to a line the user can see.
- **Gestures** (`tape-sketch-solid.svelte`). One-finger or mouse drag orbits: yaw all the way round, pitch clamped between 4° (near side-on) and 90° (straight down) (`orbit_by`, `projection.ts:55`). Two fingers pinch and pan, wheel pans and Mod+wheel zooms, as in 2D. A double tap on empty space goes back to the ¾ view and refits. The chips at the bottom are ¾ (yaw −30°, pitch 32°), Top, Front (from the bottom of the page) and Side (from the left); each refits. When the numpad closes and the model has outgrown the view (a height just typed), it refits.

### Label placement

`build_scene` (`scene.ts:216`) works in screen pixels so lines keep their weight and labels their size at any zoom; it reruns on every view change. Labels are Hack (mono), 13 px, so their width is known without measuring: 0.6 em per character (`text_width`, `labels.ts:29`). `place_labels` (`labels.ts:98`) is greedy in request order: per path its edge lengths then its height, dimensions, marker notes. Each tries spots along its preferred side (for an edge, the outward normal: outside a closed path by a point-in-polygon test, away from the centroid on an open one), stepping out 0 to 64 px and sliding along the edge, then the other side. It takes the first spot whose padded rectangle crosses no line (every edge, dimension and extension line) and no earlier label, corner dot or note (Liang–Barsky clipping). When nothing is free it keeps the nearest spot rather than dropping the number.

### Export

PNG and SVG from the File menu, written where the save picker says, of the view on screen: the 2D sketch, or 3D at the current angle. `export_scene` (`svg.ts:82`) and `export_solid` (`svg.ts:125`) build the scene for a view that fits the sketch into about 900 px, crop to what it draws plus 24 px, and write plain SVG (3D faces at 6 % ink, edges on top). Colours are the current theme's, read from the CSS tokens and turned into sRGB hex through a 1 px canvas (`theme_palette`, `export.ts:22`) so the file opens anywhere. The PNG is that SVG drawn at 2× into a canvas. Fonts aren't embedded: the SVG asks for Hack, then the system mono.

## Data

- **`.tapesketch`**, UTF-8 JSON, `version: 2`:
  ```ts
  { version: 2, unit: "mm" | "cm" | "m" | "in",
    points: { id, x, y }[], paths: { id, points: id[], closed, lengths: (mm | null)[], height: mm | null }[],
    dims: { id, a, b, length: mm | null, offset }[], markers: { id, point, note }[],
    notes: { id, x, y, text }[] }
  ```
  Parsed with zod (`parse_sketch`, `format.ts:83`): a newer `version` is refused ("made by a newer Tape Sketch"), lengths and heights must be positive, every point reference must exist, a closed path needs 3+ corners and a path needs exactly one length per edge. Saved with coordinates and offsets rounded to 0.1 and lengths to 0.01 mm (`serialize_sketch`, `format.ts:100`), always as version 2.
- **Version 1** (3.65.0) had no heights and a `boxes` list (`{ id, x, y, w, d, h, note }`, an oblique W × D × H symbol). It still opens: every path gets `height: null` and the boxes are left out, counted, with a notification saying how many. Converting a box to a rectangle with a height was rejected as code for files that hardly exist.
- Opened through the `.tapesketch` association (`FILE_PROPS`, `path`). Open…, Save (Mod+S), Save as… (Mod+Shift+S), New sketch, and the dirty close guard follow Hopsprite. A new sketch keeps the last unit, cm the first time.
- `app.tape-sketch.snap` in app storage: the 45° magnet.
- No shell commands; `open` covers it through the association.

## Dependencies & licences

None beyond the repo: zod for the file, `$kit/utils/history` and `$kit/utils/view` (camera math, pinch). The 3D view is hand-written SVG, no WebGL and no 3D library.

## Limits

- The 2D sketch is not to scale on purpose; only Redraw to scale makes the drawing match the numbers, and only per path. 3D is always to scale, but placed by the drawing: two shapes drawn apart stay apart by the drawn distance through the median scale, not by anything measured, so a gap between them in 3D isn't a measurement.
- Every height stands on the same floor; there is no way to raise a shape (a shelf on a wall).
- An unmeasured height counts as still to measure, so a sketch with heightless shapes never reads "Everything is measured".
- 3D faces are sorted by mean depth only, which can misorder two faces that cross; they're translucent and the edges draw on top, so it shows as a slightly wrong shade, not a hidden line.
- The closure check is per closed path; dimensions and heights aren't checked against anything.
- A dimension endpoint tapped off a corner becomes a free point; it isn't snapped onto the middle of an edge.
- Label placement is greedy, not optimal: a crowded corner can push a label far out, and a sketch with dozens of short edges isn't measured for speed.
- The PNG and SVG use the theme of the moment; exporting in a light theme gives a light picture.
- Tested by hand on Chromium only (desktop window, 390 px mobile shell with touch).

## Decisions

- [ADR-069](../adrs/069-tape-sketch.md) and its 2026-10-25 revisions (the numbers above; the 3D view replacing the box).
- [Brainstorm 2026-10-25](../brainstorm/2026-10-25_tape-sketch.md), sessions 1 and 2.
