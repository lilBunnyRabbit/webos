# Files by light
**Date:** 2026-10-21
**Participants:** owner, Claude

## Context
Owner's idea, from a viral post: one phone flashes animated QR codes, the other films them; fountain codes make dropped frames cost time, not data; claimed 60 fps, 190 KB/s.

Investigation: kit `qr-transfer` (ADR-053) sends JSON as `WQ1` Base45 frames, 240 B each, cycling at 2.5 fps (`qr-frames.svelte:11`), cap 999 frames: about 600 B/s. Encoder `uqr` at ECC L (`kit/utils/qr.ts:97`); decoder native `BarcodeDetector` with `jsqr` fallback (`qr.ts:49-72`), one detect per `requestVideoFrameCallback`. Measured: `BarcodeDetector` 22-29 ms per 1080p frame on desktop Chromium. Cameras give ~30 fps and rolling shutter blends frames, so 10-15 fps display is the useful ceiling; QR v15-20-L (500-700 B) is the sweet spot off a phone screen. `rawValue` is a string, so stay Base45. Credible: 3-10 KB/s; 190 KB/s is cimbar-class, not QR. With 20% drops, systematic LT needs 69 frames for k=50 where cycling needs ~165, 688 vs ~2360 for k=500.

## Decisions
- **Home: P2P Transfer "By light" mode** next to Direct (WebRTC). One-way, no back-channel: the sender runs until stopped; the receiver shows progress and saves to `/home/Downloads`. The codec is a kit util (`$kit/utils/light`). Shopping List and Cards stay on WQ1. Rejected: a new app (duplicates file pick and save); WQ2 everywhere (small payloads gain nothing, old receivers ignore it).
- **Codec: systematic LT, hand-written.** Plain blocks first, then repair symbols with robust-soliton degrees from a seeded PRNG; peeling decoder; a header frame (name, size, type, k, block size, SHA-256) repeated in the stream; Base45 frames at QR v15-20-L; deflate only for text-like types; whole-file SHA-256 checked before saving. Own frame prefix, distinct from WQ1. Rejected: faster WQ1 cycling (still pays the wait for missed frames); cimbar colour codes (big WASM or months).
- **Limits:** files over 2 MB refused, with an estimated time shown before sending; Speed preset Steady (about 8 fps) / Fast (about 15 fps) sets fps and QR version; the receiver shows its rate and percent. Sender frames pre-rendered to canvas and driven by `requestAnimationFrame`. Wake Lock on both sides; tell the user to raise screen brightness.
- **Shell:** nothing.
- **Mobile:** primary target (phone to phone); desktop works as sender or webcam receiver.

## Action items
- [x] ADR-060; `$kit/utils/light` (codec + tests: random drops, any order, hash mismatch); P2P Transfer mode; `docs/apps/p2p-transfer.md`; changelog.

## Next session topics
- Multiple files per run
- Real phone-to-phone speed measurement
