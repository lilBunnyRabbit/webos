# ADR-092: Skip pauses in Video Tools
**Date:** 2026-11-04
**Status:** Implemented

## Context
lax asked for timelapses and screen recordings without the pauses: frames that look the same as the one before are removed, so playback is non-stop ([brainstorm](../brainstorm/2026-11-04_skip-pauses.md)). Video Tools already rebuilds a video frame by frame (kit `capture()` and `WebmEncoder`, its own GIF writer). Recorder records with `MediaRecorder` and never sees single frames.

## Decision
- **Video Tools** gets a **Skip pauses** toggle on Clip and GIF, with a sensitivity slider under it.
- **Filter:** each captured frame is shrunk to about 160 px wide grey and compared with the last kept frame. When the share of pixels that differ by more than a small step is under the sensitivity's threshold, the frame is skipped. The first frame is always kept.
- **Timing:** kept frames are stamped on a running output clock: each kept frame lasts as long as it did in the source, up to the next frame, so the first frame of a still stretch shows for one normal frame time and the rest of the stretch is gone. WebM gets the new timestamps and duration; GIF gets the new delays.
- **Sound** is dropped while Skip pauses is on: the Sound toggle is off and disabled, with a note.
- **Estimate:** the GIF frame count and size become "up to" while Skip pauses is on. After saving, the result says how long the source was and how long the output is.
- **Persistence:** the sensitivity is remembered in `/var/lib/apps/video-tools/settings.json` through `storage.file`: `{ "version": 1, "skip_sensitivity": number }`. The default is tuned on test footage so a blinking cursor counts as still.
- **Props:** Video Tools' props become `z.object({ path: z.string().optional(), skip_pauses: z.boolean().optional() })`. `skip_pauses: true` opens with Clip chosen and Skip pauses on.
- **Recorder:** the review of a screen or camera video take gets **Save & remove pauses…**. It saves the take as Save does, then `apps.launch("video-tools", { path, skip_pauses: true })`. Mic takes and photos don't get it.
- **Shell:** nothing new; `video trim` and `video gif` are unchanged.
- **Mobile:** both, inside Video Tools' existing panel.

## Alternatives Considered
- Skipping live in Recorder: MediaRecorder can't drop frames, so screen recording would move to a canvas plus WebCodecs pipeline; only new recordings would benefit.
- Moving `export_clip` into the kit so Recorder runs it on the unsaved take: a large refactor for one second user, and Recorder would need its own settings UI.
- Comparing with the previous frame: a slow fade or slow scroll never changes enough between two frames and disappears.
- Cutting the sound with the frames, or skipping only silent pauses: clicks at every cut, or an audio pass and more rules. Left for later.

## Consequences
- Narrated recordings lose their voice when pauses are skipped.
- A blinking cursor or a ticking clock can keep pauses in at high sensitivity; the slider is the remedy.
- Video Tools has an algorithm now, so it gets a `docs/apps/video-tools.md` page.

## Revision 2026-11-04: built
- **Compare step and sensitivity scale.** A pixel counts as changed when it moves more than 8 grey levels. Sensitivity 0–100 maps on a log scale from a 1 % share of the small picture to 0.007 % (about one pixel of 160 × 90); the default is 50, about 12 pixels. On drawn editor footage at 640, 1280 and 1920 px a blinking caret plus a ticking clock stays under it, and a few typed characters or a short pen stroke go over it. Numbers in [video-tools.md](../apps/video-tools.md).
- **Downscaling** uses `imageSmoothingQuality = "high"`: with the default, a 12× shrink samples too few source pixels, and a thin caret or text stroke changes nothing in the small picture.
- **Typing plays faster than it was typed.** The frames between keystrokes are still too, so each kept keystroke lasts one frame time. That follows from "cut fully" and is left as decided.
- The skip is an optional `skip` (the sensitivity) on Video Tools' Clip and GIF export settings. The shell commands don't pass it.

## Revision 2026-11-08: MP4 and size
- Clip can now be saved as MP4 (H.264, AAC) and scaled down ([ADR-100](./100-video-mp4-output.md)). Skip pauses works with both formats on the same `OutputClock`. `settings.json` is version 2: `format` and `size` beside `skip_sensitivity`; a version 1 file reads as WebM at the original size. `video trim` gains `--format` and `--size`, still without skipping.
