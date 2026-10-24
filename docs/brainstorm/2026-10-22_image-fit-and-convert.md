# Image Tools: fit under a size, convert to every format
**Date:** 2026-10-22
**Participants:** owner, Claude

## Context
Owner: "with image tools i want a tool that "compresses" (resizes, whatever) an image to fit inside the maximum size allowed. often i need to upload an image and it needs to be smaller. we need to do this without sacrificing image quality as much as possible". Then: "the image tool should also be converting the image to ALL other formats".

Today: Squash (`image-tools/squash*.ts`) makes WebP/JPEG copies at a fixed quality with a max side, batch, as a task; no size target. Format Lab encodes one image to JPEG, WebP, PNG, AVIF and JPEG XL (jSquash in the kit codec worker pool) to compare quality. Hand-written encoders sit in single apps: GIF + LZW (`hopsprite/gif.ts`), ICO (`icon-pack/ico.ts`), BMP (`image-tools/test-image-encode.ts`), median-cut + Floyd–Steinberg quantizer (`video-tools/quantize.ts`).

Feasibility (measured, Chromium 153, 10.7 MP photo): JPEG encode ~50 ms, WebP ~0.7–1.1 s; canvas can't encode AVIF. A binary search over quality takes ~6 encodes, plus one rescale by `sqrt(target / size_at_floor) × 0.95` when the floor still doesn't fit. HEIC needs libheif + x265 (GPL): out.

## Decisions
- **Fit is a new section (decided).** One image: pick or drop, a limit (500 KB, 1 MB, 2 MB, 5 MB, 8 MB, custom), format Keep / JPEG / WebP / AVIF / JXL, optional max side, a before/after preview, Save / Save as / Copy. Rejected: a goal inside Squash only (no preview, estimates meaningless).
- **Search.** Already under the limit with the format kept and no max side hit: copy unchanged. Otherwise binary search integer quality in [floor, ceiling]; if the floor doesn't fit, scale down and search again. The limit is a hard ceiling: "MB" is read as the smaller reading (10^6 vs 2^20). PNG and other lossless targets only scale. Transparency with JPEG flattens onto white with a warning. Animated sources: first frame, with a warning.
- **AVIF/JXL in Fit (decided):** allowed through the existing jSquash worker, slow (~30 s+ per photo), run as a task with Cancel.
- **Convert section in Image Tools (decided).** One input, a grid of every format the kit can write: PNG, JPEG, WebP, AVIF, JXL, GIF, BMP, ICO, TIFF (uncompressed), QOI, TGA, PPM. Each card: size, change against the source, warnings (alpha lost, huge), Save; Save all as a zip. One task, one sub-task per format. Rejected: extending Format Lab (it's a quality lab, not where you'd export).
- **Kit encoder table (decided).** The scattered encoders move to `$kit/utils/codecs` in their own `refactor:` commit first, behind one table (`format → encode(image, options)`), used by Fit, Convert, Squash and Format Lab. New hand-written writers (TIFF, QOI, TGA, PPM, 32-bit BMP) go there too. Rejected: importing across apps.
- **Shell (decided):** `squash --under <size>` (batch fit; `-q` becomes the ceiling, `--floor` the lowest quality); `image fit <path> <size>` (one-off); `image convert-all <path> [--zip]`. All yield `file` values.
- **No new dependency.** MozJPEG, oxipng, imagequant and libheif stay out unless asked.

## Key takeaways
- The search shares one function between Fit, `image fit` and `squash --under`.
- Image Tools gains a `docs/apps/image-tools.md` page: the fit search is an algorithm.

## Action items
- [x] refactor: kit encoder table (move GIF, ICO, BMP, quantizer; Hopsprite, Icon Pack, Video Tools, Image Tools, Format Lab import from it).
- [x] feat: Fit section, `image fit`, `squash --under`.
- [x] feat: Convert section, `image convert-all`.

## Next session topics
- MozJPEG (smaller JPEGs at equal quality) if the browser encoder isn't enough.
- A megapixel limit next to max side.
