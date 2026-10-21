# ADR-060: Files by Light
**Date:** 2026-10-21
**Status:** Implemented

## Context
P2P Transfer needs a network path between two devices (ADR-032). The owner wants a transfer that needs no network at all: animated QR codes filmed by the other device ([brainstorm](../brainstorm/2026-10-21_light-transfer.md)). ADR-053's cycling `WQ1` frames carry JSON at about 600 B/s and stall waiting for missed frames.

## Decision
- **P2P Transfer gains a "By light" mode** beside Direct. One-way, no back-channel: the sender loops until stopped; the receiver collects, verifies and saves to `/home/Downloads`.
- **Fountain codec in `$kit/utils/light`:** systematic LT. Blocks 1..k sent plain, then repair symbols (XOR of robust-soliton-sized neighbour sets from a seeded PRNG, the seed in the frame). Peeling decoder. A header frame (name, size, type, k, block size, compressed flag, SHA-256) interleaved periodically. Frames are Base45 in QR alphanumeric mode with their own prefix (not `WQ1`). Deflate only for text-like types. SHA-256 must match before the file is saved.
- **Limits and pacing:** 2 MB cap with an estimated time before sending. Speed presets Steady (about 8 fps) and Fast (about 15 fps) pick fps and QR version (v15-20, ECC L). Frames are pre-rendered to canvas and shown on `requestAnimationFrame`. Wake Lock on both sides.
- **Shell:** nothing.
- No dependency: `uqr`, `BarcodeDetector`, `CompressionStream`, `crypto.subtle`.

## Alternatives Considered
- Faster `WQ1` cycling with a binary path: about 4× today, still waits for whole rounds.
- Upgrading `qr-transfer` everywhere: Shopping List and Cards use 1-5 frames and gain nothing.
- A separate app: duplicates file pick and save.
- RaptorQ: thousands of lines. cimbar colour codes: large WASM or a lot of work.

## Consequences
- Expect 3-10 KB/s on phones, not the viral 190 KB/s; 1 MB takes minutes.
- The sender never learns the receiver finished; the user stops it.
- Two QR frame formats in the kit, each for its own use.

## Revision 2026-10-21: as built
- **Repair degrees scaled for the missing set.** Plain robust soliton over all `k` blocks made about half the repair symbols cover only blocks the receiver already had: 2.3-2.8× `k` frames at 20% missed (simulated). The degree is now drawn from robust soliton over 30% of `k` (the expected gap) and scaled back up by 1/0.3, which lands at 1.43× `k` at 20% missed and 1.65× at 30% (headers included). Still robust-soliton-shaped, seeded from the symbol number.
- **Schedule:** endless rounds of the `k` plain blocks then `k` fresh repair symbols (repair numbers never repeat); the header is every 16th frame. Data frames carry `k`, so decoding starts before the first header arrives.
- **Stream id** is a hash of the header (file hash, block size, compression), not random: a sender that stops and starts again continues the same stream.
- **Presets:** Steady = 8 fps at QR v15 (489 B a block), Fast = 15 fps at v20 (817 B).
- **Pre-rendering is a rolling 2 s look-ahead** of `ImageBitmap`s at one pixel per module, drawn scaled on `requestAnimationFrame`. Rendering every frame up front would hold thousands of canvases for a 2 MB file.
- Frame prefix `WL1:`. Measured in headless Chromium: about 5 ms to render a frame, 12-14 ms to detect one (native `BarcodeDetector`, about 70-85 frames/s); a fake camera filming the sender window moved 40 KB in 11 s at Steady and 400 KB in 40 s at Fast (about 10 KB/s), hash matching.
