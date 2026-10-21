import { describe, expect, test } from "vitest";
import { encode } from "uqr";
import { encode_frames } from "../qr-transfer";
import {
  block_size_for,
  encode_light,
  equal_bytes,
  estimate_frames,
  FRAME_PREFIX,
  header_frame,
  LightDecoder,
  LightResult,
  MAX_BYTES,
  QR_VERSIONS,
  read_frame,
  type LightFile,
  type LightStream,
} from "./codec";
import { prng } from "./lt";

function file_of(size: number, seed = 1, name = "data.bin", type = "application/octet-stream"): LightFile {
  const random = prng(seed);
  const bytes = new Uint8Array(size);
  for (let index = 0; index < size; index++) bytes[index] = Math.floor(random() * 256);
  return { name, type, bytes };
}

function receive(stream: LightStream, decoder: LightDecoder, loss: number, seed: number, start = 0): number {
  const random = prng(seed);
  for (let position = start; position < start + stream.header.k * 20 + 100; position++) {
    if (random() < loss) continue;
    if (decoder.add(stream.frame(position)) === LightResult.COMPLETE) return position - start + 1;
  }
  throw new Error("never completed");
}

describe("light frames", () => {
  test("a full data frame lands on exactly its QR version, alphanumeric", async () => {
    for (const version of QR_VERSIONS) {
      const stream = await encode_light(file_of(block_size_for(version) * 2), version);
      const frame = stream.frame(1);
      expect(frame).toMatch(/^WL1:[0-9A-Z $%*+\-./:]+$/);
      expect(encode(frame, { ecc: "L", minVersion: version, maxVersion: version }).version).toBe(version);
      expect(() => encode(frame + "00", { ecc: "L", minVersion: version, maxVersion: version })).toThrow();
    }
  });

  test("the header fits the smallest version even with a long name", async () => {
    const stream = await encode_light(file_of(10, 1, `${"ä".repeat(300)}.txt`, "text/plain".padEnd(150, "x")), 15);
    const frame = header_frame(stream.header);
    expect(encode(frame, { ecc: "L", maxVersion: 15 }).version).toBeLessThanOrEqual(15);
    const parsed = read_frame(frame);
    expect(parsed?.kind).toBe(0);
    if (parsed?.kind === 0) expect(parsed.header.name.endsWith(".txt")).toBe(true);
  });

  test("other codes are not frames", async () => {
    const [wq1] = await encode_frames("SL", { a: 1 });
    const decoder = new LightDecoder();
    expect(decoder.add(wq1)).toBe(LightResult.NOT_A_FRAME);
    expect(decoder.add("https://example.com")).toBe(LightResult.NOT_A_FRAME);
    expect(decoder.add(`${FRAME_PREFIX}???`)).toBe(LightResult.NOT_A_FRAME);
    expect(decoder.add(FRAME_PREFIX)).toBe(LightResult.NOT_A_FRAME);
  });

  test("the stream id is the same for the same file and speed, different across speeds", async () => {
    const file = file_of(5000);
    const [a, b, c] = await Promise.all([encode_light(file, 15), encode_light(file, 15), encode_light(file, 20)]);
    expect(a.header.id).toBe(b.header.id);
    expect(a.header.id).not.toBe(c.header.id);
  });
});

describe("light transfer", () => {
  test("one block, no loss", async () => {
    const file = file_of(100);
    const stream = await encode_light(file, 15);
    expect(stream.header.k).toBe(1);
    const decoder = new LightDecoder();
    receive(stream, decoder, 0, 1);
    const result = await decoder.result();
    expect(equal_bytes(result.bytes, file.bytes)).toBe(true);
    expect(result.name).toBe("data.bin");
  });

  test("an empty file", async () => {
    const stream = await encode_light(file_of(0), 15);
    const decoder = new LightDecoder();
    receive(stream, decoder, 0, 1);
    expect((await decoder.result()).bytes.length).toBe(0);
  });

  test.each([0.2, 0.3])("%s of the frames missed", async (loss) => {
    const file = file_of(150_000, 7);
    const stream = await encode_light(file, 15);
    const decoder = new LightDecoder();
    const sent = receive(stream, decoder, loss, 11);
    expect(sent).toBeLessThan(stream.header.k * 2);
    expect(equal_bytes((await decoder.result()).bytes, file.bytes)).toBe(true);
  });

  test("any order, with duplicates, from the middle of the stream", async () => {
    const file = file_of(40_000, 3);
    const stream = await encode_light(file, 18);
    const frames = Array.from({ length: stream.header.k * 3 }, (_, index) => stream.frame(index + 500));
    const random = prng(5);
    for (let index = frames.length - 1; index > 0; index--) {
      const pick = Math.floor(random() * (index + 1));
      [frames[index], frames[pick]] = [frames[pick], frames[index]];
    }
    const decoder = new LightDecoder();
    let duplicates = 0;
    for (const frame of [...frames.slice(0, 20), ...frames]) {
      const result = decoder.add(frame);
      if (result === LightResult.DUPLICATE) duplicates++;
      if (result === LightResult.COMPLETE) break;
    }
    expect(duplicates).toBeGreaterThan(0);
    expect(equal_bytes((await decoder.result()).bytes, file.bytes)).toBe(true);
  });

  test("frames of another file are ignored", async () => {
    const [mine, other] = await Promise.all([
      encode_light(file_of(20_000, 1), 15),
      encode_light(file_of(20_000, 2), 15),
    ]);
    const decoder = new LightDecoder();
    decoder.add(mine.frame(1));
    for (let position = 0; position < 50; position++)
      expect(decoder.add(other.frame(position))).toBe(LightResult.FOREIGN);
    receive(mine, decoder, 0.2, 9);
    expect(equal_bytes((await decoder.result()).bytes, file_of(20_000, 1).bytes)).toBe(true);
  });

  test("a hash mismatch is refused", async () => {
    const stream = await encode_light(file_of(3000), 15);
    const forged = { ...stream.header, sha256: new Uint8Array(32) };
    const decoder = new LightDecoder();
    expect(decoder.add(header_frame(forged))).toBe(LightResult.ADDED);
    for (let position = 1; position < 40 && !decoder.complete; position++) decoder.add(stream.frame(position));
    expect(decoder.complete).toBe(true);
    await expect(decoder.result()).rejects.toThrow(/damaged/);
  });

  test("text is deflated and comes back the same", async () => {
    const text = new TextEncoder().encode("the quick brown fox jumps over the lazy dog\n".repeat(2000));
    const file = { name: "notes.txt", type: "text/plain", bytes: text };
    const stream = await encode_light(file, 15);
    expect(stream.header.compressed).toBe(true);
    expect(stream.header.length).toBeLessThan(text.length / 10);
    const decoder = new LightDecoder();
    receive(stream, decoder, 0.2, 4);
    expect(equal_bytes((await decoder.result()).bytes, text)).toBe(true);
  });

  test("a 2 MB file round-trips at 25% missed; anything bigger is refused", async () => {
    const file = file_of(MAX_BYTES, 13);
    const stream = await encode_light(file, 20);
    const decoder = new LightDecoder();
    const sent = receive(stream, decoder, 0.25, 21);
    expect(sent).toBeLessThan(stream.header.k * 1.8);
    expect(sent).toBeLessThan(estimate_frames(stream.header.k) * 1.2);
    expect(equal_bytes((await decoder.result()).bytes, file.bytes)).toBe(true);
    await expect(encode_light(file_of(MAX_BYTES + 1), 20)).rejects.toThrow(/2 MB/);
  });
});
