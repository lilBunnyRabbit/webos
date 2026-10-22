import { describe, expect, test } from "vitest";
import type { Size } from "../image-editor/edit";
import {
  can_copy,
  fit_target,
  fit_warnings,
  format_limit,
  parse_limit,
  scale_by,
  search_fit,
  source_format,
  FitFormat,
  type FitSpec,
} from "./fit";

const model = (bytes_per_pixel: (quality: number | null) => number) => {
  const calls: { size: Size; quality: number | null }[] = [];
  const encode = async (size: Size, quality: number | null) => {
    calls.push({ size, quality });
    return { size: Math.round(size.width * size.height * bytes_per_pixel(quality)), value: null };
  };
  return { calls, encode };
};
const jpeg_like = (quality: number | null) => 0.05 + ((quality ?? 100) / 100) ** 3;

const spec = (overrides: Partial<FitSpec>): FitSpec => ({
  limit: 1_000_000,
  lossy: true,
  floor: 50,
  ceiling: 92,
  source: { width: 4000, height: 3000 },
  max: null,
  ...overrides,
});

describe("parse_limit", () => {
  test("reads the decimal meaning of KB, MB and GB, and plain bytes", () => {
    expect(parse_limit("500 KB")).toBe(500_000);
    expect(parse_limit("1MB")).toBe(1_000_000);
    expect(parse_limit("1.5 mb")).toBe(1_500_000);
    expect(parse_limit("2m")).toBe(2_000_000);
    expect(parse_limit("800k")).toBe(800_000);
    expect(parse_limit("4096")).toBe(4096);
    expect(parse_limit("1 GB")).toBe(1e9);
  });

  test("refuses what isn't a size", () => {
    expect(parse_limit("")).toBeNull();
    expect(parse_limit("big")).toBeNull();
    expect(parse_limit("0")).toBeNull();
    expect(parse_limit("-1MB")).toBeNull();
  });

  test("formats back in the same units", () => {
    expect(format_limit(500_000)).toBe("500 KB");
    expect(format_limit(1_000_000)).toBe("1 MB");
    expect(format_limit(1_234_567)).toBe("1.23 MB");
    expect(format_limit(987)).toBe("987 B");
  });
});

describe("can_copy", () => {
  test("only when under the limit, same format and no max side hit", () => {
    const base = { size: 900_000, limit: 1_000_000, same_format: true, max_side_hit: false };
    expect(can_copy(base)).toBe(true);
    expect(can_copy({ ...base, size: 1_000_001 })).toBe(false);
    expect(can_copy({ ...base, same_format: false })).toBe(false);
    expect(can_copy({ ...base, max_side_hit: true })).toBe(false);
  });
});

describe("scale_by", () => {
  test("keeps the ratio and always shrinks", () => {
    expect(scale_by({ width: 4000, height: 3000 }, 0.5)).toEqual({ width: 2000, height: 1500 });
    const almost = scale_by({ width: 10, height: 10 }, 0.99);
    expect(almost.width).toBeLessThan(10);
    expect(scale_by({ width: 3, height: 1 }, 0.01)).toEqual({ width: 1, height: 1 });
  });
});

describe("search_fit", () => {
  test("the ceiling first: when it fits, one encode", async () => {
    const codec = model(jpeg_like);
    const outcome = await search_fit(spec({ limit: 100_000_000 }), codec.encode);
    expect(outcome).toMatchObject({ fitted: true, attempts: 1, best: { quality: 92, width: 4000, height: 3000 } });
  });

  test("binary search finds the highest integer quality under the limit", async () => {
    const codec = model(jpeg_like);
    const limit = 4000 * 3000 * jpeg_like(71) + 1;
    const outcome = await search_fit(spec({ limit }), codec.encode);
    expect(outcome.fitted).toBe(true);
    expect(outcome.best.quality).toBe(71);
    expect(outcome.best.size).toBeLessThanOrEqual(limit);
    expect(outcome.attempts).toBeLessThanOrEqual(2 + Math.ceil(Math.log2(92 - 50)));
    expect(codec.calls.every((call) => call.size.width === 4000)).toBe(true);
  });

  test("scales when the floor is still over, then searches again", async () => {
    const codec = model(jpeg_like);
    const outcome = await search_fit(spec({ limit: 1_000_000 }), codec.encode);
    expect(outcome.fitted).toBe(true);
    expect(outcome.best.size).toBeLessThanOrEqual(1_000_000);
    expect(outcome.best.width).toBeLessThan(4000);
    expect(outcome.best.width / outcome.best.height).toBeCloseTo(4 / 3, 2);
    expect(outcome.best.quality).toBeGreaterThanOrEqual(50);
  });

  test("the limit is a hard ceiling, never rounded over", async () => {
    for (const limit of [123_457, 500_000, 2_000_000, 7_654_321]) {
      const outcome = await search_fit(spec({ limit }), model(jpeg_like).encode);
      expect(outcome.fitted).toBe(true);
      expect(outcome.best.size).toBeLessThanOrEqual(limit);
    }
  });

  test("lossless formats only scale", async () => {
    const codec = model(() => 3);
    const outcome = await search_fit(spec({ lossy: false, limit: 2_000_000 }), codec.encode);
    expect(outcome.fitted).toBe(true);
    expect(codec.calls.every((call) => call.quality === null)).toBe(true);
    expect(outcome.best.size).toBeLessThanOrEqual(2_000_000);
    expect(outcome.best.size).toBeGreaterThan(2_000_000 * 0.8);
  });

  test("max side applies before the first encode", async () => {
    const codec = model(jpeg_like);
    await search_fit(spec({ limit: 100_000_000, max: 1000 }), codec.encode);
    expect(codec.calls[0].size).toEqual({ width: 1000, height: 750 });
  });

  test("gives up with the smallest file tried when nothing fits", async () => {
    const codec = model(() => 1);
    const outcome = await search_fit(spec({ lossy: false, limit: 0.5 }), codec.encode);
    expect(outcome.fitted).toBe(false);
    expect(outcome.best.size).toBe(Math.min(...codec.calls.map((call) => call.size.width * call.size.height)));
  });

  test("floor above ceiling collapses to the ceiling", async () => {
    const codec = model(jpeg_like);
    await search_fit(spec({ floor: 95, ceiling: 80, limit: 100 }), codec.encode);
    expect(codec.calls.every((call) => call.quality === 80)).toBe(true);
  });
});

describe("fit_warnings", () => {
  test("names what was lost", () => {
    expect(fit_warnings({ alpha: true, target_alpha: false, animated: true, fitted: false, limit: 1_000_000 })).toEqual([
      "Transparency flattened onto white",
      "Animated: only the first frame is kept",
      "Didn't fit under 1 MB, even at the smallest size tried",
    ]);
    expect(fit_warnings({ alpha: true, target_alpha: true, animated: false, fitted: true, limit: 1 })).toEqual([]);
  });
});

describe("target format", () => {
  test("the source format by MIME type, then by extension", () => {
    expect(source_format("image/jpeg", "a.jpg")).toBe("jpeg");
    expect(source_format("image/vnd.microsoft.icon", "a.ico")).toBe("ico");
    expect(source_format("", "a.jxl")).toBe("jxl");
    expect(source_format("", "a.TIF")).toBe("tiff");
    expect(source_format("image/svg+xml", "a.svg")).toBeNull();
  });

  test("Keep keeps a writable format and falls back for the rest", () => {
    expect(fit_target(FitFormat.KEEP, "gif", false)).toEqual({ target: "gif", fallback: false });
    expect(fit_target(FitFormat.KEEP, null, true)).toEqual({ target: "png", fallback: true });
    expect(fit_target(FitFormat.KEEP, null, false)).toEqual({ target: "jpeg", fallback: true });
    expect(fit_target(FitFormat.AVIF, "png", true)).toEqual({ target: "avif", fallback: false });
  });
});
