# ADR-032: P2P Transfer
**Date:** 2026-10-13
**Status:** Implemented

> **Revision 2026-10-18:** `qr.ts` and `qr-scan.svelte.ts` moved to the app kit, `$kit/utils/qr` ([ADR-048](./048-app-kit-layer.md)).
>
> **Revision 2026-10-19:** `peer.ts` and `signal.ts` moved to the app kit, `$kit/utils/p2p`, so Shopping List pairs the same way ([ADR-052](./052-p2p-pairing-in-kit.md)). Their errors no longer name P2P Transfer, and `create_offer` takes the channel label.

## Context

The roadmap lists P2P file transfer (ADR-009, Utilities). WebRTC data channels move bytes directly between browsers, but the peers must first exchange an offer and an answer, normally through a signaling server. WebOS is a static site with no backend. Discussion: [brainstorm](../brainstorm/2026-10-13_p2p-transfer.md).

## Decision

1. **A user app, `user/p2p-transfer`.** No service; nothing else calls it yet.
2. **Manual signaling by QR code.** The sender shows an offer code, the receiver scans it and shows an answer code, the sender scans that. Each code can also be copied and pasted.
3. **Compact codes.** `signal.ts` reduces the SDP to ICE ufrag and password, SHA-256 fingerprint, DTLS role and UDP candidates, packs them as bytes (ICE strings base64-decoded, IPv4 as 4 bytes, mDNS names as 16) and writes them in Base45 (RFC 9285). Base45 stays inside the QR alphanumeric charset, so a Chrome offer is ~125 characters and a version 4–5 QR instead of version 8. ICE gathering completes (or times out after 4 s) before the code is shown; there is no trickle.
4. **STUN: `stun:stun.l.google.com:19302`.** No TURN: symmetric NAT or carrier-grade NAT (CGNAT) on both sides fails to connect.
5. **QR encoding through `uqr`** (new dependency, owner-approved), wrapped as `qr_path()` in `$lib/core/utils/qr.ts`. The detector (`BarcodeDetector`, jsQR fallback) moved there from QR Reader.
6. **Protocol** on one ordered, reliable channel: `manifest` → `resume {offsets}` → per file `start`, 64 KB binary chunks, `end` → `done` → `received`. Sender backpressure at 4 MB buffered. Messages are zod-validated and file names sanitised; the peer is untrusted.
7. **Files land in `/home/Downloads`**, through `/tmp/p2p-transfer/{size}-{name}.part`, then `move_file` to a free name.
8. **The UI shows the real connection** (`read_link()` over `getStats()`): route, RTT, rate, endpoints, DTLS cipher, bytes on the wire, where files are written, and a timestamped event log. STUN is drawn as address lookup only.
9. **Waiting for a late answer is normal.** The answering side's ICE checks go unanswered until the other device has the answer, and Chrome reports `failed` after ~15 s, then recovers once checks arrive. Before the channel opens only `closed` ends the attempt; the user cancels otherwise. A second scan of the same answer is ignored.
10. **Scanning** asks for 1080p with continuous autofocus, and offers "Take photo" (the native camera app) as a fallback for screens the live preview can't focus on. Codes can be shared with the Web Share API.
11. **Resume** on reconnect: the receiver offers each part file's size as the offset and `null` for files already saved this session. `/tmp` is emptied at boot, so resume survives a dropped connection but not a reload.

## Alternatives Considered

- **Public relay for room codes** (PeerJS cloud, Nostr relays, public MQTT, WebTorrent trackers): nicer UX, but it depends on a third-party server and probably a dependency.
- **Own signaling server**: breaks the no-backend rule.
- **Hand-written QR encoder**: no dependency, ~250 lines to own. The owner chose `uqr`.
- **Partial files in `/home/Downloads/*.part`**: resume across reloads, but visible clutter.
- **Raw or deflated SDP in the QR**: works, but a ~1 kB code is a dense QR that a phone reads poorly off a screen.
- **WebTorrent swarming**: heavy, and pointless for one sender and a few receivers.

> **Revision 2026-10-13: first real-device test (desktop ↔ phone)**
> - Codes timed out while being copied by hand: the receiver treated ICE `failed` as final and closed. Now only `closed` is final before the channel opens (decision 9).
> - The live camera struggled with the version 8 QR: codes moved from a text format (`WEBOS-P2P1|…`, ~165 chars) to Base45 binary (decision 3), plus the photo fallback (decision 10).
> - Re-scanning an answer after it was applied failed with "Failed to set remote description"; it's now a no-op, and the UI confirms the answer.

> **Revision 2026-10-13: second device test (phone on Wi-Fi ↔ desktop on cable, same network)**
> - **No relay, confirmed by the owner.** Mobile data ↔ home network fails behind a carrier's symmetric NAT; that stays a known limit. Once the sender has the answer, both sides have tried every path, so ICE `failed` is final there: the sender stops with "No direct path… same Wi-Fi or a hotspot".
> - **Progress is confirmed, not queued.** The sender counted bytes handed to the channel, so a 200 KB photo showed 100 % before a byte left the phone; the owner then put the phone away and the page froze. The receiver now sends `ack {index, bytes}` (every 256 KB or 250 ms) and the sender shows those. Protocol version 2: the manifest carries `protocol`, and a receiver refuses a version 1 sender with a reason.
> - **Screen Wake Lock** while connecting or transferring, re-taken when the page becomes visible again. **Stall** shown after 10 s without confirmed progress while the link is up.
> - **A "what's happening now" banner** gives one plain sentence and the next action for every state, above the technical readout.

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
