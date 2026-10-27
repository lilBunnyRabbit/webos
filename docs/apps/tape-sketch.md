# Tape Sketch
Id `tape-sketch` · Source: `src/lib/apps/user/tape-sketch/` · [ADR-069](../adrs/069-tape-sketch.md) · brainstorms [2026-10-25](../brainstorm/2026-10-25_tape-sketch.md), [2026-10-27](../brainstorm/2026-10-27_tape-sketch-2d.md)

## What it does

A sketch pad for measuring around the house, built for one hand on a phone while the other holds the tape. You draw the shape (a room, a drawer, a fence) with clean lines, then type each length on a big numpad; the number sits on its edge, outside the shape. Dimension lines measure between any two points (lamp to wall), markers pin a note on a point (socket, hook, a height), notes go anywhere. The sketch is not to scale: the numbers win. A closed shape checks that its lengths can all be true, offers the missing one, and gives area and perimeter; a shape that isn't flat (a box drawn by hand in 3D) turns that check off. The magnet snaps to 45°, iso, 15° or your own angles. Two fingers zoom and turn the sketch.

## How it works

Pure logic is in `.ts` files with Node tests beside them: `model.ts` (types), `units.ts`, `geometry.ts` (snap sets, closure, rebuild, area), `edit.ts` (every edit as `Sketch → Sketch`, measuring targets, walking), `labels.ts` (placement), `scene.ts` (everything the view draws, in screen pixels), `rotation.ts` (the turned camera and the two-finger gesture), `format.ts` and `svg.ts`. `export.ts` (theme colours, PNG) has a browser test. Reactive state is one `Editor` in `editor.svelte.ts`: an immutable undo history of whole sketches (`$kit/utils/history`), a `preview` sketch while a drag is live, the tool, the selection and the numpad's typed text. `tape-sketch-canvas.svelte` draws the scene as SVG and owns its pointer input; the app file maps taps to edits per tool and holds the view (pan, zoom, rotation).

### Model

Points carry sketch coordinates; paths list point ids and hold one length per edge (`lengths[i]` is the edge from `points[i]` to the next, wrapping on a closed path) and a `check` flag. Dimensions, markers and paths can share points, so a dimension from a room corner moves with that corner. Lengths are stored in mm; the sketch's `unit` only changes how they read and how typed numbers are read. Coordinates mean direction, nothing more. The sketch also carries its magnet set, `snap`.

### Drawing

| Mode | How |
|------|-----|
| Corners | Each tap adds a corner. With the magnet on, the corner snaps to the nearest direction of the sketch's set from the last one and lands at the foot of the tap on that ray (`snap_dir`, `geometry.ts:65`), so a sloppy thumb keeps its reach. Tapping the first corner of a path with 3+ corners closes it and opens the numpad on the first unmeasured edge. Tapping the end of an open path continues it; its start turns it round first. Finish leaves it open; a path left with one corner is dropped. |
| Walk | Start from a tapped corner or a new point, type a length, pick a direction. With the 45° set that's 8 buttons around an empty centre (keyboard: arrows, Home / PgUp / End / PgDn for diagonals); any other set gets a direction ring (below). `walk` (`edit.ts:273`) extends the open path that ends there or starts a new one. The step is drawn at the sketch's median drawn-to-measured ratio (`sketch_scale`, `geometry.ts:295`); with nothing measured yet the first step sets it at `FIRST_STEP` = 120 units. A step that lands within the closure tolerance of the path's first corner closes the path with that length. |

Dragging a corner moves it, pulled onto a neighbour's x or y within 8 px so walls stay straight. Dragging a dimension changes its offset, dragging a note moves it. Drags draw from `preview` and commit as one undo step when the pointer capture is lost; a second finger cancels the drag and pinches.

### Magnet angles

`Sketch.snap` lists angles in degrees, counter-clockwise from right as you look at the page; each also stands for its opposite, so a set is a set of lines, closed under +180°. `normalize_snap` (`geometry.ts:77`) folds every angle into [0, 180), rounds it to 0.01° and drops duplicates; `snap_directions` (`geometry.ts:87`) turns the set into unit vectors both ways (sketch y grows downwards, so 90° is −y).

The Magnet button in the toolbar (Corners and Walk) opens a menu: Off, **45°** (0, 45, 90, 135: 8 directions, the default and what older files get), **Iso** (0, 30, 90, 150: ±30°, ±150°, verticals, horizontals, for drawing a box in isometric), **15°** (every 15°, 24 directions), and **Custom…**, a prompt prefilled with the current set where you type angles separated by commas or spaces (`parse_angles`, `geometry.ts:118`), for example `0, 22.5, 63, 90`. `snap_preset` names a set by comparing it with the presets; anything else reads as Custom. Picking a set is an undoable edit of the sketch and turns the magnet on; Off is per device (`app.tape-sketch.snap`), the set is per sketch. A new sketch keeps the last sketch's unit and set.

**Direction ring** (`tape-sketch-ring.svelte`). For any set but 45°, Walk shows a disc with a tick per direction (every direction labelled up to 8 of them, else only multiples of 45°). Press anywhere on it: the direction nearest the finger lights up with its angle in the middle, sliding moves it, and lifting (lost pointer capture) walks that way. A press in the middle 8 % picks nothing. Visually hidden buttons, one per direction, carry the same action for screen readers.

Corner-drag alignment doesn't use the set: it still pulls a dragged corner onto a neighbour's x or y.

### Measuring

Every length is a target: per path its edges in order, then the dimensions (`measure_targets`, `edit.ts:192`). The numpad opens on the tapped edge or label. ← and → (and Tab) commit and step; while anything is unmeasured they step only through those, otherwise through all (`step_target`, `edit.ts:226`). ✓ (Enter) commits and closes, Clear unmeasures. A length is only rewritten when a key was typed, so stepping past a measured edge doesn't touch it. The current target is drawn in `primary` and the view pans just enough to keep its label out from under the sheet.

On touch, every numpad key (digits, point, backspace, Clear and ✓) buzzes for 8 ms (`buzz`, `tape-sketch-keys.svelte`) through `navigator.vibrate`, only when the press is `pointerType === "touch"`. Safari and Firefox don't have the Vibration API; the keys just don't buzz there (compat entry `vibration`, cosmetic).

### Closure check

`closure` (`geometry.ts:211`), for a closed path with 3+ corners and `check` on. Each edge's drawn direction is a unit vector `u`. For each axis, the measured lengths projected on their direction should sum to zero: `Σ Lᵢ·uᵢ.x = 0` and the same for y.

- An axis whose edges are all measured shows the leftover as the gap.
- An unmeasured edge counts on an axis only when its direction has more than 0.05 of it (`INVOLVED`, about 3°), so a square wall doesn't spoil the other axis.
- When exactly one unmeasured edge counts on an axis, its implied length is `−Σ / u`. If both axes imply it, the axis it runs along most wins, and the other axis then gets a gap of its own from that value. Non-positive values aren't offered.
- The tolerance is `max(5 mm, 0.2 % of the measured lengths)` (`closure_tolerance`, `geometry.ts:187`): a tape is good to a few mm, and the error grows with the distance walked.

The summary card shows the gap per axis (↔, ↕) when it's over the tolerance, "The lengths close" when everything is measured and agrees, and a button per implied length; the numpad offers the implied value for the edge it's on.

### Check lengths

`SketchPath.check`, true for every new path and for every path in an older file. A hand-drawn "3D" box (the iso magnet makes one easy) is a flat outline whose lengths are real edges in depth, so it can't close as a flat shape and the check would nag. The summary card of a closed path has a **Check lengths** switch (hidden while the numpad is open); off, `closure` and `rebuild` return null and `measures` gives no area. So: no gap, no "The lengths close", no implied lengths on the card or the numpad, no Redraw to scale, no area. The perimeter still shows once every edge is measured. Flipping it is an undoable edit.

### Rebuild from lengths: area and Redraw to scale

`edge_vectors` (`geometry.ts:262`) turns each edge into a vector of its length along its drawn direction; an unmeasured edge keeps its drawn length through the scale. On a closed path the vectors rarely sum to zero, so the leftover is spread: over the unmeasured edges when there are any (they have nothing to contradict, so with one unmeasured edge it gets exactly its implied vector), else over every edge in proportion to its length, the surveyor's compass rule.

- **Area** (`measures`, `geometry.ts:340`) needs every edge measured and the check on: the shoelace formula on the corners rebuilt in mm. It reads `≈` when the closure is over the tolerance, since the spread leftover bent the shape. Perimeter is the sum of the lengths. Metric areas read in m² from 0.1 m², else cm²; inches in ft² from 1 ft², else in².
- **Redraw to scale** (`rebuild`, `geometry.ts:318`, `redraw_to_scale`, `edit.ts:243`) moves the corners to the rebuilt shape: the first corner stays, and the path's own drawn-to-measured ratio (`path_scale`) keeps it about the size it was drawn. It's one edit, so Undo puts it back. Anything on those corners (dimensions, markers) moves with them.

### Turning the sketch

Two fingers pinch, pan and turn at once. The view is a camera `{ view, rotation }` (`rotation.ts`): a sketch point is turned by `rotation` (radians, clockwise on screen) about the sketch origin, then scaled and offset by the kit `View` (`to_screen`, `rotation.ts:24`); a screen point goes back the other way (`to_sketch`, `rotation.ts:29`), so taps, hit-tests, drags, the dimension offset and the walk start all work in sketch coordinates whatever the turn.

- **Gesture** (`pinch_camera`, `rotation.ts:62`). At the second finger the camera, the midpoint, the spread and the angle between the fingers are kept. Each move: the rotation is the start rotation plus the change of the finger angle, the scale follows the spread (clamped like the kit's), and the sketch point that was under the starting midpoint is put under the current one. A pinch that hardly twists stays put, because of the snap.
- **Snap** (`snap_rotation`, `rotation.ts:40`). Within 8° of a quarter turn the rotation settles on it, so a sketch turned back near upright is exactly upright again and straight walls read straight.
- **Labels stay upright.** The rotation is folded into the screen mapping rather than an SVG `transform`, so `build_scene` gets screen positions of the turned lines and places every label as usual: upright, outside its edge, off every line.
- **Compass.** While the sketch is turned, a compass button sits top right of the canvas, its needle turned with the sketch. Tapping it turns back to 0° about the middle of the canvas (`turn_camera`, `rotation.ts:70`). Fit (Mod+0) fits the turned sketch and keeps the turn.
- **Directions on screen.** Walk's 8 buttons, its arrow keys and the ring show directions as they look on screen; each is turned back by the rotation and matched to the nearest direction of the set before walking. The magnet in Corners snaps in sketch coordinates, so its directions turn with the drawing.
- The rotation is view state, like pan and zoom: not saved in the file, not restored with the window. Export draws the sketch upright. There's no mouse gesture for it; a desktop turns only with touch.

### Label placement

`build_scene` (`scene.ts:193`) works in screen pixels so lines keep their weight and labels their size at any zoom and turn; it reruns on every view change. Labels are Hack (mono), 13 px, so their width is known without measuring: 0.6 em per character (`text_width`, `labels.ts:29`). `place_labels` (`labels.ts:98`) is greedy in request order: per path its edge lengths, dimensions, marker notes. Each tries spots along its preferred side (for an edge, the outward normal: outside a closed path by a point-in-polygon test, away from the centroid on an open one), stepping out 0 to 64 px and sliding along the edge, then the other side. It takes the first spot whose padded rectangle crosses no line (every edge, dimension and extension line) and no earlier label, corner dot or note (Liang–Barsky clipping). When nothing is free it keeps the nearest spot rather than dropping the number.

### Export

PNG and SVG from the File menu, written where the save picker says, of the whole sketch upright. `export_scene` (`svg.ts:80`) builds the scene for a view that fits the sketch into about 900 px, crops to what it draws plus 24 px, and writes plain SVG. Colours are the current theme's, read from the CSS tokens and turned into sRGB hex through a 1 px canvas (`theme_palette`, `export.ts:22`) so the file opens anywhere. The PNG is that SVG drawn at 2× into a canvas. Fonts aren't embedded: the SVG asks for Hack, then the system mono.

## Data

- **`.tapesketch`**, UTF-8 JSON, `version: 3`:
  ```ts
  { version: 3, unit: "mm" | "cm" | "m" | "in",
    snap: number[],                       // degrees, 1 to 180 of them; each also means its opposite
    points: { id, x, y }[], paths: { id, points: id[], closed, lengths: (mm | null)[], check: boolean }[],
    dims: { id, a, b, length: mm | null, offset }[], markers: { id, point, note }[],
    notes: { id, x, y, text }[] }
  ```
  Parsed with zod (`parse_sketch`, `format.ts:129`): a newer `version` is refused ("made by a newer Tape Sketch"), lengths must be positive, every point reference must exist, a closed path needs 3+ corners and a path needs exactly one length per edge; `snap` is normalised on read. Saved with coordinates and offsets rounded to 0.1 and lengths to 0.01 mm (`serialize_sketch`, `format.ts:146`), always as version 3.
- **Version 2** (3.67.0 to 3.74) had `paths[].height` (mm or null) and a 3D view, no `snap` and no `check`. It still opens: every path gets `check: true`, the sketch gets the 45° set, and each non-null height becomes a marker note `↑ {height}` in the file's unit on that path's first corner (`heights_to_markers`, `format.ts:80`). A marker already on that corner gets ` · ↑ …` appended, so two heights on one corner share it. A notification says how many heights moved; saving writes version 3.
- **Version 1** (3.65.0) had no heights and a `boxes` list (`{ id, x, y, w, d, h, note }`, an oblique W × D × H symbol). It opens through the version 2 path; the boxes are left out, counted, with a notification saying how many.
- Opened through the `.tapesketch` association (`FILE_PROPS`, `path`). Open…, Save (Mod+S), Save as… (Mod+Shift+S), New sketch, and the dirty close guard follow Hopsprite.
- `app.tape-sketch.snap` in app storage: the magnet on or off.
- `/var/lib/apps/tape-sketch/achievements.json`: achievements, written by the OS ([achievements](../system/services/achievements.md)).
- No shell commands; `open` covers it through the association.

**Achievements** (ADR-078), reported after a save lands, from the saved sketch (`geometry.ts`), only when the sketch had unsaved changes or had never been saved (Save on an untouched file earns nothing): `first-save`, `every-edge` (`all_measured`: at least one edge, every edge of every path with a length; dimension lines don't count), `square` (`checks_out`: a closed path with Check lengths on, every edge measured and its closure within tolerance).

## Dependencies & licences

None beyond the repo: zod for the file, `$kit/utils/history` and `$kit/utils/view` (scale clamp, fit, zoom). The rotation math is the app's own; the kit `View` is untouched.

## Limits

- The sketch is not to scale on purpose; only Redraw to scale makes the drawing match the numbers, and only per path.
- There's no height and no 3D view any more: a 3D box is drawn by hand (Iso helps) with Check lengths off, and a height goes in a marker or a dimension.
- The closure check is per closed path; dimensions aren't checked against anything, and a path with Check lengths off isn't checked at all.
- A dimension endpoint tapped off a corner becomes a free point; it isn't snapped onto the middle of an edge.
- Label placement is greedy, not optimal: a crowded corner can push a label far out, and a sketch with dozens of short edges isn't measured for speed.
- Rotation has no mouse or keyboard control, and isn't remembered across opens.
- The PNG and SVG use the theme of the moment; exporting in a light theme gives a light picture.
- Tested by hand on Chromium only (desktop window, 390 px mobile shell with touch, a two-finger twist sent as CDP touch events).

## Decisions

- [ADR-078](../adrs/078-achievements.md): achievements.
- [ADR-069](../adrs/069-tape-sketch.md) and its revisions: 2026-10-25 (the numbers above; the 3D view replacing the box) and 2026-10-27 (3D and heights removed, Check lengths, magnet sets, rotation, key buzz).
- [Brainstorm 2026-10-25](../brainstorm/2026-10-25_tape-sketch.md), sessions 1 and 2; [brainstorm 2026-10-27](../brainstorm/2026-10-27_tape-sketch-2d.md).
