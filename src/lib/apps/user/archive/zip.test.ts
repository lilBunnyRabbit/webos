import { describe, expect, it } from "vitest";
import { crc32 } from "./crc32";
import { Flag, Method, ZipError, decode_name, deflate_raw, from_dos_datetime, inflate_raw, safe_segments, to_dos_datetime } from "./zip-format";
import { entry_blob, read_zip, readable, type ZipArchive } from "./zip-read";
import { write_zip, type ZipSource } from "./zip-write";

// Made with Info-ZIP 3.0 (`zip -X -r -n .bin`): folders, a stored .bin, a deflated .txt and an empty file.
const INFOZIP =
  "UEsDBAoAAAAAANWDIlgAAAAAAAAAAAAAAAAFAAAAZG9jcy9QSwMECgAAAAAA1YMiWHh3pg8MAAAADAAAAAwAAABkb2NzL3Jhdy5iaW5zdG9yZWQgYnl0ZXNQSwMECgAAAAAA1YMiWAAAAAAAAAAAAAAAAA8AAABkb2NzL2VtcHR5LWRpci9QSwMEFAAAAAgA1YMiWOBTM40QAAAAHgAAAA4AAABkb2NzL2hlbGxvLnR4dMtIzcnJV8jAIMvzi3JSuABQSwMECgAAAAAA1YMiWAAAAAAAAAAAAAAAAAkAAABlbXB0eS50eHRQSwECHgMKAAAAAADVgyJYAAAAAAAAAAAAAAAABQAAAAAAAAAAABAA7UEAAAAAZG9jcy9QSwECHgMKAAAAAADVgyJYeHemDwwAAAAMAAAADAAAAAAAAAAAAAAApIEjAAAAZG9jcy9yYXcuYmluUEsBAh4DCgAAAAAA1YMiWAAAAAAAAAAAAAAAAA8AAAAAAAAAAAAQAO1BWQAAAGRvY3MvZW1wdHktZGlyL1BLAQIeAxQAAAAIANWDIljgUzONEAAAAB4AAAAOAAAAAAAAAAEAAACkgYYAAABkb2NzL2hlbGxvLnR4dFBLAQIeAwoAAAAAANWDIlgAAAAAAAAAAAAAAAAJAAAAAAAAAAAAAACkgcIAAABlbXB0eS50eHRQSwUGAAAAAAUABQAdAQAA6QAAAAAA";
// Python's zipfile: a UTF-8 name (flag bit 11).
const PY_UTF8 =
  "UEsDBBQAAAgIANV7IliCjI5QDgAAAAwAAAAXAAAAxI3FocW+L8O8YmVyIOaXpeacrC50eHQrzctMzk9JVXg0ZzIXAFBLAQIUAxQAAAgIANV7IliCjI5QDgAAAAwAAAAXAAAAAAAAAAAAAACAAQAAAADEjcWhxb4vw7xiZXIg5pel5pysLnR4dFBLBQYAAAAAAQABAEUAAABDAAAAAAA=";
// Info-ZIP reading stdin (`zip - -`): ZIP64 end records and a ZIP64 local extra.
const ZIP64 =
  "UEsDBC0AAAAIACGuTl2DyaYx//////////8BABQALQEAEAAcAAAAAAAAABQAAAAAAAAAKy4pSk3MTU1RSEksSVQoRuZxAQBQSwECHgMtAAAACAAhrk5dg8mmMRQAAAAcAAAAAQAAAAAAAAABAAAAsBEAAAAALVBLBgYsAAAAAAAAAB4DLQAAAAAAAAAAAAEAAAAAAAAAAQAAAAAAAAAvAAAAAAAAAEcAAAAAAAAAUEsGBwAAAAB2AAAAAAAAAAEAAABQSwUGAAAAAAEAAQAvAAAARwAAAAAA";
// Python's zipfile writing to an unseekable stream: a data descriptor after the data (flag bit 3), zeros in the local header.
const DESCRIPTOR =
  "UEsDBBQACAAIANV7IlgAAAAAAAAAAAAAAAAGAAAAZGQudHh0S0ktTi7KLCjJL1JIwcbkAgBQSwcIZBPRTBEAAAAhAAAAUEsBAhQDFAAIAAgA1XsiWGQT0UwRAAAAIQAAAAYAAAAAAAAAAAAAAIABAAAAAGRkLnR4dFBLBQYAAAAAAQABADQAAABFAAAAAAA=";

const bytes = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
const blob = (base64: string) => new Blob([bytes(base64)]);
const text = async (archive: ZipArchive, source: Blob, name: string) =>
  await (await entry_blob(source, archive.entries.find((entry) => entry.name === name)!)).text();

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("is 0 for nothing and continues across chunks", () => {
    const data = new TextEncoder().encode("The quick brown fox jumps over the lazy dog");
    expect(crc32(new Uint8Array())).toBe(0);
    expect(crc32(data)).toBe(0x414fa339);
    expect(crc32(data.subarray(10), crc32(data.subarray(0, 10)))).toBe(0x414fa339);
  });
});

describe("format helpers", () => {
  it("round-trips DOS date and time to two seconds", () => {
    const date = new Date(2024, 0, 2, 15, 30, 43);
    const dos = to_dos_datetime(date);
    expect(from_dos_datetime(dos.time, dos.date)).toEqual(new Date(2024, 0, 2, 15, 30, 42));
  });

  it("clamps dates before 1980", () => {
    const dos = to_dos_datetime(new Date(1970, 5, 1));
    expect(from_dos_datetime(dos.time, dos.date)).toEqual(new Date(1980, 0, 1, 0, 0, 0));
  });

  it("decodes CP437 without the UTF-8 flag", () => {
    expect(decode_name(new Uint8Array([0x63, 0x61, 0x66, 0x82]), false)).toBe("café");
    expect(decode_name(new TextEncoder().encode("café"), true)).toBe("café");
  });

  it("keeps extraction paths inside the target", () => {
    expect(safe_segments("../../etc/passwd")).toEqual(["etc", "passwd"]);
    expect(safe_segments("/abs/./a.txt")).toEqual(["abs", "a.txt"]);
    expect(safe_segments("C:\\Users\\x.txt")).toEqual(["Users", "x.txt"]);
    expect(safe_segments("..")).toEqual([]);
  });

  it("deflates and inflates raw data", async () => {
    const data = new TextEncoder().encode("abcabcabcabcabcabc");
    const packed = await deflate_raw(data);
    expect(packed.length).toBeLessThan(data.length);
    expect(await inflate_raw(packed)).toEqual(data);
  });
});

describe("read_zip", () => {
  it("reads an Info-ZIP archive: folders, stored, deflated, empty", async () => {
    const source = blob(INFOZIP);
    const archive = await read_zip(source);
    expect(archive.zip64).toBe(false);
    expect(archive.entries.map((entry) => [entry.name, entry.directory, entry.method, entry.size, entry.compressed_size])).toEqual([
      ["docs/", true, Method.STORE, 0, 0],
      ["docs/raw.bin", false, Method.STORE, 12, 12],
      ["docs/empty-dir/", true, Method.STORE, 0, 0],
      ["docs/hello.txt", false, Method.DEFLATE, 30, 16],
      ["empty.txt", false, Method.STORE, 0, 0],
    ]);
    expect(archive.entries[3].crc).toBe(0x8d3353e0);
    expect(archive.entries[3].path).toEqual(["docs", "hello.txt"]);
    expect(await text(archive, source, "docs/hello.txt")).toBe("hello hello hello hello world\n");
    expect(await text(archive, source, "docs/raw.bin")).toBe("stored bytes");
    expect(await text(archive, source, "empty.txt")).toBe("");
  });

  it("reads UTF-8 names", async () => {
    const source = blob(PY_UTF8);
    const archive = await read_zip(source);
    const [entry] = archive.entries;
    expect(entry.name).toBe("čšž/über 日本.txt");
    expect(entry.flags & Flag.UTF8).toBeTruthy();
    expect(entry.modified).toEqual(new Date(2024, 0, 2, 15, 30, 42));
    expect(await text(archive, source, entry.name)).toBe("unicode ✓\n");
  });

  it("reads ZIP64 end records", async () => {
    const source = blob(ZIP64);
    const archive = await read_zip(source);
    expect(archive.zip64).toBe(true);
    expect(archive.entries).toHaveLength(1);
    expect(await text(archive, source, "-")).toBe("streamed data streamed data\n");
  });

  it("reads entries written with a data descriptor", async () => {
    const source = blob(DESCRIPTOR);
    const archive = await read_zip(source);
    expect(archive.entries[0].flags & Flag.DESCRIPTOR).toBeTruthy();
    expect(await text(archive, source, "dd.txt")).toBe("descriptor descriptor descriptor\n");
  });

  it("rejects a damaged entry by its checksum", async () => {
    const data = bytes(INFOZIP);
    const at = data.indexOf(0x73, 0x23 + 12 + 30);
    data[at] ^= 1;
    const source = new Blob([data]);
    const archive = await read_zip(source);
    await expect(entry_blob(source, archive.entries[1])).rejects.toThrow(/checksum/);
  });

  it("stops reading when cancelled, keeping the abort as the error", async () => {
    const source = blob(INFOZIP);
    const archive = await read_zip(source);
    const controller = new AbortController();
    controller.abort(new DOMException("Cancelled", "AbortError"));
    await expect(entry_blob(source, archive.entries[3], { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects what isn't a zip", async () => {
    await expect(read_zip(new Blob(["just text, no zip here"]))).rejects.toBeInstanceOf(ZipError);
    await expect(read_zip(new Blob([]))).rejects.toBeInstanceOf(ZipError);
  });

  it("flags encrypted and unknown methods as unreadable", async () => {
    const archive = await read_zip(blob(INFOZIP));
    expect(readable(archive.entries[3])).toBe(true);
    expect(readable({ ...archive.entries[3], method: 14 })).toBe(false);
    expect(readable({ ...archive.entries[3], encrypted: true })).toBe(false);
  });
});

describe("write_zip", () => {
  const modified = new Date(2025, 4, 6, 7, 8, 10);
  const repetitive = "na ".repeat(5000) + "batman";
  const noise = crypto.getRandomValues(new Uint8Array(4096));
  const sources: ZipSource[] = [
    { name: "folder", directory: true, modified },
    { name: "folder/song.txt", data: new Blob([repetitive]), modified },
    { name: "folder/empty.txt", data: new Blob([]), modified },
    { name: "noise.bin", data: new Blob([noise]), modified },
    { name: "žabe/日本語 ✓.md", data: new Blob(["# unicode\n"]), modified },
  ];

  for (const method of [Method.STORE, Method.DEFLATE]) {
    it(`round-trips with method ${method}`, async () => {
      const zip = await write_zip(sources, { method });
      const archive = await read_zip(zip);
      expect(archive.entries.map((entry) => entry.name)).toEqual([
        "folder/",
        "folder/song.txt",
        "folder/empty.txt",
        "noise.bin",
        "žabe/日本語 ✓.md",
      ]);
      expect(archive.entries[0].directory).toBe(true);
      expect(archive.entries.every((entry) => entry.modified.getTime() === modified.getTime())).toBe(true);
      expect(await text(archive, zip, "folder/song.txt")).toBe(repetitive);
      expect(await text(archive, zip, "folder/empty.txt")).toBe("");
      expect(await text(archive, zip, "žabe/日本語 ✓.md")).toBe("# unicode\n");
      const noise_entry = archive.entries[3];
      expect(new Uint8Array(await (await entry_blob(zip, noise_entry)).arrayBuffer())).toEqual(noise);
      expect(noise_entry.method).toBe(Method.STORE);
      expect(archive.entries[1].method).toBe(method);
      if (method === Method.DEFLATE) expect(archive.entries[1].compressed_size).toBeLessThan(200);
    });
  }

  it("sets the UTF-8 flag only on non-ASCII names", async () => {
    const archive = await read_zip(await write_zip(sources, { method: Method.DEFLATE }));
    expect(archive.entries[1].flags & Flag.UTF8).toBe(0);
    expect(archive.entries[4].flags & Flag.UTF8).toBe(Flag.UTF8);
  });

  it("reports every uncompressed byte as progress, reading too", async () => {
    let written = 0;
    const zip = await write_zip(sources, { method: Method.DEFLATE, on_bytes: (n) => (written += n) });
    const total = repetitive.length + noise.length + "# unicode\n".length;
    expect(written).toBe(total);

    let read = 0;
    const archive = await read_zip(zip);
    for (const entry of archive.entries) await entry_blob(zip, entry, { on_bytes: (n) => (read += n) });
    expect(read).toBe(total);
  });

  it("stops when cancelled", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("Cancelled", "AbortError"));
    await expect(write_zip(sources, { method: Method.DEFLATE, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("writes an empty archive that reads back empty", async () => {
    const zip = await write_zip([], { method: Method.DEFLATE });
    expect(zip.size).toBe(22);
    expect((await read_zip(zip)).entries).toEqual([]);
  });
});
