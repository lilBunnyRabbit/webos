import { describe, expect, it } from "vitest";
import { jpeg_image_end, jpeg_segments, png_chunks, webp_chunks } from "./containers";
import { concat, jpeg, latin1, png, png_chunk, riff_chunk, tiff, vp8l, vp8x, webp, type TiffEntry } from "./fixtures";
import { orientation, read_metadata } from "./index";

const CAMERA: TiffEntry[] = [
  { tag: 0x010f, type: 2, values: "Canon" },
  { tag: 0x0110, type: 2, values: "EOS R6" },
  { tag: 0x0112, type: 3, values: [6] },
  { tag: 0x0131, type: 2, values: "Lightroom" },
];
const EXPOSURE: TiffEntry[] = [
  { tag: 0x829a, type: 5, values: [0.004] },
  { tag: 0x829d, type: 5, values: [2.8] },
  { tag: 0x8827, type: 3, values: [400] },
  { tag: 0x9000, type: 7, values: [0x30, 0x32, 0x33, 0x32] },
  { tag: 0x9003, type: 2, values: "2024:05:01 12:34:56" },
  { tag: 0x927c, type: 7, values: Array.from({ length: 300 }, () => 7) },
];
const GPS: TiffEntry[] = [
  { tag: 0x01, type: 2, values: "N" },
  { tag: 0x02, type: 5, values: [46, 3, 5.5] },
  { tag: 0x03, type: 2, values: "W" },
  { tag: 0x04, type: 5, values: [14, 30, 0] },
  { tag: 0x05, type: 1, values: [1] },
  { tag: 0x06, type: 5, values: [12.5] },
];

describe("read_tiff through read_metadata", () => {
  it.each([false, true])("reads IFD0, the Exif sub-IFD and GPS (little endian: %s)", (little) => {
    const metadata = read_metadata(jpeg({ exif: tiff(CAMERA, EXPOSURE, GPS, little) }));
    expect(metadata.exif).toMatchObject({
      Make: "Canon",
      Model: "EOS R6",
      Orientation: 6,
      Software: "Lightroom",
      ExposureTime: 0.004,
      FNumber: 2.8,
      ISO: 400,
      ExifVersion: "0232",
      DateTimeOriginal: "2024:05:01 12:34:56",
    });
    expect(metadata.exif.MakerNote).toBeUndefined();
    expect(metadata.orientation).toBe(6);
    expect(metadata.gps?.latitude).toBeCloseTo(46 + 3 / 60 + 5.5 / 3600, 6);
    expect(metadata.gps?.longitude).toBeCloseTo(-14.5, 6);
    expect(metadata.gps?.altitude).toBeCloseTo(-12.5, 6);
  });

  it("survives truncated and bogus EXIF", () => {
    const whole = tiff(CAMERA, EXPOSURE, GPS);
    expect(() => read_metadata(jpeg({ exif: whole.subarray(0, 40) }))).not.toThrow();
    expect(read_metadata(jpeg({ exif: latin1("not a tiff at all") })).exif).toEqual({});
  });
});

describe("JPEG", () => {
  it("reads size, frame details, XMP, ICC and comments, and lists the blocks", () => {
    const bytes = jpeg({ exif: tiff(CAMERA), xmp: "<x:xmpmeta/>", icc: true, comment: "hello", width: 1234, height: 567 });
    const metadata = read_metadata(bytes);
    expect(metadata.format).toBe("jpeg");
    expect([metadata.width, metadata.height]).toEqual([1234, 567]);
    expect(metadata.details).toMatchObject({ "Bit depth": 8, Components: 3, Encoding: "Baseline", Resolution: "72 dpi", "ICC profile": "Embedded" });
    expect(metadata.xmp).toBe("<x:xmpmeta/>");
    expect(metadata.text).toEqual([{ key: "Comment", value: "hello" }]);
    expect(metadata.blocks.map((block) => block.kind)).toEqual(["APP1 EXIF", "APP1 XMP", "APP2 ICC", "COM"]);
    const exif = metadata.blocks[0];
    expect([bytes[exif.offset], bytes[exif.offset + 1]]).toEqual([0xff, 0xe1]);
  });

  it("walks segments up to SOS and finds the EOI past stuffed bytes and restart markers", () => {
    const bytes = jpeg({ trailing: latin1("appended image") });
    const segments = jpeg_segments(bytes);
    expect(segments.at(-1)?.marker).toBe(0xda);
    expect(jpeg_image_end(bytes, segments.at(-1)!.end)).toBe(bytes.length - "appended image".length);
  });
});

describe("PNG", () => {
  it("reads IHDR, text, time, pHYs, eXIf and XMP", () => {
    const phys = new Uint8Array(9);
    new DataView(phys.buffer).setUint32(0, 11811);
    new DataView(phys.buffer).setUint32(4, 11811);
    phys[8] = 1;
    const itxt = concat(latin1("Description\0"), [0, 0], latin1("en\0Opis\0"), new TextEncoder().encode("Ljubljana čez"));
    const metadata = read_metadata(
      png(
        png_chunk("pHYs", phys),
        png_chunk("tIME", [0x07, 0xe8, 5, 1, 12, 34, 56]),
        png_chunk("tEXt", latin1("Software\0GIMP")),
        png_chunk("iTXt", itxt),
        png_chunk("iTXt", concat(latin1("XML:com.adobe.xmp\0"), [0, 0, 0, 0], latin1("<x/>"))),
        png_chunk("zTXt", concat(latin1("Comment\0"), [0, 1, 2, 3])),
        png_chunk("eXIf", tiff(CAMERA, [], [], true))
      )
    );
    expect(metadata.format).toBe("png");
    expect([metadata.width, metadata.height]).toEqual([320, 200]);
    expect(metadata.details).toMatchObject({ "Bit depth": 8, "Colour type": "RGBA", Resolution: "300 dpi", Modified: "2024-05-01 12:34:56" });
    expect(metadata.text).toEqual([
      { key: "Software", value: "GIMP" },
      { key: "Description", value: "Ljubljana čez" },
      { key: "Comment", value: "Compressed, 3 bytes" },
    ]);
    expect(metadata.xmp).toBe("<x/>");
    expect(metadata.exif.Make).toBe("Canon");
    expect(metadata.orientation).toBe(6);
    expect(metadata.blocks.map((block) => block.kind)).toEqual(["tIME", "tEXt", "iTXt", "iTXt", "zTXt", "eXIf"]);
  });

  it("stops at a chunk that runs past the end", () => {
    const bytes = png(png_chunk("tEXt", latin1("a\0b")));
    expect(png_chunks(bytes.subarray(0, bytes.length - 5)).map((chunk) => chunk.type)).toEqual(["IHDR", "tEXt", "IDAT"]);
  });
});

describe("WebP", () => {
  it("reads VP8X, EXIF with or without its header, XMP and animation frames", () => {
    const bare = read_metadata(webp(vp8x(0x18, 800, 600), vp8l(800, 600), riff_chunk("EXIF", tiff(CAMERA)), riff_chunk("XMP ", latin1("<x/>"))));
    expect(bare).toMatchObject({ format: "webp", width: 800, height: 600, orientation: 6, xmp: "<x/>" });
    expect(bare.details).toMatchObject({ Alpha: "Yes", Encoding: "Lossless" });
    expect(bare.blocks.map((block) => block.kind)).toEqual(["EXIF", "XMP"]);

    const headed = read_metadata(webp(vp8x(0x0a, 10, 10), riff_chunk("ANMF", [1]), riff_chunk("ANMF", [2]), riff_chunk("EXIF", concat(latin1("Exif\0\0"), tiff(CAMERA)))));
    expect(headed.exif.Model).toBe("EOS R6");
    expect(headed.details.Animated).toBe("2 frames");
  });

  it("reads a simple lossless WebP's size from VP8L and pads odd chunks", () => {
    const bytes = webp(riff_chunk("ODD!", [1, 2, 3]), vp8l(17, 9));
    expect(webp_chunks(bytes).map((chunk) => chunk.type)).toEqual(["ODD!", "VP8L"]);
    expect(read_metadata(bytes)).toMatchObject({ width: 17, height: 9, orientation: 1 });
  });
});

describe("orientation", () => {
  it("is the EXIF value in every format, 1 without one or when out of range", () => {
    expect(orientation(jpeg({ exif: tiff(CAMERA) }))).toBe(6);
    expect(orientation(png(png_chunk("eXIf", tiff(CAMERA))))).toBe(6);
    expect(orientation(webp(vp8l(1, 1), riff_chunk("EXIF", tiff(CAMERA))))).toBe(6);
    expect(orientation(jpeg())).toBe(1);
    expect(orientation(jpeg({ exif: tiff([{ tag: 0x0112, type: 3, values: [9] }]) }))).toBe(1);
    expect(orientation(latin1("GIF89a"))).toBe(1);
  });

  it("gives an unknown format nothing", () => {
    expect(read_metadata(new Uint8Array([1, 2, 3]))).toMatchObject({ format: null, exif: {}, blocks: [] });
  });
});
