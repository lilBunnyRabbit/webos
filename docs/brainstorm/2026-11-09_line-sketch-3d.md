# 3D line sketches with real lengths

**Date:** 2026-11-09
**Participants:** owner, Claude (lead), one researcher agent

## Context

The owner plans furniture, rooms and fences as 3D line drawings in Inkscape with real lengths: omara (wardrobe under a sloped roof), predsoba (hallway), skarpa (fence wall on a slope), ograja (stair railing). What's missing is a way to turn the sketch and still read the measurements. An older college project, `fri-3-year/rgti/dn-1`, turned points and lines into a 3D object that could be rotated and scaled. The idea is to join the two. The hard part is the editor: how to say, as simply as in Inkscape, where things are, what touches what, and what is in front.

### How the Inkscape sketches are built

Read from `~/Documents/Inkscape/*.svg`:

- The document is in cm with 1 user unit = 1 mm (`width="1000cm"`, `viewBox="0 0 10000 10000"`).
- The projection is **cavalier oblique**: X is horizontal (`H`), Z is vertical (`V`), and Y runs at 30° at full length (`m 4.97,6372.79 3464.10,-2000` is a 4000 mm Y edge).
- Lengths are the geometry itself, read with Inkscape's measure tool. There are no text labels.
- The layers `Coo` / `X` / `Y` / `Z` draw the axes in red, teal and blue. The object layers are named (`stene`, `stroj`, `prikl`, `ograja`, `stena`) and each has its own colour.

A script classified every segment by its screen angle:

| File | X (0°) | Y (30°) | Z (90°) | other |
|------|--------|---------|---------|-------|
| omara | 26 | 44 | 37 | 11 + 2 arcs |
| omara-v4 | 62 | 104 | 77 | 26 + 2 arcs |
| predsoba | 26 | 25 | 35 | 4 |
| skarpa | 43 | 64 | 77 | 0 |

85–100 % of the lines lie on an axis. The rest are roof slopes, door swings and stair stringers, and those join two corners that already exist.

### What exists in WebOS

- **Tape Sketch** ([ADR-069](../adrs/069-tape-sketch.md), [internals](../apps/tape-sketch.md)) is a phone-first, not-to-scale measuring pad. It already has:
  - an Iso magnet,
  - a direction ring,
  - a numpad that steps through edges,
  - upright label placement,
  - two-finger rotation.
- **Tape Sketch's old 3D view.** Tape Sketch had heights and a 3D view of extruded floor plans from 2026-10-25 to 2026-10-27, and it was removed ([2026-10-27](2026-10-27_tape-sketch-2d.md)). The owner's reason: "i would drop 3d in the way it is now its too complex. i would rather have better support to draw the 3d axis shapes". The removed code (an SVG projection, no dependency) is at `34d71eab^:src/lib/apps/user/tape-sketch/projection.ts`, `solid.ts` and `tape-sketch-solid.svelte`.
- **No 3D library** is in the repo.
- **dn-1** returns 404, so it is private. It was not read.

## The key observation

In a parallel projection (cavalier like the owner's, or isometric), the three axes appear as three different screen directions. A stroke in one of those directions can mean only one axis, sign included. The editor never has to guess depth:

- **Where things are.** Each line is an axis plus a length. A chain of lines from a known point is fully defined in 3D. "In front" is just the Y value you walked to.
- **What touches.** Two lines touch when they share a point. Lines that cross on screen never connect (the Huffman–Clowes T-junction rule). Depth decides what is in front, and the user never draws it.
- **Lines off the axes** (slope, brace, stringer) go between two points that are already placed, or take a typed 3D offset.
- **Where it is ambiguous:**
  - a tap on empty space: it goes to the floor (z = 0) or snaps to a point;
  - two corners on the same pixel: pick the one the lengths lead to;
  - a part connected to nothing (omara's two wall boxes): it needs an anchor, an offset from a known point.

That is the difference from the dropped 3D view. That view was a second view of a flat plan. Here the drawing itself is 3D, so turning it is free.

## Editor models (research: SketchUp, Shapr3D, Onshape, Mental Canvas, Lipson–Shpitalni, True2Form)

| # | Model | Box with a shelf | Depth from | Hard part |
|---|-------|------------------|------------|-----------|
| 1 | **Axis walk from anchored points**: SketchUp's inference cut down to 3 coloured axes, a typed length on every stroke | Origin, then red 80, green 40, back; blue 200 up from the corners (or "copy edge along axis"); for the shelf, tap a vertical edge at 90, then red 80 and green 40 | Every stroke starts at a known point | Snapping on touch without hover (to an end, on an edge at a distance, parallel); repeating an edge or face so a box isn't 12 strokes |
| 2 | **Draw flat, then lift**: Tape Sketch's Iso magnet, each edge tagged with its axis by direction, then a "3D" button | Draw as in Tape Sketch today, type the lengths, then orbit | The chain from the first point, rebuilt from typed lengths per axis | Not-to-scale input has to be rebuilt per axis, with loops that don't close flagged; floating parts need anchors |
| 3 | **Work planes**: Shapr3D, Onshape, Mental Canvas | Floor plane rectangle, side plane, a plane at 90 for the shelf | The active plane | Managing planes; vertical lines between planes need their own tool. Close to the extrude model that was already dropped |
| 4 | **Freehand + automatic lift**: Lipson–Shpitalni, True2Form | Draw anywhere, a solver guesses | Optimisation | Can be wrong without saying so; typed cm don't fit. Rejected |

Labels: project every point each frame and run a Tape Sketch-style 2D placer in screen space, so labels stay upright for free. Hide an edge's label when it is very short on screen.

The full research, with sources, is summarised here. The per-tool tables were in the researcher's scratch doc.

## Topics discussed, with decisions

- **A new app, not part of Tape Sketch.** Owner: "tape sketch is mobile focused that i can use on the go. this is more specific and complex thing".
- **Editor: axis walk.** Every stroke starts at a known point and follows X, Y or Z. Its length is typed in cm, so the geometry is always exact and to scale, and the view can be turned at any time while drawing. A slope joins two points that already exist. A floating part takes a typed x, y, z offset from an anchor.
- **Inkscape SVG import: later**, not in v1.
- **Renderer: SVG with its own projection math**, no dependency. Points are projected each frame, then lines and labels are drawn in screen space with the labels upright.
- **Platform: desktop first, mobile usable.** Mouse and keyboard is the main path. On mobile you can open, orbit, read and make light edits (direction ring, numpad).
- **No groups in v1.** Each line picks its own colour from the theme's accents. Named layers come later.
- **Repeat tools in v1:**
  - Box: from a corner, W × D × H gives 8 points and 12 edges.
  - Extrude along an axis: the selection is copied a typed length away and joined by edges.
  - Copy along an axis × n: a step and a count.
- **Files: own file type in `/home`**, opened by association. A versioned zod format: points in mm, lines, colours. SVG/PNG export of the current view.
- **Shell: `open` through the file association only.** No manifest commands.
- **Name: Wireframe, with the `.wire` extension.** Recorded in [ADR-102](../adrs/102-wireframe.md).

### Picked by the lead (inside the decided scope)
- **Model:** points in mm and lines as point pairs. A line's axis is derived from its points, not stored, so a moved point turns its lines into slopes without any special case.
- **View presets:** Cavalier (the owner's Inkscape view), Isometric, Front, Side, Top. Drawing is refused when two axis directions nearly overlap on screen.
- **Labels:** every line shows its length; a label is hidden when its line is very short on screen.
- **Line colour:** a user colour (a token name or a hex), per Design › User colours.

## Key takeaways

- The owner's sketches are already 3D data in disguise: axis lines at true length in a fixed oblique projection. Both a native editor and an importer for the existing files are feasible.
- The editor problem shrinks to anchoring. Once every line has an axis and starts from a known point, "touching" and "in front" fall out.

## Action items

- [x] Owner decides: new app or part of Tape Sketch; the editor model; importing Inkscape files; the renderer; shell.
- [x] One app-builder agent builds Wireframe v1 per ADR-102, with a visual pass on desktop and mobile (2026-11-10).
- [x] A review of the build, then a push (4.14.0, 2026-11-10).

## Next session topics

- Groups and layers (the owner's named, coloured layers), and showing or hiding them.
- Repeating geometry (copy an edge, face or box along an axis): skarpa's posts and stair steps.
