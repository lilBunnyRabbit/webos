import { describe, expect, it } from "vitest";
import {
  BLOB,
  busy_edge,
  components,
  estimate_background,
  find_blob,
  measure_subject,
  pick_component,
  segment,
  to_planes,
} from "./blob";

const WIDTH = 120;
const HEIGHT = 90;

type Paint = (x: number, y: number) => readonly [number, number, number] | null;

function window_of(...layers: Paint[]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y++)
    for (let x = 0; x < WIDTH; x++) {
      let color: readonly number[] = [70 + y * 0.6, 130 + y * 0.4, 210 + y * 0.2];
      for (const layer of layers) color = layer(x, y) ?? color;
      out.set([...color, 255], (y * WIDTH + x) * 4);
    }
  return out;
}

const disc =
  (cx: number, cy: number, r: number, color: readonly [number, number, number]): Paint =>
  (x, y) =>
    (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r ? color : null;

const DARK = [25, 25, 35] as const;
const WHITE = [236, 236, 230] as const;

function noise(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const leaves: Paint = (x, y) => {
  const n = noise(x >> 1, y >> 1);
  return n > 0.15 ? [30 + 70 * n, 80 + 100 * n, 30 + 30 * n] : null;
};

describe("blob", () => {
  it("fits a sky gradient and keeps it out of the foreground", () => {
    const planes = to_planes(window_of(), WIDTH, HEIGHT);
    const background = estimate_background(planes);
    expect(background.busy).toBe(false);
    expect(background.luma.sigma).toBeLessThan(1);
    expect(segment(planes, background).every((value) => value === 0)).toBe(true);
  });

  it("segments both a dark silhouette and a white belly against the sky", () => {
    const planes = to_planes(
      window_of(disc(30, 45, 6, DARK), disc(85, 45, 9, DARK), disc(85, 45, 5, WHITE)),
      WIDTH,
      HEIGHT
    );
    const found = components(segment(planes, estimate_background(planes)), WIDTH, HEIGHT).sort((a, b) => a.cx - b.cx);
    expect(found).toHaveLength(2);
    expect(found[0].area).toBeGreaterThan(100);
    expect(Math.hypot(found[0].cx - 30, found[0].cy - 45)).toBeLessThan(0.5);
    expect(found[1].area).toBeGreaterThan(240);
    expect(Math.hypot(found[1].cx - 85, found[1].cy - 45)).toBeLessThan(0.5);
  });

  it("picks the plausibly sized component nearest the prediction", () => {
    const planes = to_planes(
      window_of(disc(25, 30, 6, DARK), disc(90, 60, 6, DARK), disc(60, 20, 2, DARK)),
      WIDTH,
      HEIGHT
    );
    const mask = segment(planes, estimate_background(planes));
    const area = Math.PI * 36;
    expect(pick_component(mask, WIDTH, HEIGHT, { x: 80, y: 55 }, area)).toMatchObject({ cx: expect.closeTo(90, 0) });
    expect(pick_component(mask, WIDTH, HEIGHT, { x: 30, y: 30 }, area)).toMatchObject({ cx: expect.closeTo(25, 0) });
    expect(pick_component(mask, WIDTH, HEIGHT, { x: 60, y: 20 }, area)?.area).toBeGreaterThan(area * BLOB.MIN_AREA);
    expect(pick_component(mask, WIDTH, HEIGHT, { x: 60, y: 20 }, area * 10)).toBeNull();
  });

  it("rejects a window of leaves, and a leaf at the edge of a tree", () => {
    const bird = disc(60, 45, 7, DARK);
    const textured = to_planes(window_of(leaves, bird), WIDTH, HEIGHT);
    expect(busy_edge(textured.luma)).toBe(true);
    expect(find_blob(textured, { x: 60, y: 45 }, Math.PI * 49)).toBeNull();

    const tree_side: Paint = (x, y) => (x < 40 ? leaves(x, y) : null);
    const leaf = disc(44, 45, 6, [40, 90, 35]);
    const edge = to_planes(window_of(tree_side, leaf), WIDTH, HEIGHT);
    expect(estimate_background(edge).busy).toBe(false);
    expect(find_blob(edge, { x: 44, y: 45 }, Math.PI * 36)).toBeNull();

    const clear = to_planes(window_of(tree_side, disc(90, 45, 6, DARK)), WIDTH, HEIGHT);
    expect(find_blob(clear, { x: 80, y: 45 }, Math.PI * 36)).toMatchObject({ cx: expect.closeTo(90, 0) });
  });

  it("learns the subject's area and offset from the boxed first frame", () => {
    const planes = to_planes(window_of(disc(62, 47, 6, DARK)), WIDTH, HEIGHT);
    const subject = measure_subject(planes, { x: 60, y: 45 }, 30, 24)!;
    expect(subject.area).toBeCloseTo(Math.PI * 36, -1);
    expect(subject.dx).toBeCloseTo(2, 0);
    expect(subject.dy).toBeCloseTo(2, 0);
    expect(measure_subject(to_planes(window_of(leaves), WIDTH, HEIGHT), { x: 60, y: 45 }, 30, 24)).toBeNull();
  });
});
