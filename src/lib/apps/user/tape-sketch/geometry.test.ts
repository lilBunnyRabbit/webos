import { describe, expect, test } from "vitest";
import {
  align,
  closure,
  DIRECTIONS,
  measures,
  nearest_direction,
  normalize_snap,
  parse_angles,
  rebuild,
  sketch_scale,
  snap_dir,
  snap_directions,
  snap_preset,
  SnapPreset,
} from "./geometry";
import { create_sketch, point_map, SNAP_45, type Sketch, type SketchPath } from "./model";

function room(
  corners: [number, number][],
  lengths: (number | null)[],
  closed = true
): { sketch: Sketch; path: SketchPath } {
  const points = corners.map(([x, y], i) => ({ id: `p${i}`, x, y }));
  const path: SketchPath = { id: "room", points: points.map((point) => point.id), closed, lengths, check: true };
  return { sketch: { ...create_sketch(), points, paths: [path] }, path };
}

const SQUARE: [number, number][] = [
  [0, 0],
  [100, 0],
  [100, 80],
  [0, 80],
];

describe("snap_dir", () => {
  const eight = snap_directions(SNAP_45);

  test("snaps to the nearest of the set's directions and keeps the reach along it", () => {
    expect(snap_dir({ x: 0, y: 0 }, { x: 100, y: 7 }, eight)).toEqual({ x: 100, y: 0 });
    expect(snap_dir({ x: 10, y: 10 }, { x: 10, y: -50 }, eight)).toEqual({ x: 10, y: -50 });
    const diagonal = snap_dir({ x: 0, y: 0 }, { x: 50, y: 46 }, eight);
    expect(diagonal.x).toBeCloseTo(diagonal.y);
  });

  test("the 45° set is the pad's 8 directions", () => {
    expect(eight).toHaveLength(8);
    for (const direction of DIRECTIONS)
      expect(eight.some((each) => Math.hypot(each.x - direction.x, each.y - direction.y) < 1e-9)).toBe(true);
  });

  test("iso snaps to 30° up the page, its mirror, and the verticals", () => {
    const iso = snap_directions([0, 30, 90, 150]);
    expect(iso.map((each) => each.id)).toEqual(["0", "30", "90", "150", "180", "210", "270", "330"]);
    const up_right = snap_dir({ x: 0, y: 0 }, { x: 100, y: -50 }, iso);
    expect(Math.atan2(-up_right.y, up_right.x) * (180 / Math.PI)).toBeCloseTo(30);
    const down_right = snap_dir({ x: 0, y: 0 }, { x: 100, y: 55 }, iso);
    expect(Math.atan2(-down_right.y, down_right.x) * (180 / Math.PI)).toBeCloseTo(-30);
  });

  test("angles are folded into one half turn, rounded and deduplicated", () => {
    expect(normalize_snap([180, 45, 225, -30, 22.5004, 360])).toEqual([0, 22.5, 45, 150]);
  });

  test("presets are recognised, anything else is custom", () => {
    expect(snap_preset([135, 90, 45, 0])).toBe(SnapPreset.DEG_45);
    expect(snap_preset([0, 30, 90, 150])).toBe(SnapPreset.ISO);
    expect(snap_preset(Array.from({ length: 24 }, (_, i) => i * 15))).toBe(SnapPreset.DEG_15);
    expect(snap_preset([0, 90, 22.5])).toBe(SnapPreset.CUSTOM);
  });

  test("typed angles parse with commas, spaces and degree signs", () => {
    expect(parse_angles("0, 22.5 63°; 90")).toEqual([0, 22.5, 63, 90]);
    expect(parse_angles("")).toBeNull();
    expect(parse_angles("0, ten")).toBeNull();
  });

  test("the nearest direction to a pull", () => {
    const iso = snap_directions([0, 30, 90, 150]);
    expect(nearest_direction(iso, { x: 1, y: -0.4 })?.id).toBe("30");
  });
});

test("align pulls a corner onto a neighbour's axis", () => {
  expect(align({ x: 103, y: 50 }, [{ x: 100, y: 0 }], 6)).toEqual({ x: 100, y: 50 });
  expect(align({ x: 120, y: 50 }, [{ x: 100, y: 0 }], 6)).toEqual({ x: 120, y: 50 });
});

describe("closure", () => {
  test("a rectangle whose sides agree closes", () => {
    const { sketch, path } = room(SQUARE, [4000, 3000, 4000, 3000]);
    const check = closure(path, point_map(sketch))!;
    expect(check.gap.x).toBeCloseTo(0);
    expect(check.gap.y).toBeCloseTo(0);
    expect(check.closes).toBe(true);
    expect(check.complete).toBe(true);
  });

  test("shows the gap per axis when opposite sides disagree", () => {
    const { sketch, path } = room(SQUARE, [4000, 3000, 3950, 3000]);
    const check = closure(path, point_map(sketch))!;
    expect(check.gap.x).toBeCloseTo(50);
    expect(check.gap.y).toBeCloseTo(0);
    expect(check.closes).toBe(false);
  });

  test("a gap inside the tolerance still closes", () => {
    const { sketch, path } = room(SQUARE, [4000, 3000, 3997, 3000]);
    expect(closure(path, point_map(sketch))!.closes).toBe(true);
  });

  test("offers the implied value of the one unmeasured edge on an axis", () => {
    const { sketch, path } = room(SQUARE, [4000, 3000, null, 3000]);
    const check = closure(path, point_map(sketch))!;
    expect(check.implied).toEqual([{ index: 2, value: 4000 }]);
    expect(check.gap.x).toBeCloseTo(0);
    expect(check.complete).toBe(false);
  });

  test("two unmeasured edges on an axis imply nothing", () => {
    const { sketch, path } = room(SQUARE, [null, 3000, null, 3000]);
    const check = closure(path, point_map(sketch))!;
    expect(check.implied).toEqual([]);
    expect(check.gap.x).toBeNull();
    expect(check.gap.y).toBeCloseTo(0);
  });

  test("an L-shaped room implies its last wall", () => {
    const corners: [number, number][] = [
      [0, 0],
      [100, 0],
      [100, 40],
      [60, 40],
      [60, 80],
      [0, 80],
    ];
    const { sketch, path } = room(corners, [5000, 2000, 2000, 2000, 3000, null]);
    const check = closure(path, point_map(sketch))!;
    expect(check.implied).toEqual([{ index: 5, value: 4000 }]);
  });

  test("open paths have no closure", () => {
    const { sketch, path } = room(SQUARE, [100, 100, 100], false);
    expect(closure(path, point_map(sketch))).toBeNull();
  });
});

describe("measures", () => {
  test("perimeter and area come from the lengths, not the drawing", () => {
    const { sketch, path } = room(SQUARE, [4000, 3000, 4000, 3000]);
    const result = measures(path, point_map(sketch))!;
    expect(result.perimeter).toBe(14000);
    expect(result.area).toBeCloseTo(12_000_000);
    expect(result.approximate).toBe(false);
  });

  test("the area is approximate when the lengths don't close", () => {
    const { sketch, path } = room(SQUARE, [4000, 3000, 3900, 3000]);
    const result = measures(path, point_map(sketch))!;
    expect(result.approximate).toBe(true);
    expect(result.area).toBeGreaterThan(11_500_000);
    expect(result.area).toBeLessThan(12_000_000);
  });

  test("needs every edge measured", () => {
    const { sketch, path } = room(SQUARE, [4000, 3000, null, 3000]);
    expect(measures(path, point_map(sketch))).toBeNull();
  });
});

describe("rebuild", () => {
  test("moves the corners to the lengths, keeping the first corner and the path's size", () => {
    const { sketch, path } = room(SQUARE, [4000, 2000, 4000, 2000]);
    const moved = rebuild(path, point_map(sketch))!;
    const k = 360 / 12000;
    expect(moved.get("p0")).toEqual({ x: 0, y: 0 });
    expect(moved.get("p1")!.x).toBeCloseTo(4000 * k);
    expect(moved.get("p2")!.y).toBeCloseTo(2000 * k);
    expect(moved.get("p3")!.x).toBeCloseTo(0);
  });

  test("an unmeasured edge takes up the slack so the path still closes", () => {
    const { sketch, path } = room(SQUARE, [4000, 2000, 4000, null]);
    const moved = rebuild(path, point_map(sketch))!;
    expect(moved.get("p3")!.x).toBeCloseTo(0);
  });

  test("nothing to rebuild without a measured edge", () => {
    const { sketch, path } = room(SQUARE, [null, null, null, null]);
    expect(rebuild(path, point_map(sketch))).toBeNull();
  });
});

describe("check lengths off", () => {
  test("no closure, no implied length, no rebuild; perimeter but no area", () => {
    const { sketch, path } = room(SQUARE, [4000, 3000, 3900, 3000]);
    const off = { ...path, check: false };
    const points = point_map(sketch);
    expect(closure(off, points)).toBeNull();
    expect(closure({ ...off, lengths: [4000, 3000, null, 3000] }, points)).toBeNull();
    expect(rebuild(off, points)).toBeNull();
    expect(measures(off, points)).toEqual({ perimeter: 13900, area: null, approximate: false });
  });
});

test("sketch_scale is the median ratio of drawn to measured", () => {
  const { sketch } = room(SQUARE, [1000, 800, null, null]);
  expect(sketch_scale(sketch)).toBeCloseTo(0.1);
  expect(sketch_scale(create_sketch())).toBeNull();
});

describe("parse_angles cap", () => {
  test("refuses more angles than a file may hold", () => {
    const many = Array.from({ length: 181 }, (_, i) => i * 0.5).join(",");
    expect(parse_angles(many)).toBeNull();
    expect(parse_angles("0, 22.5, 63, 90")).toEqual([0, 22.5, 63, 90]);
  });
});
