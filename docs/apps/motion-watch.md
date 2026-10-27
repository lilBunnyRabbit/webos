# Motion Watch

Id `motion-watch` · Source: `src/lib/apps/user/motion-watch/`, the job runner in `src/lib/core/api/services/background/`, encoding in `src/lib/kit/utils/video/` · [ADR-082](../adrs/082-motion-watch.md) · [ADR-081](../adrs/081-background-apps.md) · [brainstorm](../brainstorm/2026-10-27_motion-watch.md)

## What it does

Watches a camera for motion. When something moves it keeps a clip from about five seconds before to five seconds after, sends a notification, and puts the event on the day's timeline. **Arm** starts the watch as a background job: closing the window leaves it running, a second window shows the same watch, and another tab shows "Watching in another tab". **Disarm** stops it (also `bg stop motion-watch`, Activity Monitor › Background).

Chrome and Edge only: it needs `MediaStreamTrackProcessor` on the page (compat `camera-frames`). Elsewhere the window says "Needs Chrome".

## How it works

### Threads

| Where | File | Does |
|-------|------|------|
| Main thread, the job | `watch.svelte.ts` | `getUserMedia` (640×480 at 15 fps ideal, no audio), `MediaStreamTrackProcessor`, transfers its `readable` to the worker; shares a `LiveWatch` (`live.svelte.ts`: stream, level, motion, recording, last motion, clips saved) with the windows; pushes settings to the worker when they change; turns worker events into the notification and saved files |
| Worker | `watch.worker.ts` | Reads every frame: encodes it, detects motion on a small copy, cuts clips, muxes them, posts events (`level` at most every 150 ms or on motion, `motion` when a clip starts, `clip` with the WebM) |
| Main thread | `storage.ts` | Writes clips and `events.json` through FilesService, prunes old days |

The worker is spawned with `ctx.spawn` ("Detector and encoder"), so it shows under the job in Activity Monitor and ends with it. A hidden tab throttles the page's timers but not a worker reading a track stream, which is why the per-frame work is there. Files are never written from the worker: FilesService owns OPFS writes and folder revisions.

### Detection (`detect.ts`, `settings.ts`)

Each frame is drawn to a 160×120 `OffscreenCanvas` and turned grey with Birdseye's `to_gray` (`../birdseye/ncc.ts:17`).

1. **Background.** A running average, `bg += 0.05 × (grey − bg)` per pixel, every frame. Something that stops moving fades into it within about 20 frames (a parked car, a moved chair). The first frame seeds it; nothing counts for 10 frames.
2. **Changed pixels.** `|grey − bg| > threshold`, kept only where the zone mask is on.
3. **Lights.** When more than 60 % of the whole picture changed, the frame is a light switch or an exposure change and never counts.
4. **Blobs.** The changed watched pixels are grouped 8-connected with Birdseye's `components` (`../birdseye/blob.ts:182`). Motion is any blob of at least `min_area` pixels; its bounding box gives the zone cells it touched.
5. **Level.** Changed watched pixels over watched pixels, the live meter (drawn at ×4 so small motion shows).

The one **sensitivity** slider (0–100, default 50) sets both: threshold 45 → 12 grey levels, minimum area 160 → 10 pixels (`detect_config`).

**Zones.** A 16×12 grid over the picture, each cell 10×10 detection pixels. `zones` is a 192-character string, `"1"` watched and `"0"` ignored, row by row. **Zones** turns the overlay into an editor: dragging from a cell paints the rectangle up to the pointer with the opposite of the first cell's state (`paint_zones`); the drag ends on `lostpointercapture`. Cells are focusable, Enter or Space toggles one.

### Pre-roll ring (`recorder.ts`, kit `video/encode.ts`)

The worker encodes nonstop through `WebmEncoder` (VP9, else VP8; 1 Mbit/s, 15 fps, at most 640 px on the long side, drawn through a canvas when the camera's frame is bigger), keyframe every 2 s (`KEYFRAME_EVERY_US`). Its `on_chunk` hook hands each chunk to `ClipRecorder` instead of keeping it; `tracks` gives the muxer the video track. A busy encoder skips the frame; detection still sees it.

| Rule | Value |
|------|-------|
| Ring | Pruned to start on the newest keyframe at least 7 s old (`KEEP_US`), so 7–9 s are kept |
| Start | Two detection frames in a row with motion (`CONFIRM`) |
| Pre-roll | From the newest keyframe at or before 5 s before the start (`PRE_US`), else the oldest keyframe in the ring: 5–7 s |
| End | 5 s after the last frame with motion (`POST_US`) |
| Cap | 120 s (`MAX_US`); motion that goes on starts the next clip with its own pre-roll |
| Stop | `finish` cuts the clip in progress; the job waits up to 4 s for it before letting go |
| Output | Chunks rebased to start at 0, then kit `mux_webm` |

A clip only ever opens on a keyframe: when the ring has none yet, the clip waits for the next one. Encoder output trails its input a little, so the last frame or two of the post-roll can be missing.

### Files (`events.ts`, `storage.ts`)

```
/home/Videos/Motion/2026-10-27/
  14-03-09.webm
  14-07-41.webm
  events.json   [{ "at": …, "end": …, "peak": 0.12, "cells": [52, 53, 68], "clip": "14-03-09.webm" }]
```

- Days and names follow the local clock. A clip in the same second as another gets ` (1)` (`create_file` without overwrite); `clip` is the name actually written.
- `at` and `end` are the wall-clock ms of the first and last frame that saw motion; `peak` the highest level; `cells` every zone cell motion touched.
- Saves run one at a time; each rewrites the day's `events.json` sorted by `at`. A bad entry is dropped on read, a file that isn't a list reads as none.
- **Retention.** When the watch starts, day folders older than the last `keep_days` days (today included) are deleted. Other names in the folder are left alone.

**Settings** live in `/var/lib/apps/motion-watch/settings.json` through `json_file`: `{ sensitivity, zones, keep_days }`. The job and every window in the tab hold the same cell, so a slider move reaches the running worker at once.

### Notification

On each clip start: `notify({ title: "Motion", message: "Seen at 14:03. Recording a clip.", system: true })` with Open; a hidden tab also gets a browser notification. Arm asks for notification permission in the click.

### Window

- **Stage.** The live preview (the job's `MediaStream`) with the zone overlay, a Watching / Recording / "Light changed, ignored" chip, and the motion meter. A played clip replaces it with controls and a Live button. Disarmed or elsewhere, a placeholder with the state.
- **Panel.** Arm / Disarm, clips this run and the last motion, sensitivity, Zones (with the watched count and Watch all), Keep clips for (1, 3, 7, 14, 30 days), and Events: a day picker, a 24-hour strip with a mark per event (click plays) and the list newest first with time, length and peak.
- **Layout.** Container queries: from `@2xl` the stage sits left and the panel is a 20 rem column; below, the stage is full width on top and the panel a rounded sheet under it that scrolls.
- **Phone.** Dim covers the window with the darkest surface (tap to wake), a screen wake lock is held while this window shows a running watch and is visible, and a note says the OS stops the camera when the screen turns off or the browser goes to the background. Back closes the player, then Dim, then zone editing.

### Resume

The job calls `ctx.resumable()` once the camera is running. After a reload with the watch armed, WebOS offers "Resume Motion Watch?"; Resume arms it again (the camera permission must still be granted).

## Shell

Nothing of its own: `bg ls` and `bg stop motion-watch` ([background](../system/services/background.md#shell)).

## Known gaps

- Firefox and Safari can't run it.
- A phone stops the camera with the screen off; the job then ends with "The camera stopped".
- No audio. No clip deletion in the app (File Explorer does it). One camera, the default one.
- Phone as a remote camera over WebRTC is a later ADR.
