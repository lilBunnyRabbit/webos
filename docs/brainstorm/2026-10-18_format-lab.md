# Format Lab (AVIF / JPEG XL)

**Date:** 2026-10-18
**Participants:** owner, Claude

## Context

Owner asked for "some app about AVIF, JPEG XL". Probed the owner's browser (Edge/Chromium 155):

| | AVIF | JPEG XL | WebP / JPEG |
|---|---|---|---|
| Decode (`ImageDecoder`, `<img>`) | yes | no | yes |
| Encode (`OffscreenCanvas.convertToBlob`) | no (silently PNG) | no | yes |
| WebCodecs AV1 `VideoEncoder` | yes | n/a | n/a |

Today Image Tools › Squash writes WebP or JPEG only; Media Preview claims `image/*`, so a `.jxl` opens there and shows nothing.

## Decisions

1. **New app, Format Lab.** One image encoded as JPEG, WebP, AVIF and JXL side by side: swipe compare, bytes, saving vs the source, encode time, a quality score, per-format settings, save one or all. Also a viewer/inspector for AVIF and JXL files (dimensions, bit depth, alpha, animation, HDR where the header says).
2. **Codecs: jSquash** (`@jsquash/avif`, `@jsquash/jxl`), run in a Worker; wasm fetched on first use only, never at boot. Owner approved the dependencies.
3. **Codec home: `$kit/utils/codecs`**, jSquash in the root `package.json` like the kit's other packages (ADR-048). `encode(format, image, options)`, `decode(blob)`, `supported(format)`. Internal, not stable.
4. **Media Preview decodes JXL** through the kit codec, lazily.
5. **Quality score: SSIM** (hand-written, in the worker) plus a diff heatmap toggle.
6. **Shell: `convert`**, contributed by Format Lab's manifest `shell`: `convert <path...> --to avif|jxl|webp|jpeg|png [--quality] [--out dir]`. Folders convert each image. Runs as a task. Writes beside the source unless `--out`, yields file values.

## Key takeaways

- The browser decodes AVIF but can't make it; JXL needs wasm both ways.
- `convert` overlaps `squash` a little; squash stays the "make smaller" batch tool, convert is format change.

## Action items

- [ ] Implement `$kit/utils/codecs`, Format Lab, Media Preview JXL, `convert`, docs, changelog.

## Next session topics

- WebCodecs AV1 + own AVIF muxer as a learning piece (rejected for now).
- Squash gaining AVIF/JXL through the kit codecs.
