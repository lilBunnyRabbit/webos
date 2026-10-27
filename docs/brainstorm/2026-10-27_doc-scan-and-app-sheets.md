# Doc Scan and app sheets
**Date:** 2026-10-27
**Participants:** owner, Claude

## Context
The owner wants a document scanner: photograph a page at an angle, get it back flat, several pages into one PDF. Two apps already hold half of it:

- **Font Maker** straightens a photographed template: an adaptive threshold (`dark_mask`), a flood fill (`blobs`), a hand-written homography solved by Gaussian elimination, bilinear sampling, and a four-corner drag step (`font-maker/scan.ts`, `font-maker-scan.svelte`).
- **Shopping List** reads a photographed list, after a rectangular crop (`photo-crop.svelte`, the kit's `CropFrame`). A list photographed at an angle reaches the reader skewed.

PDF writing exists in PDF Tools (`PdfWriter`), which Image Tools' poster already imports across apps.

The open question beyond the app itself: how does another app (Shopping List's "From photo") use the scanner without copying it?

## Topics discussed

### Reuse between apps: app sheets
Owner: "instead of just apps provide window/app plugins of sorts... can be called from window like we do for the per window file explorer. all still dynamic imports and in this case if something fails would fallback to camera. it would open the scanner and the scanner would have a callback or sth to return the image".

Decided:
- `define_app` gains optional `provides: { [kind]: () => import("./x-sheet.svelte") }`: lazy sheet components.
- `WindowHandle` gains `request<T>(key, input?)`, `key` = `"app-id::kind"`. Owner: "app-id::kind - i always loved the :: from rust". The caller names the provider app, so there's no registry and no clash rule. The key is typed from a registry type where feasible, so a typo fails to compile.
- It opens as a sheet over the calling window, exactly like `pick_file`. The sheet gets `input` and a `resolve` (value or `null`). The window closing resolves `null`.
- Provider not installed (ADR-077): loaded online like Open without install. Any failure (offline, import error, the provider throwing) resolves `null`. Owner: "always assume that it can fail. the app should handle fallback or what happens if it doesn't work". Callers must handle `null`.
- Shell: `app provides [kind]` lists them, columns `key` (`app::kind`) and `app`.
- Mobile: works in the mobile shell like `pick_file` does.

Rejected: a kit-only reuse (Shopping List imports Doc Scan's component directly): couples one app's code to another's folder and skips the install model; a system-wide registry of "scanners" picked by kind alone: needs a clash rule nobody asked for.

### Kit extraction
Font Maker's perspective math moves to `$kit/utils/perspective` and its corner step to `$kit/components/quad-frame` (`<QuadFrame bind:quad {image} />`), next to `crop-frame`, with no change to Font Maker. The kit component goes into the design docs and the Style Guide.

### Doc Scan (`doc-scan`)
- Standalone, phone-first. `tools: ["image/*"]` (Open with on images; `.pdf` is not claimed). Props `photo?: boolean` (start the picker at once) and `paths?: string[]`.
- Capture: the file picker only (`pick_device_files({ accept: ["image/*"] })`, which is the camera on phones), drop and paste on desktop (ADR-076), and WebOS files. No live viewfinder.
- Per page: paper corners found automatically (`find_paper` in the kit: threshold the bright paper blob, corners from the extremes of x+y and x−y, a default quad when nothing is found), dragged to fix with `QuadFrame` (a magnifier while dragging is a design call), filter Color / Gray / B&W (the adaptive threshold), reorder with buttons, delete.
- Warp capped around 2000–2500 px on the long side; a worker if the main thread stalls (design call).
- Export: one PDF through PDF Tools' `PdfWriter`, B&W pages as PNG, the rest as JPEG, as a task; `pick_save` defaulting to `/home/Documents/Scan YYYY-MM-DD HH.MM.pdf`. No project file, no session restore of pages.
- `provides: { scan }`: input `{ source?: Blob }` (no source: the sheet opens the picker), returns the straightened image `Blob` with the chosen filter, or `null`.
- Shell: props and the Open with entry only.

### Shopping List
Replace the rectangular crop with a quad crop and straighten before reading, corners pre-filled by `find_paper`, **only if** a measured side-by-side shows a gain on a skewed photo: a synthetic printed list, skewed by a perspective transform, read with and without straightening. Privacy: never the real lists file, never the owner's photos. No gain: don't wire it, report the numbers.

## Key takeaways
- App-to-app reuse goes through a sheet the caller can't depend on: `null` is a normal answer.
- The math was already in the repo; the scanner is mostly UI around it.

## Action items
- [x] Kit extraction: `$kit/utils/perspective`, `QuadFrame`, Font Maker on both, Style Guide demo.
- [x] App sheets (ADR-079): `provides`, `win.request`, `app provides`, docs, tests.
- [ ] Doc Scan (ADR-079): the app, its sheet, `docs/apps/doc-scan.md`.
- [ ] Shopping List: measure straightening on a skewed synthetic list; wire it only on a gain.

## Next session topics
- More providers once a second use shows up (a signature sheet from PDF Tools, a colour picker).
