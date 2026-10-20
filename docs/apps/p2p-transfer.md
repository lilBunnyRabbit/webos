# P2P Transfer

Id `p2p-transfer` · Source: `src/lib/apps/user/p2p-transfer/`, pairing in `src/lib/kit/utils/p2p/` · [ADR-032](../adrs/032-p2p-transfer.md), [ADR-052](../adrs/052-p2p-pairing-in-kit.md) · [brainstorm](../brainstorm/2026-10-13_p2p-transfer.md)

## What it does

Sends files straight from one device to another over WebRTC, with no server of ours anywhere. The two devices pair by scanning each other's QR code; the files land in the receiver's `/home/Downloads`. The screen shows the real connection: route, round trip, endpoints, cipher, bytes on the wire and a timestamped log, so you can see that nothing passes through a server.

## How it works

### QR signalling

WebRTC needs an offer and an answer exchanged before the direct link exists; normally a signalling server carries them. Here the user does: the sender shows an offer code, the receiver scans it and shows an answer code, the sender scans that. Codes can also be copied, pasted and shared with the Web Share API.

A raw data-channel SDP is about 1 kB, a dense QR a phone reads poorly off a screen. Only five things in it matter for connecting. `read_sdp` (`kit/utils/p2p/signal.ts:55`) keeps those, `encode_signal` (`signal.ts:189`) packs them as bytes, and `write_sdp` (`signal.ts:264`) rebuilds the fixed rest on the other side.

| Kept | Packed as |
|------|-----------|
| Header | 1 byte: format version (1) in the high nibble, `0x08` for an answer, DTLS role index (`actpass`, `active`, `passive`) |
| ICE ufrag, password | `0x80 \| length` + the base64-decoded bytes when the value is base64 of a multiple of 4 characters (4 characters → 3 bytes); else length + ASCII (`signal.ts:147`) |
| DTLS fingerprint | 32 raw bytes; SHA-256 only, anything else is refused |
| Candidates | Count, then per UDP component-1 candidate: `type << 4 \| address kind`, the address, the port as 2 bytes |
| Address | IPv4: 4 bytes. mDNS `{uuid}.local`: the UUID's 16 bytes. Anything else (IPv6, a host name): length + text |

Duplicate address and port pairs and TCP candidates are dropped. The bytes are written in **Base45** (RFC 9285, `signal.ts:91`), whose 45 characters are exactly a QR code's alphanumeric mode: 5.5 bits a character instead of 8 in byte mode.

| Code | Length | QR version |
|------|--------|------------|
| Raw SDP | about 1 kB | dense, poor on a phone |
| First text format `WEBOS-P2P1\|…` | about 165 characters | 8 (49 modules); the phone camera struggled in the first device test |
| Base45 binary | about 125 characters for a Chrome offer | 4–5 (test: `signal.test.ts`, version ≤ 5 at ECC L) |

The rebuilt SDP gives each candidate an RFC 8445 priority with host above prflx above srflx (`signal.ts:22`, `signal.ts:257`), so a same-network path is tried first. ICE gathering finishes (or times out after 4 s) before the code is shown; there's no trickle, the code is shown once with every candidate in it (`kit/utils/p2p/peer.ts:6`).

Why manual signalling: the rejected options were a public relay for room codes (PeerJS cloud, Nostr, MQTT, WebTorrent trackers: someone else's server and likely a dependency) and an own signalling server (breaks no-backend).

### Connecting

| Setting | Value | Why |
|---------|-------|-----|
| STUN | `stun:stun.l.google.com:19302` (`peer.ts:4`) | Finds each side's public address; sees both IPs, no file data |
| TURN | none | Owner's call: no relay. Symmetric or carrier NAT on both sides fails |
| Waiting for the answer | Only `closed` ends the attempt before the channel opens (`peer.ts:63`) | The answering side checks candidates at once and gets no reply until the other device has the answer. Chrome reports ICE `failed` at about 15 s and recovers once checks arrive (measured: failed at 15 s, connected at 45 s) |
| After the answer | ICE `failed` is final: "No direct path…, same Wi-Fi or a hotspot" | Both sides have tried every path by then |
| Second scan of the same answer | Ignored (`peer.ts:48`) | The first scan closing the camera looked like a failure, so users scanned again |

`read_link` (`peer.ts:172`) reads `getStats()` for the selected candidate pair: route (LAN when both ends are `host`, or the remote is `prflx`, which is the other device's mDNS host address learned in-band), RTT, endpoints, DTLS cipher and version, transport bytes.

### Transfer protocol

One ordered, reliable data channel labelled `files`. A channel with another label (a Shopping List code) is turned away with "That code is from another app" (`session.svelte.ts:335`). Control messages are JSON strings validated with zod (`protocol.ts:25`); file bytes are binary messages between `start` and `end`.

```
sender   → manifest { protocol: 2, files: [{ name, size, type }] }
receiver → resume { offsets }                 bytes held per file, null = already saved
sender   → start { index, offset } … 64 KB chunks … end { index }      per file
receiver → ack { index, bytes }               every 256 KB or 250 ms, and at each end
sender   → done
receiver → received                           only now may the sender close
```

| Constant | Value | Where | Why |
|----------|-------|-------|-----|
| Chunk | 64 KB | `transfer.ts:7` | Under every browser's SCTP message limit, low per-message overhead |
| Backpressure | Wait above 4 MB buffered, resume at 1 MB (`bufferedamountlow`) | `transfer.ts:9` | `send()` never blocks |
| Ack | 256 KB or 250 ms | `transfer.ts:12` | The sender's progress is confirmed bytes, not queued ones. A 200 KB photo showed 100% before a byte left the phone |
| Stall | 10 s without confirmed progress while linked | `session.svelte.ts:48` | Usually the other screen went off |
| Protocol | 2 | `protocol.ts:22` | Version 2 added `ack`; a receiver refuses a version 1 sender with a reason |

`Inbox` (`peer.ts:90`) hands messages over one at a time, so each chunk is written before the next is read; messages that arrived before a close are still delivered.

No checksums: SCTP over DTLS is reliable and authenticated, so a delivered byte is the sent byte. The receiver does check that a file never exceeds its announced size and arrives complete, and that `start` and `end` come in step (`transfer.ts:140`).

The peer is untrusted: file names are cleaned of path separators, control characters and `.`/`..` (`protocol.ts:4`).

### Resume

The receiver's disk is the state. Each file is written to `/tmp/p2p-transfer/{size}-{name}.part` (`protocol.ts:46`); the size in the name keeps a different file with the same name from resuming onto the wrong bytes. On reconnect the receiver answers the manifest with each part's length as the offset, `null` for files saved earlier in this session, or 0 when the part is bigger than the file (`protocol.ts:51`). The sender starts each file at its offset. A finished part is moved into `/home/Downloads` under a free name.

`/tmp` is emptied at boot, so resume survives a dropped connection or a locked phone, not a reload.

### Staying awake

Screen Wake Lock while connecting or transferring, taken again when the page becomes visible (`p2p-transfer.app.svelte:67`). A suspended tab drops the connection; resume picks it up.

## Data

| What | Where | Lifetime |
|------|-------|----------|
| Half-received file | `/tmp/p2p-transfer/{size}-{name}.part` | Until complete, or the `/tmp` sweep at boot |
| Received file | `/home/Downloads/{name}`, renamed on a clash | Kept |
| Sent files | Read in memory from OPFS or the device | Nothing stored |

No props, no settings, no shell commands. The pairing code lives in `$kit/utils/p2p` (ADR-052); Shopping List used it until 3.6.0 and now shares by QR instead (ADR-053), so P2P Transfer is its only user. A Shopping List offer from an older version still connects and is turned away by its channel label.

## Dependencies & licences

| Dependency | Licence | Scope |
|------------|---------|-------|
| `uqr` 0.1.3 (draws the code, kit `qr_path`) | MIT | Root, owner-approved in ADR-032 |
| `jsqr` 1.4.0 (scanner fallback without `BarcodeDetector`) | Apache-2.0 | Root |
| `zod` | MIT | Root |
| Google's public STUN server | Service, no data beyond the two public addresses | Runtime |

## Limits

- No TURN: phone on mobile data ↔ home network fails behind a carrier's symmetric NAT (second device test). Same Wi-Fi or a hotspot works.
- Two scans per connection, and again for every reconnect. One receiver per connection.
- No receive-side flow control: the receiver writes as fast as messages arrive.
- The rebuilt SDP is hand-shaped and tested against Chromium peers only (`transfer.browser.test.ts`); Safari and Firefox are untested. A browser that rejects it needs its fields added back.
- Resume doesn't survive a reload.
- Throughput is unmeasured; the UI shows it live but no figures are recorded.

## Decisions

- [P2P transfer brainstorm](../brainstorm/2026-10-13_p2p-transfer.md): signalling, shape, resume, `uqr`, both device tests.
- [ADR-032](../adrs/032-p2p-transfer.md): the decision and its two device-test revisions.
- [ADR-052](../adrs/052-p2p-pairing-in-kit.md): `peer.ts` and `signal.ts` moved to `$kit/utils/p2p`, neutral errors, channel labels.
- [ADR-048](../adrs/048-app-kit-layer.md): the app kit.
