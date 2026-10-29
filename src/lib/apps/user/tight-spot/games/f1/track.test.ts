import { describe, expect, it } from "vitest";
import { body_centre, max_steer, steer_base } from "../../core/vehicle";
import { SPEC } from "./spec";
import { lock_curvature, LINE_ROOM, racing_line } from "./line";
import { HALF_WIDTH, KERB, locate, passes, progress, trace } from "./track";
import { TRACK_DEFS, TRACK_IDS, track_of } from "./tracks";

describe("tracks", () => {
  it.each(TRACK_DEFS.map((def) => [def.id, def] as const))("%s closes on itself", (_, def) => {
    const { end } = trace(def.pieces);
    expect(Math.hypot(end.x, end.y)).toBeLessThan(1);
    expect(end.heading).toBeCloseTo(Math.PI * 2, 6);
  });

  it.each(TRACK_IDS)("%s: bends the car can take, walls clear of the kerbs", (id) => {
    const track = track_of(id);
    const lock = Math.tan(max_steer(SPEC)) / steer_base(SPEC);
    expect(Math.max(...track.curvature.map(Math.abs))).toBeLessThan(lock * 0.6);
    expect(Math.min(...track.wall_left, ...track.wall_right)).toBeGreaterThanOrEqual(HALF_WIDTH + KERB + 0.5);
    expect(track.length).toBeGreaterThan(400);
  });

  it.each(TRACK_IDS)("%s: the grid sits behind the line, on the track", (id) => {
    const track = track_of(id);
    const at = locate(track, body_centre(track.start, SPEC));
    expect(Math.abs(at.lateral)).toBeLessThan(0.1);
    expect(progress(at.s, 0, track.length)).toBeGreaterThan(5);
    expect(progress(at.s, 0, track.length)).toBeLessThan(10);
  });

  it.each(TRACK_IDS)("%s: the racing line stays on the asphalt and inside the lock", (id) => {
    const line = racing_line(track_of(id));
    expect(Math.max(...line.offset.map(Math.abs))).toBeLessThanOrEqual(LINE_ROOM + 1e-9);
    expect(Math.max(...line.curvature.map(Math.abs))).toBeLessThan(lock_curvature());
    expect(line.splits[0]).toBeLessThan(line.splits[1]);
    expect(line.splits[1]).toBeLessThan(line.ms);
  });

  it("measures progress round the loop", () => {
    expect(progress(990, 10, 1000)).toBe(20);
    expect(progress(10, 990, 1000)).toBe(-20);
    expect(passes(995, 10, 0, 1000)).toBe(true);
    expect(passes(995, 3, 0, 1000)).toBe(false);
    expect(passes(5, -10, 0, 1000)).toBe(false);
  });
});
