# Motion Watch
**Date:** 2026-10-27
**Participants:** owner, Claude

## Context
Owner asked for camera tools. Motion Watch watches a camera, saves a clip from just before to just after motion, notifies, and shows a timeline. Reuse: Recorder's camera code (`recorder/session.svelte.ts:208`), `$kit/utils/video` `WebmEncoder` and `mux_webm`, Birdseye's `to_gray`/`downsample`/`components`, `notify({ system: true })`, the wake lock pattern (`cards/checkout.svelte:22`). Phone as a remote camera over WebRTC comes later; `$kit/utils/p2p` is data-channel only.

## Decisions
- **Pre-roll:** WebCodecs ring. Encode nonstop at about 640p with a keyframe every 2 s, keep the last ~7 s of chunks, slice from the oldest keyframe on motion, mux with `mux_webm`. `WebmEncoder` gains an `on_chunk`. Rejected: two rotating MediaRecorders (two files), no pre-roll (misses the trigger); a MediaRecorder timeslice ring corrupts files.
- **Detection:** running-average background (α ≈ 0.05) on 160×120 grey, threshold plus minimum area, ignore frames where over 60 % changes (lights, exposure). One sensitivity slider. Zones: a 16×12 cell grid, tap or drag cells off.
- **Where it runs:** a worker fed by `MediaStreamTrackProcessor`, so it keeps going in a hidden tab (Chrome-only; compat entry). The owner asked whether this wants a kernel worker service: **blocked on that exploration**, Motion Watch waits until it's decided.
- **Storage:** `/home/Videos/Motion/YYYY-MM-DD/HH-MM-SS.webm` plus `events.json` per day (`[{ at, end, peak, cells, clip }]`), rewritten per event; keep 7 days by default.
- **Shell:** nothing.

## Key takeaways
Phones stop the camera with the screen off: realistic mobile use is a phone on a charger with the app open, a wake lock and a dim overlay.

## Action items
- [ ] Explore a kernel worker service (own brainstorm, ADR if accepted).
- [ ] Then build Motion Watch on it.

## Next session topics
- Worker service shape; phone as a remote camera (p2p media tracks, own ADR).
