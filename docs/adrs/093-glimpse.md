# ADR-093: Glimpse, throwaway photos
**Date:** 2026-11-05
**Status:** Implemented

## Context
The owner takes several quick photos as a double check (a closed door, a parked car) and doesn't want to keep them. The phone's camera app is slow to reach, and its photos stay forever. WebOS has cameras in Recorder, Color Tools, Motion Watch and the kit QR scanner, but none of them uses the torch, zoom or focus, and none has a gallery ([brainstorm](../brainstorm/2026-11-05_glimpse.md)).

## Decision
- **New user app `glimpse` (Glimpse):** a camera, plus a gallery of photos that erase themselves.
- **Storage:** app storage only, in `/var/lib/apps/glimpse/`:
  - `index.json` `{ version: 1, batches: [{ id, name?, created, expires, photos: [{ id, taken, width, height }] }] }`
  - `photos/{id}.jpg` and `thumbs/{id}.jpg` (320 px).
  - Erasing deletes the files, then rewrites the index.
  - On open, files the index doesn't list are deleted.
- **Batches:** opening the camera starts a batch and closing it ends the batch. An expiry chip (1 h · 24 h · 3 d · 1 w, default 24 h) sets the batch's `expires` and can be changed while the camera is open. A batch with no photos isn't stored. The name is optional and is set in the gallery.
- **Erasing:** batches past `expires` are erased when Glimpse opens and by a timer while it is open. There is no scheduler job.
- **Keeping:** in the viewer, **Save to Pictures** copies the photo to `/home/Pictures`, and **Extend** changes the batch's expiry.
- **Shutter:** a frame grab from the live preview.
  - The stream is `getUserMedia` with `facingMode: "environment"`, up to 4096×3072 (`ideal`).
  - A shot runs `createImageBitmap(video)`, rotated to the device orientation. A worker encodes it as JPEG 0.85 and makes the thumbnail.
  - Writes are queued, so the shutter never waits for them.
  - There is no `ImageCapture.takePhoto()`.
- **Controls:** each shows only when `track.getCapabilities()` reports it:
  - torch: on or off, or one-shot (on for the shot)
  - zoom: pinch and a slider
  - tap to focus: `pointsOfInterest`
  - front/back and lens switch
- **Camera behaviour:**
  - The front camera's preview is mirrored; the saved photo isn't.
  - Shutter feedback is a vibrate and a click.
  - A Screen Wake Lock is held while the camera is open.
  - The camera is released while the window is hidden.
- **Gallery:**
  - Batches, newest first. Each row shows the batch's name or time, a countdown ("erases in 5 h") and its thumbnails.
  - The full-screen viewer moves through every photo with swipe or the arrow keys, and zooms with pinch or the wheel.
- **Camera code:** lives in the app (`glimpse/camera.svelte.ts`), not the kit.
- **Shell:** nothing; `app launch glimpse` covers it.
- **Mobile:** both. The phone is the main target.

## Alternatives Considered
- `ImageCapture.takePhoto()` as the shutter, or as an HQ toggle: full sensor and a real flash, but 0.3–1 s per shot on Android, a blinking preview and no Firefox.
- A kit camera helper first, merging `CameraScan`, Color Tools' `Camera`, Recorder and Motion Watch: a refactor of 7 call sites ahead of one new user.
- A scheduler job per batch, to erase while only WebOS is open: more code, and a job per batch.
- A folder per batch: listing would read N meta files.
- Photos in `/home`: they'd show in Explorer and outlive the app's expiry.

## Consequences
- Photos are as big as the video stream (1080p–4K on a phone), not the full sensor.
- A photo that expires while Glimpse is closed stays on disk until Glimpse next opens.
- Glimpse is a fifth camera-opening implementation, until a kit helper merges them.
- Glimpse gets a `docs/apps/glimpse.md` page, because it has a format and a capture pipeline.

## Revision 2026-11-05 (build)
Decided within scope while building:
- The expiry chip starts at 24 h every time the camera opens; it doesn't carry the last pick into the next batch.
- A camera that reports no `facingMode` (laptop webcams) is treated as front-facing, so its preview is mirrored.
- The lens pick shows only with more than two cameras; with two, the switch button covers it.
- Torch, zoom and focus are Chrome-only constraints, so they got a `camera-controls` entry (cosmetic) in the browser support list.
- Device orientation comes from `devicemotion` gravity. iOS sends no events without a permission prompt, which Glimpse doesn't show, so photos there follow the screen angle only.
