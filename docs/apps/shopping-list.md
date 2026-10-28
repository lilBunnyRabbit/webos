# Shopping List

Id `shopping-list` · Source: `src/lib/apps/user/shopping-list/` · [ADR-051](../adrs/051-ai-image-input.md), [ADR-053](../adrs/053-qr-data-transfer.md), [ADR-079](../adrs/079-app-sheets.md), [ADR-078](../adrs/078-achievements.md) · [brainstorm](../brainstorm/2026-10-19_shopping-list.md)

## What it does

A shopping list for use in the store, phone first. Several coloured lists, tick and untick in place, amounts typed as you go ("2x mleko", "500 g moka"), suggestions from what you bought before, and "buy again" for the last trip. It reads a handwritten or printed list from a photo or from a Doc Scan scan, and two phones pass lists to each other by QR code, every change reviewed before it lands, with no server.

## How it works

### Reading a photo

Two readers. Gemini Nano goes first where Chrome has it; PP-OCRv5 runs everywhere else, and also when Nano throws.

Two ways in, both offered wherever one shows (both ⋯ menus, the empty list, the widget; owner: "both camera and scanner options (always)"). The entry bar has one camera button that opens a menu of the two (`read_menu`), so the field keeps its width on a phone:

- **Camera** (`photo()`, `CameraIcon`): the device picker, then every step below.
- **Scan** (`scan()`, phosphor `Article`, Doc Scan's own icon is an app file): `win.request("doc-scan::scan")` with no source, so Doc Scan's sheet opens over the list and asks for the photo itself ([ADR-079](../adrs/079-app-sheets.md), [doc-scan](doc-scan.md)). The Blob it hands back is already straight, so it goes to `read(image, null)` at once, skipping step 3. `null` (Cancel, offline, Doc Scan failing to load) does nothing: the list stays as it was, and Read a photo in the same menu is the way on. No fallback picker.

"Try again" and "Another photo" on the review go back the same way the read started (`read_from`).

| Step | What | Where |
|------|------|-------|
| 1. Pick | `read_method()`: Nano unless `AiFeature.PROMPT_IMAGE` is `no` (always `no` on mobile, ADR-051) | `read-image.ts:18` |
| 2. Straighten | `createImageBitmap(…, { imageOrientation: "from-image" })`, so the EXIF orientation tag is applied before anything sees the pixels | `photo.ts:7` |
| 3. Frame and flatten (optional) | The frame sheet (`photo-crop.svelte`, kit `QuadFrame` with its magnifier): the list's paper corners pre-filled by `find_paper` (kit `perspective`, on a 480 px copy), dragged to fix. "Read the list" pulls the quad flat through the homography (`page_size`, `warp`; the photo first scaled to 1.25× the output) before anything reads it; "Read all" skips it. A photo pasted or dropped while the sheet is open starts it over (keyed on the picture); one the browser can't decode shows "Couldn't open the photo" with Back. At most 2000 px on the long side | `photo.ts:13`, `photo.ts:30` |
| 4a. Nano | The straightened crop as a PNG part plus a fixed system prompt ("items only, one per line, with any amount"), streamed | `read-image.ts:35` |
| 4b. PP-OCRv5 | A module worker inside a task job: detect, recognise, group, snap (below) | `read-image.ts:55`, `ocr.worker.ts:79` |
| 5. Clean | Bullets, checkboxes, numbering and trailing punctuation stripped; lines without a letter and repeats dropped | `lines.ts:43` |
| 6. Review | Every line shown with a keep toggle (a 44 px target) before anything is added; a line whose name is already open on the list is tagged "On the list" (adding it updates that item, `add_entry`). The OCR job ends without a done toast (`done: () => null`); the review screen is the result | `read-image.ts:69` |

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

#### Why flatten

Measured 2026-10-27 with PP-OCRv5 in Chromium on a synthetic photo (made-up printed list of 10 items, warped onto a dark table by a perspective transform; `straighten.browser.test.ts`), items read exactly:

| Photo | As photographed | Flattened first |
|-------|-----------------|-----------------|
| Mildly skewed | 10 | 10 |
| Strongly skewed (keystone) | 10 | 10 |
| Turned about 15° and skewed | 5 | 10 |

Axis-aligned detection boxes cut slanted lines apart; flattening makes them level again. The old rectangle crop couldn't do that. Not measured on real handwritten photos or with Gemini Nano.

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

### Sharing by QR

No connection between the phones ([ADR-053](../adrs/053-qr-data-transfer.md)). Share… (list ⋯, All's ⋯, or Share on the Lists screen) picks lists, current one ticked (`share-panel.svelte`), and shows them as cycling QR codes (`$kit/components/qr-transfer` `QrFrames`). Receive… opens the camera (`QrCollect`), which gathers the codes in any order and hands over the payload; nothing is written until the review is applied.

| Step | What | Where |
|------|------|-------|
| Snapshot | `{ v: 1, lists: [{ id, name, color, icon?, items }] }`, every item including tombstones, so deletions travel | `share_of` (`share.ts`) |
| Frames | JSON → `deflate-raw` → Base45, 240 bytes a frame, `WQ1:SL:{msg}:{i}/{n}:{data}` | `$kit/utils/qr-transfer` |
| Diff | Per incoming list: unknown id → one New list change; else list details (name, colour, icon: no timestamp, any difference is offered) and per item the version `newer()` would keep: new, changed (text or amount), ticked, unticked, deleted. Identical items and older incoming versions are skipped | `review_share` |
| Review | Grouped per list and kind, every change ticked, untick to skip, Apply N (`share-review.svelte`) | `View.INCOMING` |
| Apply | Picked items take the incoming version whole; a new list is pushed as sent | `apply_changes` |

Merge is still last-writer-wins per item (`merge.ts`):

- Every change stamps `updated_at = max(now, previous + 1)`, so an item's stamp never goes back even when this phone's clock is behind.
- Equal stamps are broken by comparing the items' serialised form, so both phones pick the same one.
- A deletion is a tombstone (`deleted_at`) and wins or loses like any edit. Tombstones older than 30 days are pruned when the file loads; a phone that hasn't received a share for longer can bring a deleted item back.
- Ids start with the time in base 36, so sorting by id gives the order of adding on both phones.
- `added_at` isn't part of `item_key` and never changes after an item is made, so an item whose date was filled in on read (see Data) on one side isn't offered as changed.

45 items with random ids came to 5 codes in the browser check; a typical list is 1–2.

### Quantities

`parse_entry` (`parse.ts:29`) peels an amount off the front or back of what's typed. Tried in order, first match wins:

| Shape | Example | Result |
|-------|---------|--------|
| `N x item` | `2x mleko`, `2 × mleko` | qty 2 |
| `N unit item` | `500 g moka`, `1,5 l mleko` | qty 500, unit `g` |
| `N item` | `3 jajca` | qty 3 |
| `item N unit` | `moka 500g` | qty 500, unit `g` |
| `item Nx` / `item xN` | `jajca x10` | qty 10 |

A bare trailing number stays in the name (owner, 2026-10-20): `omega 3`, `WD 40`. That also goes for photo lines, so a handwritten `mleko 2` reads as the name `mleko 2`.

Units: kg, dag, g, mg, l, dl, cl, ml, kos, kom, pcs, pc, pkg, pack, pak, with an optional dot. Decimal comma or point. The rest needs a letter and the amount must be over 0, otherwise the whole text is the item. Amounts display with a decimal comma and parse back to the same entry (`parse.ts:50`).

### The list view

Three places, in window storage `list`: `@home` (the default), `@all`, or a list id.

- **Lists** (`lists-overview.svelte`): an All lists row, then a card per list (icon tile, name, "N left", the first four open items), a gear for List settings, and a New list card.
- **A list or All**: the toolbar is a back arrow to Lists, the list's icon and name (or All lists), store mode and ⋯ (owner: no chip row). The ‹ goes to Lists; Back (nav bar, browser) closes a side view or sheet and otherwise leaves the app, it doesn't step to Lists (owner).
- **All**: a header per list with open items (tap the header to open that list), then one "In the cart" section where each row shows its list's icon. The entry bar gets a list picker in front (window storage `add_to`, else the first list); photo lines go to the same list.

Open items sit in a card (`divide-y`, full-contrast medium text, the amount as a pill); ticked ones drop into a collapsible "In the cart · N" section (window storage `cart_open`), dimmed and struck through. A tick runs inside `view_transition`, each row carrying `view-transition-name: item-{id}`, so the row slides between the sections. A thin progress bar under the toolbar shows ticked over all.

Sort (window storage `sort`): ⋯ › Sort, a submenu in a list's and in All's menu with Oldest first (the default, the order items were always shown in), Newest first, Name A–Z and Name Z–A, a tick on the current one (`sort_menu`). `sort_items` (`sort.ts`) orders the open items, each list's group in All and "In the cart" alike. Dates compare `added_at`; names use one `Intl.Collator` with `sensitivity: "base"` (case and accents aside), ties by `added_at`; the sort is stable, so remaining ties keep the file's order. A change of sort runs inside `view_transition`, so rows glide to their new places. One sort per window, not per list (owner).

A row (`item-row.svelte`) is swiped, not tapped, to tick (owner: taps were misclicks). Pointer events on the `li` with `touch-action: pan-y`: past 10px a mostly horizontal move takes the pointer (capture) and drags the row over a coloured reveal; released past `min(120px, 35%)` → ticks or unticks, or past 60% ← deletes with an Undo toast (`delete_item`; longer so a scroll that drifts left doesn't delete, owner 2026-10-20), a short vibration when the threshold is crossed; short of it the row springs back. A vertical move first leaves it to the page scroll. The click after a swipe is swallowed. A tap opens the item editor; in store mode it only nudges the row 28px right over the green reveal and back (`peek`, skipped with reduced motion), showing the swipe that ticks. a mouse also gets a real checkbox in front (`pointer-fine:grid`, `data-no-swipe`), keyboard users too. The row menu (Edit…, Move to, Delete) is a long press on touch (`long_press`, off in store mode) and the ⋯ button or a right-click with a mouse; the ⋯ is `pointer-coarse:hidden`. Edit…, a tap and a tap on the amount pill (its button spans the row's height) open the item editor (`item-editor.svelte`, `View.EDIT`), a bottom sheet over the list (`inert` behind it) so the list keeps its scroll; Back, Esc, Cancel, a tap on the scrim or a swipe down (`swipe_dismiss`, kit `Grabber`) close it: name, a −/+ stepper with a number field (steps of 50 for g and ml, 0,5 for kg and l, 1 otherwise; empty means no amount), and unit chips (×, g, dag, kg, ml, dl, l, pak, plus the item's own unit when it's another). Under the name a muted line says when the item was added (`format_added`, `added.ts`): "Added today, 18:04", "Added yesterday, 18:04", the weekday within a week ("Added Mon, 18:04"), then "Added 12 Oct, 18:04", with the year when it isn't this one. The editor is the only place that shows it: not on rows, no toggle (owner: "i want to see it only if i want").

List settings (`list-settings.svelte`, `View.SETTINGS`) edit name, colour (swatches named by how the theme paints them, `color_names()` in `colors.ts`: each token resolved through a hidden element, its hue named, look-alikes split into Light and Dark; the token names say nothing about the colour, owner) and icon (a grid of 16, the picked one tinted in the picked colour, `ListIcon` in `data.ts`, components in `colors.ts`), with a live preview tile; New list opens the same view empty. Renaming also renames the list's widget file.

The bottom of a list: a strip with "N of M in the cart" and Clear done (shown once something is ticked; the button turns primary only when nothing is left open), then the entry bar. Both are centred at the list's `max-w-xl`, so a wide window keeps them under the list. Clear done shows a "Cleared N items" toast for 8 s whose Undo puts the items back and restores the history as it was before the trip was recorded. The entry bar's field, camera and Add are 44 px on touch, and Add drops its label below `@md`; in store mode the Buy again chips are hidden (a stray tap there adds an item), suggestions while typing stay, and the bar is one "+ Add" button (`compact`) until tapped: it then opens and focuses the field, and collapses again when the field is left empty (owner).

### Adding an item

`add_entry` (`items.ts:5`) is the one add path, used by the entry bar, the photo review and the widget. It parses the amount (below); an item already open under the same name (case aside, deleted ones skipped) is unticked and takes the new amount instead of being added twice; anything else is pushed with a fresh id, `added_at` and stamp. Re-adding keeps the item's first `added_at`. Move to (row menu) makes a new item in the other list, so it gets a new `added_at` too. History isn't touched: only "Clear done" records a trip.

### Props and launching

`props: { list?: string, photo?: boolean | "scan" }` (`index.ts`, a zod union). Every launch opens a new window, as for any app.

- `list`: the window opens on that list. An unknown id is ignored and the window keeps its own (first list by default).
- `photo`: `true` starts the photo read at once, the same `photo()` as Read a photo in the entry bar's camera menu: device picker, crop, review. `"scan"` opens Doc Scan's sheet at once, the same `scan()` as Scan a list in that menu. The picker needs a user gesture; the launch from a widget tap reaches it within Chrome's activation window (checked: `navigator.userActivation.isActive` still true at the picker).
- Both are acted on once per window, when the file is ready (`shopping-list.app.svelte:126`). The window's `launched` flag keeps a session restore from switching lists or opening the picker again.

### Shell and Ask

`commands.ts` (lazy bodies in `shell.ts`, reading `lists.json` through `live_file`, so an open window and a command share one cell):

- `list ls`: `shopping-list` values, one per list: `name`, `left` (unticked), `in_cart` (ticked). Open launches the app on that list.
- `list items [list]`: `shopping-item` values for one list (by name, case-insensitive, or id) or all lists: unticked first, then those in the cart; deleted items (tombstones) left out. `amount` is `format_amount` of the item (`2×`, `500 g`). An unknown list fails with the list names.

Both are `ai: "read"`, so Ask's assistant can answer "what's on my shopping list?" once the user switches them on (ADR-054). No write commands yet: v1 of the assistant reads only.

### Widget

`widget.svelte`, `widget_size` min 3×1, max 6×2, default 4×1 (`index.ts`). Prop `list`: the list id; none or an unknown id shows the first list. Add only, no item list (owner):

| Part | Does |
|------|------|
| Header | Colour dot, list name, "N left" (`left_count`, `items.ts:23`: not ticked, not deleted). Tap launches the app with `{ list }` |
| Camera | Launches the app with `{ list, photo: true }` |
| Scan | Launches the app with `{ list, photo: "scan" }` |
| Field + Add | `add_entry` on the shared file, the same path as the entry bar; Enter or the + button. No suggestion chips |

At h=1 everything uses the kit's `sm` sizes; at h=2 `md`, with more padding. Measured on the desktop at 3×1: 263×60 px body, the field 183 px wide, nothing overflows.

Pinned from the list actions menu with `toggle_widget`: "Add to desktop" ("Add to home screen" on mobile), with the list's name as label. Once a widget with `props.list` equal to the list's id is on the desktop (`widget_for`), the item reads "Remove from desktop" ("Remove from home screen") and removes it. Renaming a list renames its widget file (`rename_list`, same `/ \ :` cleanup as `pin_widget`), so the desktop frame's title follows; a taken name keeps the old one. Deleting a list removes its widget too. A widget added from the App Store has no `list` prop and isn't counted.

### Achievements

Declared in `index.ts`, reported through `get_app_context().achievements` ([achievements](../system/services/achievements.md)). Earned by using the lists, never by opening the app:

| Id | Title | Reported |
|----|-------|----------|
| `first-read` | Off the page | `add_reviewed` with at least one line: a list read from a photo or a scan was added |
| `all-in` | Every last one | `toggle` ticks the last open item of a list with five or more live items (checked against the state the tick is about to set, since `view_transition` runs the change later) |
| `bought-100` | Regular (goal 100) | `clear_done` after recording the trip: the sum of every history `count`, so no new counter key. Each item counts once per trip, as history does ("Milk" and "milk" are one). Undo puts the history back, but progress keeps its highest |
| `shared` | Two phones, one list | `apply_incoming` applied at least one change from another phone |

Existing history counts toward `bought-100` on the next Clear done.

### Suggestions and buy again

History is keyed by the item's text in lower case: `{ count, last }` (`data.ts:47`). "Clear done" records the trip: each cleared item counts once, all with the same `last` (`suggest.ts:30`). Adding an item doesn't count.

- Suggestions while typing: history keys containing the text, not already on the list; prefix matches first, then most bought, then most recent, then alphabetical; six at most (`suggest.ts:7`).
- Buy again: every key whose `last` equals the latest trip, not already on the list (`suggest.ts:19`).

## Data

| What | Where | Format |
|------|-------|--------|
| Lists, items, history | `/var/lib/apps/shopping-list/lists.json`, `storage.file()` (`shopping-list.app.svelte:71`); the widget holds the same file through `json_file()`, so both see each other's changes at once | `{ version: 1, lists: [{ id, name, color, icon?, items }], history: { [text]: { count, last } } }`; item `{ id, text, qty?, unit?, checked, added_at, updated_at, deleted_at? }` (`data.ts:52`). `added_at` is optional only on the way in: `ItemSchema` fills a missing one from the id's leading base-36 time (`added_from`), else `updated_at`, for files and shares from before it existed; the file stays version 1 |
| Open place | Window storage `list` | `@home` (default), `@all` or a list id |
| Add target in All | Window storage `add_to` | List id or `null` (the first list) |
| "In the cart" open | Window storage `cart_open` | Boolean, default open |
| Sort | Window storage `sort` | `oldest` (default), `newest`, `name`, `name-desc` (`ItemSort`, `sort.ts`) |
| In-store mode | Window storage `store` | Boolean; big rows, Screen Wake Lock (`shopping-list.app.svelte:149`) |
| Launch props handled | Window storage `launched` | Boolean; set once the `list` and `photo` props were acted on, so a restored window doesn't switch lists, ask for a photo or open the scan sheet again |
| Achievements | `/var/lib/apps/shopping-list/achievements.json` | Owned by the OS ([achievements](../system/services/achievements.md)) |
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
- No live sync: the other phone sees changes only after a share and its review.
- LWW per item: of two edits to the same item, the review offers only the later one.
- List details carry no timestamp, so the review can't tell whose rename is newer; the user picks.
- The receiver needs a camera: there is no photo or paste path for multi-part codes.
- At h=1 on a touch screen the kit's taller `pointer-coarse` sizes need about 80 px; a 1-row desktop cell gives 60, so the field can clip on a touch laptop. A phone cell is taller.
- `ocr.browser.test.ts:34` is still named after tesseract ("core and language data").

## Decisions

- [Shopping List brainstorm](../brainstorm/2026-10-19_shopping-list.md): the app, sync, storage, the handwriting investigation, PP-OCRv5 over tesseract.js, models in git, the dropped done toast.
- [Sort and date added](../brainstorm/2026-10-24_shopping-list-sort.md): `added_at` with a backfill over reading the id, the Sort submenu, the date only in the editor.
- [ADR-051](../adrs/051-ai-image-input.md): image input in AiService, `PROMPT_IMAGE`; revision for PP-OCRv5.
- [ADR-053](../adrs/053-qr-data-transfer.md): sharing by multi-part QR with a review, replacing live sync (ADR-052's pairing, used until 3.6.0).
- [ADR-045](../adrs/045-scoped-app-dependencies.md): app-scoped dependencies.
- [Doc Scan and app sheets](../brainstorm/2026-10-27_doc-scan-and-app-sheets.md): the scan option beside the camera, `photo: "scan"`, `null` does nothing. [ADR-079](../adrs/079-app-sheets.md): `win.request`.
- [Achievements](../brainstorm/2026-10-27_achievements.md): the sweep, two to four for apps with a finish line.
