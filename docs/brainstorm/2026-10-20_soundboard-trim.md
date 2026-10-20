# Soundboard: cut and splice

**Date:** 2026-10-20
**Participants:** owner, Claude

## Context
L4X recorded a pad with the mic and wanted to trim it. Pads point at an audio file (`sound` path, `soundboard/board.ts`); there is no editing.

## Topics discussed

### Edit model: write a new file (decided)
Decode, keep the chosen regions, join them, and encode a WAV next to the source (`name (edited).wav`). The pad points at the new file and the original stays. The file plays the same everywhere.
Rejected: regions on the pad (a schema change, and the cut would only exist inside Soundboard).

### Scope: trim plus cutting the middle (decided)
Start and end handles on a waveform. Select a middle span and delete it; the parts are joined with a ~10 ms crossfade so there's no click. One sound per pad.
Rejected for now: appending other clips.

### UI: in the pad dialog (decided)
An "Edit audio" section in the pad dialog (waveform, handles, play selection, Save); it also opens right after a mic recording.

### Placement: kit now (decided)
`$kit/utils/audio/wav.ts` (PCM16 WAV encoder, plus region cutting and crossfade) and `$kit/components/waveform`, so Recorder and Music Visualizer can use them later. Documented in the design docs and the Style Guide per the kit rule.

### Pad image (decided)
L4X also asked to colour a pad or give it an image. `PadSchema` gains `image: string | null` (a path, like `sound`), picked through the file picker. It shows as the tile background with a scrim so the label and progress stay readable; a missing file falls back to the colour. An optional field, no version bump.
Rejected: an embedded data URL (the board file grows).

### Free colour picker (decided, brand exception)
Beyond the seven theme swatches, a pad can have any hex colour. This is user content, an owner-approved exception to "theme tokens only", like the colours in a user's own drawing. `color` accepts a token name or `#rrggbb`. Tile tints come from `color-mix()` with the same alpha steps as the token tiles.

## Action items
- Build: pad image and free colour; kit WAV and region utilities with Node tests, the waveform component, the Soundboard pad dialog section, changelog.

## Implementation notes (2026-10-20)
- Pads point at a board-owned copy (`/var/lib/apps/soundboard/sounds/{name}`), not a path, so the edit is written into that folder as `name (edited).wav` (a free name). The original copy stays. No `/home/Music` fallback was needed.
- Soundboard has no mic recording of its own (the Recorder app saves files, which are then added), so nothing opens the edit section after a recording.
- Kit split: `$kit/utils/audio/wav.ts` (encoder) and `regions.ts` (cutting, crossfade, peaks), one `index.ts`.
- Edits saved inside the dialog but not kept (Cancel, or saved twice) are deleted when the dialog closes.
- Hex and token pads share one set of tile classes on a `--pad` custom property (Tailwind's `/18` alpha mixes in oklab, the same as the token tiles).

## Next session topics
- When a pad moves to an edited sound, its original copy stays in the sounds folder with no pad using it. Delete it then, keep it for undo, or offer "Revert to original"?
