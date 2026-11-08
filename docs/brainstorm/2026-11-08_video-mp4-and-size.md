# Video Tools: MP4 output, output size, findable pause skipping
**Date:** 2026-11-08
**Participants:** owner, Claude

## Context
LaxDOTexe sent a "Duplicate Frame Remover" concept. It analyses a video, removes duplicate or near-duplicate frames by thresholding the MSE between consecutive frames, and re-encodes. It has controls for sensitivity, output resolution and codec (H.264/H.265, .mp4/.mov). Adaptive thresholds and motion detection come later.

Most of it exists. Skip pauses in Video Tools (ADR-092, 2026-11-04, from Lax's earlier request) already does three things:
- it compares each frame with the last kept one on a 160 px grey copy;
- a sensitivity slider sets the threshold;
- it works on Clip and GIF, and Recorder has "Save & remove pauses…".

Today's gaps:
- output is WebM only (VP9/VP8, hand-written muxer `kit/utils/video/webm.ts`);
- there is no output size choice;
- searching for "duplicate frames" doesn't find it.

## Decisions
- **MP4 (H.264) output on Clip** (owner): WebCodecs `VideoEncoder` H.264 (avc), audio AAC when the browser encodes it, else no sound with a note.
  - The muxer is the `mediabunny` package (owner, a new dependency), not hand-written. Rejected: a hand-written `mp4.ts` beside `webm.ts` (box details easy to get wrong).
  - WebM keeps its own muxer.
- **Output size on Clip** (owner): Original, 1080p, 720p, 480p, scaled before encoding, aspect kept, even dimensions.
- **Findable** (owner): keywords ("duplicate frames", "remove pauses", "timelapse", "dedupe"), a guide line, and an App Store "Try:" example pointing at Skip pauses.
- **Shell** (owner): `video trim <path> --format mp4|webm --size original|1080|720|480`. The defaults are webm and original.
- **Remembered choice** (owner): Video Tools stores the last format and size in `/var/lib/apps/video-tools/settings.json` (version bump with a default for old files). Recorder's "Save & remove pauses…" opens with them. Rejected: always MP4.
- **Not now:** H.265, .mov, adaptive thresholds, motion detection.

## Action items
- [x] ADR-100, mediabunny MP4 output; ADR-092 revision.
- [x] Build: kit MP4 encode path, the Clip format and size UI, settings, shell args, keywords, docs, compat entry for H.264 `VideoEncoder` support if needed.

## Next session topics
- H.265 or .mov if Lax asks; adaptive thresholds.
