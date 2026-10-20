# ADR-053: Data by QR, Reviewed Before It Lands
**Date:** 2026-10-20
**Status:** Implemented

## Context

Shopping List shares a list live over WebRTC (ADR-052): two scans per connection, again after every disconnect, no TURN so mobile data often fails, and incoming changes apply at once. Cards puts its data in one QR (compressed, base64url) and falls back to a zip past 2000 characters. The owner, 2026-10-20: "sharing lists is not ok. i thought of this more like a direct scan code -> get updates that you need to confirm. even if we have to do multiple qr code scans its still fine", and the same for Cards. [Brainstorm](../brainstorm/2026-10-19_shopping-list.md#follow-up-2026-10-20-sharing-by-qr).

## Decision

- **One-way, no connection.** The sender shows its data as QR codes; the receiver scans them, sees what would change, and applies what it keeps. Sharing back is the same flow the other way.
- **Multi-part, cycling.** `$kit/utils/qr-transfer` encodes a payload (JSON → `deflate-raw` → Base45) into frames `WQ1:{APP}:{MSG}:{i}/{n}:{data}`, all QR alphanumeric mode. The sender cycles them (`QrFrames`, about 2.5 a second, ‹ › to step by hand); the receiver's camera collects them in any order (`QrCollect`, "3 of 5") and hands back the payload once complete. A missed frame comes round again. Frames of another app or another message are told apart by `{APP}` and `{MSG}`.
- **Snapshots, not deltas.** Shopping List sends the picked lists whole (meta and every item, tombstones too); Cards sends its cards. Nothing remembers which device has seen what.
- **Review screen.** The receiver diffs the snapshot against its own data: for Shopping List with the existing per-item newest-wins rule (new, changed, ticked/unticked, deleted, list name/colour/icon), for Cards by format + code (new, changed name/colour/notes; never a delete). Every change starts ticked; untick to skip, then Apply. A list the receiver doesn't have arrives as a new list.
- **Live sharing goes.** Shopping List drops Share live, the pair panel and the Live/Offline badge. `$kit/utils/p2p` stays for P2P Transfer.
- **Shell:** nothing.

## Alternatives Considered

- **Paged codes, tap Next per code.** No animation, but both people coordinate every code; slower.
- **One dense QR.** Simplest, but past roughly version 10 phone cameras struggle (the first P2P code format already did at version 8), and Cards already hits its limit.
- **Deltas since the last share.** Smaller codes, but per-device memory of what each peer has, and a missed share loses changes.
- **Keep live sync next to it.** Two ways to share, and the live one still fails on mobile data.
- **All or nothing confirm.** Quicker, but a stale delete from the other phone could only be refused by refusing everything.

## Consequences

- Shopping List loses real-time sync; both phones see each other's changes only after a share. A delete and an edit to the same item still resolve newest-wins, but the user sees it and can skip it.
- Without a live link, a list's name, colour and icon now travel too (they never did live).
- Cards needs no zip for a big collection; the single-card camera link (`#/app/cards?import=`) stays, since a phone camera app opens it.
- Frames are Base45 in alphanumeric mode: about 30% denser than base64 in byte mode. A 30-item list is about 1 KB compressed: one or two frames.
- Codes from one message are useless without the rest; a scan that never completes holds nothing.
