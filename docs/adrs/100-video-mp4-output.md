# ADR-100: MP4 output in Video Tools with mediabunny
**Date:** 2026-11-08
**Status:** Implemented

## Context
Video Tools saves clips as WebM through a hand-written muxer (`kit/utils/video/webm.ts`). LaxDOTexe asked for MP4 output (H.264) and an output size ([brainstorm](../brainstorm/2026-11-08_video-mp4-and-size.md)). MP4 plays everywhere: iPhone, messaging apps, editors. WebCodecs already encodes H.264. The missing piece is an ISO BMFF muxer.

## Decision
- **Dependency:** add `mediabunny` (MPL-2.0) for MP4 muxing only. It is imported lazily from the MP4 path, so WebM users and boot don't load it.
- **Encoding:** H.264 through WebCodecs `VideoEncoder` (`avc1`, a profile and level picked for the size; `isConfigSupported` checked first, with a clear error if it's missing). Audio is AAC when `AudioEncoder` supports `mp4a.40.2`; otherwise the clip is saved silent with a note.
- **Size:** Original, 1080p, 720p or 480p. Frames are drawn scaled through the existing canvas step, keeping the aspect ratio and even dimensions, never upscaled. It applies to WebM and MP4.
- **Settings:** `settings.json` gains `format` and `size` (the version is bumped; old files read with webm and original).
- **Shell:** `video trim` gains `--format mp4|webm` and `--size original|1080|720|480`.
- **Skip pauses** works with both formats, using the same output clock.

## Alternatives Considered
- **A hand-written MP4 muxer:** no dependency, but the box layout (avcC, stts/stsz/stco, edit lists) is easy to get subtly wrong across players. Rejected by the owner.
- **`mp4-muxer`:** superseded by mediabunny.
- **H.265 or .mov:** less support for encoding in browsers. Later.

## Consequences
- A new dependency in `package.json`. It is lazy, so there is no boot cost.
- `docs/apps/video-tools.md` covers the MP4 path. The compat list gains an entry if H.264 encoding isn't Baseline.

## Revision 2026-11-08: built
- **mediabunny 1.62.1**, pinned. `kit/utils/video/mp4.ts` encodes with its own `VideoEncoder` and `AudioEncoder`, keeps the chunks, and only `finish()` imports mediabunny to mux them (`EncodedVideoPacketSource("avc")`, `EncodedAudioPacketSource("aac")`, `fastStart: "in-memory"`), interleaved by timestamp. Each frame lasts until the next one, the last until the output clock's end, so the MP4's duration matches the WebM's.
- **Profile and level:** the smallest H.264 level that holds the frame size at 30 fps (Table A-1), then High, Main and Constrained Baseline in that order through `isConfigSupported`. Bitrate is the same bits-per-pixel table as VP9.
- **Size is by the short side**, so 720p of a portrait 1080 × 1920 video is 720 × 1280. Only sizes below the video's own short side are offered; a remembered size larger than the open video reads as Original without overwriting it.
- **AAC check** runs twice: the panel probes `AudioEncoder.isConfigSupported` when MP4 is picked and warns before saving; the job checks again and saves silent with a note in the saved panel and the toast.
- **Compat:** no new entry. `VideoEncoder` and `AudioEncoder` already have theirs (`video-encoder`, `audio-encoder`, both listing video-tools). Whether H.264 or AAC is encodable is per codec and only answered asynchronously, which the start-up probes can't do; the app reports it instead.
- Internal rename: the clip output is `Output.CLIP` (was `Output.WEBM`), with `format` beside it.

## Revision 2026-11-08: review fixes
- **30 fps cap for MP4.** Capture delivers the source's own rate, so a 1080p60 video overran the level (4.0) and the bitrate set for 30 fps. Videos don't report their frame rate without a demuxer, so instead of probing it the MP4 path takes frames on a 1/30 s slot grid; skipped frames never reach the output clock, so the length holds. WebM is unchanged.
- **Memory.** The encoder hands its chunks over at `finish()` and drops them, the mux loop drops each packet once added, and mediabunny writes through a `StreamTarget` into parts that become the Blob, instead of a `BufferTarget` copied into a Blob. Cancel is checked between packets and cancels the output.
- If configuring the audio encoder throws, the video encoder is closed.
