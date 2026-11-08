# Video Tools

Id `video-tools` · Source: `src/lib/apps/user/video-tools/`, capture and encoding in `src/lib/kit/utils/video/` · [ADR-092](../adrs/092-skip-pauses.md) · [ADR-100](../adrs/100-video-mp4-output.md) · brainstorms [skip pauses](../brainstorm/2026-11-04_skip-pauses.md), [MP4 and size](../brainstorm/2026-11-08_video-mp4-and-size.md)

## What it does

Trims a video to a WebM or MP4 clip, turns part of it into a GIF, or saves its sound. Pick the part with the two scrubber handles or with I and O, choose **Clip**, **GIF** or **Sound**, and save. **Skip pauses** on Clip and GIF leaves out the stretches where nothing on screen changes, so a screen recording or a timelapse plays without them. A clip can be scaled down to 1080p, 720p or 480p. `video trim`, `video gif` and `video audio` do the same from the Terminal (without Skip pauses).

With no video open, the window shows what it does: a drawing of a video cut down to a clip, a GIF or its sound (`empty-art.svelte`, from the kit's `tool-art` pieces), three steps, Open a video… and the drop and paste hint. Video Tools is one tool with three outputs, so it has no home screen ([Multi-tool app](../design/patterns.md#multi-tool-app)).

## How it works

### Play and capture (kit `video/capture.ts`)

There is no demuxer. `capture()` (`kit/utils/video/capture.ts:74`) plays the file muted in a detached `<video>` and hands each frame `requestVideoFrameCallback` reports to `on_frame`, with its `mediaTime`. A promise returned from `on_frame` pauses playback until it settles, so slow per-frame work never drops frames on purpose. Any format Chrome plays works, but saving takes about as long as the part: past 2× on a 60 Hz screen Chrome presents only some frames. The first frame is taken from the seek, since a paused seek gets no frame callback.

### Clip (`jobs.ts` `clip_steps`, kit `video/encode.ts`, `video/webm.ts`, `video/mp4.ts`)

Each captured frame goes to the format's encoder (`WebmEncoder` or `Mp4Encoder`, the same `encode_frame` / `encode_audio` / `busy` / `drained()` / `finish()` shape). Bitrate is width × height × 30 × bits per pixel for Low/Medium/High (`kit/utils/video/plan.ts` `video_bitrate`), for both formats. The frame is drawn through a canvas first (`imageSmoothingQuality = "high"`) when the output size differs from the source's. Sound is decoded once with `decodeAudioData` (resampled to 48 kHz), cut to the part and handed to the encoder in 960-sample slices.

**Size** (`scaled_size`): Original, 1080p, 720p or 480p, measured on the **short side**, so 720p is 1280 × 720 for a landscape video and 720 × 1280 for a portrait one. The long side follows the aspect ratio and both are rounded to even numbers; Original only drops an odd pixel. The Size menu offers only sizes below the open video's short side (`size_choices`), so it never upscales. A remembered size the video is too small for shows as Original and stays remembered.

**WebM:** VP9, else VP8, and Opus. The hand-written muxer (`kit/utils/video/webm.ts`) writes the WebM with a Duration, so other players see the length.

**MP4** (`kit/utils/video/mp4.ts`): H.264 and AAC through WebCodecs, muxed by [mediabunny](https://mediabunny.dev).
- *Codec string.* `avc_level` picks the smallest H.264 level whose frame size and macroblock rate at 30 fps hold the output (ITU-T H.264 Table A-1): 1280 × 720 is 3.1, 1920 × 1080 is 4.0, 3840 × 2160 is 5.1. `pick_avc_config` then tries High, Main and Constrained Baseline (`avc1.6400LL`, `4d00LL`, `42e0LL`) through `isConfigSupported`, with `avc: { format: "avc" }` so the encoder hands back an avcC description, and fails with "This browser can't encode H.264 video at W × H" when none fits.
- *Sound.* AAC-LC (`mp4a.40.2`, 128 kb/s). When `AudioEncoder.isConfigSupported` says no, the clip is saved silent: the panel warns as soon as MP4 is picked, and the saved panel and the toast carry "Saved without sound: this browser can't encode AAC".
- *Muxing.* The encoder keeps every chunk and the first decoder config of each track. `finish()` is the only place that imports mediabunny (`await import("mediabunny")`), so a WebM save, the app's first paint and boot never load it. It adds video and audio packets interleaved by timestamp to an `Output` with `Mp4OutputFormat({ fastStart: "in-memory" })` (moov before mdat, so a player starts before the whole file is read). Realtime H.264 has no B-frames, so decode order is presentation order; each frame lasts until the next one and the last until the end of the part (or the output clock's end), so the MP4's duration is the WebM's.

The file name is `{name}-clip.webm` or `{name}-clip.mp4`.

### GIF (`jobs.ts` `gif_steps`, `gif.ts`)

Frames are taken on a slot grid at the chosen fps (a frame is used when it starts a new slot), with playback sped up to `gif_playback_rate` (up to 4×) when the fps is low. Each frame gets its own 256-colour palette (kit `codecs/quantize`: median cut, optional Floyd–Steinberg) and is written as a local-palette image (`gif.ts:29`). Delays are rounded on a running total in centiseconds, so the GIF's length doesn't drift from the part's. The size estimate before saving is width × height × frames × 0.5 (plain) or 0.7 (dithered) bytes, measured on generated footage.

### Skip pauses (`skip.ts`, `jobs.ts:104`)

**Filter.** Each frame (each slot frame for a GIF) is drawn to a canvas 160 px wide, or the video's own width when that's narrower (`skip_size`), with `imageSmoothingQuality = "high"` so a thin caret or stroke is averaged in rather than dropped by the default sampling. It is turned into Rec. 601 luma (`to_grey`) and compared pixel by pixel with the **last kept frame**: a pixel counts as changed when it moved more than 8 grey levels (`SKIP_STEP`). When the share of changed pixels is below the sensitivity's threshold, the frame is skipped (`PauseFilter.keep`, `skip.ts:49`). The first frame is always kept.

Comparing with the last kept frame, not the previous one, matters both ways: a slow fade or a slow scroll that never changes much between two frames still adds up until it counts, and a blinking caret only ever differs from the reference by its own few pixels, however long it blinks.

**Sensitivity.** 0–100 maps on a log scale from a threshold of 1 % of the picture (only big changes) to 0.007 % (about one pixel of a 160 × 90 picture): `threshold = 0.01 × 0.007^(s/100)`. The default, **50**, is about 0.084 %, 12 pixels of 160 × 90. Measured on drawn 16:9 editor footage (dark background, light monospace text, 14–16 px font), changed pixels at 160 × 90 against the frame before:

| Change | 1920 × 1080 | 1280 × 720 | 640 × 360 |
|--------|-------------|------------|-----------|
| Caret blinks | 2 | 3 | 5 |
| Clock's seconds tick | 0 | 1 | 6 |
| Clock's minute ticks (3 digits) | 1 | 3 | 13 |
| One character typed | 3 | 6 | 12 |
| Three characters typed | 8 | 12 | 24 |
| Nine characters typed | 16 | 21 | 44 |
| 60 px pen stroke | 8 | 10 | 25 |

12 sits above a blinking caret plus a seconds tick at every size, and above what a few minutes of a clock in the corner add up to at 1280 and above, so an idle editor counts as still. Typing and drawing add up against the last kept frame, so they're kept every one to five characters depending on the size. `skip.browser.test.ts` checks this on encoded 1280 × 720 footage: an idle editor with a blinking caret and a ticking clock keeps at most 2 frames in 3 s at 50 and at least 5 at 100, while typing and drawing keep at least 5.

**Output clock.** Kept frames are stamped on a running output clock (`OutputClock`, `skip.ts:61`): each kept frame lasts as long as it did in the source, up to the next captured frame, whether that one is kept or not. So the frame that starts a still stretch shows for one normal frame time and the rest of the stretch is gone. With every frame kept the clock gives each frame its source time minus the start of the part, the same as without skipping. The clip (WebM or MP4) gets the new timestamps and the clock's end as its duration; the GIF writes only kept frames and takes its delays from the clock.

**Sound.** A clip that skips pauses has no sound: the Keep the sound switch is off and disabled, with a note. Cutting the audio at every skip would click.

**Result.** The saved panel and the done toast show the part's length and the output's, e.g. `0:06.0 → 0:00.6`. Before saving, the GIF frame count and size read "up to", since how much is skipped is only known after.

## Data

| What | Where | Format |
|------|-------|--------|
| Sensitivity, clip format and size | `/var/lib/apps/video-tools/settings.json` through `storage.file` | `{ "version": 2, "skip_sensitivity": 0–100, "format": "webm" \| "mp4", "size": "original" \| "1080" \| "720" \| "480" }`; defaults 50, webm, original. A version 1 file (`{ "version": 1, "skip_sensitivity" }`) reads as webm and original with its sensitivity (`settings.ts`) |
| Output | Next to the source, or `/home/Videos` for a dropped or pasted file | `{name}-clip.webm`, `{name}-clip.mp4`, `{name}.gif`, `{name}-audio.webm`; a taken name gets a free one |

The Skip pauses switch itself isn't remembered; format and size are. Props: `{ path?: string, skip_pauses?: boolean }`. `skip_pauses: true` opens with Clip chosen and Skip pauses on; Recorder's **Save & remove pauses…** launches it that way with the saved take, so it saves in the remembered format and size.

## Shell

`video trim <path> [--from S] [--to S] [-q low|medium|high] [--mute] [--format webm|mp4] [--size original|1080|720|480] [-o out]`: defaults webm and original; `--size` is the short side and never upscales; `-o` without the right extension gets `.webm` or `.mp4`. `video gif` and `video audio` are unchanged. None of them skip pauses.

## Dependencies & licences

- [mediabunny](https://github.com/Vanilagy/mediabunny) 1.62.1 (MPL-2.0), MP4 muxing only, loaded lazily on an MP4 save (ADR-100). Tests also use its demuxer (`Input`, `BlobSource`) to read the MP4 back.
- The platform: WebCodecs (`VideoEncoder`, `AudioEncoder`; H.264 and AAC support is checked per config with `isConfigSupported`), `requestVideoFrameCallback`, `OffscreenCanvas`, Web Audio's `decodeAudioData`. The WebM muxer, GIF writer and quantizer are the repo's own.

## Limits

- Saving runs in real time (play and capture); a dropped presentation frame in a busy tab just lasts longer.
- Typing plays faster than it was typed: the frames between keystrokes are still too, so each keystroke that's kept shows for one frame time.
- At 1920 px and above, a single typed character is about the size of a blinking caret at 160 px, so typing is kept every few characters, not every one.
- A clock or a busy notification area can keep frames at high sensitivity; the slider is the remedy. Skipping by sound (keep narration, skip only silent still parts) isn't built.
- The default was tuned on drawn footage, not on real recordings; real screen recordings with grain or a video playing in a corner keep more.
- An MP4 is built in memory: every encoded chunk is kept until `finish()`, as for WebM.
- H.264 gets the VP9 bitrate table, so an MP4 at the same quality is a little softer or larger than the WebM.
- No H.265, no .mov.

## Decisions

- [ADR-092: Skip pauses in Video Tools](../adrs/092-skip-pauses.md), [brainstorm](../brainstorm/2026-11-04_skip-pauses.md)
- [ADR-100: MP4 output in Video Tools with mediabunny](../adrs/100-video-mp4-output.md), [brainstorm](../brainstorm/2026-11-08_video-mp4-and-size.md)
