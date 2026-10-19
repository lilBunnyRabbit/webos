# Shopping List

Id `shopping-list` · Source: `src/lib/apps/user/shopping-list/` · [ADR-051](../adrs/051-ai-image-input.md), [ADR-052](../adrs/052-p2p-pairing-in-kit.md) · [brainstorm](../brainstorm/2026-10-19_shopping-list.md)

## What it does

A shopping list for use in the store, phone first. Several coloured lists, tick and untick in place, amounts typed as you go ("2x mleko", "500 g moka"), suggestions from what you bought before, and "buy again" for the last trip. It reads a handwritten or printed list from a photo, and two phones can share one list live with no server.

## How it works

### Reading a photo

Two readers. Gemini Nano goes first where Chrome has it; PP-OCRv5 runs everywhere else, and also when Nano throws.

| Step | What | Where |
|------|------|-------|
| 1. Pick | `read_method()`: Nano unless `AiFeature.PROMPT_IMAGE` is `no` (always `no` on mobile, ADR-051) | `read-image.ts:18` |
| 2. Straighten | `createImageBitmap(…, { imageOrientation: "from-image" })`, so the EXIF orientation tag is applied before anything sees the pixels | `photo.ts:7` |
| 3. Crop (optional) | The crop sheet (`photo-crop.svelte`, kit `CropFrame`); "Read all" skips it. At most 2000 px on the long side | `photo.ts:4`, `photo.ts:12` |
| 4a. Nano | The straightened crop as a PNG part plus a fixed system prompt ("items only, one per line, with any amount"), streamed | `read-image.ts:35` |
| 4b. PP-OCRv5 | A module worker inside a task job: detect, recognise, group, snap (below) | `read-image.ts:55`, `ocr.worker.ts:79` |
| 5. Clean | Bullets, checkboxes, numbering and trailing punctuation stripped; lines without a letter and repeats dropped | `lines.ts:43` |
| 6. Review | Every line shown with a keep toggle before anything is added. The OCR job ends without a done toast (`done: () => null`); the review screen is the result | `read-image.ts:69` |

#### Why PP-OCRv5

Measured on the owner's photo of a handwritten list: 34 items in block capitals, two columns, one struck out. Chromium on the owner's Mac, empty history. A line counts when it equals an item, case and punctuation aside.

| Reader | Right | Near | Junk |
|--------|-------|------|------|
| tesseract.js as shipped in 3.3.0 (read the photo sideways) | 0 | 0 | 19 |
| tesseract.js + orientation, confidence filter, snap | 15 | 4 | 6 |
| PP-OCRv5 + the same | 28 | 3 | 1 |

The parallel model test on the same photo, exact items:

| Model | Exact | Size | Verdict |
|-------|-------|------|---------|
| tesseract.js | 4 | | A lottery: 1600, 2000, 2400 and 4000 px read 10, 15, 12 and 11 items, a crop to the paper 5–12; grayscale or contrast read 5–11 against 15 |
| PP-OCRv5 (mobile det + Latin rec) | 25 | 12.9 MB models | Shipped. Reads 28 on the whole photo and on a crop alike |
| Florence-2 | 17 | about 275 MB | Too big for a phone, and worse |
| TrOCR (handwritten) | 0 | | Hallucinates English sentences on block capitals |

Speed: about 2 s a photo on the Mac, 2.7 s when it has to turn once.

#### Detector: DB (differentiable binarization)

`det.onnx` (4.8 MB, PP-OCRv5 mobile). The photo is scaled so its long side is 1280 px, each side rounded to a multiple of 32, fed as planar BGR with ImageNet mean and std (`ocr.worker.ts:45`, `ocr.worker.ts:56`). The model returns one text probability per pixel. `text_boxes` (`paddle.ts:8`) turns that into boxes:

| Parameter | Value | Does |
|-----------|-------|------|
| `threshold` | 0.3 | A pixel above it is text |
| connected regions | 4-neighbour flood fill, explicit stack | One region per piece of text |
| `box_threshold` | 0.6 | Mean probability a region needs to stay; slivers under 3 px go too |
| `unclip` | 1.5 | Grows the box by `area × 1.5 / perimeter` on each side: the model is trained on shrunk text areas |

Boxes are axis-aligned. Paddle's reference uses rotated rectangles; a list written straight doesn't need them, and the four-turn retry covers a sideways photo.

#### Recogniser: CTC over 836 characters

`latin-rec.onnx` (8.0 MB). Each box is cut out at 48 px high, width in proportion (max 3200), normalised to [-1, 1] (`ocr.worker.ts:69`). The model returns per time step a probability over 838 classes: blank, the 836 characters of `models/latin-dict.json`, and space (`ocr.worker.ts:31`). `ctc_decode` (`paddle.ts:53`) is greedy: best class per step, blank (class 0) dropped, repeats collapsed. The box's confidence is the mean of the kept steps' scores, 0–100.

Greedy, like PaddleOCR's own CTC post-processing; no beam search and no language model. The snap below does the correcting.

#### Turning, filtering, grouping

| Rule | Value | Why | Where |
|------|-------|-----|-------|
| Turns tried | 0°, 90°, 270°, 180°, stopping at the first good read; the best by `page_score` wins | Phones store photos a quarter turn off more often than upside down | `ocr.worker.ts:33`, `ocr.worker.ts:85` |
| Poor read | Under 40% of its letters in confident words | On the test list every upright letter was in a confident word; upside down 15%, sideways none | `lines.ts:110` |
| Confidence filter | Words under 60 dropped, unless they have 4+ letters and snap to a known word | Upright words read 76–100, a turned read under 60 for almost all | `lines.ts:60`, `lines.ts:88` |
| Rows | Boxes whose middles are within half a box height share a row, left to right | | `lines.ts:24` |
| Columns | A gap wider than the row's median box height splits the row into items | Split all four two-column rows that 1.5× and 3× merged | `lines.ts:62`, `lines.ts:66` |
| Symbols | A part with fewer than 2 letters or digits, or under half letters, is dropped | Magnets and clipboard edges | `lines.ts:78` |

#### Snap

`snap_line` (`snap.ts:111`) corrects each word against a vocabulary in tiers: the purchase history first, then 518 built-in Slovenian and English grocery words (`words.ts`, 2.2 KB gzipped, only in the reader's worker chunk). A later tier is asked only when an earlier one has nothing close. A whole line that matches a multi-word history entry snaps as a phrase first.

| Rule | Value | Where |
|------|-------|-------|
| Distance | Damerau-Levenshtein, optimal string alignment (a neighbour swap is one edit), on folded text: lower case, no diacritics, `đ` → `d` | `snap.ts:13`, `snap.ts:18` |
| Allowed | 0 edits under 4 letters, 1 for 4–5, 2 for 6+ ("sol" is one edit from "sok") | `snap.ts:31` |
| Tie | Two different words equally close: keep the word as read ("zoda": voda or soda). Two forms of one word ("jogurt", "jogurti"): take the first | `snap.ts:57`, `snap.ts:63` |
| Digit lookalikes | `0`→o, `1`→i/l, `2`→z, `5`→s, `8`→b, at most 8 spellings tried | `snap.ts:83` |

PP-OCRv5's Latin dictionary has č, š and ž, but it never wrote them on the test photo; the snap puts them back (riž, kartuše, šamponi).

#### Runtime

`onnxruntime-web` 1.30.0, the wasm-only build (`onnxruntime-web/wasm`), one thread: the site isn't cross-origin isolated, so there's no `SharedArrayBuffer` and no wasm threads (`ocr.worker.ts:26`). First use downloads ONNX Runtime's wasm (14.2 MB, 3.7 MB gzipped) and both models, about 17 MB; the service worker keeps them in the `webos-wasm` cache (`vite.config.ts`, `CacheFirst` on `.wasm` and `.onnx`), so it works offline after that. A fresh worker per read; it's terminated when the read ends or is cancelled (`ocr.ts:13`).

### Live sync

Two phones pair by scanning each other's QR code (`$kit/utils/p2p`, see [P2P Transfer](p2p-transfer.md#qr-signalling)) and share one list over a WebRTC data channel labelled `shopping-list` (`sync.ts:6`). A code from another app connects, and the channel label gives it away: the pairing fails with "That code is from another app" (`sync.svelte.ts:135`).

| Message | Direction | Holds |
|---------|-----------|-------|
| `hello` | Starting phone, first thing on every connection | `version: 1`, the list's id, name and colour, every item |
| `items` | Both, after each change | Only the items the other side doesn't have in that version |

`sync.ts:13` (zod; anything else is ignored with a warning).

Merge is last-writer-wins per item (`merge.ts:8`, `merge.ts:19`):

- Every change stamps `updated_at = max(now, previous + 1)`, so an item's stamp never goes back even when this phone's clock is behind (`data.ts:75`).
- Equal stamps are broken by comparing the items' serialised form, so both phones pick the same one.
- A deletion is a tombstone (`deleted_at`) and wins or loses like any edit. Tombstones older than 30 days are pruned when the file loads (`merge.ts:29`, `shopping-list.app.svelte:104`); a phone apart longer than that can bring a deleted item back.
- Ids start with the time in base 36 (`data.ts:69`), so sorting by id gives the order of adding on both phones.
- `known` holds what the other side has per item; `push` sends only the difference, and a received item is recorded first so it isn't echoed back (`sync.svelte.ts:90`, `sync.svelte.ts:164`).

What syncs: items only. The joining phone takes the list's name and colour once, when it creates the list. The pairing belongs to the window that paired; closing it ends the link and the other phone shows Offline. "Pair again" sends `hello` again and the merge catches up on whatever changed apart.

Last-writer-wins per item, not a CRDT: the brainstorm settled on "each item resolves to its newest `updated_at`". The price is that two concurrent edits to the same item keep only the later one; edits to different items never conflict.

### Quantities

`parse_entry` (`parse.ts:29`) peels an amount off the front or back of what's typed. Tried in order, first match wins:

| Shape | Example | Result |
|-------|---------|--------|
| `N x item` | `2x mleko`, `2 × mleko` | qty 2 |
| `N unit item` | `500 g moka`, `1,5 l mleko` | qty 500, unit `g` |
| `N item` | `3 jajca` | qty 3 |
| `item N unit` | `moka 500g` | qty 500, unit `g` |
| `item Nx` / `item xN` | `jajca x10` | qty 10 |
| `item N` | `mleko 2` | qty 2 |

Units: kg, dag, g, mg, l, dl, cl, ml, kos, kom, pcs, pc, pkg, pack, pak, with an optional dot. Decimal comma or point. The rest needs a letter and the amount must be over 0, otherwise the whole text is the item. Amounts display with a decimal comma and parse back to the same entry (`parse.ts:50`).

### Adding an item

`add_entry` (`items.ts:5`) is the one add path, used by the entry bar, the photo review and the widget. It parses the amount (below); an item already open under the same name (case aside, deleted ones skipped) is unticked and takes the new amount instead of being added twice; anything else is pushed with a fresh id and stamp. History isn't touched: only "Clear done" records a trip.

### Props and launching

`props: { list?: string, photo?: boolean }` (`index.ts`). Every launch opens a new window, as for any app.

- `list`: the window opens on that list. An unknown id is ignored and the window keeps its own (first list by default).
- `photo`: the window starts the photo read at once, the same `photo()` as the camera button: device picker, crop, review. The picker needs a user gesture; the launch from a widget tap reaches it within Chrome's activation window (checked: `navigator.userActivation.isActive` still true at the picker).
- Both are acted on once per window, when the file is ready (`shopping-list.app.svelte:117`). The window's `launched` flag keeps a session restore from switching lists or opening the picker again.

### Widget

`widget.svelte`, `widget_size` min 3×1, max 6×2, default 4×1 (`index.ts`). Prop `list`: the list id; none or an unknown id shows the first list. Add only, no item list (owner):

| Part | Does |
|------|------|
| Header | Colour dot, list name, "N left" (`left_count`, `items.ts:23`: not ticked, not deleted). Tap launches the app with `{ list }` |
| Camera | Launches the app with `{ list, photo: true }` |
| Field + Add | `add_entry` on the shared file, the same path as the entry bar; Enter or the + button. No suggestion chips |

At h=1 everything uses the kit's `sm` sizes; at h=2 `md`, with more padding. Measured on the desktop at 3×1: 263×60 px body, the field 183 px wide, nothing overflows.

Pinned from the list actions menu with `toggle_widget`: "Add to desktop" ("Add to home screen" on mobile), with the list's name as label. Once a widget with `props.list` equal to the list's id is on the desktop (`widget_for`), the item reads "Remove from desktop" ("Remove from home screen") and removes it. Renaming a list renames its widget file (`rename_list`, same `/ \ :` cleanup as `pin_widget`), so the desktop frame's title follows; a taken name keeps the old one. Deleting a list removes its widget too. A widget added from App Library has no `list` prop and isn't counted.

### Suggestions and buy again

History is keyed by the item's text in lower case: `{ count, last }` (`data.ts:47`). "Clear done" records the trip: each cleared item counts once, all with the same `last` (`suggest.ts:30`). Adding an item doesn't count.

- Suggestions while typing: history keys containing the text, not already on the list; prefix matches first, then most bought, then most recent, then alphabetical; six at most (`suggest.ts:7`).
- Buy again: every key whose `last` equals the latest trip, not already on the list (`suggest.ts:19`).

## Data

| What | Where | Format |
|------|-------|--------|
| Lists, items, history | `/var/lib/apps/shopping-list/lists.json`, `storage.file()` (`shopping-list.app.svelte:71`); the widget holds the same file through `json_file()`, so both see each other's changes at once | `{ version: 1, lists: [{ id, name, color, items }], history: { [text]: { count, last } } }`; item `{ id, text, qty?, unit?, checked, updated_at, deleted_at? }` (`data.ts:29`) |
| Open list | Window storage `list` | List id, default `groceries` |
| In-store mode | Window storage `store` | Boolean; big rows, Screen Wake Lock (`shopping-list.app.svelte:149`) |
| Launch props handled | Window storage `launched` | Boolean; set once the `list` and `photo` props were acted on, so a restored window doesn't switch lists or ask for a photo again |
| Widgets | `/home/Desktop/{list name}.widget` | `{ app: "shopping-list", props: { list }, w, h }`, written by `pin_widget` (desktop service) |
| Models and runtime | Bundled assets, `webos-wasm` cache | Not in OPFS, not in backups |

No shell commands (owner: nothing for now).

## Dependencies & licences

| Dependency | Licence | Scope |
|------------|---------|-------|
| `onnxruntime-web` 1.30.0 | MIT | App `package.json` (ADR-045) |
| PP-OCRv5 mobile detector, Latin recogniser, dictionary | Apache-2.0, © PaddlePaddle Authors | Committed under `models/`, unchanged from Hugging Face; sources in `models/README.md` |
| `zod` | MIT | Root, ADR-approved |
| Gemini Nano | Chrome's built-in model | Through AiService (ADR-046, ADR-051), nothing shipped |

## Limits

- Measured on one photo, one hand, one device. Printed lists, other handwriting, cursive and other languages are untested beyond the unit and browser tests.
- Left over on the test photo: "vrečke zasm." and "zelenjava" sit too close to split; "soda b." loses its "b."; a struck-out item is read like any other.
- A snap can be wrong with confidence: a misread within 1–2 edits of another grocery word becomes that word. The review screen is the guard.
- Gemini Nano's reading is untested on a real device with image input; only the fallback path is measured.
- First read needs about 17 MB over the network; offline before that, the reader fails.
- Sync has no TURN relay: two phones on mobile data behind carrier NAT don't connect (same limit as P2P Transfer). One list per pairing, one pairing per window.
- LWW per item: two people editing the same item at once keep only the later edit.
- Renames and colour changes don't sync.
- At h=1 on a touch screen the kit's taller `pointer-coarse` sizes need about 80 px; a 1-row desktop cell gives 60, so the field can clip on a touch laptop. A phone cell is taller.
- `ocr.browser.test.ts:34` is still named after tesseract ("core and language data").

## Decisions

- [Shopping List brainstorm](../brainstorm/2026-10-19_shopping-list.md): the app, sync, storage, the handwriting investigation, PP-OCRv5 over tesseract.js, models in git, the dropped done toast.
- [ADR-051](../adrs/051-ai-image-input.md): image input in AiService, `PROMPT_IMAGE`; revision for PP-OCRv5.
- [ADR-052](../adrs/052-p2p-pairing-in-kit.md): pairing moved to `$kit/utils/p2p`, channel labels.
- [ADR-045](../adrs/045-scoped-app-dependencies.md): app-scoped dependencies.
