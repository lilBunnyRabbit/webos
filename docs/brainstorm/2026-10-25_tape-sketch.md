# Tape Sketch
**Date:** 2026-10-25
**Participants:** owner, Claude

## Context
Owner: "Often when im measuring around the house or in the house i end up with a sketch like this - i mean it works but its a) hard to read b) hard to make. So this needs to optimize how i can draw this sketches and how to add measurements to them. in some rare cases i even do simple 3d. This should be first optimized for mobile since this is something i do when im actively measuring things." Their example was a freehand outline in a phone notes app with handwritten numbers, one of them written over a correction. It was a private input and is not kept.

Today: Paint is freehand only. Nothing stores measured lengths.

## Decisions
- **New app** `tape-sketch`, "Tape Sketch". It's the owner's own idea, so no extra credit. [ADR-069](../adrs/069-tape-sketch.md). Rejected names: Measure (reads like a unit converter), Floor Plan (wrong for drawers and fences), Dimensions.
- **Drawing:** both tap-corners (snap to 45°) and walk (type a length, tap a direction). Owner: "its not always just walls. i often measure like drawers or maybe lamp positions". Rejected: freehand auto-straightened.
- **Pieces on one sketch:**
  - several paths, open or closed;
  - dimension lines between any two points (lamp to wall);
  - point markers with a note;
  - free text notes.
- **Scale:** the sketch is not to scale and the numbers win. The closure check flags mismatches while you're still standing there, and Redraw to scale is optional. Rejected: always to scale, and pure labels with no check.
- **3D:** a box object, W × D × H in oblique projection. Owner's example: measuring a fence, which needs width, height and depth. Rejected: an extruded room with a 3D view, and nothing.
- **Numbers:** the app's own big numpad sheet, stepping ← / → through the unmeasured edges. Rejected: the system keyboard.
- **Units:** per sketch, cm by default (mm / cm / m / in), stored in mm.
- **Storage:** `.tapesketch` JSON files in `/home` with a file association. Rejected: app storage.
- **Shell:** `open` through the association only, no commands. The owner didn't pick the commands option.
- **First cut:** everything above, plus PNG and SVG export and area and perimeter. Not now: a photo underlay.

## Key takeaways
- The fix for "hard to read" is binding a number to its edge. The fix for "hard to make" is tap corners plus a numpad, usable one-thumbed with a tape in the other hand.
- The closure check turns the sketch into a remeasure prompt on the spot.

## Action items
- [x] Build with one app-builder agent, mobile first. Docs page `docs/apps/tape-sketch.md`: the format, the closure check, the area rebuild, the oblique box.

## Session 2: 3D view replaces the box (2026-10-25)
Owner, after using 3.65.0: "i dont like the "box" - i think its best if we go with option for 3d view. will that be hard?" The rejected option from the first grill was a room extruded by a height with a rotatable 3D view.

### Decisions
- **Box: dropped.** Format `version: 2` has no `boxes`. A v1 file still opens; its boxes are left out with a toast that says so. Rejected: converting each box to a rectangle path with a height (code for files that hardly exist), keeping the box beside 3D (two ways to say one thing).
- **Height: any path, open or closed.** `path.height: mm | null`. A closed path plus a height is a room, a drawer or a box; an open path plus a height is a fence or a single wall. The height is one more numpad target, stepped after the path's edges. Rejected: closed paths only (a fence needs a thin rectangle), one height per sketch (a drawer and a lamp in one sketch).
- **Shape in 3D comes from the numbers.** Each path is rebuilt to scale from its lengths (the existing `rebuild`); unmeasured edges at the drawn ratio, an unmeasured height at a placeholder shown as `?`. Rejected: the drawing as drawn (3D would lie about proportions).
- **Layout: placed by drawing, sized by numbers.** Each rebuilt path sits where its first corner is in the drawing, through the sketch's median scale. Rejected: only the selected path in 3D.
- **3D view: a 2D / 3D toggle, measuring works in 3D.** Tap an edge or a height and the numpad opens on it, ← / → step as in 2D. Drawing and moving corners stay in 2D. Rejected: read-only orbit, fixed isometric (hides the back walls of an L-room), full editing in 3D (unprojecting touches onto the floor).
- **Also in 3D:** dimensions and markers on the floor. Free notes stay 2D only.
- **Shell:** nothing new; `open` through the association covers it.
- **Mobile interaction** (owner: "what is best for mobile use - think of something good"), picked by Claude:
  - one-finger drag on empty space orbits (yaw all round, pitch clamped between a near-top view and a near-side view); pinch zooms and pans as in 2D; double-tap on empty space resets to the default ¾ view;
  - a row of view chips at the bottom, in thumb reach: ¾, Top, Front, Side;
  - taps hit the nearest line within a touch-sized radius, so thin edges are easy to hit; a floor edge and its top edge are the same length target, a vertical edge is the path's height;
  - a path without a height shows a `↑ ?` handle at its first corner, a full touch target, so adding a height is one tap;
  - walls are translucent faces sorted back to front, edges drawn on top; the current target is in `primary` on both its floor and top copies;
  - each length is labelled once, on the floor edge; the height once, on the vertical edge nearest the viewer; a label whose edge is seen nearly end-on is hidden until that edge is tapped.

### Action items
- [x] One app-builder agent: format v2, height in 2D and 3D, 3D view, box removal, docs page and ADR-069 revision.

## Next session topics
- Photo underlay (measure on a photo).
- Shell commands, if wanted.
