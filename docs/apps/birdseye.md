# Birdseye

Id `birdseye` · Source: `src/lib/apps/user/birdseye/`, capture and encoding in `src/lib/kit/utils/video/` · [ADR-056](../adrs/056-birdseye.md) · [brainstorm](../brainstorm/2026-10-20_birdseye.md) · idea by LaxDOTexe

## What it does

For watching one moving thing in a video, such as a bird in flight: you draw a box around it once, and the video is re-framed so that subject stays still in the middle while everything else moves around it. Frames where the tracker lost the subject show on the timeline, and you box it again there. The result is saved as a WebM next to the source, with its sound.

Flow: open a video (`path` prop, "Open with" on any `video/*`, the picker, or a drop) → pause → **Box** and drag around the subject → **Track** (a task) → **Locked** view with zoom and edge fill → **Save** (a task).

## How it works

### Pipeline

| Step | Where | What |
|------|-------|------|
| Frames | `jobs.ts:45` `run_track` | `$kit/utils/video` `capture` plays the file in a detached `<video>` from the boxed frame to the end and hands every frame `requestVideoFrameCallback` reports, with its media time |
| Read | `jobs.ts` `read` | The frame is drawn into an `OffscreenCanvas` at the working scale; only the search window comes back through `getImageData` and turns into luma (`ncc.ts:17`) |
| Match | `tracker.ts:110` `Tracker.step` | NCC template matching, coarse to fine (below) |
| Store | `path.ts:56` `splice_track` | `track[i] = { t, cx, cy, scale, conf }` in source pixels, one per presented frame, kept in memory |
| Camera | `path.ts:113` `build_path` | Lost frames interpolated, then smoothed forward and backward |
| Draw | `render.ts:65` `draw_locked` | Edge fill, then the frame placed so the camera centre lands in the middle |
| Export | `jobs.ts:149` `export_locked` | Plays the file again, draws each frame, encodes VP9 (or VP8) plus Opus through `WebmEncoder`, writes `{stem}-birdseye.webm` beside the source (Videos for a dropped file) |

Tracking and export both run through TasksService, with a progress toast, Cancel and Retry. A cancelled track keeps the earlier one.

### Why NCC template matching

Normalised cross-correlation of the boxed patch against every position in a search window: it ignores brightness and contrast changes, needs no training, and is a few dozen lines. The alternatives are in the ADR: mean-shift locks onto anything of the same colour, MOSSE is more code for the same job here, KLT loses small flapping subjects, and detector models (MediaPipe, SAM2) are megabytes of dependency.

`ncc.ts` keeps the template with its mean removed (`prepare_template`, `ncc.ts:87`), so the cross term is a plain dot product, and a window's mean and variance come from summed-area tables in O(1) (`integral`, `ncc.ts:108`). Flat windows and flat templates score 0.

### Coarse to fine

`Tracker.step` (`tracker.ts:110`):

1. **Search window.** `region()` (`tracker.ts:65`) is 3× the box (×1.05 headroom, plus the refine margin) around the last centre plus a velocity estimate (half the previous estimate plus half the last move). Lost frames reset the velocity.
2. **Level 1.** The window and template are halved by 2×2 mean (`downsample`, `ncc.ts:24`) and searched exhaustively.
3. **Level 0.** Full resolution, ±2 px around the coarse peak. With **Follow size**, three template scales (×0.95, ×1, ×1.05 of the current one, resampled bilinearly by `sample_patch`, `ncc.ts:43`) are tried here and the best wins.
4. **Sub-pixel.** A parabola through the peak and its two neighbours on each axis (`parabolic_peak`, `ncc.ts:150`) places the peak within ±0.5 px.
5. **Confidence** is the peak score. Below `TRACK.LOST` (0.55) the frame is lost: the position holds and the template is untouched. At or above `TRACK.WEAK` (0.75) the matched patch is blended into the template at 8 % (`TRACK.BLEND`), so it follows slow changes in appearance without drifting onto the background. In between, the match counts but isn't learned from.

**Working scale.** A box whose longer side is over 48 px (`TRACK.WORK_SIDE`) tracks on the whole frame scaled down so the box is 48 px (`work_factor`, `tracker.ts:33`). That caps the cost per frame whatever the box size; results go back to source pixels.

**Main thread.** Each frame has to be read from the `<video>` on the main thread anyway, and a match is a few ms, so there's no worker. A frame whose work passes 8 ms returns `context.pace()`, which holds playback (`capture` waits on the promise) and yields to the page.

### Lost frames and re-boxing

`status_of` (`path.ts:8`) sorts samples into good, weak and lost. The timeline (`timeline.svelte`) draws `status_runs` as a hard-stop CSS gradient over the video's length in `success`, `warning` and `error`, with untracked time at `foreground` 12 %. **Next lost** (N) jumps to the start of the next lost run, and a lost frame shows "Lost here. Box it again".

Box offers the estimated box at that time (the camera position and the last box size); dragging anywhere else draws a new one. Track replaces the track from that frame to the end (`splice_track`); everything before it stays. A re-box with Follow size starts at the scale of the new box against the first one (√ of the area ratio), so the zoom doesn't jump.

### Camera path

`build_path` (`path.ts:113`):

- **Gaps.** `fill_gaps` (`path.ts:60`) replaces lost samples by the linear blend in time of the good samples around them; before the first good one and after the last, the nearest.
- **Smoothing.** `smooth` (`path.ts:90`) runs a one-pole low-pass forward, then backward over the result, so the two phase shifts cancel and the camera never lags the subject. Both ends are padded with an odd reflection, so the passes start settled. Position uses α = 0.5, which removes jitter while keeping fast curves (on the 640 × 360 fixture moving up to 12 px a frame, the smoothed path is within 3 px of the truth). Scale uses α = 0.04, in log space so growing and shrinking by the same factor move alike.
- **Lookup.** `path_at` (`path.ts:142`) holds the sample at or before the time instead of blending. A paused video shows the frame at or before `currentTime`, and a blend toward the next sample put the subject one frame's motion off centre after a seek.

### Render

`frame_rect` (`render.ts:32`) scales the frame by `output / source × zoom` (divided by the smoothed scale with Follow size) and offsets it so the camera centre lands in the middle of the output. Edge fill, drawn first (`draw_locked`, `render.ts:65`):

| Fill | Drawn as |
|------|----------|
| Blur (default) | The frame scaled to cover the output, grown by twice the blur radius so the edges don't fade to transparent, under `blur(width / 40) brightness(0.5)` |
| Black | `#000`: it's picture content in the output video, not UI |
| Colour | One of five theme tokens (Darkest, Window, Primary, Secondary, Tertiary), read from its CSS variable (`read_token`, `render.ts:59`) when drawing |

No rotation, ever (ADR-056). The preview draws on a canvas at up to 1280 px wide, over the `<video>` it reads from, on every presented frame and every seek. Export uses the source size, rounded to even sides for VP8/VP9.

## Data

Nothing is persisted: the track lives in the window and is lost when it closes. Output: `{stem}-birdseye.webm` beside the source, or in `/home/Videos` for a file from the device; a taken name gets a free one.

Props: `path` (optional), a video to open. The manifest lists `tools: ["video/*"]`, so Birdseye is under Open with for videos; Media Preview stays the default. No shell commands (owner decision, ADR-056).

## Dependencies & licences

None of its own. `$kit/utils/video` (capture, `WebmEncoder`, the WebM muxer), `$kit/components/crop-frame` for the box, and Video Tools' `VIDEO_ACCEPT` and `is_video_name` for the picker and drops.

## Limits

- Tracking plays the video at 1×, so it takes as long as the rest of the video. Frames Chrome doesn't present aren't tracked; the path holds across them.
- Frame accuracy is Chrome's playback: there's no demuxer (a later decision, `mediabunny`).
- Measured on synthetic footage only (`fixtures.ts`: a 40 px dark square over a striped light background, 640 × 360, up to 12 px a frame): the raw track stays within 1.5 px of the truth, re-acquires after a re-box, and the locked preview keeps the square within about 2 px of the centre. No real bird footage has been measured.
- A step costs about 2 ms for a 48 px working box with or without Follow size, and 0.2 ms for a 24 px box (Node on an Apple M1 Max, 200 frames of 1920 × 1080 texture). In the browser it isn't measured.
- Occlusion, a subject crossing a similar one, or a subject that leaves the search window while hidden stays lost until it's boxed again. Rotation and strong motion blur lower the score.
- Thresholds (0.55 lost, 0.75 learned) are tuned on the fixture only.

## Decisions

- [ADR-056](../adrs/056-birdseye.md), with its 2026-10-20 revision note (main thread, forward re-track, per-frame hold).
- [Brainstorm 2026-10-20](../brainstorm/2026-10-20_birdseye.md): own app, edge fill, scale, shell, name.
- [ADR-048](../adrs/048-app-kit-layer.md): the app kit that `$kit/utils/video` belongs to.
