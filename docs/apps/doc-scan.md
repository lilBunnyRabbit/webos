# Doc Scan

ADR: [080](../adrs/080-doc-scan.md), [079](../adrs/079-app-sheets.md) · Source: `src/lib/apps/user/doc-scan/`, `src/lib/kit/utils/perspective.ts`, `src/lib/kit/components/quad-frame/`

Photograph pages at any angle; Doc Scan finds each page's edges, pulls it flat, cleans it up and saves the pages as one PDF. Phone first: the photo comes from the OS camera through the file picker, there is no viewfinder. Other apps borrow one page at a time through the `doc-scan::scan` sheet.

## Pipeline

| Step | What | Where |
|------|------|-------|
| 1. Upright | `createImageBitmap(blob, { imageOrientation: "from-image" })` in the worker, so a phone photo's EXIF orientation is applied before anything measures it. `<img>` applies the same tag, so `QuadFrame`'s picture and the corners agree | `scan.worker.ts` |
| 2. Find the page | On a copy at most 480 px long: luma, then `find_paper` (below). Corners scale back to the photo's pixels. Nothing found: `default_quad`, 8 % in from each edge, and the editor says so | `perspective.ts` `find_paper` |
| 3. Fix | `QuadFrame` with `loupe`: drag a corner (a 3× magnifier beside the finger), or arrow keys. "Find edges" puts the found corners back, "Whole photo" takes the whole frame | `page-editor.svelte` |
| 4. Straighten | Output size from the longer of each pair of opposite edges, scaled to 2400 px on the long side. The photo is drawn at 1.25× that resolution first, then every output pixel maps through the homography (flat → photo) and samples bilinearly | `perspective.ts` `page_size`, `warp` |
| 5. Filter | Color as photographed; Gray stretches luma so the 90th percentile (the paper) is white and the 1st is black; B&W is `dark_mask` (ratio 0.78, radius 1/40 of the long side): ink is darker than its neighbourhood, so a shadow across the page stays white | `warp.ts` `apply_filter` |
| 6. Encode | B&W as PNG (two levels compress small), the rest JPEG at 0.88 | `scan.worker.ts` |
| 7. PDF | One task (`run_job` from PDF Tools): a unit per page, then "Write PDF". Each page is A4 wide on its short side (595.28 pt) and as long as its proportions, the image filling it. `pick_save` starts in `/home/Documents` as `Scan YYYY-MM-DD HH.MM.pdf` | `export.ts`, `layout.ts` |

### `find_paper`

The paper is the biggest bright thing in the picture:

1. **Otsu threshold** on the luma histogram: the level that maximises the between-class variance, which splits the paper from a darker table.
2. **Regions:** 4-connected flood fill of the bright mask, labelled, and the biggest kept. Under 10 % of the picture (no page) or over 97 % (no background: white desk, or the page fills the photo edge to edge with no margin) gives up.
3. **Corners:** over the region's pixels, the minimum of x + y is the top left, the maximum the bottom right, the maximum of x − y the top right and the minimum the bottom left. This is exact for a page turned less than 45°; past that the corners come out rotated a quarter turn, which straightens the page sideways (drag them, or rotate the photo first).
4. **Sanity:** the quad must cover at least 75 % of the region's area, or it isn't a four-sided page (a round plate, a crumpled receipt) and `null` sends the caller to `default_quad`.

Text, holes and shadows inside the page don't break it: they're islands in the region, and the extremes only look at its outline.

### The homography

`homography(from, to)` solves the 8 × 8 linear system for the 3 × 3 projective matrix (last entry 1) by Gaussian elimination with partial pivoting, four point pairs giving two equations each. `warp` builds it from the flat output rectangle to the photo's quad and projects each output pixel's centre, so every output pixel gets a value and the result has no holes. Degenerate corners (three in a line) throw, and the page shows the error.

## Model

`ScanPage` (`page.svelte.ts`) holds one photo: the source `Blob` and its object URL, upright size, `quad`, the `found` corners, `filter`, and the result `Blob` and URL. `render()` straightens with the current corners and filter; a newer call wins over one still running (a version counter), and a page already rendered with the same `quad` and `filter` returns its result. The app keeps an array of pages in memory: nothing is written until the PDF.

`process.ts` calls one worker for every window and sheet through the core worker helper (`spawn` here, `serve` in `scan.worker.ts`, methods `detect` and `straighten`), and ends it after 30 s with nothing pending; a worker that fails rejects every pending call and the next call starts a new one.

## App

- **Pages:** a grid (2 columns, 3 from `@md`, 4 from `@2xl`) of straightened thumbnails with the page number; ‹ › move a page, the bin deletes it, a tap opens the editor. Add photos (device picker, several at once), From files… (WebOS picker), drop or paste pictures (the kit's `DropZone`, which also takes pastes). One photo added opens its editor straight away.
- **Editor:** the status line, `QuadFrame` or the preview, and a bar with the filter, Find edges, Whole photo and Preview / Corners. Back (and the phone's Back) returns to the pages and renders the page if its corners changed.
- **Dirty:** while the pages differ from the last saved PDF (ids, filters, corners), the window is dirty; the close prompt's Save runs the export.
- **Props:** `photo` opens the device picker, `path` / `paths` open pictures as pages. Only on the window's first launch (window storage `launched`): pages aren't restored, so a restored window starts empty rather than asking again.
- **Storage:** `app.doc-scan.filter`, the filter new pages start with (the last one picked).

## Sheet: `doc-scan::scan`

`provides: { scan: () => import("./scan-sheet.svelte") }`, typed in `sheet-types.ts`:

```ts
const blob = await win.request("doc-scan::scan", { source }); // source?: Blob
if (!blob) /* cancelled or failed: carry on your own way */;
```

Without a `source` the sheet opens the device picker right away (and shows Take or choose a photo / From files… in case the browser didn't let it). It's the same editor with Cancel, a Retake icon and "Use page", which resolves the straightened image (PNG for B&W, JPEG otherwise). It runs in the caller's window and app context and stores nothing; new pages start in Color.

## Shell

None of its own: Open with on a picture, and the props (`#/app/doc-scan?photo=true`).
