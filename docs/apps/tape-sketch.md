# Tape Sketch
Id `tape-sketch` · Source: `src/lib/apps/user/tape-sketch/` · [ADR-069](../adrs/069-tape-sketch.md) · [brainstorm](../brainstorm/2026-10-25_tape-sketch.md)

## What it does

A sketch pad for measuring around the house, built for one hand on a phone while the other holds the tape. You draw the shape (a room, a drawer, a fence) with clean lines, then type each length on a big numpad; the number sits on its edge, outside the shape. Dimension lines measure between any two points (lamp to wall), markers pin a note on a point (socket, hook), notes go anywhere, and a box sketches furniture in 3D as W × D × H. The sketch is not to scale: the numbers win. A closed shape checks that its lengths can all be true, offers the missing one, and gives area and perimeter.

## How it works

Pure logic is in `.ts` files with Node tests beside them: `model.ts` (types), `units.ts`, `geometry.ts` (snap, closure, rebuild, area), `edit.ts` (every edit as `Sketch → Sketch`, measuring targets, walking), `labels.ts` (placement), `scene.ts` (everything drawn, in screen pixels), `format.ts` and `svg.ts`. `export.ts` (theme colours, PNG) has a browser test. Reactive state is one `Editor` in `editor.svelte.ts`: an immutable undo history of whole sketches (`$kit/utils/history`), a `preview` sketch while a drag is live, the tool, the selection and the numpad's typed text. `tape-sketch-canvas.svelte` draws the scene as SVG and owns the pointer input; the app file maps taps to edits per tool.

### Model

Points carry sketch coordinates; paths list point ids and hold one length per edge (`lengths[i]` is the edge from `points[i]` to the next, wrapping on a closed path). Dimensions, markers and paths can share points, so a dimension from a room corner moves with that corner. Lengths are stored in mm; the sketch's `unit` only changes how they read and how typed numbers are read. Coordinates mean direction, nothing more.

### Drawing

| Mode | How |
|------|-----|
| Corners | Each tap adds a corner. With the magnet on, the corner snaps to the nearest of 8 directions from the last one and lands at the foot of the tap on that ray (`snap_45`, `geometry.ts:65`), so a sloppy thumb keeps its reach. Tapping the first corner of a path with 3+ corners closes it and opens the numpad on the first unmeasured edge. Tapping the end of an open path continues it; its start turns it round first. Finish leaves it open; a path left with one corner is dropped. |
| Walk | Start from a tapped corner or a new point, type a length, tap one of 8 directions (keyboard: arrows, Home / PgUp / End / PgDn for diagonals). `walk` (`edit.ts:280`) extends the open path that ends there or starts a new one. The step is drawn at the sketch's median drawn-to-measured ratio (`sketch_scale`, `geometry.ts:237`); with nothing measured yet the first step sets it at `FIRST_STEP` = 120 units. A step that lands within the closure tolerance of the path's first corner closes the path with that length. |

Dragging a corner moves it, pulled onto a neighbour's x or y within 8 px so walls stay straight. Dragging a dimension changes its offset, dragging a box or a note moves it. Drags draw from `preview` and commit as one undo step when the pointer capture is lost; a second finger cancels the drag and pinches.

### Measuring

Every length is a target: path edges in order, then dimensions, then each box's W, D, H. The numpad opens on the tapped edge, label or box. ← and → (and Tab) commit and step; while anything is unmeasured they step only through those, otherwise through all (`step_target`, `edit.ts:233`). ✓ (Enter) commits and closes, Clear unmeasures. A length is only rewritten when a key was typed, so stepping past a measured edge doesn't touch it. The current target is drawn in `primary` and the view pans just enough to keep its label out from under the sheet.

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
- **Redraw to scale** (`rebuild`, `geometry.ts:260`, `redraw_to_scale`, `edit.ts:250`) moves the corners to the rebuilt shape: the first corner stays, and the path's own drawn-to-measured ratio (`path_scale`) keeps it about the size it was drawn. It's one edit, so Undo puts it back. Anything on those corners (dimensions, markers) moves with them.

### The oblique box

A box is a front bottom left corner plus W, D, H. It's drawn in cabinet oblique projection: the front face square to the screen, the depth receding up and right at 45° at half its length (`box_corners`, `scene.ts:93`). Sizes come from the box's own numbers relative to its largest one, at most 120 units, each at least a quarter so a thin fence panel still shows depth, an unmeasured side at 0.6 (`box_size`, `scene.ts:84`). It's a symbol, not drawn to the sketch's scale. The three hidden back edges are dashed. W sits under the front, H left of it, D beside the receding bottom edge, each `?` until measured; a note goes under W.

### Label placement

`build_scene` (`scene.ts:160`) works in screen pixels so lines keep their weight and labels their size at any zoom; it reruns on every view change. Labels are Hack (mono), 13 px, so their width is known without measuring: 0.6 em per character (`text_width`, `labels.ts:29`). `place_labels` (`labels.ts:98`) is greedy in request order: edge lengths, dimensions, box sides, box and marker notes. Each tries spots along its preferred side (for an edge, the outward normal: outside a closed path by a point-in-polygon test, away from the centroid on an open one), stepping out 0 to 64 px and sliding along the edge, then the other side. It takes the first spot whose padded rectangle crosses no line (every edge, dimension and extension line, box edge) and no earlier label, corner dot or note (Liang–Barsky clipping). When nothing is free it keeps the nearest spot rather than dropping the number.

### Export

PNG and SVG from the File menu, written where the save picker says. `export_scene` (`svg.ts:26`) builds the scene for a view that fits the sketch into about 900 px, crops to what it draws plus 24 px, and `scene_svg` writes plain SVG. Colours are the current theme's, read from the CSS tokens and turned into sRGB hex through a 1 px canvas (`theme_palette`, `export.ts:22`) so the file opens anywhere. The PNG is that SVG drawn at 2× into a canvas. Fonts aren't embedded: the SVG asks for Hack, then the system mono.

## Data

- **`.tapesketch`**, UTF-8 JSON, `version: 1`:
  ```ts
  { version: 1, unit: "mm" | "cm" | "m" | "in",
    points: { id, x, y }[], paths: { id, points: id[], closed, lengths: (mm | null)[] }[],
    dims: { id, a, b, length: mm | null, offset }[], markers: { id, point, note }[],
    notes: { id, x, y, text }[], boxes: { id, x, y, w, d, h: mm | null, note }[] }
  ```
  Parsed with zod (`parse_sketch`, `format.ts:45`): a newer `version` is refused ("made by a newer Tape Sketch"), lengths must be positive, every point reference must exist, a closed path needs 3+ corners and a path needs exactly one length per edge. Saved with coordinates and offsets rounded to 0.1 and lengths to 0.01 mm (`serialize_sketch`, `format.ts:67`).
- Opened through the `.tapesketch` association (`FILE_PROPS`, `path`). Open…, Save (Mod+S), Save as… (Mod+Shift+S), New sketch, and the dirty close guard follow Hopsprite. A new sketch keeps the last unit, cm the first time.
- `app.tape-sketch.snap` in app storage: the 45° magnet.
- No shell commands; `open` covers it through the association.

## Dependencies & licences

None beyond the repo: zod for the file, `$kit/utils/history` and `$kit/utils/view` (camera math, pinch).

## Limits

- Not to scale on purpose; only Redraw to scale makes the drawing match the numbers, and only per path.
- The closure check is per closed path; dimensions and boxes aren't checked against anything.
- A dimension endpoint tapped off a corner becomes a free point; it isn't snapped onto the middle of an edge.
- Label placement is greedy, not optimal: a crowded corner can push a label far out, and a sketch with dozens of short edges isn't measured for speed.
- The PNG and SVG use the theme of the moment; exporting in a light theme gives a light picture.
- Tested by hand on Chromium only (desktop window, 390 px mobile shell with touch).

## Decisions

- [ADR-069](../adrs/069-tape-sketch.md) and its 2026-10-25 revision (the numbers above).
- [Brainstorm 2026-10-25](../brainstorm/2026-10-25_tape-sketch.md).
