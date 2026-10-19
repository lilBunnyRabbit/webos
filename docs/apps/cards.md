# Cards

Id `cards` · Source: `src/lib/apps/user/cards/` · [brainstorm](../brainstorm/2026-10-19_cards.md) · kit: `$kit/utils/qr`, `$kit/utils/qr-scan.svelte` ([ADR-048](../adrs/048-app-kit-layer.md))

## What it does

A loyalty card wallet, phone first. Scan a card's barcode (camera, photo, drop or paste) or type its number, then show it at the till full screen with the screen kept awake. Most used and pinned cards come first. Every format the browser's `BarcodeDetector` reads can be scanned and drawn again. Cards move between devices as a zip file, a QR code of the list, or a share link for one card.

## How it works

### Formats and validation

Format ids are `BarcodeDetector`'s own names, so a scan maps onto a card format one to one (`formats.ts:2`, `formats.ts:51`). Each has a bwip-js encoder id (`bcid`) and a shape that decides the quiet zone and the checkout layout (`formats.ts:28`).

| Format | `bcid` | Shape | Validation (`validate_code`, `formats.ts:80`) |
|--------|--------|-------|-----------------------------------------------|
| EAN-13 | `ean13` | linear | 13 digits, GTIN check digit |
| EAN-8 | `ean8` | linear | 8 digits, GTIN check digit |
| UPC-A | `upca` | linear | 12 digits, GTIN check digit |
| UPC-E | `upce` | linear | 8 digits, starts with 0 or 1, check digit over the expanded UPC-A body |
| Code 128 | `code128` | linear | Printable ASCII |
| Code 39, Code 93 | `code39`, `code93` | linear | A–Z, 0–9, space, `- . $ / + %` |
| ITF | `interleaved2of5` | linear | Digits, even count |
| Codabar | `rationalizedCodabar` | linear | Digits and `- $ : / . +`, optional A–D at both ends |
| QR, Aztec, Data Matrix | `qrcode`, `azteccode`, `datamatrix` | square | Any text |
| PDF417 | `pdf417` | stacked | Any text |
| Number only | none | none | Any text, no barcode drawn |

- **GTIN check digit** (`formats.ts:55`): weights 3 and 1 alternating from the right, `(10 − sum mod 10) mod 10`. The error names the digit it should be, so a typo is easy to find.
- **UPC-E** (`formats.ts:61`): the 6 data digits expand to a UPC-A body by the last data digit (0–2, 3, 4, 5–9 patterns), and the check digit is computed on that.
- **Guessing** for a typed number (`formats.ts:111`): 13 digits are EAN-13, 8 digits with a valid check digit EAN-8, anything else Code 128. A scan's format overrides the guess (`cards.app.svelte:110`).
- **Codabar**: scanners often drop the start and stop letters, bwip-js needs them, so `A…A` is added when they're missing (`formats.ts:118`). **Code 93**: its two check characters are mandatory but BWIPP leaves them to the caller, so `includecheck` is set (`render.ts:91`).

### Drawing: bwip-js through its own SVG path

bwip-js is BWIPP (the PostScript barcode library) ported to JavaScript. Before Cards, the repo drew QR only (`uqr`); nothing drew 1D codes, PDF417, Aztec or Data Matrix. One dependency covers every format above.

- **Named encoder imports** (`render.ts:23`): `ean13`, `qrcode` and the rest from `bwip-js/browser`, not `toSVG({ bcid })`, so the build tree-shakes to these 13 encoders. The bundle size of that chunk is unmeasured.
- **Own drawing context** (`render.ts:53`): bwip-js calls `line()` and `polygon()` on a `DrawingContext`; this one appends to a single SVG path string instead of bwip-js's SVG output, which bakes in its own colours. The page fills the path with `CODE_INK` on a `CODE_FIELD` surface (theme tokens: white with dark ink in light themes, the light foreground grey in Brand Dark, where no token is white). Text, hexagons (MaxiCode) and ellipses are ignored; no format here uses them, and the number is printed by the page.
- **Pixel coverage** matches bwip-js's own bitmap drawing: an odd line width puts its wider half before the line (`render.ts:65`). `shape-rendering="crispEdges"` keeps bars sharp at any scale.
- **Quiet zone** in the `viewBox`, in modules × scale 2: linear 11 (EAN asks for 11 on the left and 7 on the right; the larger fits every linear format), square 4 (QR's spec), stacked 2 (`render.ts:50`). Linear codes are 18 mm high and get no vertical margin.
- **Errors**: bwip-js throws `bwipp.…: reason`; the prefix is stripped and the reason shown in place of the code (`render.ts:98`).

Tested: EAN-13 draws 30 bars, 2D codes are square, number only throws, a bad code gives bwip-js's reason (`render.test.ts`), plus the browser render (`render.browser.test.ts`).

### Scanning

One detector per window, made on first use with every format Cards draws (`cards.app.svelte:94`, `formats.ts:47`). `create_barcode_detector(formats)` (`kit/utils/qr.ts:49`):

1. The native `BarcodeDetector` with the asked formats it supports. A missing format is left out rather than giving up: macOS lists no `upc_a` or `codabar` and reads UPC-A as EAN-13.
2. Only when it supports none of them (iOS Safari, Firefox): jsQR, imported lazily, QR only, on a frame scaled to 1024 px.

| Source | Path |
|--------|------|
| Camera | `CameraScan` from the kit in the card editor: live preview, reports `{ value, format }`, releases the camera while the window isn't visible |
| Photo, drop, paste | `scan_image` (`cards.app.svelte:166`): `createImageBitmap`, one `detect_barcode` call, a warning toast when nothing is found |

Paste is document-level, so it's ignored while the window isn't focused, checkout is open or any dialog is up (`cards.app.svelte:355`).

### Share payload: `WEBOS-CARDS:1:`

`encode_share` (`share.ts:33`):

```
WEBOS-CARDS:1: + base64url( deflate-raw( JSON [[name, code, format, color, notes?], …] ) )
```

- **Tuples, not objects**, and no photos, pins, use counts or ids: every byte makes the QR denser. `notes` is left off when empty.
- **deflate-raw** through the browser's `CompressionStream`, no dependency.
- **base64url**, unpadded: URL-safe, so the same payload goes into a share link unescaped.
- **Version 1** in the prefix: a future format gets `:2:`; `decode_share` rejects anything without this prefix, a body that doesn't inflate, or a shape that fails the zod schema (`share.ts:39`).
- **Limit**: 2000 characters (`share.ts:8`). A version 40 QR at ECC L holds 2953 bytes, but past about 2000 a phone held up to a screen stops reading it reliably. Over that, the share sheet says so and offers the file.

Two ways out:

| Share | QR holds | Read by |
|-------|----------|---------|
| The list (More › Share list as QR) | The bare payload | Add › Import from QR (or More › Import from QR): camera, photo or paste |
| One card (card › Share) | `{origin}{base}#/app/cards?import=<payload>` | Any phone camera; the link opens WebOS with the `import` prop. Import from QR also accepts the link (`share.ts:52`) |

Import shows a confirm sheet listing the new cards; duplicates (same format and number, `share.ts:68`) are skipped and counted. Imported cards get fresh ids.

### Zip export

`Cards.zip` (`archive.ts:14`), built with the core zip writer (DEFLATE), saved through the WebOS save picker:

```
cards.json               the CardsFile, pretty-printed
photos/{id}-front.webp   only for cards that have them
photos/{id}-back.webp
```

Import (`archive.ts:25`, picked or dropped): `cards.json` must exist and pass `CardsFileSchema`; only photos the list points at are read; every card gets a new id, photo flags follow what the zip actually holds (`archive.ts:41`); duplicates by format and number are skipped.

## Data

| What | Where | Format |
|------|-------|--------|
| Cards | `/var/lib/apps/cards/cards.json`, `storage.file()` (`cards.app.svelte:63`) | `{ version: 1, cards: [{ id, name, code, format, color, notes, pinned, uses, used_at, created_at, photos: { front, back } }] }` (`data.ts:14`) |
| Photos | `/var/lib/apps/cards/photos/{id}-{front\|back}.webp` | WebP, quality 0.85, long side at most 1600 px (`photos.ts:10`) |
| Open card | Window storage `card` | Card id |
| Handled props | Window storage `handled` | `{ card, import }`: the prop values this window already acted on, so a restored window doesn't count a use or import twice |

Both files sit under `/var/lib`, so they're in backups and removed by "uninstall with its data".

**Props** (`index.ts`, zod):

| Prop | Does |
|------|------|
| `card` | Name, id or a unique name prefix (`data.ts:103`). Opens that card in checkout. `app launch cards card=spar` |
| `import` | A `WEBOS-CARDS:1:` payload. Shows the import confirm sheet |

Sort order: pinned, then most used, then most recently used, then name (`data.ts:86`). No shell commands.

## Dependencies & licences

| Dependency | Licence | Scope |
|------------|---------|-------|
| `bwip-js` 4.11.4 | MIT | App `package.json` (ADR-045) |
| `uqr` 0.1.3 (QR for sharing, via kit `qr_path`) | MIT | Root |
| `jsqr` 1.4.0 (fallback scanner) | Apache-2.0 | Root, loaded only without a native detector |
| `zod` | MIT | Root |

## Limits

- No real-till test is recorded: whether every drawn format scans at a checkout is untested beyond round-trips in the browser tests.
- Without a native `BarcodeDetector` (iOS Safari, Firefox) only QR codes scan; 1D cards must be typed.
- macOS's detector reads UPC-A as EAN-13, so a UPC-A card scanned there is saved as EAN-13.
- The QR limit (2000 characters) is a rule of thumb, not measured per phone.
- A share link holds the card number in the URL; anyone who sees the QR has the card.
- The zip import trusts `cards.json` beyond its schema: a huge photo is written as is.
- No coupons (deferred: the store's site blocks in-browser fetches).

## Decisions

- [Cards brainstorm](../brainstorm/2026-10-19_cards.md): formats, bwip-js, the kit detector extension, storage, extras, export and import, the share payload and props.
- [ADR-048](../adrs/048-app-kit-layer.md): the app kit, where the detector lives.
- [ADR-045](../adrs/045-scoped-app-dependencies.md): app-scoped dependencies.
- [ADR-035](../adrs/035-app-platform-wave-2.md): app data in `/var/lib/apps/{id}/`.
