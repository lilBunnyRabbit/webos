import { describe, expect, it } from "vitest";
import { difference, grid_size, MAX_GRID, odd_round, remaining_ms } from "./odd";

describe("odd one out", () => {
  it("grows from 2×2 to 9×9", () => {
    expect(grid_size(0)).toBe(2);
    expect(grid_size(1)).toBe(2);
    expect(grid_size(2)).toBe(3);
    expect(grid_size(100)).toBe(MAX_GRID);
  });

  it("shrinks the difference to a floor", () => {
    expect(difference(1)).toBeLessThan(difference(0));
    expect(difference(100)).toBe(2.5);
  });

  it("replays a round from seed and level, the odd tile on the board and different", () => {
    for (let seed = 0; seed < 20; seed++) {
      for (let level = 0; level < 30; level++) {
        const round = odd_round(seed, level);
        expect(round).toEqual(odd_round(seed, level));
        expect(round.odd).toBeGreaterThanOrEqual(0);
        expect(round.odd).toBeLessThan(round.size * round.size);
        expect(round.odd_color).not.toBe(round.base);
      }
    }
  });

  it("counts misses as lost time", () => {
    expect(remaining_ms(10_000, 0)).toBe(50_000);
    expect(remaining_ms(10_000, 2)).toBe(44_000);
    expect(remaining_ms(59_000, 3)).toBe(0);
  });
});
