import { describe, expect, it } from "vitest";
import { gray, sample_patch, type Gray } from "./ncc";
import { TRACK, Tracker, work_factor } from "./tracker";

const WIDTH = 240;
const HEIGHT = 160;

function background(): Gray {
  const image = gray(WIDTH, HEIGHT);
  for (let y = 0; y < HEIGHT; y++)
    for (let x = 0; x < WIDTH; x++) image.data[y * WIDTH + x] = 200 + 20 * Math.sin(x / 9) * Math.cos(y / 13);
  return image;
}

// Anti-aliased, so sub-pixel moves show in the pixels.
function frame(cx: number, cy: number, side = 20, occluded = false): Gray {
  const image = background();
  if (occluded) return image;
  for (let y = 0; y < HEIGHT; y++)
    for (let x = 0; x < WIDTH; x++) {
      const cover = (a: number, half: number) => Math.min(1, Math.max(0, half + 0.5 - Math.abs(a)));
      const outer = cover(x + 0.5 - cx, side / 2) * cover(y + 0.5 - cy, side / 2);
      const inner = cover(x + 0.5 - (cx - side / 6), side / 6) * cover(y + 0.5 - (cy - side / 6), side / 6);
      const at = y * WIDTH + x;
      image.data[at] = image.data[at] * (1 - outer) + 30 * outer;
      image.data[at] = image.data[at] * (1 - inner) + 230 * inner;
    }
  return image;
}

function run(tracker: Tracker, image: Gray, t: number, first = false) {
  const area = tracker.region();
  const scaled =
    tracker.factor === 1
      ? image
      : sample_patch(image, WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, tracker.work.width, tracker.work.height);
  const region = sample_patch(
    scaled,
    area.x + area.width / 2,
    area.y + area.height / 2,
    area.width,
    area.height,
    area.width,
    area.height
  );
  if (first) {
    tracker.start(region, area);
    return tracker.first(t);
  }
  return tracker.step(region, area, t);
}

const path = (t: number) => ({ x: 120 + 80 * Math.sin(t * 1.3), y: 80 + 45 * Math.sin(t * 1.9 + 0.4) });

describe("tracker", () => {
  it("works at full size up to the work side, scaled down past it", () => {
    expect(work_factor({ width: 40, height: 20 })).toBe(1);
    expect(work_factor({ width: 96, height: 200 })).toBeCloseTo(TRACK.WORK_SIDE / 200);
  });

  it("follows a moving square within half a pixel", () => {
    const start = path(0);
    const tracker = new Tracker({
      box: { x: start.x - 10, y: start.y - 10, width: 20, height: 20 },
      frame: { width: WIDTH, height: HEIGHT },
      follow_size: false,
    });
    run(tracker, frame(start.x, start.y), 0, true);
    let worst = 0;
    for (let i = 1; i <= 90; i++) {
      const t = i / 30;
      const truth = path(t);
      const point = run(tracker, frame(truth.x, truth.y), t);
      expect(point.conf).toBeGreaterThan(TRACK.WEAK);
      worst = Math.max(worst, Math.hypot(point.cx - truth.x, point.cy - truth.y));
    }
    expect(worst).toBeLessThan(0.5);
  });

  it("marks an occluded frame lost, holds still, and picks the subject up again", () => {
    const tracker = new Tracker({
      box: { x: 90, y: 60, width: 20, height: 20 },
      frame: { width: WIDTH, height: HEIGHT },
      follow_size: false,
    });
    run(tracker, frame(100, 70), 0, true);
    run(tracker, frame(102, 70), 1 / 30);
    const lost = run(tracker, frame(0, 0, 20, true), 2 / 30);
    expect(lost.conf).toBeLessThan(TRACK.LOST);
    expect(lost.cx).toBeCloseTo(102, 0);
    const back = run(tracker, frame(106, 71), 3 / 30);
    expect(back.conf).toBeGreaterThan(TRACK.WEAK);
    expect(Math.hypot(back.cx - 106, back.cy - 71)).toBeLessThan(0.5);
  });

  it("follows a growing subject with Follow size, and reports scale 1 without it", () => {
    const box = { x: 90, y: 60, width: 20, height: 20 };
    const sized = new Tracker({ box, frame: { width: WIDTH, height: HEIGHT }, follow_size: true });
    const fixed = new Tracker({ box, frame: { width: WIDTH, height: HEIGHT }, follow_size: false });
    run(sized, frame(100, 70, 20), 0, true);
    run(fixed, frame(100, 70, 20), 0, true);
    let last = { scale: 1 };
    for (let i = 1; i <= 20; i++) {
      const side = 20 * (1 + i * 0.02);
      last = run(sized, frame(100, 70, side), i / 30);
      expect(run(fixed, frame(100, 70, side), i / 30).scale).toBe(1);
    }
    expect(last.scale).toBeGreaterThan(1.25);
  });

  it("tracks a big box on a scaled-down frame and answers in source pixels", () => {
    const tracker = new Tracker({
      box: { x: 60, y: 30, width: 100, height: 100 },
      frame: { width: WIDTH, height: HEIGHT },
      follow_size: false,
    });
    expect(tracker.factor).toBeCloseTo(0.48);
    run(tracker, frame(110, 80, 100), 0, true);
    const point = run(tracker, frame(116, 83, 100), 1 / 30);
    expect(Math.hypot(point.cx - 116, point.cy - 83)).toBeLessThan(1.5);
  });
});
