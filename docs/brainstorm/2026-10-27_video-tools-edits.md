# Video Tools: edits
**Date:** 2026-10-27
**Participants:** owner, Claude

## Context
Owner asked for tool apps around video and the camera. Video Tools today: one screen, a scrubber with in/out points and a "Save as" choice of Clip (WebM), GIF or Sound, plus mute (`jobs.ts:228`). `$kit/utils/video` plays the file in a detached `<video>` and captures frames through `requestVideoFrameCallback`, so every export runs in real time; output is WebM only; there is no demuxer and no MP4 muxer. Brainstorm only: nothing is built yet (owner: "lets not implement video editor changes yet just brainstorm").

## Decisions
- **UI:** one collapsible "Adjust" group in the aside that applies to Clip and GIF. `ClipSettings` gains `edit: { crop: Bounds | null, rotate: 0|90|180|270, speed: number, subs?: Cue[] }`, applied in `on_frame`. Rejected: one output per feature (crop plus speed impossible, 7+ entries), a SideNav per tool (duplicates the preview).
- **Speed sound:** dropped when speed ≠ 1× in the first cut. Rejected for now: chipmunk resample, pitch kept through `record_audio({ rate })` (kit API change).
- **Merge:** in RAM, files captured in turn, letterboxed to the first clip's size, audio decoded per file, about 10 min total cap. Rejected: streaming the muxer to OPFS (new kit design).
- **Demuxer:** none; stay real-time. mediabunny stays a later call (Birdseye wants it too).

## Candidates, value over cost
1. Frame grab to PNG (XS)
2. Crop and rotate through `CropFrame` (S)
3. Fit to a target size: a fourth Quality option, about ±15 % (S)
4. Speed 0.25–4× (S–M)
5. Burned-in subtitles from SRT/VTT, app-local parser (M)
6. Merge (M–L)
Extras: GIF boomerang, fade in/out, contact sheet, volume.

## Key takeaways
Everything fits the current kit without a dependency. Real-time export is the cost.

## Action items
- [ ] Build when the owner picks it up; first batch frame grab, crop/rotate, target size, boomerang.
- [ ] `docs/apps/video-tools.md` once Merge or subtitles land.

## Next session topics
- Shell: flags on `video trim` (`--crop --rotate --speed --size`) plus `video frame` and `video merge`, or a verb each.
