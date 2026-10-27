# Tape Sketch: back to 2D
**Date:** 2026-10-27
**Participants:** owner, Claude

## Context
Tape Sketch ([ADR-069](../adrs/069-tape-sketch.md), [internals](../apps/tape-sketch.md)) got a 3D view and a height per path on 2026-10-25 ([earlier brainstorm](2026-10-25_tape-sketch.md), session 2). After using it, the owner:

> vibrate api on the keyboard, option to rotate canvas (with fingers i can only zoom now). i would drop 3d in the way it is now its too complex. i would rather have better support to draw the 3d axis shapes without the tool prompting me to adjust it - the adjusting prompt is good but i want to opt out as well since that would break my manual 3d of it.

And: "optional angle defs would be nice".

Today: the 2D canvas pinches and pans but can't turn; the magnet snaps to 8 fixed directions (`snap_45`); every closed shape runs the closure check and offers implied lengths, which fights a box drawn by hand in 3D (its outline is flat, its lengths aren't); the numpad gives no feedback under a thumb.

## Decisions
- **Drop the 3D view and heights.** The 2D / 3D toggle, the solid model, the projection, the 3D canvas and their tests go; `SketchPath.height` goes, with the ↑ label, the height targets in measuring and stepping, and the summary card's height. Format version 3. Rejected: keeping 3D behind a setting (the complexity stays).
- **Version 2 files keep their heights as notes.** Each non-null height becomes a marker note `↑ {height}` on its path's first corner; an existing marker on that point gets it appended, else a new marker. Version 1 still opens.
- **Per-shape "Check lengths", default on.** `SketchPath.check`. Off: no closure gap, no implied lengths on the card or the numpad, no Redraw to scale, no area; the perimeter stays. A switch on the summary card. Version 2 reads as on.
- **Magnet angle set per sketch.** `Sketch.snap: number[]`, degrees, each also mirrored (a set closed under +180°). Presets: 45° (0, 45, 90, 135: 8 directions, the default and today's behaviour), Iso (0, 90, 30, 150), 15° (every 15°), Custom (type extra angles like 22.5, 63). Magnet off stays. `snap_45` generalises to `snap_dir(from, to, directions)`. Walk keeps its 8 buttons for 45°; other sets get a UI picked by Claude. Corner-drag alignment unchanged. Version 2 reads as 45°.
- **Two-finger rotate, in the app.** The kit `View` stays as it is. Rotate from the pinch angle while zooming, snap to 0 / 90 / 180 / 270 within 8°, labels upright and readable, taps un-rotated before mapping, a compass / reset button while turned. Rotation is view state, not saved in the file.
- **Vibrate on numpad keys.** `navigator.vibrate(8)` per press, touch only. A cosmetic Vibration entry in the browser support list (already there; Tape Sketch joins its apps).
- **Shell:** nothing new; `open` through the association still covers it.
- **Out:** any new 3D work; video or scan input.

### Picked in the build (design calls)
- **Walk with a set other than 45°: a direction ring.** A disc with one tick per direction of the set; press, slide to the nearest tick (it lights up with its angle), lift to walk. Works for 8 directions or 24 with the same touch target, the whole disc. The 8 buttons stay for 45°.
- **Rotation folded into the screen mapping** instead of an SVG group transform, so labels are placed upright against the turned lines with no counter-rotation (recorded in the ADR revision).
- **Walk directions are screen directions** when the sketch is turned: the arrow you press is the way the line goes on screen, matched to the nearest direction of the set.
- **Magnet menu** with the presets, a short description each, and Custom… as a prompt prefilled with the current set; the set is an undoable sketch edit, on / off stays per device.

## Key takeaways
- The 3D view answered "show me the room" but the owner's real 3D need is drawing a box by hand quickly; isometric snapping plus an opt-out of the flat-shape check serves that with far less code.
- A sketch turned in the hand should read like paper turned on a table: lines turn, numbers stay upright.

## Action items
- [x] One app-builder agent: format v3 with v2 / v1 reading, 3D and heights removed, Check lengths, magnet sets and ring, rotation, key buzz, compat entry, docs page, ADR-069 revision, changelog.

## Next session topics
- Photo underlay (measure on a photo), still open from 2026-10-25.
- A mouse or keyboard way to turn the sketch on a desktop, if wanted.
