# P2P transfer

**Date:** 2026-10-13
**Participants:** owner, Claude

## Context

The owner brought an AI-written plan for a P2P file-sharing product (WebRTC, WebTorrent swarming, Node signaling server, Bluetooth/NFC discovery, freemium) and asked whether something like it fits WebOS. The roadmap already had "P2P File Transfer — WebRTC, room codes, QR share" under Utilities.

Most of the plan assumes a backend and a product. WebOS has neither: GitHub Pages, no server (CLAUDE.md). The one thing WebRTC can't do without a server is signaling, the exchange of offer and answer before the direct connection exists.

What doesn't carry over from the plan: Bluetooth (Web Bluetooth can't move files between phones), Web NFC (Android-only, tags), Wi-Fi Direct (no web API), background transfers (the tab is suspended), WebTorrent swarming (heavy, pointless for a few nearby devices), and the product sections.

## Topics

| Question | Decision | Rejected |
|----------|----------|----------|
| Signaling | **Manual, by QR.** Sender shows an offer code, receiver scans it and shows an answer code, sender scans that. Pasting the text works too | A public relay (PeerJS cloud, Nostr, MQTT, WebTorrent trackers) for room codes: someone else's server, likely a dependency; own signaling server: breaks no-backend |
| Shape | **User app only** (`user/p2p-transfer`) | A service with "Send to device…" in File Explorer: no second caller yet |
| Relation to ADR-010 | **Separate.** ADR-010 is URL state; this is device-to-device bytes. They share only QR encoding, which now lives in `$lib/core/utils/qr.ts` for the share dialog to reuse. Decided by Claude, owner delegated ("you decide") | Folding transfer into the share system |
| Failure | **Show it as interrupted and resume** on reconnect | Fail and start over |
| QR encoder | **`uqr`** (unjs, zero-dependency, encode only), approved by the owner | Hand-written encoder (~250 lines, no dependency) |
| Partial files | **`/tmp/p2p-transfer/{size}-{name}.part`**: hidden, cleaned at boot. Resume works while the tab lives (dropped connection, locked phone), not after a reload | `/home/Downloads/name.part` like `.crdownload`: survives reloads, visible clutter |
| STUN | **`stun.l.google.com:19302`**: works across most networks. It sees both public IPs, no file data | Local network only |

### How the code stays small

A raw SDP is around 1 kB: a dense QR a phone struggles to read from a screen. Only five things in a data-channel SDP matter for connecting: ICE ufrag and password, the SHA-256 DTLS fingerprint, the DTLS role and the UDP candidates. `signal.ts` keeps those (about 170 characters, a version 8–10 QR) and rebuilds the fixed rest of the SDP on the other side. Checked against real Chromium peers in `transfer.browser.test.ts`.

### Protocol

One ordered, reliable data channel. JSON control messages, file bytes as 64 KB binary messages:

```
sender → manifest {files}
receiver → resume {offsets}      // bytes held per file, null = already saved
sender → start {index, offset} … chunks … end {index}   (per file)
sender → done
receiver → received              // sender closes only now; closing earlier drops buffered data
```

No checksums: SCTP over DTLS is reliable and authenticated, so a delivered byte is the sent byte. The resume offset comes from the `.part` file's size; the part name includes the size so a different file with the same name never resumes onto the wrong bytes.

### UI: show what's going on

The owner wanted a polished, technical look, and above all to see where the files go and that no server is involved. Everything shown comes from the real connection, not from copy:

- **Status strip**: link state, route (LAN, or WAN via STUN), RTT, rate. Route and RTT come from `getStats()` on the selected ICE candidate pair.
- **Handshake steps**: offer → answer → channel (scan → answer → channel on the receiver).
- **Data path**: this device ⇄ other device with each side's candidate type and port, the DTLS version and cipher, bytes on the wire (transport stats). STUN is drawn off to the side as "address lookup only". The receiver shows where files are written (`/tmp/p2p-transfer/*.part → /home/Downloads`), the sender shows "read in memory, nothing is uploaded".
- **Progress**: big mono percentage, rate, ETA, a 20 s throughput graph, block progress bars per file, the saved path per file.
- **Event log**: timestamped lines for candidate gathering, answer, DTLS up, manifest, resume, route, cipher, each saved file, errors.

Chrome blanks LAN addresses in `getStats()` (and uses `.local` mDNS names in SDP), so a same-network endpoint shows as `private:{port}`. A public (srflx) address shows in full.

### First real-device test (desktop ↔ phone)

The owner tried it between a desktop and a phone:

| Symptom | Root cause | Fix |
|---------|-----------|-----|
| Times out before the answer is pasted | The answering side checks the offer's candidates at once; nobody replies until the sender has the answer. Chrome reports ICE `failed` at ~15 s and recovers when checks arrive (measured: failed at 15 s, connected at 45 s), but `channel_open` rejected on `failed` | Only `closed` ends the wait before the channel opens. Browser test holds the answer until the receiver reports `failed`, then connects |
| Phone camera slow to focus | Version 8 QR (49 modules) shown at 256px | Base45 binary codes: version 4–5. 1080p + continuous autofocus. "Take photo" with the native camera. QR shown at up to 288px |
| First camera tap closes, second opens but doesn't scan, "failed to set remote description" | The first tap scanned the answer, and the camera closing was the success path, but nothing confirmed it. Re-scanning applied the answer twice (signaling state already `stable`) | "Answer accepted" state replaces the scanner; a repeated answer is a no-op. `getUserMedia` now runs before the detector import so the tap's user activation isn't spent |
| Copy and paste on a phone is clumsy | — | Share button (Web Share API) next to Copy |

### Second device test

| Symptom | Root cause | Fix |
|---------|-----------|-----|
| Phone on mobile data ↔ desktop at home: "Answer accepted", then nothing | Carrier symmetric NAT: the port STUN reports isn't the one used toward the desktop; no direct path exists. Needs a TURN relay | Owner: **no relay**. Sender stops after ICE fails post-answer and says to use the same Wi-Fi or a hotspot |
| Same network: phone says 100 %, desktop shows 0 B, data arrives a minute later | The sender's progress counted bytes queued in its 4 MB buffer, so a small file read 100 % instantly. The owner put the phone away, the page froze, the link went quiet (`Link quiet` in the log, both sides on `HOST` LAN addresses) | Receiver `ack`s, sender shows confirmed bytes; "waiting for the receiver to confirm" state; wake lock; stall warning |
| Rate `3e-20 B/s`, ETA `1e27` | Smoothed rate decaying toward zero, printed raw | Below 1 B/s shows 0 and `--:--` |
| "I was kinda lost" | Technical readout without a plain summary | Status banner on top: what's happening and what to do |

## Key takeaways

- Signaling is the only server-shaped part of WebRTC, and two QR scans replace it.
- SDP compaction is what makes manual signaling usable.
- Resume is cheap because the receiver's disk is the state: the part file's length is the offset.

## Action items

- [x] ADR-032
- [x] App, tests (unit: codec, protocol; browser: two real peers, transfer and resume)
- [-] Try it phone ↔ laptop on the same Wi-Fi and on mobile data (the owner): first round found the timeout and scanning issues above, retest pending

## Next session topics

- Whether File Explorer gets "Send to device…" (would make this a service)
- Resume across reloads if `/tmp` turns out too short-lived in practice
