# ADR-064: Kit Encoder Table
**Date:** 2026-10-22
**Status:** Implemented

## Context
Image Tools gains Fit (an image under a size limit) and Convert (one image in every format) ([brainstorm](../brainstorm/2026-10-22_image-fit-and-convert.md)). Both need to write many formats. The writers WebOS already had sat inside single apps: GIF and LZW in Hopsprite, ICO in Icon Pack, BMP in Image Tools' test image, the median-cut quantizer with Floyd–Steinberg in Video Tools. Format Lab's codecs (`$kit/utils/codecs`, ADR-048) covered PNG, JPEG and WebP through the canvas and AVIF and JPEG XL through jSquash. Importing across apps was rejected.

## Decision
- The scattered encoders move to `$kit/utils/codecs`, in their own `refactor:` commit, with no change in behaviour; Hopsprite, Video Tools, Icon Pack and Image Tools import them from there.
- One table, `format → { mime, ext, lossy, alpha, encode(image, options) }`, covers PNG, JPEG, WebP, AVIF, JPEG XL (the existing jSquash worker path), GIF, BMP, ICO, and new hand-written TIFF (uncompressed), QOI, TGA and PPM writers. BMP gains a 32-bit form for alpha.
- Fit, Convert, Squash and Format Lab use the table where it fits.
- No new dependency: MozJPEG, oxipng, imagequant and libheif stay out. No HEIC (libheif and x265 are GPL).

## Alternatives Considered
- **Import the writers across apps.** Rejected: an app's folder is its own, and deleting one would break the others.
- **Extend Format Lab with every format.** Rejected for Convert: Format Lab is a quality lab, not where you export.

## Consequences
- `ENCODERS[format].encode` is the one way apps write an image format; a new format is one writer plus one table row.
- Each writer is a pure function over `{ width, height, data }`, Node-tested; round trips where Chromium or a small hand decoder reads the result back, byte-structure checks otherwise.

## Revision 2026-10-22 (implementation)
- **Where encodes run.** Every format, the hand-written ones included, encodes in the existing codec worker pool: `write.ts` dispatches the writers there. A 256-colour GIF of a 10 MP photo takes seconds of median cut and dithering, which would freeze the page on the main thread, and in the worker Cancel ends it.
- **Two layers of the table.** The metadata (`EncoderFormat`, `ENCODER_INFO`: label, MIME, extension, `lossy`, `alpha`) lives in the kernel-free `formats.ts`, because the worker needs the MIME types and must not import the pool. `ENCODERS` in `encoders.ts` spreads it and adds `encode`. The five codec rows take label, MIME and extension from `CODECS`, so nothing is written twice.
- **`lossy` means "takes a quality".** GIF is marked `lossy: false` although it cuts to 256 colours: it has no quality to search, so Fit treats it like the lossless formats and only scales it. `alpha` is true for GIF, whose transparency is one bit.
- **`read_image` and `has_alpha`** moved from Format Lab into the kit (`codecs/source.ts`, `codecs/pixels.ts`), so Fit and Convert read JPEG XL sources the same way.
- **Format Lab** already used `CODECS`, which the table builds on; its code is unchanged apart from those imports. Video Tools' own GIF frame writer (local palettes per frame) stays in Video Tools and imports LZW from the kit.
