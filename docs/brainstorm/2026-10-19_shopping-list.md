# Shopping List

**Date:** 2026-10-19
**Participants:** owner, Claude

## Context

The owner wants a shopping list app tuned for use in the store: tick items and untick them again, read a list from an image, and live sync between two devices "over Bluetooth if possible".

Findings:
- Web Bluetooth only has the central role. A browser can't advertise, so two browsers can't pair over Bluetooth.
- P2P Transfer already pairs two devices over WebRTC with no server, using QR codes for signalling (`p2p-transfer/peer.ts`, `signal.ts`).
- There's no native OCR: `TextDetector` is behind a flag. `AiService.prompt` takes text only, and `MobileAiService` answers "no".

## Decisions

- **Mobile first:** designed for the phone first (one hand, thumb reach, big targets); desktop window must still work.
- **Name and storage:** Shopping List, id `shopping-list`. Everything lives in `/var/lib/shopping-list/lists.json`: lists, items and history. Items carry `updated_at`. Deleted items stay as tombstones (`deleted_at`) for 30 days so a sync can merge them.
- **Sync:** WebRTC paired by scanning QR codes. P2P Transfer's peer and signal code moves into `$kit/utils/p2p` and is shared by both apps.
  - A pairing shares one chosen list. Both sides edit it live, and each item resolves to its newest `updated_at`.
  - The list shows its status (live or offline). "Pair again" merges whatever changed while apart.
- **Image import, with both methods:**
  - Gemini Nano where available, otherwise tesseract.js (an app dependency; WASM and Slovenian plus English data cached offline after first use).
  - The user reviews the read lines before they're added.
- **AiService API:**
  - `AiMessage.content` becomes `string | AiPart[]`, where an `AiPart` is `{ type: "text", value }` or `{ type: "image", value: Blob }`. This mirrors Chrome's Prompt API.
  - A session is created with image input only when needed.
  - The new availability `AiFeature.PROMPT_IMAGE` tells the app whether to offer it. Existing callers don't change.
- **Ticked items:** they stay in place, greyed and struck through. Tapping again unticks them.
- **Extras:**
  - Smart entry: suggestions from history, quantities parsed as you type ("2x mleko", "500 g moka"), and "buy again".
  - Multiple lists, each with a colour, with moving items between lists.
  - In-store mode: big rows, tap to tick, screen kept awake, and "Clear done" saves the trip to history.
- **Not wanted:** store aisle grouping.
- **Shell:** nothing.

## Action items

- An ADR for the AiService image input, and one for moving P2P signalling into the kit if it counts as a pattern change.
- Implement the app, the kit move, the AiService change, docs and the changelog.

## Next session topics

- Store aisle grouping, if it's missed.
- Shell commands (`shop add`).
- Sync of all lists, if one list proves too little.

## Implementation notes

Built 2026-10-19 as decided, with these calls made on the way (flagged for the owner):

- **Storage path.** The file is `/var/lib/apps/shopping-list/lists.json`, through `storage.file()` like Kanban and Work Hours, not `/var/lib/shopping-list/`. That's where app data lives (ADR-035), and uninstalling with data removes it. Shape: `{ version: 1, lists: [{ id, name, color, items }], history: { [lower-case text]: { count, last } } }`.
- **What syncs.** Items only, newest `updated_at` per item, equal stamps broken the same way on both sides. The joining phone takes the list's name and colour once, when it creates the list; renames and colour changes stay per phone. Item order is by id (time of adding), so both phones show the same order.
- **History.** "Clear done" counts each cleared item once and stamps the trip; "buy again" is every entry with the latest stamp. Adding an item doesn't count.
- **Kit wording.** The moved pairing code no longer names P2P Transfer in its errors (ADR-052).
- **tesseract.js 7 bug.** It can't take language data as bytes (`{ code, data }`: its worker joins `data` into the language name). The app wraps tesseract's worker in a tiny blob worker that maps `{langPath}/{code}.traineddata.gz` onto the Vite-hashed bundled files. Core, worker and data all come from this site; the service worker caches them in `webos-wasm` after first use.
- **Session.** The live link belongs to the window that paired; closing it ends the pairing (the other phone shows Offline).

## Photo reading on handwriting (later the same day)

The owner tried a photo of a handwritten list (block capitals, two columns, clipboard, magnets). The text reader returned junk. Run locally on the same photo: sideways it's junk, upright it gets about half (KARTUSE, KANALETA, SYOSS, MESO, VEGETA…) plus near misses ("TOKA" for moka, "HASLO" for maslo, "ZELEAAVA" for zelenjava).

Decisions:
- **Fix the local reader first:**
  - Straighten the photo by its orientation, and try all four rotations when the read is poor, keeping the most confident.
  - Drop low-confidence words.
  - Snap words within edit distance 1–2 to your history first, then to a built-in list of about 500 Slovenian and English grocery words.
- **Optional crop** before reading, with "Read all" to skip it.
- **In parallel, test only:** try another OCR model (PaddleOCR via ONNX and similar) on the same photo, and report what it reads, its size and its speed. The owner decides afterwards whether it goes in.
