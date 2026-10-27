# ADR-082: Motion Watch
**Date:** 2026-10-27
**Status:** Implemented

> **Revision 2026-10-27: stopping and encoder failure.** Stop is honoured at every wait while starting (settings, the camera prompt, `resumable()`); a camera stream granted after Stop is stopped at once. `finish` flushes the encoder before cutting the clip. An encoder that fails saves the clip in progress, starts a fresh encoder and keeps watching; the fourth failure in a run ends the job.

## Context
The owner asked for camera tools. Motion Watch watches a camera, saves a clip from just before to just after motion, notifies, and shows the day as a timeline ([brainstorm](../brainstorm/2026-10-27_motion-watch.md)). It needs to run with no window, which ADR-081 provides.

## Decision
- **App** `motion-watch`, Media, by the owner. A `background` module (`watch.svelte.ts`) runs the watch; the window is a view onto it (live preview, meter, controls, events). Arm starts the job, Disarm stops it.
- **Camera** through `getUserMedia` (640×480, 15 fps ideal) on the main thread, inside the job. `MediaStreamTrackProcessor` on the page; its `readable` is transferred to a dedicated worker (`ctx.spawn`), which keeps reading in a hidden tab. Chrome only: a compat entry `camera-frames`, the window says "Needs Chrome" elsewhere.
- **Detection** in the worker: each frame drawn to 160×120, grey (`to_gray` from Birdseye), compared with a running-average background (α = 0.05). Changed watched pixels are grouped into blobs (`components` from Birdseye); motion is a blob of at least the minimum area. A frame where over 60 % of the picture changed is lights or exposure and is ignored. One sensitivity slider sets the threshold (45 → 12 grey levels) and the minimum area (160 → 10 pixels). Zones: a 16×12 grid, cells dragged off and on over the picture.
- **Pre-roll** with WebCodecs: the worker encodes nonstop at up to 640 px with a keyframe every 2 s (kit `WebmEncoder`, which gains an additive `on_chunk` hook and a `tracks` getter), the ring keeps at least 7 s of chunks. Motion confirmed on two frames in a row starts a clip from the newest keyframe at least 5 s before; it runs until 5 s after the last motion (clips cut at 120 s), then the chunks are rebased and muxed with kit `mux_webm`.
- **Files** written on the main thread through FilesService, never from the worker: `/home/Videos/Motion/YYYY-MM-DD/HH-MM-SS.webm` and that day's `events.json`, `[{ at, end, peak, cells, clip }]`, rewritten per event. Days older than the retention (7 by default, 1–30 in the app) are deleted when the watch starts.
- **Notification** on each motion start: `notify({ system: true })`, so a hidden tab shows a browser notification.
- **Settings** in `/var/lib/apps/motion-watch/settings.json` (`json_file`), shared live by the job and the windows: sensitivity, zones, keep days.
- **Mobile:** full-width preview over a controls panel, a big Arm button, Dim (a dark overlay, tap to wake), a screen wake lock while this window shows a running watch, and a note that the OS stops the camera with the screen off.
- **Shell:** nothing of its own; `bg ls` and `bg stop motion-watch` cover it.

## Alternatives Considered
- Two rotating MediaRecorders, no pre-roll, a MediaRecorder timeslice ring: rejected in the brainstorm (two files, misses the trigger, corrupt files).
- Detection on the main thread: a hidden tab throttles it.
- Writing files from the worker: FilesService owns OPFS writes and folder revisions.
- Moving Birdseye's grey and blob helpers to the kit: one import each from another app's module follows the existing precedent (`color-recall/color.ts`, `pdf-tools/pdf`); they move when a third user appears.

## Consequences
- Firefox and Safari can't run it (no `MediaStreamTrackProcessor` on the page).
- A clip's last few frames after the post-roll may be missing: the encoder's output trails the frames by a little, and the clip is cut at the frame, not after a flush.
- Phone as a remote camera over WebRTC stays a later ADR.
