import { describe, expect, it } from "vitest";
import { Container, count_bytes, describe_text, entropy, gunzip_head, gzip_identity, identify, scan, scan_state, sniff, with_entropy, zip_identity } from "./identify";

const text = (source: string) => new TextEncoder().encode(source);

function bytes(...parts: (number | number[] | string | Uint8Array)[]): Uint8Array<ArrayBuffer> {
  const values: number[] = [];
  for (const part of parts) {
    if (typeof part === "number") values.push(part);
    else if (typeof part === "string") values.push(...Array.from(part, (char) => char.charCodeAt(0)));
    else values.push(...part);
  }
  return new Uint8Array(values);
}

const be32 = (value: number) => [value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
const le16 = (value: number) => [value & 0xff, value >>> 8];
const le32 = (value: number) => [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, value >>> 24];
const zeros = (count: number) => new Array<number>(count).fill(0);

const png = (width: number, height: number) => bytes(0x89, "PNG\r\n\x1a\n", be32(13), "IHDR", be32(width), be32(height), 8, 6, 0, 0, 0, zeros(4));

const jpeg = (width: number, height: number) =>
  bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16, "JFIF\0", 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc0, 0, 17, 8, height >> 8, height & 0xff, width >> 8, width & 0xff, 3, zeros(9), 0xff, 0xda);

function zip_local(name: string, data = "", method = 0): Uint8Array<ArrayBuffer> {
  return bytes(le32(0x04034b50), le16(20), le16(0), le16(method), zeros(8), le32(data.length), le32(data.length), le16(name.length), le16(0), name, data);
}

function tar(name: string, size: number): Uint8Array<ArrayBuffer> {
  const header = new Uint8Array(512);
  header.set(text(name), 0);
  header.set(text("0000644\0"), 100);
  header.set(text(`${size.toString(8).padStart(11, "0")}\0`), 124);
  header.set(text("ustar\0"), 257);
  header.set(text("00"), 263);
  header.fill(0x20, 148, 156);
  const sum = header.reduce((total, byte) => total + byte, 0);
  header.set(text(`${sum.toString(8).padStart(6, "0")}\0 `), 148);
  return bytes(header, zeros(Math.ceil(size / 512) * 512));
}

describe("sniff: images", () => {
  it("reads PNG dimensions and colour type from IHDR", () => {
    expect(sniff(png(640, 480))).toMatchObject({ type: "PNG image", details: "640 × 480, 8-bit RGBA" });
  });

  it("finds JPEG dimensions in the SOF segment", () => {
    expect(sniff(jpeg(1920, 1080))).toMatchObject({ type: "JPEG image", details: "1920 × 1080" });
  });

  it("reads GIF and BMP headers", () => {
    expect(sniff(bytes("GIF89a", le16(32), le16(16), zeros(8)))).toMatchObject({ type: "GIF image", details: "32 × 16, GIF89a" });
    const bmp = bytes("BM", le32(70), zeros(4), le32(54), le32(40), le32(2), le32(3), le16(1), le16(24), zeros(24));
    expect(sniff(bmp)).toMatchObject({ type: "BMP image", details: "2 × 3, 24-bit" });
  });

  it("tells WebP from WAV inside RIFF", () => {
    const webp = bytes("RIFF", le32(30), "WEBP", "VP8X", le32(10), zeros(4), [99, 0, 0], [49, 0, 0]);
    expect(sniff(webp)).toMatchObject({ type: "WebP image", details: "100 × 50, extended" });
    const wav = bytes("RIFF", le32(36), "WAVE", "fmt ", le32(16), le16(1), le16(2), le32(44100), le32(176400), le16(4), le16(16));
    expect(sniff(wav)).toMatchObject({ type: "WAV audio", details: "PCM, 44.1 kHz, 16-bit, stereo" });
  });

  it("reads AIFF's extended-precision sample rate", () => {
    const aiff = bytes("FORM", be32(46), "AIFF", "COMM", be32(18), 0, 2, be32(1000), 0, 16, 0x40, 0x0e, be32(0xac440000), zeros(4));
    expect(sniff(aiff)).toMatchObject({ type: "AIFF audio", details: "44.1 kHz, 16-bit, stereo" });
  });
});

describe("sniff: documents, archives and executables", () => {
  it("reads the PDF version", () => {
    expect(sniff(text("%PDF-1.7\n%âãÏÓ"))).toMatchObject({ type: "PDF document", details: "version 1.7" });
  });

  it("marks zips as a container and reads an EPUB from its mimetype entry", () => {
    expect(sniff(zip_local("hello.txt", "hi"))).toMatchObject({ type: "Zip archive", container: Container.ZIP });
    expect(sniff(zip_local("mimetype", "application/epub+zip"))).toMatchObject({ type: "EPUB ebook", container: Container.ZIP });
  });

  it("names gzip's original file and checks reserved flags", () => {
    expect(sniff(bytes(0x1f, 0x8b, 8, 0x08, zeros(4), 0, 3, "notes.txt\0"))).toMatchObject({ type: "gzip compressed data", details: "was notes.txt" });
    expect(sniff(bytes(0x1f, 0x8b, 8, 0xe0, zeros(6)))).toBeNull();
  });

  it("validates a tar header by its checksum", () => {
    expect(sniff(tar("readme.md", 10))).toMatchObject({ type: "tar archive", details: "first entry readme.md", span: 1024 });
    const broken = tar("readme.md", 10);
    broken[0] = 0x58;
    expect(sniff(broken)).toBeNull();
  });

  it("knows 7z, RAR, xz, bzip2, wasm and SQLite", () => {
    expect(sniff(bytes(0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0, 4))?.type).toBe("7-Zip archive");
    expect(sniff(bytes("Rar!\x1a\x07\x01\x00"))).toMatchObject({ type: "RAR archive", details: "version 5" });
    expect(sniff(bytes(0xfd, "7zXZ", 0))?.type).toBe("xz compressed data");
    expect(sniff(bytes("BZh9", "1AY&SY"))?.type).toBe("bzip2 compressed data");
    expect(sniff(bytes(0, "asm", le32(1)))?.type).toBe("WebAssembly module");
    expect(sniff(bytes("SQLite format 3\0", 0x10, 0))).toMatchObject({ type: "SQLite 3 database", details: "4096-byte pages" });
  });

  it("decodes ELF, Mach-O and PE headers", () => {
    const elf = bytes(0x7f, "ELF", 2, 1, 1, zeros(9), le16(3), le16(0x3e), zeros(4));
    expect(sniff(elf)).toMatchObject({ type: "ELF shared object", details: "64-bit, x86-64, little-endian" });
    const macho = bytes(0xcf, 0xfa, 0xed, 0xfe, le32(0x0100000c), le32(0), le32(2));
    expect(sniff(macho)).toMatchObject({ type: "Mach-O executable", details: "64-bit, ARM64" });
    const pe = new Uint8Array(0x200);
    pe.set(text("MZ"), 0);
    pe.set(le32(0x80), 0x3c);
    pe.set(text("PE\0\0"), 0x80);
    pe.set(le16(0x8664), 0x84);
    pe.set(le16(0x20b), 0x98);
    pe.set(le16(3), 0x98 + 68);
    expect(sniff(pe)).toMatchObject({ type: "PE32+ executable", details: "x86-64, console" });
    expect(sniff(text("MZ is just text here"))).toBeNull();
  });
});

describe("sniff: media and fonts", () => {
  it("reads MP3 frames, behind an ID3 tag too", () => {
    const frame = [0xff, 0xfb, 0x90, 0x00];
    expect(sniff(bytes(frame, zeros(4)))).toMatchObject({ type: "MP3 audio", details: "128 kbps, 44.1 kHz, stereo" });
    expect(sniff(bytes("ID3", 4, 0, 0, 0, 0, 0, 2, zeros(2), frame))).toMatchObject({ type: "MP3 audio", details: "ID3v2.4, 128 kbps, 44.1 kHz, stereo" });
  });

  it("names MP4-family files by brand", () => {
    expect(sniff(bytes(be32(24), "ftypisom", zeros(12)))?.type).toBe("MP4 video");
    expect(sniff(bytes(be32(24), "ftypheic", zeros(12)))?.type).toBe("HEIF image");
  });

  it("tells WebM from Matroska and reads Ogg and FLAC headers", () => {
    expect(sniff(bytes(0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84, "webm"))?.type).toBe("WebM video");
    const ogg = bytes("OggS", 0, 2, zeros(20), 1, 30, 1, "vorbis", zeros(4), 2, le32(48000));
    expect(sniff(ogg)).toMatchObject({ type: "Ogg Vorbis audio", details: "48 kHz, stereo" });
    const flac = bytes("fLaC", 0x80, 0, 0, 34, zeros(10), 0x0a, 0xc4, 0x42, 0xf0, zeros(20));
    expect(sniff(flac)).toMatchObject({ type: "FLAC audio", details: "44.1 kHz, 16-bit, stereo" });
  });

  it("checks sfnt's search range before calling it a font", () => {
    expect(sniff(bytes(0, 1, 0, 0, 0, 12, 0, 128, 0, 3, 0, 64))).toMatchObject({ type: "TrueType font", details: "12 tables" });
    expect(sniff(bytes(0, 1, 0, 0, 0, 12, 0, 128, 0, 3, 0, 60))).toBeNull();
    expect(sniff(bytes("wOF2", be32(0x00010000), be32(1000), 0, 9))).toMatchObject({ type: "WOFF2 font", details: "9 tables" });
  });
});

describe("describe_text", () => {
  it("tells ASCII from UTF-8 and counts lines", () => {
    expect(describe_text(text("hello\nworld\n"), true)).toEqual({ type: "ASCII text", details: "LF line endings, 2 lines" });
    expect(describe_text(text("čšž\r\nend"), true)).toEqual({ type: "UTF-8 text", details: "CRLF line endings, 2 lines" });
  });

  it("notes a BOM and mixed line endings", () => {
    expect(describe_text(bytes(0xef, 0xbb, 0xbf, "a\nb\r\nc"), true)?.details).toBe("with BOM, mixed line endings, 3 lines");
  });

  it("recognises JSON, XML, SVG, HTML and scripts", () => {
    expect(describe_text(text('{"a": 1}'), true)).toEqual({ type: "JSON data", details: "ASCII, no line breaks, 1 line" });
    expect(describe_text(text("{not json"), true)?.type).toBe("ASCII text");
    expect(describe_text(text('<?xml version="1.0"?>\n<svg xmlns="x"/>'), true)?.type).toBe("SVG image");
    expect(describe_text(text('<?xml version="1.0"?>\n<root/>'), true)?.type).toBe("XML document");
    expect(describe_text(text("<!DOCTYPE html><html></html>"), true)?.type).toBe("HTML document");
    expect(describe_text(text("#!/usr/bin/env python3\nprint(1)"), true)?.type).toBe("python3 script");
    expect(describe_text(text("#!/bin/sh\necho"), true)?.type).toBe("sh script");
  });

  it("skips the line count when only the head was read, and tolerates a cut UTF-8 sequence", () => {
    const head = text("ž".repeat(10)).subarray(0, 19);
    expect(describe_text(head, false)).toEqual({ type: "UTF-8 text", details: "no line breaks" });
  });

  it("treats NULs and control bytes as binary, Latin-1 as ISO-8859", () => {
    expect(describe_text(bytes("abc", 0, "def"), true)).toBeNull();
    expect(describe_text(bytes(1, 2, 3, 4, 5, 6, 7, 8), true)).toBeNull();
    expect(describe_text(bytes("caf", 0xe9), true)?.type).toBe("ISO-8859 text");
  });
});

describe("identify", () => {
  it("falls back from signatures to text to data", () => {
    expect(identify(new Uint8Array(0), 0).type).toBe("empty");
    expect(identify(png(1, 1), 33).type).toBe("PNG image");
    expect(identify(text("plain"), 5).type).toBe("ASCII text");
    expect(identify(bytes(0, 1, 2, 0xfe, 0, 9), 6).type).toBe("data");
  });
});

describe("zip_identity and gzip_identity", () => {
  const zip = { type: "Zip archive", details: "", container: Container.ZIP };

  it("names Office, Android and Java archives by their entries", () => {
    expect(zip_identity(["[Content_Types].xml", "word/", "word/document.xml"], zip)).toMatchObject({ type: "Word document (docx)", details: "2 files" });
    expect(zip_identity(["AndroidManifest.xml", "classes.dex"], zip).type).toBe("Android package (apk)");
    expect(zip_identity(["META-INF/MANIFEST.MF", "a.class"], zip).type).toBe("Java archive (jar)");
    expect(zip_identity(["a.txt"], zip).type).toBe("Zip archive");
    expect(zip_identity(["mimetype", "META-INF/MANIFEST.MF"], { ...zip, type: "EPUB ebook" }).type).toBe("EPUB ebook");
  });

  it("finds a tar inside a gzip from the head alone", async () => {
    const archive = bytes(tar("src/main.ts", 100), tar("src/util.ts", 2000));
    const packed = new Uint8Array(await new Response(new Blob([archive]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
    const inner = await gunzip_head(packed.slice(0, Math.min(packed.length, 200)));
    expect(inner?.length).toBeGreaterThan(0);
    const full = await gunzip_head(packed);
    const base = { type: "gzip compressed data", details: "", container: Container.GZIP };
    expect(gzip_identity(full, base)).toEqual({ type: "gzip compressed tar archive", details: "first entry src/main.ts" });
    expect(gzip_identity(null, base)).toBe(base);
  });
});

describe("entropy", () => {
  it("is 0 for one repeated byte and 8 for every byte equally often", () => {
    const same = new Float64Array(256);
    count_bytes(same, new Uint8Array(1000).fill(7));
    expect(entropy(same)).toBe(0);
    const uniform = new Float64Array(256);
    count_bytes(uniform, Uint8Array.from({ length: 256 * 4 }, (_, index) => index & 0xff));
    expect(entropy(uniform)).toBeCloseTo(8);
    expect(entropy(new Float64Array(256))).toBe(0);
  });

  it("counts across chunks the same as all at once", () => {
    const data = text("abracadabra");
    const whole = new Float64Array(256);
    count_bytes(whole, data);
    const parts = new Float64Array(256);
    count_bytes(parts, data.subarray(0, 4));
    count_bytes(parts, data.subarray(4));
    expect(entropy(parts)).toBe(entropy(whole));
    expect(entropy(whole)).toBeCloseTo(2.04, 2);
  });

  it("flags high-entropy unknown data only", () => {
    expect(with_entropy({ type: "data", details: "" }, 7.99).details).toBe("looks compressed or encrypted");
    expect(with_entropy({ type: "data", details: "" }, 5).details).toBe("");
    expect(with_entropy({ type: "PNG image", details: "1 × 1" }, 7.99).details).toBe("1 × 1");
  });
});

describe("scan", () => {
  const run = (data: Uint8Array) => scan(data, 0, data.length, scan_state());

  it("lists embedded files by offset and skips the file itself at 0", () => {
    const jpeg_at = 33 + 12;
    const data = bytes(png(4, 4), text("filler text "), jpeg(8, 8), zeros(16), "%PDF-1.4\n");
    expect(run(data).map(({ offset, type }) => ({ offset, type }))).toEqual([
      { offset: jpeg_at, type: "JPEG image" },
      { offset: jpeg_at + jpeg(8, 8).length + 16, type: "PDF document" },
    ]);
  });

  it("reports one zip, not each of its entries, and a new zip after the end record", () => {
    const end = bytes(le32(0x06054b50), zeros(18));
    const data = bytes(text("head"), zip_local("a.txt", "aa"), zip_local("b.txt", "bb"), end, zip_local("c.txt"));
    const hits = run(data);
    expect(hits.map((hit) => hit.offset)).toEqual([4, 4 + 37 + 37 + 22]);
    expect(hits[0].details).toBe("first entry a.txt");
  });

  it("skips a tar's own later headers but lists one appended after it", () => {
    const archive = bytes(tar("a", 10), tar("b", 600));
    const data = bytes(archive, zeros(1024), tar("c", 0));
    expect(run(data).map((hit) => hit.offset)).toEqual([archive.length + 1024]);
  });

  it("ignores chance matches that fail validation", () => {
    const noise = bytes("BM", zeros(4), "MZ", zeros(64), "ID3", 9, "OggS", 1, 0, "\x00\x01\x00\x00", 0, 200);
    expect(run(noise)).toEqual([]);
    const audio = bytes(zeros(8), 0xff, 0xd8, 0xff, 0xc0, 0, 17, 0xff, 0xff, 0xff, 0xff, zeros(16));
    expect(run(audio)).toEqual([]);
  });

  it("carries state and offsets across chunks", () => {
    const data = bytes(zeros(10), png(2, 2));
    const state = scan_state();
    expect(scan(data, 0, 8, state)).toEqual([]);
    expect(scan(data.subarray(8), 8, data.length - 8, state)).toEqual([{ offset: 10, type: "PNG image", details: "2 × 2, 8-bit RGBA" }]);
  });
});
