# ADR-052: P2P Pairing in the App Kit
**Date:** 2026-10-19
**Status:** Implemented

## Context

P2P Transfer (ADR-032) pairs two devices over WebRTC with no server: each side shows its SDP as a compact Base45 QR code (`signal.ts`) and the other scans it, then a data channel opens (`peer.ts`). Shopping List needs the same pairing to sync one list live between two phones ([brainstorm](../brainstorm/2026-10-19_shopping-list.md)). Two apps importing each other's files is what the app kit exists to avoid (ADR-048).

## Decision

- **`$kit/utils/p2p`.** `peer.ts` and `signal.ts` (with `signal.test.ts`) move from `apps/user/p2p-transfer/` to `src/lib/kit/utils/p2p/`, behind an `index.ts` barrel. P2P Transfer imports them from there; its `transfer.ts`, `protocol.ts`, `session.svelte.ts` and their tests stay in the app.
- **Neutral wording.** The kit has no idea which app is pairing, so its errors stop naming P2P Transfer and its roles: "This isn't a pairing code", "That's an answer code. Scan the code on the device that started", "That's an offer code. Scan the answer on the device that joined".
- **Channel label.** `create_offer(pc, label = "files")` takes the data channel's label, so an app can tell its own channel from another app's. P2P Transfer keeps `files`; Shopping List uses `shopping-list`.
- **Internal, like the rest of the kit's helpers.** Not pinned in `app-api.test.ts`; promoting it is a minor.
- **Shell:** nothing.

## Alternatives Considered

- **Shopping List imports from P2P Transfer's folder.** No move, but deleting P2P Transfer would break another app, and the fork test (ADR-048) stops holding per app.
- **A copy in Shopping List.** Two copies of a hand-shaped SDP codec drift; a fix to one (a browser that rejects the rebuilt SDP) wouldn't reach the other.
- **Core (`$lib/core/utils`).** Nothing in the OS itself pairs devices, so it's kit, not core.

## Consequences

- P2P Transfer's behaviour is unchanged apart from the three error sentences above.
- Codes are interchangeable between the apps: a P2P Transfer offer scanned in Shopping List connects, and the app closes it because the channel label doesn't match.
- The UI for showing and scanning codes (viewfinder, QR display, paste field) stays per app for now; a second identical copy would be the signal to move it into the kit too.
