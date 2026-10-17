import { describe, expect, it } from "vitest";
import { orientation, read_metadata } from "$lib/core/utils/exif";
import { JPEG_SCAN, concat, jpeg, latin1, png, png_chunk, riff_chunk, tiff, vp8l, vp8x, webp, type TiffEntry } from "$lib/core/utils/exif/fixtures";
import { png_chunks, webp_chunks } from "$lib/core/utils/exif/containers";
import { crc32 } from "$lib/core/utils/zip/crc32";
import { strip_metadata, stripped_name } from "./strip";

const TAGS: TiffEntry[] = [
  { tag: 0x010f, type: 2, values: "Canon" },
  { tag: 0x0112, type: 3, values: [6] },
];
const GPS: TiffEntry[] = [
  { tag: 0x02, type: 5, values: [46, 0, 0] },
  { tag: 0x04, type: 5, values: [14, 0, 0] },
];

function contains(haystack: Uint8Array, needle: readonly number[]): boolean {
  outer: for (let at = 0; at <= haystack.length - needle.length; at++) {
    for (let index = 0; index < needle.length; index++) if (haystack[at + index] !== needle[index]) continue outer;
    return true;
  }
  return false;
}

describe("strip_metadata: JPEG", () => {
  const original = jpeg({ exif: tiff(TAGS, [], GPS), xmp: "<x/>", comment: "secret", icc: true, trailing: latin1("gain map") });

  it("drops EXIF, XMP, comments and appended data, keeps JFIF, ICC and the image bytes", () => {
    const { bytes, removed } = strip_metadata(original, { keep_orientation: false });
    const metadata = read_metadata(bytes);
    expect(removed).toBe(4);
    expect(metadata.exif).toEqual({});
    expect(metadata.xmp).toBeNull();
    expect(metadata.text).toEqual([]);
    expect(metadata.blocks.map((block) => block.kind)).toEqual(["APP2 ICC"]);
    expect(metadata.details.Resolution).toBe("72 dpi");
    expect([metadata.width, metadata.height]).toEqual([640, 480]);
    expect(contains(bytes, JPEG_SCAN)).toBe(true);
    expect(bytes.slice(-2)).toEqual(Uint8Array.from([0xff, 0xd9]));
  });

  it("keeps only the orientation when asked", () => {
    const { bytes } = strip_metadata(original, { keep_orientation: true });
    expect(read_metadata(bytes).exif).toEqual({ Orientation: 6 });
    expect(bytes[2 + 18 + 1]).toBe(0xe1);
  });

  it("writes no EXIF for an upright image even when keeping orientation", () => {
    const upright = jpeg({ exif: tiff([{ tag: 0x010f, type: 2, values: "Canon" }]) });
    expect(read_metadata(strip_metadata(upright, { keep_orientation: true }).bytes).blocks).toEqual([]);
  });

  it("is a no-op on a clean file", () => {
    const clean = jpeg();
    expect(strip_metadata(clean, { keep_orientation: false })).toEqual({ bytes: clean, removed: 0 });
  });
});

describe("strip_metadata: PNG", () => {
  const original = png(
    png_chunk("tEXt", latin1("Author\0me")),
    png_chunk("tIME", [0x07, 0xe8, 1, 1, 0, 0, 0]),
    png_chunk("eXIf", tiff(TAGS)),
    png_chunk("iCCP", latin1("sRGB\0\0x"))
  );

  it("drops text, time and eXIf; keeps colour chunks and the image data", () => {
    const { bytes, removed } = strip_metadata(original, { keep_orientation: false });
    expect(removed).toBe(3);
    expect(png_chunks(bytes).map((chunk) => chunk.type)).toEqual(["IHDR", "iCCP", "IDAT", "IEND"]);
  });

  it("puts an orientation-only eXIf with a valid CRC after IHDR", () => {
    const { bytes } = strip_metadata(original, { keep_orientation: true });
    const chunks = png_chunks(bytes);
    expect(chunks.map((chunk) => chunk.type)).toEqual(["IHDR", "eXIf", "iCCP", "IDAT", "IEND"]);
    const exif = chunks[1];
    const stored = new DataView(bytes.buffer, bytes.byteOffset).getUint32(exif.end - 4);
    expect(stored).toBe(crc32(bytes.subarray(exif.start + 4, exif.end - 4)));
    expect(orientation(bytes)).toBe(6);
  });
});

describe("strip_metadata: WebP", () => {
  const original = webp(vp8x(0x0c | 0x10, 8, 8), vp8l(8, 8), riff_chunk("EXIF", tiff(TAGS)), riff_chunk("XMP ", latin1("<x/>")));

  it("drops EXIF and XMP, clears their VP8X flags and fixes the RIFF size", () => {
    const { bytes, removed } = strip_metadata(original, { keep_orientation: false });
    expect(removed).toBe(2);
    expect(webp_chunks(bytes).map((chunk) => chunk.type)).toEqual(["VP8X", "VP8L"]);
    expect(bytes[20]).toBe(0x10);
    expect(new DataView(bytes.buffer).getUint32(4, true)).toBe(bytes.length - 8);
  });

  it("keeps the orientation in a fresh EXIF chunk with its flag", () => {
    const { bytes } = strip_metadata(original, { keep_orientation: true });
    expect(webp_chunks(bytes).map((chunk) => chunk.type)).toEqual(["VP8X", "VP8L", "EXIF"]);
    expect(bytes[20]).toBe(0x18);
    expect(read_metadata(bytes).exif).toEqual({ Orientation: 6 });
  });
});

describe("strip_metadata", () => {
  it("refuses other formats", () => {
    expect(() => strip_metadata(concat(latin1("%PDF-1.7")), { keep_orientation: false })).toThrow(/JPEG, PNG and WebP/);
  });
});

describe("stripped_name", () => {
  it("adds -clean before the extension", () => {
    expect(stripped_name("IMG_0001.JPG")).toBe("IMG_0001-clean.JPG");
    expect(stripped_name("photo.final.webp")).toBe("photo.final-clean.webp");
    expect(stripped_name("noext")).toBe("noext-clean");
  });
});
