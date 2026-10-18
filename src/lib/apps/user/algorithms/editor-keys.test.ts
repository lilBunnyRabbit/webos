import { describe, expect, test } from "vitest";
import { free_spot, is_arrow, nudge } from "./editor-keys";

describe("editor keys", () => {
  test("arrows nudge by 1, or 10 with Shift, inside 0–100", () => {
    expect(nudge({ x: 50, y: 50 }, "ArrowLeft", false)).toEqual({ x: 49, y: 50 });
    expect(nudge({ x: 50, y: 50 }, "ArrowDown", true)).toEqual({ x: 50, y: 60 });
    expect(nudge({ x: 95, y: 3 }, "ArrowRight", true)).toEqual({ x: 100, y: 3 });
    expect(nudge({ x: 95, y: 3 }, "ArrowUp", true)).toEqual({ x: 95, y: 0 });
    expect(nudge({ x: 1, y: 1 }, "Enter", false)).toEqual({ x: 1, y: 1 });
    expect(is_arrow("ArrowUp")).toBe(true);
    expect(is_arrow("a")).toBe(false);
  });

  test("a free spot starts at the centre and keeps its distance", () => {
    expect(free_spot([])).toEqual({ x: 50, y: 50 });
    const taken = [{ x: 50, y: 50 }, { x: 41, y: 41 }];
    const spot = free_spot(taken);
    for (const point of taken) expect(Math.hypot(point.x - spot.x, point.y - spot.y)).toBeGreaterThanOrEqual(10);
  });
});
