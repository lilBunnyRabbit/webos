import { describe, expect, it } from "vitest";
import { BIRD_FPS, bird_frame, bird_scene } from "./bird-fixture";
import { to_gray } from "./ncc";
import { FrameStatus, status_of } from "./path";
import { Tracker, type TrackPoint } from "./tracker";

function crop(rgba: Uint8ClampedArray, stride: number, x: number, y: number, width: number, height: number) {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++)
    out.set(rgba.subarray(((y + row) * stride + x) * 4, ((y + row) * stride + x + width) * 4), row * width * 4);
  return out;
}

function track(follow_size: boolean) {
  const scene = bird_scene();
  const tracker = new Tracker({ box: scene.box, frame: scene, follow_size });
  expect(tracker.factor).toBe(1);
  const out: { point: TrackPoint; error: number; x: number }[] = [];
  for (let i = 0; i < scene.seconds * BIRD_FPS; i++) {
    const t = i / BIRD_FPS;
    const area = tracker.region();
    const rgba = crop(bird_frame(scene, t), scene.width, area.x, area.y, area.width, area.height);
    const region = to_gray(rgba, area.width, area.height);
    let point: TrackPoint;
    if (i === 0) {
      tracker.start(region, area, rgba);
      point = tracker.first(t);
    } else point = tracker.step(region, area, t, rgba);
    const truth = scene.at(t);
    out.push({ point, error: Math.hypot(point.cx - truth.x, point.cy - truth.y), x: truth.x });
  }
  return { scene, out };
}

describe("a bird that changes shape every few frames", () => {
  for (const follow_size of [false, true])
    it(`stays on it over the sky and goes lost, not wrong, in the trees${follow_size ? " (Follow size)" : ""}`, () => {
      const { scene, out } = track(follow_size);
      const found = (sample: (typeof out)[number]) => status_of(sample.point) !== FrameStatus.LOST;
      const sky = out.filter((sample) => sample.x < scene.trees - 30);
      const trees = out.filter((sample) => sample.x > scene.trees + 30);
      expect(sky.filter(found).length / sky.length).toBeGreaterThan(0.95);
      expect(Math.max(...sky.filter(found).map((sample) => sample.error))).toBeLessThan(5);
      expect(out.some((sample) => sample.point.shape)).toBe(true);
      expect(trees.filter(found).every((sample) => sample.error < 5)).toBe(true);
      expect(trees.filter((sample) => !found(sample)).length).toBeGreaterThan(trees.length / 2);
    });
});
