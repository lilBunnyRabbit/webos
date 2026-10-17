# EXIF reader

Core util · Source: `src/lib/core/utils/exif/` · Decided in [app wave 7](../../brainstorm/2026-10-17_app-wave-7.md#decided-metadata-inspector-new-app) · Used by: Metadata, PDF Tools

## Purpose

Reads image metadata from bytes, by hand, with no dependency: EXIF (camera, capture, GPS), XMP, PNG text chunks and the format's own facts. It only reads. Stripping belongs to the Metadata app, the only writer.

## Public API

`$lib/core/utils/exif` (`index.ts`):

| Export | Does |
|--------|------|
| `read_metadata(bytes: Uint8Array): Metadata` | Sync. Detects JPEG, PNG or WebP by signature; anything else gives `format: null` and empty fields. Never throws on a broken file: a block that runs past the end is skipped |
| `orientation(bytes: Uint8Array): number` | The EXIF orientation, 1 to 8. 1 when there is no EXIF, no tag, or a value out of range. Reads only the EXIF block |
| `Metadata`, `ExifTags`, `ExifValue`, `GpsPosition`, `TextEntry`, `MetadataBlock`, `ImageKind` | Types (`type.ts`) |

`Metadata`:

| Field | Holds |
|-------|-------|
| `format` | `"jpeg" \| "png" \| "webp" \| null` |
| `width`, `height` | As stored, before orientation. JPEG from the first SOF, PNG from IHDR, WebP from VP8X, else VP8 or VP8L |
| `orientation` | 1 to 8 |
| `exif` | Tags by EXIF name (`Make`, `FNumber`, `DateTimeOriginal`, `GPSLatitude`), IFD0, Exif sub-IFD and GPS IFD merged. Rationals are their quotient, several values an array, `ASCII` a trimmed string. Only tags named in `tags.ts`; unknown tags, `MakerNote` and the thumbnail IFD are skipped |
| `gps` | `{ latitude, longitude, altitude }` in decimal degrees and metres, south, west and below sea level negative; null without both coordinates |
| `text` | PNG `tEXt` / `iTXt` (latin1 / UTF-8) and JPEG `COM`. Compressed text (`zTXt`, compressed `iTXt`) shows as `Compressed, N bytes`: decompressing would make the read async |
| `details` | Format facts that aren't EXIF: bit depth, components, encoding (baseline, progressive, lossy, lossless), resolution in dpi (JFIF, `pHYs`), PNG colour type, interlace, gamma, sRGB, `tIME` as `Modified`, ICC profile, animation frames, WebP alpha |
| `xmp` | The XMP packet as text (JPEG APP1, PNG `iTXt` `XML:com.adobe.xmp`, WebP `XMP `) |
| `blocks` | Each metadata carrier with its offset and length from its first byte: `APP1 EXIF`, `APP1 XMP`, `APP2 ICC`, `APP13 IPTC`, other `APPn`, `COM`, `eXIf`, `tEXt`, `iTXt`, `zTXt`, `tIME`, `iCCP`, `EXIF`, `XMP`, `ICCP` |

Internal to the folder, also used by the Metadata app's strip: `containers.ts` walks the containers (`jpeg_segments` up to the first SOS, `jpeg_image_end`, `png_chunks`, `webp_chunks`, `image_kind`) and `tiff.ts` parses a TIFF structure.

## Behaviour & invariants

- **JPEG.** Segments are walked from SOI to the first SOS; fill bytes are skipped, standalone markers have no length. APP1 is `Exif\0\0` + TIFF or the XMP namespace; APP2 `ICC_PROFILE`; APP13 is listed as IPTC. Bytes after the main image's EOI (appended gain maps, MPF images) aren't read.
- **PNG.** Chunks from the signature to IEND. CRCs aren't checked.
- **WebP.** RIFF chunks within the RIFF size, padded to even. `EXIF` may or may not start with `Exif\0\0`; both are read.
- **TIFF.** Both byte orders. Entry counts are capped (512 per IFD, 64 values per tag), every offset is bounds-checked, and only IFD0's Exif and GPS pointers are followed, so a looping file can't hang the read. `UserComment` is read when its charset is ASCII.
- `width` and `height` ignore orientation. A JPEG with orientation 6 stored as 4000 × 3000 displays as 3000 × 4000.

## Tests

`exif.test.ts`, on hand-built bytes from `fixtures.ts` (`tiff`, `jpeg`, `png`, `webp` builders): both byte orders, GPS signs, truncated EXIF, each container's blocks, compressed text, orientation per format.

## Known gaps

- No HEIC, AVIF, TIFF or GIF.
- IPTC (APP13) is listed as a block but not decoded. XMP is returned raw, not parsed.
- Compressed PNG text isn't inflated.
