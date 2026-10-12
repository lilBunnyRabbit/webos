# Open from device

**Date:** 2026-10-13
**Participants:** owner, Claude

## Context

Every app with "Open…" opened files only through `window.pick_file()`, which browses OPFS. To open a photo from the phone, or a file from the PC, the owner had to upload it in File Explorer first (or copy and paste it), then pick it. The owner called that flow bad and asked for "open from device" as a secondary action in every app with Open….

What existed: eight apps (Image Crop, Background Remove, Image Split, Sprite Extractor, Image Concat, GIF Player, Music Visualizer, QR Reader) already took a raw `File` from drop or paste without writing to OPFS. Paint, Speed Reader, Dev Tools hash, Text Editor and the four viewers (Media Preview, PDF Viewer, HTML Preview, CSV Viewer) were path-only. `opfs.upload_files` had its own `<input type="file">` code.

## Topics

| Question | Decision | Rejected |
|----------|----------|----------|
| Where it lives | **Core util `pick_device_files({ accept, multiple })` → `File[]`** (a detached `<input type="file">`, nothing written to OPFS). Each app adds a secondary "Open from device…" button and feeds the files to its own loader. `upload_files` reuses it | A "From device…" button inside the picker that copies into `/tmp` and returns a path (still writes to storage, one tap deeper, a Save in Text Editor would land in `/tmp`, wiped at boot); a `WindowHandle` method (same app work, changes the handle's shape) |
| Text Editor Save | **Save is Save as** for a device file: no path, the file's name is prefilled. The buffer isn't dirty until edited, since the original is still on the device | Importing into `/home/Downloads` on open (the upload flow, made silent; copies pile up) |

## Key takeaways

- A device file has no path. So it gets no disk watch in Text Editor, no Save to disk in Media Preview, no remembered position in Speed Reader, and no session restore. That's the same as a dropped file today.
- Viewers keep `source: string | File` instead of `path`; `path` is derived from it.

## Action items

- [x] ADR-031
- [x] Util, 16 open surfaces, docs
