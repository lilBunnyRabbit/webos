import { describe, expect, test } from "vitest";
import { CollectResult, encode_frames, FrameCollector, parse_frame } from "./frames";

const big = { items: Array.from({ length: 200 }, (_, index) => ({ id: crypto.randomUUID(), text: `item ${index}`, checked: index % 3 === 0 })) };

describe("qr-transfer frames", () => {
  test("a small payload is one frame, all alphanumeric", async () => {
    const frames = await encode_frames("SL", { hello: "world" });
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatch(/^WQ1:SL:[A-Z0-9]{4}:1\/1:[0-9A-Z $%*+\-./:]+$/);
  });

  test("frames collected in any order give the payload back", async () => {
    const frames = await encode_frames("SL", big);
    expect(frames.length).toBeGreaterThan(1);
    const collector = new FrameCollector("SL");
    const shuffled = [...frames].reverse();
    const results = shuffled.map((frame) => collector.add(frame));
    expect(results.at(-1)).toBe(CollectResult.COMPLETE);
    expect(await collector.payload()).toEqual(big);
  });

  test("duplicates, other apps and noise are told apart", async () => {
    const [frame] = await encode_frames("SL", { a: 1 }, 1);
    const collector = new FrameCollector("CARDS");
    expect(collector.add(frame)).toBe(CollectResult.FOREIGN);
    expect(collector.add("https://example.com")).toBe(CollectResult.NOT_A_FRAME);
    const own = new FrameCollector("SL");
    expect(own.add(frame)).not.toBe(CollectResult.DUPLICATE);
    expect(own.add(frame)).toBe(CollectResult.DUPLICATE);
  });

  test("a frame of a new share starts over", async () => {
    const first = await encode_frames("SL", big);
    const second = await encode_frames("SL", { other: true });
    const collector = new FrameCollector("SL");
    collector.add(first[0]);
    expect(collector.add(second[0])).toBe(CollectResult.COMPLETE);
    expect(await collector.payload()).toEqual({ other: true });
  });

  test("parse_frame rejects an index out of range", () => {
    expect(parse_frame("WQ1:SL:ABCD:3/2:00")).toBeNull();
    expect(parse_frame("WQ1:SL:ABCD:1/2:00")).toMatchObject({ app: "SL", message: "ABCD", index: 1, total: 2 });
  });
});
