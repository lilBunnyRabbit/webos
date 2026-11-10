# Wireframe
Id `wireframe` · Source: `src/lib/apps/user/wireframe/` · [ADR-102](../adrs/102-wireframe.md) · [brainstorm 2026-11-09](../brainstorm/2026-11-09_line-sketch-3d.md) · [brainstorm 2026-11-10](../brainstorm/2026-11-10_wireframe-place-and-fill.md)

## What it does

A planner for furniture, rooms and fences drawn as 3D lines at real lengths, desktop first and usable on a phone. Every line is walked from a point along X (across), Y (into the depth) or Z (up) with a typed length, so the drawing is exact and to scale; slopes join two points that exist, and a floating part starts from a typed offset. The view orbits at any time and every line carries its length. It opens in the cavalier projection the owner draws by hand in Inkscape (X across, Z up, Y at 30° and full length), with isometric, front, side and top a menu away. Boxes, extrude and copy along an axis save drawing the same edges twice. A part is moved, duplicated or pasted by holding one of its corners and dropping it on a point, so it joins what's there exactly; a closed flat loop of lines can be filled with an opaque face, as the owner's Inkscape drawings fill wall panels and leave out what's behind them.

## How it works

Pure logic is in `.ts` files with Node tests beside the ones that hold the decisions: `model.ts` (types, the axis of a line), `units.ts`, `projection.ts` (orbit, cavalier blend, axis inference), `edit.ts` (every edit as `Wire → Wire`, the repeat tools), `faces.ts` (loops, flatness, Fill), `part.ts` (lifting a part out, placing it, the clipboard text), `labels.ts` (placement), `scene.ts` (everything the view draws, in screen pixels, back to front), `format.ts` and `svg.ts`. Reactive state is one `Editor` in `editor.svelte.ts`: an immutable undo history of whole sketches (`$kit/utils/history`), the tool, the axis panel's job, the selection (points, lines, faces), the part being placed, the stroke waiting for its length and the typed text. `wireframe-canvas.svelte` draws the scene as SVG and owns its pointer input; the app file maps taps and strokes to edits and holds the camera.

### Model

Points carry x, y, z in mm; a line is a pair of point ids and a colour. Lines touch only where they share a point, never where they cross on screen. A line's axis isn't stored: `axis_of` (`model.ts:91`) reads it from the ends (exactly one coordinate differs by more than 0.005 mm), so a moved point turns its lines into slopes with no special case. Every edit goes through `ensure_point` (`edit.ts:26`), which reuses a point already within 0.005 mm of the new position: two strokes that end in the same place share their corner, and a walk whose computed end lands on an existing point ends on it. That point's position decides, which also settles two corners drawn on the same pixel. Coordinates are rounded to 0.01 mm on every edit.

A face is a loop of point ids in order and a colour. It holds no lines: its sides are the pairs of neighbouring points (`face_sides`, `model.ts`). Deleting a point of a face, or a line along one of its sides, deletes the face (`delete_items`). When points merge (`merge_coincident`, or a drop that lands a part on existing points), faces are remapped like lines: a loop that collapses to fewer than three corners, or that fills a loop already filled, goes (`remap`, `edit.ts`). Extrude, Copy along, Duplicate and Paste carry every face whose points are all in what they copy. A face whose points move only in part (a typed Move of some of its corners) follows them and can end up bent; nothing checks it again.

### Projection

A camera is an orbit, a pivot and the kit `View` (zoom and pan, `projection.ts:19`). The orbit gives a 2 × 3 basis: screen x and screen y per mm of world X, Y and Z (`basis`, `projection.ts:79`). The plain orbit is orthographic, yaw about Z and pitch above the floor:

```
screen x = X cos ψ + Y sin ψ
screen y = (X sin ψ − Y cos ψ) sin θ − Z cos θ        (screen y grows down)
```

Cavalier isn't an orbit: it's an oblique shear, `x = X + Y cos 30°`, `y = −Z − Y sin 30°`. The orbit carries `oblique` from 0 to 1 and the basis is the linear blend of the orthographic basis and the cavalier one. The Cavalier preset is `oblique: 1` on top of an orbit that looks roughly the same (ψ 30°, θ 20°), so orbiting out of it fades the shear over the first 160 px of drag (`orbit_by`, `projection.ts:148`) instead of jumping. The presets:

| Preset | ψ | θ | oblique |
|--------|---|---|---------|
| Cavalier | 30° | 20° | 1 |
| Isometric | 45° | 35.26° (asin tan 30°, all three axes the same length) | 0 |
| Front | 0° | 0° | 0 |
| Side | 90° | 0° | 0 |
| Top | 0° | 90° | 0 |

Pitch is clamped to ±90°, yaw wraps. Picking a preset animates the orbit for 260 ms. Depth, for drawing order, is the distance along the direction that projects to a dot (`view_direction`, the cross product of the two basis rows), so it works for the oblique blend too: lines and points are drawn back to front, nearer on top.

Points are projected about a pivot. Orbiting turns about the drawing's 3D centre: when an orbit starts, the pivot moves there and the pan takes up the difference so nothing jumps (`repivot`, `projection.ts:120`). Zoom is the app's own clamp, 0.002 to 40 px per mm (`scene.ts`), since the kit's clamp (0.05) can't fit a 50 m fence on a phone.

### Input

Mouse: left-drag from a point strokes (Draw), on empty space it pans; right- or middle-drag orbits, Shift with it pans; the wheel zooms about the pointer. Touch: one finger strokes from a point or pans. Two fingers lock after 10 px to what they did first (`wireframe-canvas.svelte`): moving together orbits; spreading or closing zooms about the midpoint and pans with it. Locking keeps a pinch from turning the view or fading Cavalier's shear. Opening a file shows it in Cavalier, fitted; a load that lands after the drawing was edited, or after New, is dropped with a notice (`open_request`, and the wire compared before and after the read).

### Axis inference

In a parallel projection the six axis directions (±X, ±Y, ±Z) are six screen directions. `axis_directions` (`projection.ts:188`) lists them for the current basis, minus any axis whose screen length is under 0.2 of the longest: seen almost end-on, a stroke along it would be a guess. A drag from a point picks the direction with the smallest angle to the drag (`nearest_axis`). `overlapping` refuses drawing when two different axes are within 14° of each other on screen, with a hint naming them; Front, Side and Top drop the axis pointing at you and still draw along the other two.

While the drag moves, the stroke shows as a dashed line in its axis colour with a suggested length: the drag projected on the axis in mm, rounded to the smallest of 1, 5, 10, 50, 100, 500, 1000, 5000 mm that's at least 8 px on screen (`round_drag`), or the exact distance when the pointer is over a point that lies on that ray. Every point under the pointer is looked at (`elementsFromPoint`), so of two corners on one pixel the stroke takes the one its ray reaches. A snapped stroke remembers the point (`Editor.snap`) and commits to it exactly, whatever the rounded text says. The suggestion is shown dimmed; the first key typed replaces it and drops the snap. Enter (or ✓) commits the stroke, and the next stroke starts at its end.

Without a drag: type a length, then press X, Y or Z (Shift for minus) or tap a spoke of the ring. The ring (the kit's `DirectionRing`, `$kit/components/length-pad`, shared with Tape Sketch) draws its six spokes along their projected directions, coloured per axis, and picks the spoke nearest the finger on release (lost pointer capture), showing its name in the middle while held; the stroke waiting for its length stays lit. Visually hidden buttons carry the same actions for screen readers.

Axis colours are tokens: X `accent`, Y `secondary`, Z `tertiary`, in the gizmo, the ring, the stroke preview and the guides from the start point.

### Repeat tools

| Tool | What | Where |
|------|------|-------|
| Box | From a point (or the origin), W × D × H typed as `80 x 40 x 200`: 8 corners and 12 edges, each corner through `ensure_point`, so a box against an existing one shares its corners | `add_box`, `edit.ts:109` |
| Extrude | The selected lines copied a typed length along an axis, plus a line joining each copied point to its original, in the original line's colour | `extrude`, `edit.ts:180` |
| Copy along | The selected lines copied `count` times, each `step` further along the axis (1 to 99) | `copy_along`, `edit.ts:200` |
| Move | The selected points, and the ends of the selected lines, moved a typed length along an axis | `move_points`, `edit.ts:72` |
| Merge | Points within 0.005 mm become one; lines that then join a point to itself or double another line go | `merge_coincident`, `edit.ts:219` |

Extrude and Copy along run from the selection bar or E and C, Move by a length from M (or **By length** while placing): the axis panel opens with the numpad and the ring, and picking a direction applies it as one undo step. Extrude and Copy leave the new lines selected, so the next repeat builds on them. Deleting lines drops their end points when no other line holds them; a point that never had a line (a floating anchor) stays.

### Placing parts

An exact drop in 3D needs a target that already has a 3D position, so placing goes from point to point. Move (G, and Move in the selection bar), Duplicate (Mod+D) and Paste (Mod+V) put the editor into place mode (`Editor.place`: the kind, the part, the handle):

1. The part is lifted out of the selection (`extract_part`, `part.ts`): the selected points, lines and faces, the lines along the selected faces' sides, every end and corner of those, and every face whose corners are all in it.
2. Move and Duplicate wait for a tap on one of the part's points: that's the handle. Paste has its handle already, the part's lowest corner.
3. On a desktop the part follows the pointer as a dashed ghost in the primary colour. The ghost is the part's projection translated on screen: each corner is drawn at the pointer plus `direction(corner − handle)`, which is exact for a parallel projection. Over a point it snaps to that point's projection.
4. A tap on a point (or the origin of an empty drawing) drops it there: the shift is target − handle, exactly. Move runs `translate` (`edit.ts`): the points move and any that land on a point that stayed merge into it, lines and faces remapped as above. Duplicate and Paste run `place_part`: every corner goes through `ensure_point`, lines through `add_line` (an edge already there isn't doubled) and faces through `add_face`; the new lines and faces end up selected.

Each drop is one undo step. Esc, Cancel in the bar, or the back button cancel; a touch screen uses the same two taps with no ghost. Duplicate is never written to the drawing before the drop: a copy in place would merge straight into its original. Undo or redo while a held part comes from the drawing ends place mode, since the part no longer matches the sketch; a pasted part stays held.

### Clipboard

Mod+C (or Copy in the selection bar) writes the part to the system clipboard as text, through ClipboardService `copy_text`:

```ts
{ wireframe: 2, unit, points: { id, x, y, z }[], lines: { id, a, b, color }[], faces: { id, points, color }[] }
```

Positions are mm, relative to the part's lowest corner (lowest Z, then Y, then X: `anchor_of`), rounded to 0.01 mm. The `wireframe` tag tells a paste it's a part; `unit` is informational, a paste keeps the target's unit. Mod+V (or Paste in the bar or the File menu) reads the text with `navigator.clipboard.readText()` and parses it with zod plus the file's reference checks (`parse_clip`); anything else is refused with a notice. Since it's the system clipboard, a part copied in one Wireframe window pastes in any other, and survives a reload. Mod+C and Mod+V stay the browser's own while a text field has focus.

### Faces and drawing order

Fill (F, or the paint bucket in the selection bar when three or more lines are selected) runs `fill` (`faces.ts`): the lines must form one closed loop (every end on exactly two of them, all connected) or it says "These lines don't close a loop"; the corners must lie within 0.05 mm of one plane (Newell's normal) or it says "The loop isn't flat". The face takes the most common colour among its edges, the first one round the loop on a tie. A loop already filled is refused. The colour picker recolours selected faces as it does lines.

Faces are opaque, so the view is one painter's list (`Scene.order`, `scene.ts`) of faces, lines and points sorted back to front by depth: a face at its corners' mean depth, a line at its midpoint, a point at its own. A face's own sides and corners are lifted to at least the face's depth and sort after it on a tie, so the edges of a face always show on it even where their middle sits behind its middle. Ties otherwise go face, line, point. The fill is the face colour mixed 24 % (12 % for the ink) into the background in sRGB (`face_css`, `colors.ts`): an opaque, muted tint from tokens only, in both themes. A selected face is the primary colour mixed 32 %.

Faces are hit targets (tap inside to select). Line strokes and their hit areas are in the painter's list, so a face covers the lines behind it for taps too; point hit areas stay on top of everything, so a hidden corner can still be a target for a drop. The accepted risk (brainstorm): sorting by one depth per item can be wrong where faces cross or where a long face sits next to a small one.

### Labels

`build_scene` (`scene.ts`) projects every point and places labels in screen space, so they stay upright at any orbit. Not every line gets one:

- Within one connected part (union-find over the lines), lines that are parallel and of the same length share a group (part, direction either way, length to 0.01 mm) and show their length once, on the first of them that finds a spot. A box reads W × D × H; three copied boxes, being three parts, read it three times.
- The selected lines and the line under the mouse are forced: they always show their own label, placed first.
- A line under 30 px on screen gets none, unless forced.
- A line whose middle is behind a face (inside a nearer face's outline, not one of its sides) gets none, unless forced.
- **All lengths** (View menu, Shift+L) off: only the forced lines get one. The setting is `{ labels: boolean }` in `/var/lib/apps/wireframe/settings.json` (`storage.file`), the same in every window.

Requests go forced first, then longest line first, each preferring the side of its line away from the drawing's screen centroid. `place_labels` (`labels.ts`) is Tape Sketch's greedy placer (step out from the line up to 24 px, slide along it, first spot that crosses no line and no earlier label or point) with a 64 px grid index for lines and placed labels, since it reruns on every frame of an orbit. What finds no such spot gets a second pass, after every group has had its chance, with the nearest spot clear of other labels even across a line; with none, it's left out rather than floated away or stacked. A slope that lies on another line on screen (Front view) isn't parallel to it in 3D, so it keeps its own label. Labels show lengths to 0.1 mm (1 place in mm, 2 in cm, 4 in m, trailing zeros trimmed); the length input keeps 0.01 mm.

### Export

PNG and SVG of the current orbit from the File menu: `wire_svg` (`svg.ts`) fits the drawing into about 1000 px, crops to the points and labels plus 16 px, and writes plain SVG in the same back-to-front order as the view, faces as polygons. Labels follow the All lengths setting (off exports none, since nothing is selected or hovered in a file). Theme tokens and token line colours are read from CSS and turned into sRGB hex through a 1 px canvas (`theme_palette`, `export.ts`); hex line colours go out as they are; a face's fill is the same sRGB mix as on screen, done on the hex values. The PNG is that SVG drawn at 2×.

## Data

- **`.wire`**, UTF-8 JSON, `version: 2` (ADR-102):
  ```ts
  { version: 2, unit: "mm" | "cm" | "m",
    points: { id, x, y, z }[],                       // mm
    lines: { id, a, b, color: string | null }[],     // a token name or #rrggbb; null is the foreground
    faces: { id, points: string[], color }[] }       // point ids in loop order, at least 3
  ```
  Parsed with zod (`parse_wire`, `format.ts`): a version 1 file opens with `faces: []` and is saved as version 2; a `version` above 2 is refused ("made by a newer Wireframe"), so an older Wireframe never drops faces by saving over them. Point, line and face ids must be unique, every line's ends must exist and differ, every face corner must exist and appear once; a colour is one of `primary`, `secondary`, `tertiary`, `accent`, `info`, `success`, `warning` or a 6-digit hex. Coordinates are written rounded to 0.01 mm. The view is not in the file: a file always opens in Cavalier, fitted.
- Opened through the `.wire` association (`FILE_PROPS`, `path`). New, Open…, Save (Mod+S), Save as… (Mod+Shift+S) and the dirty close guard follow Tape Sketch.
- App storage: `settings.json` (`{ labels }`, the All lengths toggle). No shell commands; `open` covers it through the association.
- Guide: `guide.md`, shown on the first launch with no props.

## Dependencies & licences

None beyond the repo: zod for the file, `$kit/utils/history`, the kit `View` type. The projection, orbit and label placement are the app's own code; a second app that needs them moves them to the kit (ADR-102).

## Limits

- No groups or layers, no import of Inkscape SVGs, no perspective, no Fill tool that taps inside a region (ADR-102, deferred).
- Only faces hide anything: lines behind a face are covered, lines behind lines are all drawn. Hidden lines aren't dashed.
- One depth per face and line: crossing faces, or a long face beside a small one, can draw in the wrong order.
- A partly moved face isn't re-checked for flatness.
- The paste and drop ghost shows only with a mouse; on touch the part appears when it's dropped.
- In a dense drawing some lengths go unlabelled until you zoom in or turn the view: placement is greedy and drops a label rather than stack it. Speed with hundreds of lines while orbiting is unmeasured.
- Box sizes and floating offsets are typed in a text prompt, not on the numpad.
- No box-select: Shift-click and Mod+A build a multi-selection. On a phone, once lines are selected, tapping another line adds it (tapping a selected one drops it, empty space clears), so a loop can be picked for Fill; points and faces are still one at a time.
- Tested by hand on Chromium only (desktop window, 390 px mobile shell with touch).

## Decisions

- [ADR-102](../adrs/102-wireframe.md) and its 2026-11-10 revisions (what the build decided inside the ADR; place, labels and faces).
- [Brainstorm 2026-11-10](../brainstorm/2026-11-10_wireframe-place-and-fill.md): placing point to point, the system clipboard, the label toggle, opaque faces and `.wire` version 2.
- [Brainstorm 2026-11-09](../brainstorm/2026-11-09_line-sketch-3d.md): new app, axis walk, SVG renderer, no groups in v1.
