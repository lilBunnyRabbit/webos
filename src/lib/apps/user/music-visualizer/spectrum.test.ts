import { describe, expect, test } from "vitest";
import {
  analyser_smoothing,
  apply_sensitivity,
  decay,
  format_time,
  group_bins,
  log_bands,
  wave_sample,
} from "./spectrum";

describe("log_bands", () => {
  const options = { bin_count: 1024, band_count: 64, sample_rate: 48000 };
  const hz_per_bin = 24000 / 1024;

  test("returns the requested number of contiguous, non-empty bands", () => {
    const bands = log_bands(options);
    expect(bands).toHaveLength(64);
    bands.forEach((band, i) => {
      expect(band.end).toBeGreaterThan(band.start);
      if (i) expect(band.start).toBe(bands[i - 1].end);
    });
  });

  test("spans the frequency range inside the bins", () => {
    const bands = log_bands(options);
    expect(bands[0].start).toBe(Math.floor(30 / hz_per_bin));
    expect(bands.at(-1)!.end).toBeLessThanOrEqual(1024);
    expect(Math.abs(bands.at(-1)!.end * hz_per_bin - 16000)).toBeLessThan(hz_per_bin);
  });

  test("widens toward high frequencies", () => {
    const bands = log_bands(options);
    const width = (i: number) => bands[i].end - bands[i].start;
    expect(width(63)).toBeGreaterThan(width(10));
  });

  test("never asks for more bands than there are bins", () => {
    const bands = log_bands({ bin_count: 16, band_count: 64, sample_rate: 48000 });
    expect(bands.length).toBeGreaterThan(0);
    expect(bands.at(-1)!.end).toBeLessThanOrEqual(16);
    bands.forEach((band) => expect(band.end).toBeGreaterThan(band.start));
  });

  test("is empty without bins or bands", () => {
    expect(log_bands({ ...options, bin_count: 0 })).toEqual([]);
    expect(log_bands({ ...options, band_count: 0 })).toEqual([]);
  });
});

describe("group_bins", () => {
  test("averages each band and scales to 0..1", () => {
    const bands = [
      { start: 0, end: 2 },
      { start: 2, end: 5 },
    ];
    const out = group_bins([255, 255, 0, 51, 102], bands, new Float32Array(2));
    expect(out[0]).toBeCloseTo(1);
    expect(out[1]).toBeCloseTo(0.2);
  });
});

describe("apply_sensitivity", () => {
  test("is linear below the knee", () => {
    expect(apply_sensitivity(0.2, 2)).toBeCloseTo(0.4);
    expect(apply_sensitivity(0, 3)).toBe(0);
  });

  test("never passes 1, however loud", () => {
    expect(apply_sensitivity(1, 10)).toBeLessThanOrEqual(1);
    expect(apply_sensitivity(0.9, 1)).toBeGreaterThan(0.8);
  });

  test("is monotonic", () => {
    expect(apply_sensitivity(0.6, 2)).toBeGreaterThan(apply_sensitivity(0.5, 2));
  });
});

describe("decay", () => {
  test("rises at once and falls at most `fall` per frame", () => {
    const state = new Float32Array([0.2, 0.9, 0.5]);
    decay(state, [0.8, 0, 0.45], 0.1);
    expect(state[0]).toBeCloseTo(0.8);
    expect(state[1]).toBeCloseTo(0.8);
    expect(state[2]).toBeCloseTo(0.45);
  });
});

describe("wave_sample", () => {
  test("centres silence on zero", () => {
    expect(wave_sample(128)).toBe(0);
    expect(wave_sample(0)).toBe(-1);
  });
});

describe("analyser_smoothing", () => {
  test("stays below 1 so the spectrum keeps moving", () => {
    expect(analyser_smoothing(1)).toBeCloseTo(0.95);
    expect(analyser_smoothing(-1)).toBe(0);
  });
});

describe("format_time", () => {
  test("formats minutes and hours", () => {
    expect(format_time(0)).toBe("0:00");
    expect(format_time(65.9)).toBe("1:05");
    expect(format_time(3725)).toBe("1:02:05");
  });

  test("handles unknown durations", () => {
    expect(format_time(Number.NaN)).toBe("0:00");
    expect(format_time(Infinity)).toBe("0:00");
  });
});
