import { describe, expect, test } from "vitest";
import { clamp_count, compute_layout, SplitDirection } from "./split";

describe("split", () => {
  test("columns give square tiles and enough rows to cover the height", () => {
    expect(compute_layout(300, 250, { direction: SplitDirection.COLUMNS, count: 3 })).toMatchObject({
      columns: 3,
      rows: 3,
      size: 100,
      tile: 100,
    });
  });

  test("rows set the tile size from the height", () => {
    expect(compute_layout(300, 200, { direction: SplitDirection.ROWS, count: 2 })).toMatchObject({
      columns: 3,
      rows: 2,
      size: 100,
    });
  });

  test("clamp_count keeps the count between 1 and the cap", () => {
    expect(clamp_count(0)).toBe(1);
    expect(clamp_count(2.7)).toBe(2);
    expect(clamp_count(1000)).toBe(300);
    expect(clamp_count(Number.NaN)).toBe(1);
  });
});
