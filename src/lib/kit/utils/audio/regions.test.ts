import { describe, expect, test } from "vitest";
import { cut_regions, normalize_regions, peak_index, peaks, peaks_between, subtract_regions } from "./regions";
import type { Pcm } from "./wav";

const ramp = (length: number, rate = 1000): Pcm => ({
  sample_rate: rate,
  channels: [Float32Array.from({ length }, (_, i) => i), Float32Array.from({ length }, (_, i) => -i)],
});

describe("normalize_regions", () => {
  test("sorts, clamps, merges overlaps and drops empty spans", () => {
    expect(
      normalize_regions(
        [
          { start: 50, end: 70 },
          { start: -5, end: 10 },
          { start: 8, end: 20 },
          { start: 30, end: 30 },
          { start: 95, end: 200 },
        ],
        100
      )
    ).toEqual([
      { start: 0, end: 20 },
      { start: 50, end: 70 },
      { start: 95, end: 100 },
    ]);
  });

  test("swaps a backwards span", () => {
    expect(normalize_regions([{ start: 9, end: 3 }], 10)).toEqual([{ start: 3, end: 9 }]);
  });
});

describe("subtract_regions", () => {
  test("takes the deleted spans out of the trimmed range", () => {
    expect(
      subtract_regions(
        { start: 10, end: 90 },
        [
          { start: 40, end: 50 },
          { start: 0, end: 15 },
        ],
        100
      )
    ).toEqual([
      { start: 15, end: 40 },
      { start: 50, end: 90 },
    ]);
  });

  test("nothing deleted keeps the range; everything deleted keeps nothing", () => {
    expect(subtract_regions({ start: 10, end: 90 }, [], 100)).toEqual([{ start: 10, end: 90 }]);
    expect(subtract_regions({ start: 10, end: 90 }, [{ start: 0, end: 100 }], 100)).toEqual([]);
  });
});

describe("cut_regions", () => {
  test("trimming the edges keeps the exact samples, no fade", () => {
    const out = cut_regions(ramp(100), [{ start: 20, end: 80 }], 10);
    expect(out.sample_rate).toBe(1000);
    expect(out.channels).toHaveLength(2);
    expect(out.channels[0]).toHaveLength(60);
    expect(out.channels[0][0]).toBe(20);
    expect(out.channels[0][59]).toBe(79);
    expect(out.channels[1][0]).toBe(-20);
  });

  test("joins two parts with a linear crossfade over the seam", () => {
    const source: Pcm = {
      sample_rate: 1000,
      channels: [Float32Array.from({ length: 40 }, (_, i) => (i < 20 ? 1 : 0))],
    };
    const fade = 4;
    const out = cut_regions(
      source,
      [
        { start: 0, end: 10 },
        { start: 30, end: 40 },
      ],
      fade
    );
    const [channel] = out.channels;
    expect(channel).toHaveLength(10 + 10 - fade);
    expect(Array.from(channel.subarray(0, 10 - fade))).toEqual([1, 1, 1, 1, 1, 1]);
    expect(Array.from(channel.subarray(10 - fade, 10)).map((v) => +v.toFixed(3))).toEqual([0.8, 0.6, 0.4, 0.2]);
    expect(Array.from(channel.subarray(10))).toEqual([0, 0, 0, 0, 0, 0]);
  });

  test("the seam is continuous: no jump bigger than the fade's step", () => {
    const rate = 8000;
    const length = rate;
    const sine = (f: number, phase: number) =>
      Float32Array.from({ length }, (_, i) => Math.sin((2 * Math.PI * f * i) / rate + phase));
    const source: Pcm = { sample_rate: rate, channels: [sine(220, 0)] };
    const out = cut_regions(source, [
      { start: 0, end: 2000 },
      { start: 2037, end: 4000 },
    ]);
    const [channel] = out.channels;
    let jump = 0;
    for (let i = 1; i < channel.length; i++) jump = Math.max(jump, Math.abs(channel[i] - channel[i - 1]));
    expect(jump).toBeLessThan(0.25);
    expect(channel).toHaveLength(2000 + 1963 - 80);
  });

  test("a part shorter than the fade shortens the overlap", () => {
    const out = cut_regions(
      ramp(100),
      [
        { start: 0, end: 50 },
        { start: 60, end: 63 },
      ],
      10
    );
    expect(out.channels[0]).toHaveLength(50);
  });

  test("no regions is an empty sound", () => {
    expect(cut_regions(ramp(100), []).channels[0]).toHaveLength(0);
  });
});

test("peaks gives the min and max of each bucket across channels", () => {
  const out = peaks(ramp(100), 4);
  expect(Array.from(out)).toEqual([-24, 24, -49, 49, -74, 74, -99, 99]);
  expect(peaks({ sample_rate: 1, channels: [] }, 3)).toHaveLength(6);
});

describe("peaks_between", () => {
  const sound = ramp(1000);
  const index = peak_index(sound, 10);

  test("the index holds each block's min and max and the loudest sample", () => {
    expect(index.min).toHaveLength(100);
    expect([index.min[3], index.max[3]]).toEqual([-39, 39]);
    expect(index.loudest).toBe(999);
  });

  test("wide buckets read the index and match a full scan", () => {
    expect(Array.from(peaks_between(sound, index, 0, 1000, 4))).toEqual(Array.from(peaks(sound, 4)));
  });

  test("narrow buckets read the samples of just the visible range", () => {
    expect(Array.from(peaks_between(sound, index, 500, 504, 2))).toEqual([-501, 501, -503, 503]);
  });

  test("a range past the end or empty draws nothing", () => {
    expect(Array.from(peaks_between(sound, index, 2000, 3000, 2))).toEqual([0, 0, 0, 0]);
  });
});
