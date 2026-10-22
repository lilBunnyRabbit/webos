# Image Tools

Id `image-tools` · Source: `src/lib/apps/user/image-tools/`, writers in `src/lib/kit/utils/codecs/` · [brainstorm: Image Tools](../brainstorm/2026-10-15_image-tools.md), [brainstorm: fit and convert](../brainstorm/2026-10-22_image-fit-and-convert.md) · [ADR-064](../adrs/064-kit-encoder-table.md), [ADR-034](../adrs/034-app-extension-points.md), [ADR-013](../adrs/013-tasks-service.md)

## What it does

One app with a section per small image job: remove background, join, trim, split, sprites, atlas, patch, redact, squash, fit under a size, convert, compare, poster print, test image. This page covers the parts with non-obvious internals: Fit (getting an image under an upload limit while keeping as much quality as it can), Convert (one image in every format) and the formats both write through the kit's encoder table. The other sections are forms over canvas operations.

## How it works

### Fit search

`fit.ts:111` (`search_fit`), pure and Node-tested (`fit.test.ts`). The Fit section, `image fit` and `squash --under` all run it, through `fit_image` (`fit-job.ts:75`).

1. **Copy when nothing needs to change** (`can_copy`, `fit.ts:69`): the file is already under the limit, the target format is the source's own and the max side isn't hit. The original goes out byte for byte (an animated GIF keeps its frames).
2. **Max side first.** The longest side is brought down to the max before the first encode (`squashed_size`, shared with Squash).
3. **Lossy formats** (JPEG, WebP, AVIF, JPEG XL): encode at the ceiling; if that fits, done. Otherwise encode at the floor; if that fits, binary search the integer quality between them for the highest that fits. That's 2 + ⌈log₂(ceiling − floor)⌉ encodes at most per size, 8 for Fit's 50–92.
4. **Scale when the floor is still over**: by `√(limit / size at floor) × 0.95` (`fit.ts:23`), then search again from the ceiling. File size grows roughly with pixel count, so the square root lands near the limit; the 0.95 aims under it so one round usually does. `scale_by` always shrinks by at least a pixel, so the loop ends.
5. **Lossless formats** (PNG, GIF, BMP, ICO, TIFF, QOI, TGA, PPM) have no quality to search: they only scale, the same way.
6. **Give up** after 12 scale rounds or at 1×1: the result is the smallest file tried, flagged as not fitting. The section shows it with a warning; `image fit` and `squash --under` refuse to write it.

The limit is a hard ceiling: a result is only "fitted" at `size ≤ limit`, never rounded. Limits are read in decimal units (`parse_limit`, `fit.ts:32`): sites mean 10^6 or 2^20 by "MB", and the smaller reading fits both. The UI says so under the limit picker; sizes in the section are shown in the same units (`format_limit`).

| Quality range | Floor | Ceiling | Why |
|---------------|-------|---------|-----|
| Fit section, `image fit` | 50 | 92 | Under about 50 a smaller picture looks better than a blockier one; over 92 JPEG and WebP grow fast for little gain (`FIT_QUALITY`) |
| `squash --under` | `--floor`, default 50 | `-q`, default 80 | Squash's own quality is the most it will spend |

Measured on a generated 2400 × 1600 PNG (gradient, 4000 discs, grain; 5.19 MB), Chromium in Playwright: WebP under 500 KB took 9 encodes and landed at 476 KB, quality 76, scaled to 87%. Kept as PNG under 1 MB it took 3 encodes (lossless, scale only) and landed at 909 KB, 812 × 541. Encode times were not measured here; the brainstorm's figures for a 10.7 MP photo are JPEG ~50 ms and WebP ~0.7–1.1 s per encode, AVIF and JPEG XL tens of seconds.

### Target format

`fit_target` (`fit.ts:56`): JPEG, WebP, AVIF or JPEG XL as picked. **Keep** writes the source's own format when the kit can (`source_format`: MIME type, then extension), and otherwise PNG for an image with transparency, JPEG without (SVG, for one). Warnings come from `fit_warnings`: transparency flattened onto white (JPEG), first frame only for an animated source (`is_animated`, WebCodecs `ImageDecoder`), and "didn't fit".

### Running it

`run_fit` (`fit-job.ts:154`) is one TasksService task with a progress toast, Cancel and a row in Activity Monitor; each try is logged and shown as the status line (`2081×1387 at quality 76 → 476 KB`). Every encode goes through `ENCODERS[target].encode` in the kit's codec worker pool, so Cancel ends even a wasm AVIF encode at once. A scaled copy is drawn once per size (high-quality smoothing on an `OffscreenCanvas`) and reused for every quality tried at that size.

The section decodes the result for the after side of the swipe compare (`SwipeCompare`, the same stage as Compare). Save writes `{name}-fit.{ext}` next to the original, or to Pictures for a dropped or pasted image; Save as asks. Copy puts the picture on the clipboard as PNG, the only image type the async clipboard carries, so the pasted file's size is up to the app that receives it.

### Convert

`convert_all` (`convert-job.ts:36`) is one task: a Read step decodes the image once (`read_image`, so JPEG XL and AVIF sources work), then a parallel group with a sub-task per format in `ENCODER_FORMATS` order. The codec worker pool (at most 4 workers) caps how many encode at once. A format that fails (a GIF or TGA over 65,535 px a side, say) records its error on its card and the others carry on; Cancel stops them all. Lossy formats use the kit's default quality (JPEG 82, WebP 80, AVIF 60, JPEG XL 75).

Each card shows the size, the change against the source file (`format_share`, shared with Squash) and warnings from `convert_warnings` (`convert.ts:14`): transparency flattened (JPEG, PPM), on-or-off transparency and 256 colours (GIF), shrunk to 256 px (ICO), and "N× the original" from four times the source's size up. An animated source gets one banner: first frame only. Save writes `{stem}{ext}` next to the original (Pictures for a dropped or pasted image); Save all as zip writes `{stem}-formats.zip` (`zip_cards`, `convert-job.ts:115`, deflate through the core zip writer). The section starts converting as soon as an image arrives; a new image cancels the running job.

Measured on the same 2400 × 1600 PNG (4.95 MB in that run), Chromium in Playwright, all twelve formats in under 3 s: JPEG 1.00 MB, WebP 989 KB, AVIF 648 KB, JPEG XL 398 KB, PNG 4.95 MB, GIF 2.61 MB, ICO 116 KB, QOI 7.73 MB, BMP, TIFF, TGA and PPM 10.99 MB each (sizes in binary units, as the section shows them).

### Formats written

Through the kit's encoder table (`kit/utils/codecs/encoders.ts`, [app API](../system/app-api.md#image-codecs-kitutilscodecs)):

| Format | Writer | Quality | Alpha |
|--------|--------|---------|-------|
| PNG, JPEG, WebP | canvas `convertToBlob` in the worker | JPEG, WebP | PNG, WebP; JPEG flattened onto white |
| AVIF, JPEG XL | jSquash wasm | yes | yes |
| GIF | median cut to 256 colours, Floyd–Steinberg, LZW (`gif.ts`, `quantize.ts`) | none | one bit: under half opacity is see-through |
| BMP | 24-bit, or 32-bit BGRA with a V4 header and alpha mask (`bmp.ts`) | none | yes |
| ICO | PNG entries at 16, 32, 48, 256 px, up to the image's own size (`ico.ts`) | none | yes |
| TIFF | baseline, little-endian, one uncompressed strip (`tiff.ts`) | none | unassociated |
| QOI | spec 1.0 (`qoi.ts`) | none | yes |
| TGA | type 2 uncompressed, top-left origin, 2.0 footer (`tga.ts`) | none | 32-bit |
| PPM | binary P6 (`ppm.ts`) | none | flattened onto white |

## Data

- `app.image-tools.fit`: the Fit section's limit (a preset or `custom`), the custom text, format and max side.
- Props: `section` (`fit` opens Fit), `path` (the image).
- Output names: `{stem}-fit{ext}` (Fit, `image fit`), `{stem}-squashed{ext}` (Squash, `squash --under`), `{stem}{ext}`, `{stem}-formats/` and `{stem}-formats.zip` (Convert, `image convert-all`).
- Convert keeps nothing between visits.

## Shell

| Command | Does |
|---------|------|
| `image fit <path> <size> [-f keep\|jpeg\|webp\|avif\|jxl] [--max px]` | Writes a copy under the limit next to the original; yields the `file`. Refuses to write when nothing fits |
| `squash <path…> --under <size> [-q ceiling] [--floor 50]` | Squash with every copy fitted under the limit (WebP or JPEG); one task per image |
| `image convert-all <path> [--zip]` | Writes every format into a new `{stem}-formats` folder next to the image, or one `{stem}-formats.zip` with `--zip`; yields the `file`s. Formats that fail are skipped; it errors only when none was written |

## Dependencies & licences

None beyond the kit codecs (jSquash, Apache-2.0, for AVIF and JPEG XL). MozJPEG, oxipng, imagequant and libheif were left out (brainstorm).

## Limits

- File size isn't monotonic in quality for every encoder at every step; the binary search assumes it is, so it can miss a slightly higher quality that would also fit. The result still never goes over the limit.
- Scaling assumes size follows pixel count. Lossless formats on flat artwork can shrink faster or slower; extra rounds cover it, up to 12.
- AVIF and JPEG XL searches on a large photo take minutes (about 8 encodes of tens of seconds each); unmeasured end to end.
- HEIC isn't read or written.
- Copy can't carry the fitted bytes unless the result is PNG.
- Patch feathers its edge with a `blur()` on the mask; where the canvas ignores `filter` (Safari) that blur runs by hand (`$kit/utils/filter`) over the patched area only.

## Decisions

- [Fit and convert brainstorm](../brainstorm/2026-10-22_image-fit-and-convert.md): Fit as its own section, the search, AVIF and JPEG XL allowed as slow tasks, Convert in Image Tools rather than Format Lab, no new dependency.
- [ADR-064](../adrs/064-kit-encoder-table.md): the encoder table in the kit.
