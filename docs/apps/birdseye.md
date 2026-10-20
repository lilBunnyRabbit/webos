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
| Read | `jobs.ts` `read` | The frame is drawn into an `OffscreenCanvas` at the working scale; only the search window comes back through `getImageData`. NCC gets it as luma (`ncc.ts:17`), the blob fallback gets the RGBA too |
| Match | `tracker.ts:243` `Tracker.step` | NCC template matching, coarse to fine, then re-acquire and the blob fallback (below) |
| Store | `path.ts:57` `splice_track` | `track[i] = { t, cx, cy, scale, conf, shape? }` in source pixels, one per presented frame, kept in memory; `shape` marks a frame found by the blob fallback |
| Camera | `path.ts:114` `build_path` | Lost frames interpolated, then smoothed forward and backward |
| Draw | `render.ts:65` `draw_locked` | Edge fill, then the frame placed so the camera centre lands in the middle |
| Export | `jobs.ts:149` `export_locked` | Plays the file again, draws each frame, encodes VP9 (or VP8) plus Opus through `WebmEncoder`, writes `{stem}-birdseye.webm` beside the source (Videos for a dropped file) |

Tracking and export both run through TasksService, with a progress toast, Cancel and Retry. A cancelled track keeps the earlier one.

### Why NCC template matching

Normalised cross-correlation of the boxed patch against every position in a search window: it ignores brightness and contrast changes, needs no training, and is a few dozen lines. The alternatives are in the ADR: mean-shift locks onto anything of the same colour, MOSSE is more code for the same job here, KLT loses small flapping subjects, and detector models (MediaPipe, SAM2) are megabytes of dependency.

`ncc.ts` keeps the template with its mean removed (`prepare_template`, `ncc.ts:87`), so the cross term is a plain dot product, and a window's mean and variance come from summed-area tables in O(1) (`integral`, `ncc.ts:108`). Flat windows and flat templates score 0.

### Coarse to fine

`Tracker.step` (`tracker.ts:243`):

1. **Search window.** `region()` (`tracker.ts:111`) is 3× the box (×1.05 headroom, plus the refine margin) around the predicted centre: the last centre plus the velocity estimate (half the previous estimate plus half the last move) times the frames since the last find. While lost it widens (below).
2. **Coarsest level.** The window and template are halved by 2×2 mean (`downsample`, `ncc.ts:24`) and searched exhaustively: once normally, twice in a widened window while the template keeps at least 6 px (`TRACK.COARSE_SIDE`) on its short side (`levels`, `tracker.ts:161`). Each finer level searches ±2 px around the peak above it (`locate`, `tracker.ts:170`).
3. **Level 0.** Full resolution, ±2 px around the coarse peak. With **Follow size**, three template scales (×0.95, ×1, ×1.05 of the current one, resampled bilinearly by `sample_patch`, `ncc.ts:43`) are tried here and the best wins.
4. **Sub-pixel.** A parabola through the peak and its two neighbours on each axis (`parabolic_peak`, `ncc.ts:150`) places the peak within ±0.5 px.
5. **Two templates.** The tracker keeps the boxed patch as it was (`original`) and an adaptive copy (`appearance`). The adaptive one is searched first; when it scores under `TRACK.WEAK` the original is searched too and the better score wins. A bird that flaps back to the pose it was boxed in is found by the original even after the adaptive one has wandered.
6. **Confidence** is the peak score. At or above `TRACK.WEAK` (0.75) the matched patch is blended into the adaptive template at 8 % (`TRACK.BLEND`). Between `TRACK.LOST` (0.55) and 0.75 the match counts but isn't learned from, and the blob fallback checks it: when it finds the subject more than a quarter of the box away, the NCC peak was on one wing and the blob wins. Under 0.55 the blob fallback decides; failing that, the frame is lost.
7. **Busy windows.** When the window's edge is texture rather than sky (`busy_edge`, `blob.ts:162`, below), only a strong match (≥ 0.75) counts and nothing is learned: against leaves a weak peak is as likely the leaves, and learning from it is how the template drifts into the trees.

**Working scale.** A box whose longer side is over 48 px (`TRACK.WORK_SIDE`) tracks on the whole frame scaled down so the box is 48 px (`work_factor`, `tracker.ts:66`). That caps the cost per frame whatever the box size; results go back to source pixels. The blob fallback runs at the same scale.

### Re-acquire

Each consecutive lost frame widens the next search window: 3×, then 5×, then 8× the box (`TRACK.SEARCH`), capped at the frame, centred where the last velocity puts the subject by now. The velocity isn't reset by a loss. A lost frame reports the last found position (the camera interpolates over it) and a `conf` under 0.55. The first frame found again, by NCC or by shape, resets the window to 3× and the velocity to the move since the last find divided by the frames in between.

### Blob fallback

`blob.ts`. For a high-contrast subject against a plain background (a bird against sky), when the template can't follow its shape:

1. **Planes.** The window's RGBA becomes luma and chroma (max − min of R, G, B) (`to_planes`, `blob.ts:63`). A dark silhouette differs from blue sky in luma; a white belly differs in luma and chroma; so both count.
2. **Background.** Fitted on the window's 2 px edge ring per plane (`fit_plane`, `blob.ts:143`): the ring's median first, so when trees cover part of the edge the sky (the majority) sets the level, then four passes of a least-squares plane through the pixels within 2.5 σ of the last fit (a sky window is a gradient). σ is the robust MAD of what's kept, floored at 3 levels.
3. **Busy.** The window is texture, and nothing is trusted, when the luma σ is over 9 levels or under half the edge fits the plane (`estimate_background`, `blob.ts:155`; `busy_edge` is the luma half of it).
4. **Segment.** A pixel is foreground when it's over 4 σ from the plane in luma or chroma (`segment`, `blob.ts:167`); 8-connected components with area, centroid, bounding box and mean distance (`components`, `blob.ts:182`).
5. **Pick.** The component nearest the predicted centroid whose area is 0.3× to 3.5× the subject's (wings spread and fold) and whose surroundings are clean: in a ring around its box, half its size wide, at most 10 % may be foreground (`surroundings`, `blob.ts:239`). That ring is what rejects a leaf at the edge of a tree, which sits against sky on one side only (`pick_component`, `blob.ts:265`).
6. **Confidence** is √(contrast × size): contrast is the mean distance over 12 σ, capped at 1; size is e^−|ln(area / expected)| (`blob_conf`, `blob.ts:259`). Under 0.45 (`BLOB.ACCEPT`) it doesn't count. The point is stored with `shape: true` and the blob's confidence.
7. **Learning.** The subject's area and its centroid's offset from the box centre are measured on the first frame (`measure_subject`, `blob.ts:292`); a busy first frame turns the fallback off for the run. Each shape frame moves the expected area a quarter of the way (in log) toward what it found (`TRACK.SHAPE_SIZE`), and with Follow size moves the scale the same way, which keeps the template's scale anchored to the subject's real size. At or above 0.65 (`BLOB.LEARN`) the patch there is blended into the adaptive template at 50 % (`TRACK.SHAPE_BLEND`), so the next frame's NCC has the new shape.

A frame costs about 1.5 ms when NCC is strong and 3 ms when it's weak and the blob runs too (Bun on an Apple M1 Max, the real clip below, 36 × 48 px working box, 118 × 156 px window); a widened lost frame about 4.5 ms.

**Main thread.** Each frame has to be read from the `<video>` on the main thread anyway, and a match is a few ms, so there's no worker. A frame whose work passes 8 ms returns `context.pace()`, which holds playback (`capture` waits on the promise) and yields to the page.

### Lost frames and re-boxing

`status_of` (`path.ts:8`) sorts samples into good, weak, found by shape (`shape: true`, whatever its confidence) and lost. The timeline (`timeline.svelte`) draws `status_runs` as a hard-stop CSS gradient over the video's length in `success`, `warning`, `info` and `error`, with untracked time at `foreground` 12 %. The Track panel counts frames found by shape under "By shape" when there are any. **Next lost** (N) jumps to the start of the next lost run, and a lost frame shows "Lost here. Box it again".

Box offers the estimated box at that time (the camera position and the last box size); dragging anywhere else draws a new one. Track replaces the track from that frame to the end (`splice_track`); everything before it stays. A re-box with Follow size starts at the scale of the new box against the first one (√ of the area ratio), so the zoom doesn't jump.

### Camera path

`build_path` (`path.ts:114`):

- **Gaps.** `fill_gaps` (`path.ts:61`) replaces lost samples by the linear blend in time of the found samples (good, weak or by shape) around them; before the first good one and after the last, the nearest.
- **Smoothing.** `smooth` (`path.ts:91`) runs a one-pole low-pass forward, then backward over the result, so the two phase shifts cancel and the camera never lags the subject. Both ends are padded with an odd reflection, so the passes start settled. Position uses α = 0.5, which removes jitter while keeping fast curves (on the 640 × 360 fixture moving up to 12 px a frame, the smoothed path is within 3 px of the truth). Scale uses α = 0.04, in log space so growing and shrinking by the same factor move alike.
- **Lookup.** `path_at` (`path.ts:143`) holds the sample at or before the time instead of blending. A paused video shows the frame at or before `currentTime`, and a blend toward the next sample put the subject one frame's motion off centre after a seek.

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
- Measured on synthetic footage (`fixtures.ts`: a 40 px dark square over a striped light background, 640 × 360, up to 12 px a frame): the raw track stays within 1.5 px of the truth, re-acquires after a re-box, and the locked preview keeps the square within about 2 px of the centre.
- Synthetic bird (`bird-fixture.ts`, 480 × 270, 6 s): a 20–40 px bird that switches every 4 frames between a dark silhouette, dark wings spread, and a white belly with dark wings, banking, over a sky gradient, then into a band of leaves. Over the sky 128 of 132 frames are found (by NCC or shape), all within 4.4 px of the body centre (the white-bellied pose's centroid sits about 4 px forward); in the leaves 4 of 25 are found, within 0.3 px, and the rest are lost. Before re-acquire and the blob fallback: 88 of 132, first loss at frame 8.
- Real clip (LaxDOTexe's 7.5 s, 1080 × 1080 phone clip of a swallow against sky, then trees; not in the repo; tracked at 720 × 720 with a 48 × 64 box): 128 frames found by NCC, 37 by shape, 60 lost; the first loss is at frame 165 of 225, where the bird crosses in front of the trees, and it stays lost (not wrong) from there. With Follow size: 133 / 29 / 63, first loss at 162. Before: 39 found, 186 lost, first loss at frame 6. Checked by eye on crops around every 5th tracked point: on the bird through the sky, in every pose.
- Follow size used to shrink the template on a shape-changing subject (a smaller patch of a flapping bird always scores a little higher), down to 0.28× on the real clip while the bird grew, and then lock onto leaves at 0.8. Shape frames now pull the scale toward the blob's size; a long run of NCC-only frames can still drift it.
- Occlusion, a subject crossing a similar one, or one that's against texture (trees) when it's found again stays lost until it's boxed again. Rotation and strong motion blur lower the NCC score; the blob fallback only helps against a plain background.
- Thresholds (0.55 lost, 0.75 learned, blob 4 σ / 9 levels busy / 0.45 accepted) are tuned on the fixtures and that one clip.

## Decisions

- [ADR-056](../adrs/056-birdseye.md), with its 2026-10-20 revision note (main thread, forward re-track, per-frame hold) and its 2026-10-21 note (re-acquire, blob fallback).
- [Brainstorm 2026-10-20](../brainstorm/2026-10-20_birdseye.md): own app, edge fill, scale, shell, name; its "Feedback 2026-10-21" section covers the real-clip failure and the fix.
- [ADR-048](../adrs/048-app-kit-layer.md): the app kit that `$kit/utils/video` belongs to.
