import { describe, expect, test } from "vitest";
import {
  DEFAULT_OUTPUT,
  DEFAULT_SPEC,
  dimensions_for_bytes,
  fill_base,
  hsl_rgb,
  label_every,
  Mode,
  overlay_marks,
  parse_dimensions,
  Pattern,
  plan_output,
  ring_schemes,
  TestFormat,
  type TestImageSpec,
} from "./test-image";
import { bmp_size, png_stored_size } from "./test-image-encode";

const spec = (patch: Partial<TestImageSpec> = {}): TestImageSpec => ({ ...DEFAULT_SPEC, ...patch });

describe("parsing", () => {
  test("dimensions take x, × or *", () => {
    expect(parse_dimensions("1920x1080")).toEqual({ width: 1920, height: 1080 });
    expect(parse_dimensions(" 32 × 16 ")).toEqual({ width: 32, height: 16 });
    expect(parse_dimensions("4*4")).toEqual({ width: 4, height: 4 });
    expect(parse_dimensions("0x10")).toBeNull();
    expect(parse_dimensions("1920")).toBeNull();
    expect(parse_dimensions("2000000x1")).toBeNull();
  });
});

describe("plan_output", () => {
  test("PNG draws on a canvas while it fits, then streams uncompressed", () => {
    expect(plan_output(spec(), DEFAULT_OUTPUT)).toMatchObject({ ok: true, mode: Mode.CANVAS, bytes: null });
    expect(plan_output(spec({ width: 20_000, height: 100 }), DEFAULT_OUTPUT)).toMatchObject({
      ok: true,
      mode: Mode.STREAM,
      bytes: png_stored_size(20_000, 100),
    });
  });

  test("JPEG and WebP are bound by the canvas; BMP by 4 GB", () => {
    expect(plan_output(spec({ width: 16_384, height: 10 }), { ...DEFAULT_OUTPUT, format: TestFormat.WEBP }).ok).toBe(false);
    expect(plan_output(spec({ width: 16_384, height: 10 }), { ...DEFAULT_OUTPUT, format: TestFormat.JPEG }).ok).toBe(true);
    expect(plan_output(spec({ width: 40_000, height: 40_000 }), { ...DEFAULT_OUTPUT, format: TestFormat.BMP }).ok).toBe(false);
  });

  test("an exact size needs PNG or BMP and lands on the byte", () => {
    const gb2 = 2 * 1024 ** 3;
    expect(plan_output(spec(), { ...DEFAULT_OUTPUT, format: TestFormat.JPEG, target: 1000 }).ok).toBe(false);
    const png = plan_output(spec(), { ...DEFAULT_OUTPUT, target: gb2 });
    if (!png.ok) throw new Error(png.error);
    expect(png.mode).toBe(Mode.STREAM);
    expect(png.pad === 0 || png.pad >= 12).toBe(true);
    expect(png_stored_size(png.width, png.height) + png.pad).toBe(gb2);
    expect(png.width / png.height).toBeCloseTo(1920 / 1080, 2);

    const bmp = plan_output(spec(), { ...DEFAULT_OUTPUT, format: TestFormat.BMP, target: 10_000_000 });
    if (!bmp.ok) throw new Error(bmp.error);
    expect(bmp_size(bmp.width, bmp.height) + bmp.pad).toBe(10_000_000);
    expect(bmp.pad).toBeLessThan(bmp.width * 3 + 4);

    expect(plan_output(spec(), { ...DEFAULT_OUTPUT, format: TestFormat.BMP, target: 5 * 1024 ** 3 }).ok).toBe(false);
    expect(plan_output(spec(), { ...DEFAULT_OUTPUT, target: 20 }).ok).toBe(false);
  });

  test("dimensions_for_bytes keeps padding at zero or above the minimum", () => {
    for (const target of [100, 1000, 12_345, 1_000_000]) {
      const found = dimensions_for_bytes(target, 1, png_stored_size, 12);
      expect(found).not.toBeNull();
      expect(found!.pad === 0 || found!.pad >= 12).toBe(true);
      expect(png_stored_size(found!.width, found!.height) + found!.pad).toBe(target);
    }
  });

  test("SVG of fine rings stays a few paths", () => {
    expect(plan_output(spec({ cell: 1, width: 4000, height: 4000 }), { ...DEFAULT_OUTPUT, format: TestFormat.SVG }).ok).toBe(true);
  });
});

describe("fill_base", () => {
  const draw = (s: TestImageSpec, tile = { x: 0, y: 0, columns: s.width, rows: s.height, scale: 1 }) => {
    const pixels = new Uint32Array(tile.columns * tile.rows);
    fill_base(pixels, s, tile);
    return pixels;
  };
  const rgb = (value: number) => [value & 255, (value >> 8) & 255, (value >> 16) & 255];

  test("rings match the original: hue per ring from the outside in, alternating light and dark cells", () => {
    const s = spec({ width: 6 * 4, height: 6 * 4, cell: 4, hues: 9 });
    const schemes = ring_schemes(s);
    const pixels = draw(s);
    const at = (x: number, y: number) => rgb(pixels[y * s.width + x]);
    expect(at(0, 0)).toEqual(schemes[0][0]);
    expect(at(4, 0)).toEqual(schemes[0][1]);
    expect(at(5, 6)).toEqual(schemes[1][0]);
    expect(at(9, 9)).toEqual(schemes[2][0]);
    expect(at(23, 23)).toEqual(schemes[0][0]);
    expect(schemes[0][0]).toEqual(hsl_rgb(8 / 9, 0.65, 0.5));
    expect(schemes[0][1]).toEqual(hsl_rgb(8 / 9, 0.65, 0.4));
  });

  test("a tile draws the same pixels as the whole image", () => {
    for (const pattern of Object.values(Pattern)) {
      const s = spec({ width: 50, height: 40, cell: 3, pattern });
      const whole = draw(s);
      const part = draw(s, { x: 13, y: 7, columns: 20, rows: 10, scale: 1 });
      for (let j = 0; j < 10; j++)
        for (let i = 0; i < 20; i++) expect(part[j * 20 + i], `${pattern} ${i},${j}`).toBe(whole[(7 + j) * 50 + 13 + i]);
    }
  });

  test("hsl_rgb converts known colours", () => {
    expect(hsl_rgb(0, 1, 0.5)).toEqual([255, 0, 0]);
    expect(hsl_rgb(1 / 3, 1, 0.5)).toEqual([0, 255, 0]);
    expect(hsl_rgb(2 / 3, 1, 0.25)).toEqual([0, 0, 128]);
    expect(hsl_rgb(0.5, 0, 0.5)).toEqual([128, 128, 128]);
  });
});

describe("overlay_marks", () => {
  test("only marks touching the view are kept", () => {
    const s = spec({ width: 10_000, height: 10_000, rulers: 100, corners: false, crosshair: false, border: 0, label: "" });
    const all = overlay_marks(s, { x: 0, y: 0, width: 10_000, height: 10_000 });
    const corner = overlay_marks(s, { x: 0, y: 0, width: 300, height: 300 });
    const middle = overlay_marks(s, { x: 4000, y: 4000, width: 500, height: 500 });
    expect(corner.length).toBeGreaterThan(0);
    expect(corner.length).toBeLessThan(all.length / 10);
    expect(middle).toEqual([]);
    expect(overlay_marks({ ...s, grid: true }, { x: 4000, y: 4000, width: 500, height: 500 }).length).toBeGreaterThan(0);
  });

  test("the label fills in the dimensions and format", () => {
    const marks = overlay_marks(spec({ width: 800, height: 600, label: "{w}x{h} {format}" }), { x: 0, y: 0, width: 800, height: 600 }, TestFormat.WEBP);
    expect(marks.some((mark) => mark.kind === "text" && mark.text === "800x600 WEBP")).toBe(true);
  });

  test("ruler numbers skip steps when they wouldn't fit", () => {
    expect(label_every(100, 12, 4)).toBe(1);
    expect(label_every(10, 12, 5)).toBe(5);
  });
});
