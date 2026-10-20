# ADR-056: Birdseye, Subject-Locked Video
**Date:** 2026-10-20
**Status:** Implemented

## Context
L4X asked for a video player that follows a selected object, so the subject (a flying bird) stays still while everything else moves around it. A feasibility check found it possible in the browser without dependencies. Discussion: [brainstorm](../brainstorm/2026-10-20_birdseye.md).

## Decision
- A new user app, **Birdseye** (`birdseye`).
- Video Tools' `capture.ts`, `encode.ts`, `webm.ts` and `plan.ts` move to `$kit/utils/video` (ADR-048) in their own refactor commit. Both apps import them from there.
- **Tracking.** A hand-written NCC template matcher: grayscale `OffscreenCanvas` frames, a 2-level pyramid, a search window of about 3× the box around the last position, a sub-pixel parabolic peak, slow template blending and a confidence threshold. It runs as a task (TasksService) and stores `track[t] = { cx, cy, scale, conf }`. Frames below the threshold are marked lost; the user re-boxes there, and gaps are interpolated.
- **Scale.** An optional "Follow size" (±5 % scale search, heavy smoothing), off by default. Rotation is never compensated.
- **Render.** A fixed output size; the smoothed subject centre (forward-backward, no lag) is pinned to the middle. A zoom slider. Edge fill is a choice: blur (default, a blurred and dimmed copy of the frame), black, or a theme colour.
- **Export.** WebM through the kit encoder and muxer, audio passed through, as a cancellable task.
- **Shell.** An "Open with" entry for video files only (Media Preview stays the default); no commands.

### Revision 2026-10-20: as implemented
- **Main thread, no worker.** Each frame is read from the `<video>` on the main thread anyway (`drawImage` + `getImageData` of the search window only), and a match costs a few ms because a box past 48 px tracks on a scaled-down frame. A frame that runs over 8 ms yields through `context.pace()`, which holds playback. A worker would only add a copy per frame.
- **Re-box tracks forward.** A re-box replaces the track from that frame to the end; everything before it stays. Lost frames that are left are filled by linear interpolation between the good ones around them.
- **The camera holds per frame.** Between samples the preview uses the sample at or before the time, not a blend, because a paused video shows the frame at or before `currentTime`.
- **Theme colour** is one of five tokens (Darkest, Window, Primary, Secondary, Tertiary), read from its CSS variable when drawing.
- **Kit move.** Video Tools' test `fixtures.ts` moved with the four modules, and `Quality` moved into the kit's `plan.ts` (Video Tools' `kinds.ts` re-exports it).

## Alternatives Considered
- A Track tab in Video Tools: hard to find, and Video Tools grows.
- Mean-shift, MOSSE, KLT: mean-shift locks onto anything of the same colour; MOSSE is more code; KLT fails on small flapping subjects.
- MediaPipe, OpenCV.js, SAM2: dependencies weighing MB, held back for a later re-detect step.
- Gemini Nano per frame: seconds per frame.

## Consequences
- No new dependencies. Tracking is only as accurate as Chrome's playback; a demuxer (`mediabunny`) would be a later decision.
- Occlusion and crossing subjects need a manual re-box.
