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

## Next session topics
- Photo underlay (measure on a photo).
- Shell commands, if wanted.
- Rooms with a height, extruded in 3D.
