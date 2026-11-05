# Glimpse

Id `glimpse` · Source: `src/lib/apps/user/glimpse/` · [ADR-093](../adrs/093-glimpse.md) · [brainstorm](../brainstorm/2026-11-05_glimpse.md)

## What it does

A camera for double-check photos (the locked door, the parked car) and a gallery of them that erases itself. Every camera session is a batch. The expiry chip (1 h · 24 h · 3 d · 1 w, 24 h each time the camera opens) sets when the batch erases. In the full-screen viewer, **Save to Pictures** keeps a copy for good and **Extend** gives the batch a new time from now.

It opens on the gallery, or straight on the camera when there are no live batches. No shell commands; `app launch glimpse` opens it.

## How it works

### Files

| File | Does |
|------|------|
| `glimpse.app.svelte` | Index, batch session, erase timer, gallery, camera and viewer switching, back handling |
| `camera.svelte.ts` | `Camera`: opens and releases the stream, reads capabilities, torch, zoom, focus, wake lock, orientation; `shutter_feedback()` |
| `camera-view.svelte` | Preview, controls, tap to focus and pinch zoom, Space to shoot, Escape to close |
| `encode.ts`, `encode.worker.ts` | The encoder worker: rotate, JPEG 0.85, 320 px thumbnail |
| `store.ts` | Every OPFS write, on one queue: save a shot, erase, delete, orphan sweep, Save to Pictures |
| `photos.ts` | Index schema, expiry options, pure selection helpers (`expired`, `orphans`, `without_photo`, `time_left`) |
| `orientation.ts` | Gravity to device angle, device and screen angle to the frame's turn |
| `gallery.svelte`, `viewer.svelte`, `thumb.svelte` | Batch list, full-screen viewer, thumbnail loader |

### Capture pipeline

1. **Stream.** `getUserMedia` with `facingMode: { ideal: "environment" }` and `width`/`height` `ideal` 4096×3072, no audio (`camera.svelte.ts:185`). A lens pick asks for `deviceId: { exact }` instead; when that fails (an unplugged webcam), the pick is dropped, so Try again falls back to the facing. The old stream stops before a new one opens: phones can't hold two cameras.
2. **Shutter.** `createImageBitmap(video)` grabs the frame on screen (`Camera.grab`). No `ImageCapture.takePhoto()`: it costs 0.3–1 s per shot on Android and blinks the preview. With the torch on **flash**, the torch goes on, waits 350 ms for the exposure to settle, grabs, and goes off. A burst shares one flash: a count of shots in flight keeps the torch on until the last one has grabbed.
3. **Feedback.** `navigator.vibrate(25)` and a 30 ms noise burst through one shared `AudioContext`, created on the first tap so it starts inside the user activation. A white flash over the preview for 90 ms.
4. **Encode.** The bitmap is transferred to the worker (`encode.ts`), which draws it to an `OffscreenCanvas` turned by the shot's quarter turns, encodes JPEG 0.85, then draws again at 320 px on the long side for the thumbnail. The worker is spawned on first use and terminated after 30 s idle.
5. **Write.** `save_shot` (`store.ts:53`) runs on the store queue: photo, thumbnail, then the photo entry pushed into its batch, or a new batch entry. The shutter never awaits it: the count goes up at once, the last-shot tile shows a spinner until the thumbnail lands. A batch is created by its first saved photo, so a camera session with no shots stores nothing. Each save holds its own reference to the shared index cell (`json_file`) until it lands, so closing the window mid-burst still lists every queued shot.

The front camera's preview is mirrored with CSS (`-scale-x-100`); the frame grab isn't, so the saved photo reads the right way. A camera that reports no `facingMode` (laptop webcams) counts as front-facing.

### Controls

Each control shows only when the track reports it (`read_track`):

| Control | Shows when | Applies |
|---------|-----------|---------|
| Torch: off → flash → on | `getCapabilities().torch === true` | `applyConstraints({ advanced: [{ torch }] })` |
| Zoom: slider and two-finger pinch | `capabilities.zoom` with `max > min` | `{ zoom }`, at most once per animation frame while pinching |
| Tap to focus | `getSupportedConstraints().pointsOfInterest` and a non-empty `focusMode` | `{ pointsOfInterest: [{ x, y }], focusMode: "single-shot" }` (or `continuous`); the tap is mapped through `object-contain`'s bars and the mirror to 0–1 frame coordinates |
| Switch camera | more than one `videoinput` | flips the wanted `facingMode` |
| Pick a lens | more than two `videoinput`s | a menu of the devices' labels |

Desktop webcams usually report none of torch, zoom or focus. The compat entry `camera-controls` covers the browsers without them.

### Orientation (`orientation.ts`)

Chrome already turns camera frames to match the screen, so a frame needs turning only by how far the device is turned past the screen: a phone held sideways with its screen locked to portrait.

- `device_angle(x, y)` snaps `accelerationIncludingGravity` to the nearest quarter, in the same sense as `screen.orientation.angle`. Below 4 m/s² across the screen the phone lies flat and the last angle stays.
- `photo_turn(device, screen)` = `(screen − device) / 90` mod 4, the clockwise quarter turns the worker applies. A shot keeps the turn read at the tap.
- The controls (torch, lens, switch, last shot) rotate by the same tilt, so their icons stay upright.

Without `devicemotion` events (desktop, or iOS without the motion permission, which Glimpse doesn't ask for) the device angle is the screen angle and nothing is turned.

### Camera lifetime

`Camera` holds the stream only while it's wanted and the window is visible (`win.is_visible`): hiding or minimising the window releases the camera, showing it again reacquires. While a stream is open it holds a screen Wake Lock, reacquired on `visibilitychange`. The component's teardown releases everything.

### Storage

All in `/var/lib/apps/glimpse/`, never `/home`, so nothing shows in File Explorer.

```
index.json
photos/{id}.jpg
thumbs/{id}.jpg
```

`index.json`, through `storage.file()` with a zod schema (`photos.ts:24`):

```json
{
  "version": 1,
  "batches": [
    {
      "id": "mh3k2a1-x7p2q",
      "name": "Front door",
      "created": 1793878701878,
      "expires": 1793965101878,
      "photos": [{ "id": "mh3k2b4-a91zd", "taken": 1793878702001, "width": 1920, "height": 1080 }]
    }
  ]
}
```

- Ids are base-36 milliseconds plus five random characters; photo ids must match `[a-z0-9-]+`, since they become file names.
- `width`/`height` are the encoded photo's, after the turn. The viewer sizes the image from them before it loads.
- `name` is optional, set with the pencil in the gallery; without one the batch shows "Today 14:05", "Yesterday 09:12" or the date.
- A file that fails the schema shows an error and is left alone: nothing is erased.

### Erasing and orphan cleanup

Every write runs on one promise queue per tab (`store.ts:19`), so a save, an erase and the sweep never interleave.

- **Expired batches** (`expires <= now`) are erased when Glimpse opens and then whenever the 30 s ticker (paused while the window is hidden) finds one. Erasing deletes each photo's two files (a missing file is fine), then drops the batches from the index. There is no scheduler job: a batch that expires while Glimpse is closed stays on disk until it next opens.
- **Orphans.** After the erase on open, every file in `photos/` and `thumbs/` that no index photo owns is deleted. Files of shots still being written are kept out of the sweep (`writing` set), since their index entry lands only after both files are written. A file younger than 10 minutes is left alone too, since another tab may be between writing it and listing it. This cleans up after a tab closed mid-save. Two tabs writing the index at once is still newest-wins (`json_file`); that's the platform's rule for every app file.
- **Deleting** a batch removes its files and entry; deleting a photo removes its files, and the batch goes with its last photo.
- **Extend** sets `expires` to now plus the picked option. Changing the chip while the camera is open moves the open batch's `expires` to its `created` plus the new option.
- **Save to Pictures** copies the photo to `/home/Pictures/Glimpse YYYY-MM-DD HH-MM-SS.jpg` (folder created if missing, name made unique by FilesService) and toasts with Open.

Two Glimpse windows share the index through `storage.file()`; each runs its own camera session and batch.

### Viewer

Every photo of every batch in gallery order, one list. Swipe (60 px) or the arrow keys move; the caret buttons on the sides do the same. Pinch, the wheel and double-click zoom through `$kit/utils/view.ts` (`fit_view`, `pinch_view`, `zoom_view`); dragging pans while zoomed; zoom never goes below fit. The thumbnail shows first, scaled to the photo's size, and the full photo loads over it. Escape unzooms, then closes; Delete deletes. The viewer and the camera take focus when they open, so window keys reach them; the back button closes the viewer, then the camera.

## Limits

- Photos are as big as the video stream (1080p to 4K on a phone), not the full sensor.
- No erasing while Glimpse is closed.
- Torch, zoom and focus exist only on Chrome for Android with a camera that reports them; checked so far with Chromium's fake camera, which has none of them.
