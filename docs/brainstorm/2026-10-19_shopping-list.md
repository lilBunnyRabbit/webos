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

### Results

Measured on the owner's photo (34 items incl. one struck out) in Chromium on the owner's Mac, with an empty history. A line counts when it equals an item, case and punctuation aside.

| Reader | Items right | Near misses | Junk lines |
|--------|-------------|-------------|------------|
| tesseract as shipped in 3.3.0 (photo read sideways) | 0 | 0 | 19 |
| tesseract + orientation, confidence filter, snap | 15 | 4 | 6 |
| PP-OCRv5 + the same | 28 | 3 | 1 |

- **Orientation.** The photo carries an EXIF orientation tag; tesseract.js read the raw sideways pixels. The app now decodes with `createImageBitmap(…, { imageOrientation: "from-image" })`. A read with under 40% of its letters in sure words is tried at 90°, 270° and 180°, keeping the surest; a copy without the tag reads the same 28 after one extra turn.
- **No grayscale or contrast.** Both read fewer items with tesseract (5–11 against 15), and tesseract's adaptive thresholds were worse still.
- **Tesseract was a lottery.** 1600, 2000, 2400 and 4000 px read 10, 15, 12 and 11; cropping to the paper read 5–12. PP-OCRv5 reads 28 on the whole photo and on a crop alike.
- **Decision (owner, after a parallel test): PP-OCRv5 replaces tesseract.js.** Mobile detector at 1280 px and the Latin recogniser, on `onnxruntime-web` 1.30.0's wasm-only build, single-threaded (the site isn't cross-origin isolated), in a module worker inside the task. First use downloads ONNX Runtime's wasm (14.2 MB, 3.7 MB gzipped) and the models (4.8 MB and 8.0 MB), about 17 MB; then it works offline. A photo takes about 2 s on the Mac, 2.7 s when it has to turn once. Models: Apache-2.0, see `models/README.md` in the app.
- **Columns.** Boxes are grouped into rows by their middles; a gap wider than a box is tall splits a row into items, which split all four two-column rows that 1.5× and 3× merged.
- **Snap.** History words first, then about 520 built-in Slovenian and English words (2.2 KB gz, in the reader's worker chunk only). Damerau-Levenshtein on folded text (case, diacritics), ≤1 edit for 4–5 letters, ≤2 longer, exact only for shorter. A tie between two different words keeps the word as read ("zoda": voda or soda); a tie between forms of one word ("jogurt", "jogurti") doesn't. Digits a reader gives for letters are tried as letters (2→z, 0→o, 1→i/l, 5→s, 8→b). PP-OCRv5 never wrote č, š or ž on this photo; the snap puts them back (riž, kartuše, šamponi, palčke, prašek).
- **Left over.** "salutejp" snaps to "selotejp" (the real word); "vrečke zasm." and "zelenjava" sit too close to split; "soda b." loses its "b."; the struck-out "dezva" is read like any item.
- **The "Shopping list read" toast stays.** `TaskRunOptions.done` can only change the done toast, not drop it: removing it would change the TasksService API. Open question below.

Action items:
- Owner: decide whether TasksService gets a way to end a job without a done toast (`done: () => null`, or `toast: false`), since Shopping List's review screen already says it.

## Follow-up decisions (2026-10-19)

- **Model files stay in git** (about 12.9 MB under `models/`), so the site stays self-contained, with no runtime CDN.
- **The finished toast is removed.** `TaskRunOptions.done` may return `null` to dismiss the toast; Shopping List uses that, since the review screen shows the result.

## Per-app docs (2026-10-19)

The OCR work left facts (thresholds, model sizes, the measurements) only in this log and code comments. The system reference excludes user apps, so there was no place for them.

Decisions (owner):
- **Location:** `docs/apps/{id}.md`, with an index and the page-shape guide in `docs/apps/README.md`. Linked from CLAUDE.md's "Read first" and from `docs/system/README.md`.
- **Scope:** only apps with non-obvious internals: an algorithm, a model, a protocol or a format worth explaining. First four: Shopping List, Cards, P2P Transfer, Format Lab.
- **Shape:** What it does · How it works (pipeline and algorithms, why each over the alternatives, measured numbers) · Data (paths, formats, props) · Dependencies & licences · Limits · Decisions. Code cited as `file:line`.
- **Kept current by rule:** CLAUDE.md lists the documented ids; a change to a listed app updates its page in the same commit, and an app that gains a model, algorithm, protocol, format or non-trivial dependency gets a page. Implementing sub-agents get the rule in their prompt.

## Follow-up 2026-10-20: readability, amounts, swipe, list views

Owner, from the phone: the list read like a plain toggle list, items hard to read, checked hard to see, amount barely visible, "omega 3" became 3× omega, misclicks tick items, the list selector is a pain, wants all lists at once and list name/colour/icon editing.

Decisions:
- **Layout:** open items in a card, ticked ones in a collapsible "In the cart" section, progress bar under the toolbar. Row menu by long press on touch; ⋯ only with a mouse. (Shipped in 3.5.0.)
- **Parser:** a bare trailing number stays in the name ("omega 3", "WD 40"); trailing amounts need `x` or a unit.
- **Amounts:** an item editor view (name, −/+ stepper with a number field, unit chips), from Edit… or a tap on the amount pill.
- **Swipe:** → ticks (unticks in the cart), ← deletes with Undo, tap opens the editor, long press the menu. A mouse can still click the circle.
- **Lists:** both an overview home screen (a card per list: icon, colour, name, N left, first items) and a chip row inside a list ([All] [lists…] [+]) to hop.
- **All lists:** one scroll, a header per list with its open items, tickable; the cart gathers below. Adding in All asks which list (remembered per window).
- **List icon:** optional `icon` on the list, a fixed set; file stays version 1. A List settings view edits name, colour and icon. Not synced to a paired phone, like name and colour today.
