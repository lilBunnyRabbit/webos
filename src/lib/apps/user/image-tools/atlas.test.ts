import { describe, expect, test } from "vitest";
import { MaxRects, atlas_css, atlas_json, css_class, natural_compare, next_power_of_two, pack, unique_names, type AtlasFrame, type PackOptions, type Size } from "./atlas";

const OPTIONS: PackOptions = { max: 2048, padding: 0, extrude: 0, power_of_two: false };

function boxes(sizes: Size[], result: Extract<ReturnType<typeof pack>, { ok: true }>, grow = 0) {
  return sizes.map((size, i) => ({ x: result.positions[i].x - grow, y: result.positions[i].y - grow, w: size.w + grow * 2, h: size.h + grow * 2 }));
}

function expect_apart(rects: { x: number; y: number; w: number; h: number }[], gap: number) {
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      const apart = a.x + a.w + gap <= b.x || b.x + b.w + gap <= a.x || a.y + a.h + gap <= b.y || b.y + b.h + gap <= a.y;
      expect(apart, `${i} and ${j} overlap`).toBe(true);
    }
  }
}

describe("natural order", () => {
  test("numbers compare by value", () => {
    expect(["run_10.png", "run_2.png", "run_1.png"].sort(natural_compare)).toEqual(["run_1.png", "run_2.png", "run_10.png"]);
  });
});

describe("MaxRects", () => {
  test("fills a bin exactly and refuses what's left over", () => {
    const bin = new MaxRects(64, 64);
    const placed = [bin.insert(32, 32), bin.insert(32, 32), bin.insert(32, 32), bin.insert(32, 32)];
    expect(placed.every(Boolean)).toBe(true);
    expect(bin.insert(1, 1)).toBeNull();
  });

  test("best short side fit picks the snug space", () => {
    const bin = new MaxRects(100, 50);
    bin.insert(60, 50);
    expect(bin.insert(40, 50)).toEqual({ x: 60, y: 0, w: 40, h: 50 });
  });
});

describe("pack", () => {
  test("same-size frames make a tight square sheet", () => {
    const sizes = Array.from({ length: 16 }, () => ({ w: 32, h: 32 }));
    const result = pack(sizes, OPTIONS);
    if (!result.ok) throw new Error(result.reason);
    expect([result.width, result.height]).toEqual([128, 128]);
    expect(result.fill).toBe(1);
    expect_apart(boxes(sizes, result), 0);
  });

  test("mixed sizes never overlap and stay inside the sheet", () => {
    let seed = 3;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const sizes = Array.from({ length: 80 }, () => ({ w: 4 + Math.floor(random() * 60), h: 4 + Math.floor(random() * 60) }));
    const result = pack(sizes, OPTIONS);
    if (!result.ok) throw new Error(result.reason);
    expect_apart(boxes(sizes, result), 0);
    for (const box of boxes(sizes, result)) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.w).toBeLessThanOrEqual(result.width);
      expect(box.y + box.h).toBeLessThanOrEqual(result.height);
    }
    expect(result.fill).toBeGreaterThan(0.6);
  });

  test("padding and extrude keep frames apart and off the edges", () => {
    const sizes = [
      { w: 20, h: 10 },
      { w: 10, h: 20 },
      { w: 15, h: 15 },
    ];
    const result = pack(sizes, { ...OPTIONS, padding: 2, extrude: 1 });
    if (!result.ok) throw new Error(result.reason);
    const grown = boxes(sizes, result, 1);
    expect_apart(grown, 2);
    for (const box of grown) {
      expect(box.x).toBeGreaterThanOrEqual(2);
      expect(box.y).toBeGreaterThanOrEqual(2);
      expect(box.x + box.w + 2).toBeLessThanOrEqual(result.width);
      expect(box.y + box.h + 2).toBeLessThanOrEqual(result.height);
    }
  });

  test("power of two rounds the sheet up", () => {
    const result = pack([{ w: 100, h: 30 }], { ...OPTIONS, power_of_two: true });
    if (!result.ok) throw new Error(result.reason);
    expect([result.width, result.height]).toEqual([128, 32]);
  });

  test("refuses a frame bigger than the max size", () => {
    const result = pack([{ w: 10, h: 10 }, { w: 600, h: 20 }], { ...OPTIONS, max: 512 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("Frame 2");
  });

  test("refuses frames that don't fit together", () => {
    const sizes = Array.from({ length: 5 }, () => ({ w: 300, h: 300 }));
    const result = pack(sizes, { ...OPTIONS, max: 512 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("don't fit");
  });

  test("nothing to pack", () => {
    expect(pack([], OPTIONS).ok).toBe(false);
  });

  test("next_power_of_two", () => {
    expect([1, 2, 3, 64, 65].map(next_power_of_two)).toEqual([1, 2, 4, 64, 128]);
  });
});

describe("export formats", () => {
  const frames: AtlasFrame[] = [
    { name: "run_1.png", frame: { x: 0, y: 0, w: 8, h: 6 }, source: { x: 1, y: 2, w: 8, h: 6 }, source_size: { w: 10, h: 10 } },
    { name: "idle.png", frame: { x: 8, y: 0, w: 4, h: 4 }, source: { x: 0, y: 0, w: 4, h: 4 }, source_size: { w: 4, h: 4 } },
  ];

  test("TexturePacker JSON hash", () => {
    const json = JSON.parse(atlas_json(frames, "atlas.png", { w: 16, h: 8 }));
    expect(json.frames["run_1.png"]).toEqual({
      frame: { x: 0, y: 0, w: 8, h: 6 },
      rotated: false,
      trimmed: true,
      spriteSourceSize: { x: 1, y: 2, w: 8, h: 6 },
      sourceSize: { w: 10, h: 10 },
    });
    expect(json.frames["idle.png"].trimmed).toBe(false);
    expect(json.meta).toMatchObject({ image: "atlas.png", size: { w: 16, h: 8 } });
  });

  test("CSS classes per frame", () => {
    const css = atlas_css(frames, "atlas.png");
    expect(css).toContain('background-image: url("atlas.png")');
    expect(css).toContain(".sprite-run_1 {\n  width: 8px;\n  height: 6px;\n  background-position: 0px 0px;\n}");
    expect(css).toContain("background-position: -8px 0px;");
  });

  test("class names are safe and unique", () => {
    expect(css_class("Walk Cycle 01.png")).toBe("walk-cycle-01");
    expect(css_class("1.png")).toBe("_1");
    const css = atlas_css([frames[1], { ...frames[1], name: "idle.webp" }], "atlas.png");
    expect(css).toContain(".sprite-idle {");
    expect(css).toContain(".sprite-idle-2 {");
  });

  test("duplicate frame names get a number", () => {
    expect(unique_names(["a.png", "a.png", "b.png", "a.png"])).toEqual(["a.png", "a (2).png", "b.png", "a (3).png"]);
  });
});
