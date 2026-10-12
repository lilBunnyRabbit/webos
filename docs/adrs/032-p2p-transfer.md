# ADR-032: P2P Transfer
**Date:** 2026-10-13
**Status:** Implemented

## Context

The roadmap lists P2P file transfer (ADR-009, Utilities). WebRTC data channels move bytes directly between browsers, but the peers must first exchange an offer and an answer, normally through a signaling server. WebOS is a static site with no backend. Discussion: [brainstorm](../brainstorm/2026-10-13_p2p-transfer.md).

## Decision

1. **A user app, `user/p2p-transfer`.** No service; nothing else calls it yet.
2. **Manual signaling by QR code.** The sender shows an offer code, the receiver scans it and shows an answer code, the sender scans that. Each code can also be copied and pasted.
3. **Compact codes.** `signal.ts` reduces the SDP to ICE ufrag and password, SHA-256 fingerprint, DTLS role and UDP candidates (`WEBOS-P2P1|kind|ufrag|pwd|fingerprint|role|candidates`, ~170 characters) and rebuilds a data-channel SDP from it. ICE gathering completes (or times out after 4 s) before the code is shown; there is no trickle.
4. **STUN: `stun:stun.l.google.com:19302`.** No TURN: symmetric NAT or carrier-grade NAT (CGNAT) on both sides fails to connect.
5. **QR encoding through `uqr`** (new dependency, owner-approved), wrapped as `qr_path()` in `$lib/core/utils/qr.ts`. The detector (`BarcodeDetector`, jsQR fallback) moved there from QR Reader.
6. **Protocol** on one ordered, reliable channel: `manifest` → `resume {offsets}` → per file `start`, 64 KB binary chunks, `end` → `done` → `received`. Sender backpressure at 4 MB buffered. Messages are zod-validated and file names sanitised; the peer is untrusted.
7. **Files land in `/home/Downloads`**, through `/tmp/p2p-transfer/{size}-{name}.part`, then `move_file` to a free name.
8. **The UI shows the real connection** (`read_link()` over `getStats()`): route, RTT, rate, endpoints, DTLS cipher, bytes on the wire, where files are written, and a timestamped event log. STUN is drawn as address lookup only.
9. **Resume** on reconnect: the receiver offers each part file's size as the offset and `null` for files already saved this session. `/tmp` is emptied at boot, so resume survives a dropped connection but not a reload.

## Alternatives Considered

- **Public relay for room codes** (PeerJS cloud, Nostr relays, public MQTT, WebTorrent trackers): nicer UX, but it depends on a third-party server and probably a dependency.
- **Own signaling server**: breaks the no-backend rule.
- **Hand-written QR encoder**: no dependency, ~250 lines to own. The owner chose `uqr`.
- **Partial files in `/home/Downloads/*.part`**: resume across reloads, but visible clutter.
- **Raw or deflated SDP in the QR**: works, but a ~1 kB code is a dense QR that a phone reads poorly off a screen.
- **WebTorrent swarming**: heavy, and pointless for one sender and a few receivers.

## Consequences

### Positive
- No server of ours anywhere; file data never leaves the two devices.
- Resume needs no stored state beyond the part file itself.
- `qr_path()` is ready for ADR-010's share dialog.

### Negative
- Two scans per connection, and again for every reconnect.
- One receiver per connection; several receivers means several handshakes.
- No background transfer: a suspended tab drops the connection (then resume).
- The receiver writes as fast as messages arrive; there's no receive-side flow control.
- The rebuilt SDP is hand-shaped. A browser that rejects it would need its fields added back.
