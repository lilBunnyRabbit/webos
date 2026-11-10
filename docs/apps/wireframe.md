# Wireframe
Id `wireframe` · Source: `src/lib/apps/user/wireframe/` · [ADR-102](../adrs/102-wireframe.md) · [brainstorm 2026-11-09](../brainstorm/2026-11-09_line-sketch-3d.md)

## What it does

A planner for furniture, rooms and fences drawn as 3D lines at real lengths, desktop first and usable on a phone. Every line is walked from a point along X (across), Y (into the depth) or Z (up) with a typed length, so the drawing is exact and to scale; slopes join two points that exist, and a floating part starts from a typed offset. The view orbits at any time and every line carries its length. It opens in the cavalier projection the owner draws by hand in Inkscape (X across, Z up, Y at 30° and full length), with isometric, front, side and top a menu away. Boxes, extrude and copy along an axis save drawing the same edges twice.

## How it works

Pure logic is in `.ts` files with Node tests beside the ones that hold the decisions: `model.ts` (types, the axis of a line), `units.ts`, `projection.ts` (orbit, cavalier blend, axis inference), `edit.ts` (every edit as `Wire → Wire`, the repeat tools), `labels.ts` (placement), `scene.ts` (everything the view draws, in screen pixels), `format.ts` and `svg.ts`. Reactive state is one `Editor` in `editor.svelte.ts`: an immutable undo history of whole sketches (`$kit/utils/history`), the tool, the axis panel's job, the selection, the stroke waiting for its length and the typed text. `wireframe-canvas.svelte` draws the scene as SVG and owns its pointer input; the app file maps taps and strokes to edits and holds the camera.

### Model

Points carry x, y, z in mm; a line is a pair of point ids and a colour. Lines touch only where they share a point, never where they cross on screen. A line's axis isn't stored: `axis_of` (`model.ts:91`) reads it from the ends (exactly one coordinate differs by more than 0.005 mm), so a moved point turns its lines into slopes with no special case. Every edit goes through `ensure_point` (`edit.ts:26`), which reuses a point already within 0.005 mm of the new position: two strokes that end in the same place share their corner, and a walk whose computed end lands on an existing point ends on it. That point's position decides, which also settles two corners drawn on the same pixel. Coordinates are rounded to 0.01 mm on every edit.

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

Move, Extrude and Copy run from the selection bar or M, E, C: the axis panel opens with the numpad and the ring, and picking a direction applies it as one undo step. Extrude and Copy leave the new lines selected, so the next repeat builds on them. Deleting lines drops their end points when no other line holds them; a point that never had a line (a floating anchor) stays.

### Labels

`build_scene` (`scene.ts`) projects every point and places labels in screen space, so they stay upright at any orbit. Not every line gets one:

- Within one connected part (union-find over the lines), lines that are parallel and of the same length share a group (part, direction either way, length to 0.01 mm) and show their length once, on the first of them that finds a spot. A box reads W × D × H; three copied boxes, being three parts, read it three times.
- The selected lines and the line under the mouse are forced: they always show their own label, placed first.
- A line under 30 px on screen gets none, unless forced.

Requests go forced first, then longest line first, each preferring the side of its line away from the drawing's screen centroid. `place_labels` (`labels.ts`) is Tape Sketch's greedy placer (step out from the line up to 24 px, slide along it, first spot that crosses no line and no earlier label or point) with a 64 px grid index for lines and placed labels, since it reruns on every frame of an orbit. What finds no such spot gets a second pass, after every group has had its chance, with the nearest spot clear of other labels even across a line; with none, it's left out rather than floated away or stacked. A slope that lies on another line on screen (Front view) isn't parallel to it in 3D, so it keeps its own label. Lengths show to 0.01 mm (2 places in mm, 3 in cm, 5 in m, trailing zeros trimmed).

### Export

PNG and SVG of the current orbit from the File menu: `wire_svg` (`svg.ts`) fits the drawing into about 1000 px, crops to the points and labels plus 16 px, and writes plain SVG. Theme tokens and token line colours are read from CSS and turned into sRGB hex through a 1 px canvas (`theme_palette`, `export.ts`); hex line colours go out as they are. The PNG is that SVG drawn at 2×.

## Data

- **`.wire`**, UTF-8 JSON, `version: 1` (ADR-102):
  ```ts
  { version: 1, unit: "mm" | "cm" | "m",
    points: { id, x, y, z }[],                       // mm
    lines: { id, a, b, color: string | null }[] }    // a token name or #rrggbb; null is the foreground
  ```
  Parsed with zod (`parse_wire`, `format.ts`): a newer `version` is refused ("made by a newer Wireframe"); point and line ids must be unique, every line's ends must exist and differ; a colour is one of `primary`, `secondary`, `tertiary`, `accent`, `info`, `success`, `warning` or a 6-digit hex. Coordinates are written rounded to 0.01 mm. The view is not in the file: a file always opens in Cavalier, fitted.
- Opened through the `.wire` association (`FILE_PROPS`, `path`). New, Open…, Save (Mod+S), Save as… (Mod+Shift+S) and the dirty close guard follow Tape Sketch.
- No app storage file and no shell commands; `open` covers it through the association.
- Guide: `guide.md`, shown on the first launch with no props.

## Dependencies & licences

None beyond the repo: zod for the file, `$kit/utils/history`, the kit `View` type. The projection, orbit and label placement are the app's own code; a second app that needs them moves them to the kit (ADR-102).

## Limits

- No groups or layers, no import of Inkscape SVGs, no perspective, no faces: lines only (ADR-102, deferred).
- Hidden lines aren't dashed or dimmed; everything is drawn, back to front.
- In a dense drawing some lengths go unlabelled until you zoom in or turn the view: placement is greedy and drops a label rather than stack it. Speed with hundreds of lines while orbiting is unmeasured.
- Box sizes and floating offsets are typed in a text prompt, not on the numpad.
- No box-select: Shift-click and Mod+A build a multi-selection, and on a phone a selection is one item at a time.
- Tested by hand on Chromium only (desktop window, 390 px mobile shell with touch).

## Decisions

- [ADR-102](../adrs/102-wireframe.md) and its 2026-11-10 revision (what the build decided inside the ADR).
- [Brainstorm 2026-11-09](../brainstorm/2026-11-09_line-sketch-3d.md): new app, axis walk, SVG renderer, no groups in v1.
