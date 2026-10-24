import { describe, expect, test } from "vitest";
import {
  contain,
  lit_pixels,
  random,
  sample_size,
  sample_targets,
  svg_paths,
  TARGET_STRIDE,
  Tone,
  tone_of,
  ToneRule,
  type Mask,
} from "./targets";
import LOGO from "$lib/core/components/brand/logo-mark.svelte?raw";

function square_mask(size: number, from: number, to: number): Mask {
  const alpha = new Uint8Array(size * size);
  for (let y = from; y < to; y++) for (let x = from; x < to; x++) alpha[y * size + x] = 255;
  return { width: size, height: size, alpha };
}

const points = (data: Float32Array) =>
  Array.from({ length: data.length / TARGET_STRIDE }, (_, i) => ({
    x: data[i * 3],
    y: data[i * 3 + 1],
    tone: data[i * 3 + 2],
  }));

describe("random", () => {
  test("is deterministic per seed and stays in [0, 1)", () => {
    const a = random(7);
    const b = random(7);
    const values = Array.from({ length: 200 }, () => a());
    expect(values).toEqual(Array.from({ length: 200 }, () => b()));
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(random(8)()).not.toBe(random(7)());
  });
});

describe("lit_pixels", () => {
  test("finds pixels at or over the threshold", () => {
    expect([...lit_pixels({ width: 2, height: 2, alpha: [0, 128, 127, 255] })]).toEqual([1, 3]);
  });
});

describe("sample_targets", () => {
  const mask = square_mask(10, 2, 5);

  test("returns exactly count targets", () => {
    expect(sample_targets(mask, 500, { seed: 1, rule: ToneRule.DIAGONAL, dust: 0.1 })).toHaveLength(
      500 * TARGET_STRIDE
    );
  });

  test("shape points land on lit pixels, dust after them", () => {
    const all = points(sample_targets(mask, 400, { seed: 3, rule: ToneRule.DIAGONAL, dust: 0.25 }));
    const shape = all.slice(0, 300);
    const dust = all.slice(300);
    expect(shape.every((p) => p.x >= 0.2 && p.x <= 0.5 && p.y >= 0.2 && p.y <= 0.5)).toBe(true);
    expect(shape.every((p) => p.tone !== Tone.DUST)).toBe(true);
    expect(dust.every((p) => p.tone === Tone.DUST && p.x >= -0.13 && p.x <= 1.13)).toBe(true);
  });

  test("orders the shape left to right so morphs sweep", () => {
    const shape = points(sample_targets(mask, 300, { seed: 5, rule: ToneRule.DIAGONAL, dust: 0 }));
    const keys = shape.map((p) => p.x * 0.85 + p.y * 0.15);
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
  });

  test("is deterministic", () => {
    const options = { seed: 9, rule: ToneRule.ROWS, dust: 0.05 };
    expect(sample_targets(mask, 200, options)).toEqual(sample_targets(mask, 200, options));
  });

  test("an empty mask falls back to a ring", () => {
    const shape = points(
      sample_targets({ width: 4, height: 4, alpha: new Uint8Array(16) }, 100, {
        seed: 2,
        rule: ToneRule.ANGLE,
        dust: 0,
      })
    );
    for (const p of shape) {
      const radius = Math.hypot(p.x - 0.5, p.y - 0.5);
      expect(radius).toBeGreaterThanOrEqual(0.299);
      expect(radius).toBeLessThanOrEqual(0.381);
    }
  });
});

describe("tone_of", () => {
  test("stays within the four brand tones", () => {
    for (const rule of Object.values(ToneRule)) {
      for (const [x, y, j] of [
        [0, 0, 0],
        [1, 1, 1],
        [0.5, 0.5, 0.5],
        [-0.2, 1.3, 0.9],
      ]) {
        expect(tone_of(rule, x, y, j)).toBeGreaterThanOrEqual(Tone.PRIMARY);
        expect(tone_of(rule, x, y, j)).toBeLessThanOrEqual(Tone.ACCENT);
      }
    }
  });

  test("rows go top to bottom, angle goes around", () => {
    expect(tone_of(ToneRule.ROWS, 0.5, 0.05, 0.5)).toBe(Tone.PRIMARY);
    expect(tone_of(ToneRule.ROWS, 0.5, 0.95, 0.5)).toBe(Tone.ACCENT);
    const around = [0, 0.25, 0.5, 0.75].map((turn) => {
      const angle = (turn + 0.125) * Math.PI * 2 - Math.PI;
      return tone_of(ToneRule.ANGLE, 0.5 + Math.cos(angle) * 0.4, 0.5 + Math.sin(angle) * 0.4, 0.5);
    });
    expect(new Set(around).size).toBe(4);
  });
});

describe("contain", () => {
  test("fits and centres with padding", () => {
    expect(contain(2, 1, { x: 0, y: 0, width: 100, height: 100 })).toEqual({ x: 0, y: 25, width: 100, height: 50 });
    expect(contain(1, 1, { x: 10, y: 0, width: 200, height: 100 }, 0.1)).toEqual({
      x: 70,
      y: 10,
      width: 80,
      height: 80,
    });
  });
});

describe("sample_size", () => {
  test("keeps the aspect within the pixel budget", () => {
    const wide = sample_size(2, 20_000);
    expect(wide.width / wide.height).toBeCloseTo(2, 1);
    expect(wide.width * wide.height).toBeLessThanOrEqual(20_000);
    expect(sample_size(Number.NaN, 100)).toEqual({ width: 10, height: 10 });
  });
});

describe("svg_paths", () => {
  test("reads the logo mark component", () => {
    const logo = svg_paths(LOGO);
    expect(logo.paths).toHaveLength(2);
    expect(logo.width).toBeCloseTo(199.28, 1);
    expect(logo.height).toBeCloseTo(174.1, 1);
    expect(logo.paths[0].startsWith("M")).toBe(true);
  });
});
