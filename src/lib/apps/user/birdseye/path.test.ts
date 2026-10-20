import { describe, expect, it } from "vitest";
import {
  build_path,
  fill_gaps,
  FrameStatus,
  next_lost,
  path_at,
  sample_at,
  smooth,
  splice_track,
  status_runs,
  strip_gradient,
} from "./path";
import type { TrackPoint } from "./tracker";

const point = (t: number, cx: number, conf = 0.9, scale = 1): TrackPoint => ({ t, cx, cy: cx * 2, scale, conf });

describe("path", () => {
  it("groups samples into runs by status", () => {
    const track = [point(0, 0), point(0.1, 0), point(0.2, 0, 0.2), point(0.3, 0, 0.65), point(0.4, 0)];
    const runs = status_runs(track);
    expect(runs.map((run) => run.status)).toEqual([
      FrameStatus.GOOD,
      FrameStatus.LOST,
      FrameStatus.WEAK,
      FrameStatus.GOOD,
    ]);
    expect(runs.map((run) => [run.from, run.to].map((value) => Math.round(value * 10) / 10))).toEqual([
      [0, 0.2],
      [0.2, 0.3],
      [0.3, 0.4],
      [0.4, 0.5],
    ]);
  });

  it("interpolates lost samples and holds the ends", () => {
    const filled = fill_gaps([
      point(0, 5, 0.1),
      point(1, 10),
      point(2, 0, 0.1),
      point(3, 0, 0.1),
      point(4, 40),
      point(5, 0, 0.1),
    ])!;
    expect(filled.map((sample) => sample.cx)).toEqual([10, 10, 20, 30, 40, 40]);
    expect(filled[2].conf).toBe(0.1);
    expect(fill_gaps([point(0, 1, 0.1)])).toBeNull();
  });

  it("smooths forward and backward without lag", () => {
    const step = smooth([0, 0, 0, 0, 0, 10, 10, 10, 10, 10], 0.3);
    expect(step[4] + step[5]).toBeCloseTo(10, 0);
    expect(step[0]).toBeGreaterThan(0);
    const line = smooth(
      Array.from({ length: 101 }, (_, i) => i),
      0.3
    );
    expect(line[50]).toBeCloseTo(50, 5);
  });

  it("holds the sample of the frame on screen and clamps past the ends", () => {
    const path = build_path([point(0, 10), point(1, 10), point(2, 10)])!;
    expect(path_at(path, 0.5)).toEqual({ cx: 10, cy: 20, scale: 1 });
    expect(path_at(path, -1).cx).toBe(10);
    expect(path_at(path, 9).cx).toBe(10);
    const ramp = build_path([point(0, 0), point(1, 10), point(2, 20)])!;
    expect(path_at(ramp, 0.999999).cx).toBe(ramp.cx[0]);
    expect(path_at(ramp, 1).cx).toBe(ramp.cx[1]);
  });

  it("smooths scale in log space", () => {
    const track = Array.from({ length: 200 }, (_, i) => point(i / 30, 0, 0.9, i < 100 ? 2 : 0.5));
    const path = build_path(track)!;
    expect(path.scale[0]).toBeCloseTo(2, 1);
    expect(Math.sqrt(path.scale[99] * path.scale[100])).toBeCloseTo(1, 1);
  });

  it("finds the sample at a time, the next lost one, and splices a re-track", () => {
    const track = [point(0, 0), point(1, 1, 0.1), point(2, 2), point(3, 3, 0.1)];
    expect(sample_at(track, 1.5)?.t).toBe(1);
    expect(sample_at(track, -1)).toBeNull();
    expect(next_lost(track, 1)).toBe(3);
    expect(next_lost(track, 3)).toBe(1);
    const run = [point(0, 0), point(1, 0, 0.1), point(2, 0, 0.1), point(3, 0), point(4, 0, 0.1)];
    expect(next_lost(run, 1)).toBe(4);
    expect(next_lost([point(0, 0)], 0)).toBeNull();
    expect(splice_track(track, 2, [point(2, 9), point(3, 9)]).map((sample) => [sample.t, sample.cx])).toEqual([
      [0, 0],
      [1, 1],
      [2, 9],
      [3, 9],
    ]);
  });

  it("draws the runs as hard stops, untracked time empty", () => {
    const colors = { good: "G", weak: "W", lost: "L" };
    expect(strip_gradient([], 10, colors, "E")).toBe("E");
    expect(
      strip_gradient(
        [
          { from: 2, to: 5, status: FrameStatus.GOOD },
          { from: 5, to: 6, status: FrameStatus.LOST },
        ],
        10,
        colors,
        "E"
      )
    ).toBe("linear-gradient(to right, E 0.000% 20.000%, G 20.000% 50.000%, L 50.000% 60.000%, E 60.000% 100%)");
  });
});
