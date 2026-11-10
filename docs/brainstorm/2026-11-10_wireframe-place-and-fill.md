# Wireframe: placing parts, hiding labels, filled faces

**Date:** 2026-11-10
**Participants:** owner, Claude (lead)

## Context

Wireframe 4.14.0 shipped ([ADR-102](../adrs/102-wireframe.md), [first session](2026-11-09_line-sketch-3d.md)). The owner's skarpa sketch was converted to a `.wire` by a one-off script, and it came out right ("yep basically perfect"). Using it showed three gaps:

- **Labels can't be hidden.** On a drawing of 180 lines, the labels are noise when you're only looking at the shape.
- **Copying a part is awkward.** Copying one wall section and setting it next to the old one, joined at the shared corners, takes typed axis moves today. The only tools are Move by a typed length along one axis, Copy along an axis × n, and Extrude.
- **Nothing can be filled.** Wall panels and fence boards read as glass. The owner's Inkscape drawings fill them and leave out hidden lines.

The constraint behind the placing design: a cursor in empty space has no depth in 3D, so an exact drop needs a target that already has a 3D position, which means an existing point.

## Topics discussed, with decisions

- **Placing a part: grab a point, drop it on a target point.**
  1. Select the lines and press G (Move).
  2. Tap one of the part's points as the handle.
  3. The part follows the cursor as a ghost.
  4. Tap a target point: the part moves by (target − handle), exactly.
  - Esc cancels.
  - The typed axis Move stays, for offsets that end on no point.
- **Clipboard: the system clipboard.**
  - Mod+C writes the selected part as Wire JSON text, with positions relative to the handle.
  - Mod+V, in any Wireframe window, starts the same placing with the copy as the ghost.
  - Text that isn't a wire fragment is refused.
  - Mod+D (Duplicate) copies in place and goes straight to placing. Owner: "duplicate would work aswell".
- **Labels: a toggle.**
  - It sits in the View menu, on Shift+L.
  - When labels are off, only the selected lines and the line under the mouse show their length.
  - The setting is remembered in the app's settings file in `/var/lib/apps/wireframe/`.
- **Faces (filled sections).**
  - **Making one:** select lines that close one flat loop and press F, or Fill in the selection bar. It's refused with a hint when the lines don't close a loop or aren't flat.
  - **Drawing:** faces are opaque and cover what's behind them, like the Inkscape drawings with hidden lines removed. Lines and faces are drawn back to front together.
    - Accepted risk: back-to-front order can be wrong where faces cross, or where a long face sits next to a small one.
  - **File:** `.wire` version 2 adds `faces: { id, points: [point ids in order], color }[]`.
    - Version 1 files still open.
    - An older cached Wireframe refuses a v2 file ("made by a newer Wireframe") instead of dropping the faces when it saves.
  - **Colour:** a new face takes the colour most of its edges have, and the colour picker recolours faces the same way it recolours lines.
- **Shell: nothing new.** Only `open` through the association, as before.

## Key takeaways

- An exact drop in 3D needs a point. That's why both placing and paste are grab-and-drop between points.
- The Inkscape import works: skarpa came over with one shift to anchor it and one depth pinned by hand. Turning that script into an Import feature is a candidate for a later session.

## Action items

- [ ] One app-builder builds the placing tools, the clipboard, Duplicate, the label toggle and faces, as one feature release.
- [ ] Review, a visual pass, then a push.

## Next session topics

- Inkscape SVG import as an app feature, from the script used for skarpa.
- Groups and layers.
