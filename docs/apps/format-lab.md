# Format Lab

Id `format-lab` · Source: `src/lib/apps/user/format-lab/`, codecs in `src/lib/kit/utils/codecs/` · [brainstorm](../brainstorm/2026-10-18_format-lab.md) · [ADR-048](../adrs/048-app-kit-layer.md), [ADR-034](../adrs/034-app-extension-points.md)

## What it does

For anyone curious what AVIF and JPEG XL buy over JPEG and WebP. One image is encoded in all four formats side by side: a swipe compare against the source or another format, size and saving against the source, encode time, an SSIM score and a heatmap of where quality was lost, per-format settings, save one or all. It also reads AVIF and JPEG XL headers (dimensions, bit depth, alpha, animation, colour, HDR), and adds a `convert` shell command.

## How it works

### Why wasm codecs

Probed in the owner's browser (Edge / Chromium 155):

| | AVIF | JPEG XL | WebP, JPEG |
|---|---|---|---|
| Decode (`ImageDecoder`, `<img>`) | yes | no | yes |
| Encode (`OffscreenCanvas.convertToBlob`) | no (silently PNG) | no | yes |

So JPEG, WebP and PNG use the canvas encoder, and AVIF and JPEG XL need wasm: jSquash (`@jsquash/avif`, `@jsquash/jxl`), the Squoosh codecs packaged as ES modules. WebCodecs AV1 plus an own AVIF muxer was considered and set aside as a later learning piece.

| Format | Encoder | Default | Effort control | Lossless |
|--------|---------|---------|----------------|----------|
| JPEG | canvas, alpha flattened onto white | quality 82 | none | no |
| WebP | canvas | quality 80 | none | yes (Chromium writes lossless WebP at quality 1) |
| AVIF | jSquash, `avif_enc.wasm` 3.5 MB | quality 60 | Speed 0–10, default 6 (higher is faster and larger) | yes |
| JPEG XL | jSquash, `jxl_enc.wasm` 1.4 MB | quality 75 | Effort 1–9, default 7 | yes |
| PNG | canvas | lossless | none | always |

`kit/utils/codecs/formats.ts:32`, `codecs.worker.ts:21`, `codecs.worker.ts:40`. jSquash loads its multi-threaded build only when `wasm-feature-detect` finds wasm threads, which need cross-origin isolation; the site isn't isolated, so the single-threaded builds run.

**Decode** (`codecs.worker.ts:64`): JPEG XL is recognised by signature (bare codestream `FF 0A` or the ISO container, `formats.ts:64`), so a `.jxl` with no MIME type still counts, and goes to `jxl_dec.wasm` (0.85 MB). Everything else tries `createImageBitmap` first; only an AVIF the browser can't read falls back to `avif_dec.wasm` (1.2 MB). SVG can't be decoded in a worker; `read_image` falls back to the page's `<img>` (`kit/utils/codecs/source.ts:6`, shared with Image Tools).

Wasm is fetched on first use only, never at boot, and cached by the service worker in `webos-wasm` (`vite.config.ts`, `CacheFirst` on `.wasm`), so the formats work offline afterwards.

### Worker pool

`kit/utils/codecs/index.ts`. Every encode, decode and compare is a job in a small pool.

| Rule | Value | Why |
|------|-------|-----|
| Size | `min(4, hardwareConcurrency − 1)`, at least 1 (`kit/utils/codecs/index.ts:29`) | One per lab format at most, and a core left for the page |
| Idle | A worker ends 30 s after its last job (`kit/utils/codecs/index.ts:28`) | A worker keeps its codec's wasm memory, hundreds of MB after a big AVIF, until it's gone |
| Cancel | Terminates the worker running the job (`kit/utils/codecs/index.ts:89`) | A wasm encode never yields; ending the worker is the only stop |
| Failure | A worker whose job failed is retired, never reused (`kit/utils/codecs/index.ts:56`) | A wasm abort can leave the module unusable |
| Probe | `supported(format)`: canvas formats are probed once by encoding a 1×1 canvas and checking the blob's type; wasm formats need `WebAssembly` (`kit/utils/codecs/index.ts:138`) | `convertToBlob` silently falls back to PNG |

Format Lab runs the four formats as a parallel task group (`encode-job.ts:35`): per format encode, decode the result, compare with the source, make a bitmap for the stage. Each shows in the task's tree with its size and SSIM. Settings re-encode on Encode, not live: each run is a task with a toast, so live re-encoding on every slider move would flood toasts. Only formats whose settings changed run again (`format-lab.app.svelte:86`).

### SSIM

`kit/utils/codecs/ssim.ts:33`, hand-written, run in the worker.

- **Luma**: BT.601 (`0.299 R + 0.587 G + 0.114 B`), with transparency flattened onto white, the way JPEG output is (`ssim.ts:21`).
- **Windows**: 8 × 8, every 4 px (`SSIM_WINDOW`, `SSIM_STEP`). Constants `C1 = (0.01 · 255)²`, `C2 = (0.03 · 255)²`, the standard ones.
- **Fast sums**: per band of rows, column sums of `a`, `b`, `a²`, `b²`, `ab` are built once, then each window adds up its 8 columns: about 12 operations a pixel instead of 64 (`ssim.ts:45`).
- **Score**: the mean of all windows. A uniform-window mean SSIM, not the Gaussian-weighted reference; the scores compare formats against each other, not against published numbers.
- **Map**: each window's value, `map_width × map_height`, transferred back with the result.

Hand-written (brainstorm decision 5): about 100 lines, no dependency, and it gives a per-window map for the heatmap as well as a score.

### Heatmap

`heatmap.ts:6`. Loss per window is `(1 − SSIM) / (1 − 0.75)`, clamped to 0–1: below 0.75 a window is fully coloured, since the visible losses sit between 1 and about 0.75. Alpha is `√loss`, so small losses still show. The map is painted in the theme's `--error` colour (`source-in` composite), resolved from the live theme a frame after a theme change (`format-lab.app.svelte:117`). It's laid over the image inset by half the window overlap, because the windows don't reach the right and bottom edges (`format-lab.app.svelte:100`).

### Header inspector

`header.ts:24`, by hand, no dependency.

| Format | Reads |
|--------|-------|
| AVIF | ISOBMFF boxes: `ftyp` brands (`avis` or `moov` = animated), `meta` → `pitm` → `iprp`/`ipco`/`ipma` for the primary item's properties: `ispe` size, `pixi` bit depth, `av1C` chroma and profile, `colr` (`nclx` primaries, transfer, range, or ICC), `clli` max light, alpha by auxiliary-type URN |
| JPEG XL | The codestream's bit-packed header (from the container's `jxlc` or first `jxlp` when boxed; `jbrd` means the original JPEG can be restored): size (with the ratio shortcuts), bit depth and float, extra channels and alpha, animation (tick rate, loops), orientation, XYB (lossy) or not, colour encoding and transfer |

HDR is flagged for PQ or HLG transfers, or an AVIF `clli` box.

### `convert`

Contributed by the manifest's `shell` (ADR-034), logic lazy-loaded (`commands.ts:10`, `shell.ts:37`):

```
convert <path…> --to avif|jxl|webp|jpeg|png [-q 1–100] [-o folder]
```

- Paths are images or folders (each image in the folder, not recursive), or file values piped in. Completion offers folders and image names only.
- Writes `{stem}.{ext}` beside each source, or into `--out`, never over an existing file (a free name instead). Checks write access before starting.
- Runs as a task, **one image at a time** (sequential group, `convert-job.ts:47`): a decoded photo is width × height × 4 bytes and an AVIF encode holds several times that.
- Yields `file` values, so the output pipes on. The done toast shows the size before → after and "Show folder".

`convert` is format change; `squash` (Image Tools) stays the "make smaller" batch tool.

## Data

| What | Where | Format |
|------|-------|--------|
| Per-format settings | `localStorage` `app.format-lab.settings`, `storage.persisted()` (`format-lab.app.svelte:66`) | `{ jpeg, webp, avif, jxl: { quality, effort, lossless } }` (`settings.ts:21`) |
| Saved images | Beside the source, or a picked folder (default `/home/Pictures`) | The encoded bytes |

Nothing else is stored; results live in memory until the window closes.

**Props**: `{ path }` (`FILE_PROPS`), the image to open. Format Lab is a tool for `image/*`, not an association, so an AVIF or JPEG XL still opens in Media Preview by default (`index.ts:14`).

Media Preview decodes JPEG XL through the same kit codecs, lazily.

## Dependencies & licences

| Dependency | Licence | Scope |
|------------|---------|-------|
| `@jsquash/avif` 2.1.1 (libavif, aom) | Apache-2.0 | Root, owner-approved; the kit's packages live in the root `package.json` (ADR-048) |
| `@jsquash/jxl` 1.3.0 (libjxl) | Apache-2.0 | Root, owner-approved |
| `@lilbunnyrabbit/task-manager` | MIT | Root, ADR-013 |
| `zod` | MIT | Root |

## Limits

- No speed or size figures are recorded: encode times are shown live per image but nothing was benchmarked or written down.
- Probed in Chromium only. In a browser whose canvas can't encode WebP, WebP fails with "This browser can't encode WebP".
- Big photos are memory-heavy: four parallel encodes of a 12 MP image, AVIF especially, can run a phone out of memory. Untested on a phone with a full-size photo.
- SSIM is luma-only and uniform-window: colour shifts don't count, and the score isn't comparable with other tools' SSIM.
- JPEG output flattens alpha onto white; the SSIM does the same, so a transparent source scores JPEG fairly against its own flattening, not against the transparency.
- Animated AVIF and JPEG XL are detected in the header but only the first frame is encoded or compared.
- `convert` doesn't recurse into subfolders.

## Decisions

- [Format Lab brainstorm](../brainstorm/2026-10-18_format-lab.md): the app, jSquash, the codec home in the kit, SSIM, `convert`, the worker pool, the swipe stage moving to the kit.
- [ADR-048](../adrs/048-app-kit-layer.md): the app kit.
- [ADR-034](../adrs/034-app-extension-points.md): app shell contributions.
- [ADR-013](../adrs/013-tasks-service.md): tasks.
