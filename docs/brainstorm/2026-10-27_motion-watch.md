# Motion Watch
**Date:** 2026-10-27
**Participants:** owner, Claude

## Context
Owner asked for camera tools. Motion Watch watches a camera, saves a clip from just before to just after motion, notifies, and shows a timeline. Reuse: Recorder's camera code (`recorder/session.svelte.ts:208`), `$kit/utils/video` `WebmEncoder` and `mux_webm`, Birdseye's `to_gray`/`downsample`/`components`, `notify({ system: true })`, the wake lock pattern (`cards/checkout.svelte:22`). Phone as a remote camera over WebRTC comes later; `$kit/utils/p2p` is data-channel only.

## Decisions
- **Pre-roll:** WebCodecs ring. Encode nonstop at about 640p with a keyframe every 2 s, keep the last ~7 s of chunks, slice from the oldest keyframe on motion, mux with `mux_webm`. `WebmEncoder` gains an `on_chunk`. Rejected: two rotating MediaRecorders (two files), no pre-roll (misses the trigger); a MediaRecorder timeslice ring corrupts files.
- **Detection:** running-average background (α ≈ 0.05) on 160×120 grey, threshold plus minimum area, ignore frames where over 60 % changes (lights, exposure). One sensitivity slider. Zones: a 16×12 cell grid, tap or drag cells off.
- **Where it runs:** a worker fed by `MediaStreamTrackProcessor`, so it keeps going in a hidden tab (Chrome-only; compat entry). The owner asked whether this wants a kernel worker service. **Decided 2026-10-27** (below): a `background` service for windowless app jobs, workers stay a detail inside a job.
- **Storage:** `/home/Videos/Motion/YYYY-MM-DD/HH-MM-SS.webm` plus `events.json` per day (`[{ at, end, peak, cells, clip }]`), rewritten per event; keep 7 days by default.
- **Shell:** nothing.

## Decided 2026-10-27: background apps
- **Not a worker service.** What has to outlive a window is the job (camera, files, notifications on the main thread); workers are a detail inside it. New `background` service ([ADR-081](../adrs/081-background-apps.md)): `define_app({ background: () => import(…) })`, `start`/`stop`, reactive `list`/`get`; windows are views onto the job (two windows = one watch).
- **One per app per browser:** Web Lock `webos.background.{app}`, `ifAvailable`, never stolen (stealing restarts the camera and loses the pre-roll). Other tabs see the status over a BroadcastChannel as running elsewhere.
- **Reload:** no auto-restart; a job can mark itself resumable, and boot offers Resume as a toast after the Restore answer.
- **Visibility:** taskbar indicator, Activity Monitor › Background, an inspector. Shell `bg ls`, `bg stop <app>`; no `bg start`.
- **Workers:** a kit worker helper (`spawn<Api>()` with typed `call`, `serve<Api>()` in the worker); the codecs pool and Warren's speller move onto it. Inside a job, `ctx.spawn` wraps it, ends the worker with the job and lists it under the job; elsewhere plain `spawn`, untracked. The helper lives in core (jobs are core) and the kit re-exports it.
- **Solo:** a solo tab may run its own app's job and never takes a lock. **Mobile:** same API; the OS stops the camera with the screen off.
- Motion Watch: [ADR-082](../adrs/082-motion-watch.md), [internals](../apps/motion-watch.md).

## Key takeaways
Phones stop the camera with the screen off: realistic mobile use is a phone on a charger with the app open, a wake lock and a dim overlay.

## Action items
- [x] Explore a kernel worker service: decided as background apps (ADR-081), built 2026-10-27.
- [x] Then build Motion Watch on it (ADR-082), built 2026-10-27.

## Next session topics
- Phone as a remote camera (p2p media tracks, own ADR).
