import { describe, expect, it } from "vitest";
import { changed_share, OutputClock, PauseFilter, SKIP_SENSITIVITY, skip_size, skip_threshold, to_grey } from "./skip";

const frame = (length: number, fill = 0) => new Uint8Array(length).fill(fill);

function with_pixels(base: Uint8Array, count: number, value: number) {
  const next = base.slice();
  for (let i = 0; i < count; i++) next[i] = value;
  return next;
}

describe("skip pauses", () => {
  it("shrinks to the compare width and keeps the aspect", () => {
    expect(skip_size({ width: 1920, height: 1080 })).toEqual({ width: 160, height: 90 });
    expect(skip_size({ width: 100, height: 50 })).toEqual({ width: 100, height: 50 });
    expect(skip_size({ width: 4000, height: 10 })).toEqual({ width: 160, height: 1 });
  });

  it("asks for a smaller change the higher the sensitivity", () => {
    const low = skip_threshold(SKIP_SENSITIVITY.MIN);
    const mid = skip_threshold(SKIP_SENSITIVITY.DEFAULT);
    const high = skip_threshold(SKIP_SENSITIVITY.MAX);
    expect(low).toBeCloseTo(0.01, 6);
    expect(high).toBeCloseTo(0.00007, 8);
    expect(low).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(high);
    expect(skip_threshold(-20)).toBe(low);
    expect(skip_threshold(500)).toBe(high);
  });

  it("turns RGBA into luma", () => {
    expect([...to_grey(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255]))]).toEqual([255, 0, 76]);
  });

  it("counts only pixels that moved more than the step", () => {
    const base = frame(100, 100);
    expect(changed_share(base, with_pixels(base, 30, 105))).toBe(0);
    expect(changed_share(base, with_pixels(base, 30, 140))).toBeCloseTo(0.3);
    expect(changed_share(base, frame(50))).toBe(1);
  });

  it("keeps the first frame and skips frames close to the last kept one", () => {
    const filter = new PauseFilter(0.05);
    const base = frame(100, 50);
    expect(filter.keep(base)).toBe(true);
    expect(filter.keep(base.slice())).toBe(false);
    expect(filter.keep(with_pixels(base, 2, 200))).toBe(false);
    expect(filter.keep(with_pixels(base, 10, 200))).toBe(true);
  });

  it("lets slow drift add up against the last kept frame", () => {
    const filter = new PauseFilter(0.05);
    const base = frame(100, 50);
    filter.keep(base);
    const kept: boolean[] = [];
    for (let step = 1; step <= 6; step++) kept.push(filter.keep(with_pixels(base, step * 2, 200)));
    expect(kept).toEqual([false, false, true, false, false, true]);
  });

  it("collapses a still stretch into one frame time", () => {
    const clock = new OutputClock(0);
    const times = Array.from({ length: 10 }, (_, i) => i / 10);
    const keep = [true, true, true, false, false, false, false, true, true, true];
    const placed = times.map((time, i) => clock.place(time, keep[i]));
    expect(placed.map((at) => (at === null ? null : Math.round(at * 100) / 100))).toEqual([
      0, 0.1, 0.2, null, null, null, null, 0.3, 0.4, 0.5,
    ]);
    expect(clock.end(1)).toBeCloseTo(0.6);
  });

  it("matches source time when every frame is kept", () => {
    const clock = new OutputClock(2);
    expect(clock.place(2.05, true)).toBeCloseTo(0.05);
    expect(clock.place(2.5, true)).toBeCloseTo(0.5);
    expect(clock.end(3)).toBeCloseTo(1);
  });

  it("ends on the last kept frame's own time when the tail is still", () => {
    const clock = new OutputClock(0);
    clock.place(0, true);
    clock.place(0.1, true);
    clock.place(0.2, false);
    clock.place(0.3, false);
    expect(clock.end(5)).toBeCloseTo(0.2);
  });
});
