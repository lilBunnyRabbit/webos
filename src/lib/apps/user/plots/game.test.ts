import { describe, expect, test } from "vitest";
import {
  apply_hint,
  daily_game,
  empty_stats,
  hint,
  is_solved,
  new_game,
  place,
  Problem,
  problem_of,
  record,
  restore,
  Size,
  to_saved,
  with_plots,
  type Game,
} from "./game";
import { same_rect, Shape, type Puzzle } from "./puzzle";

const tiny: Puzzle = {
  size: 2,
  seed: 0,
  clues: [
    { cell: 0, area: 2, shape: Shape.WIDE },
    { cell: 3, area: null, shape: Shape.WIDE },
  ],
  solution: [
    { row: 0, col: 0, width: 2, height: 1 },
    { row: 1, col: 0, width: 2, height: 1 },
  ],
};

function tiny_game(): Game {
  return { puzzle: tiny, plots: [], hints: 0, solved: false };
}

describe("rules", () => {
  test("a plot is checked against its one clue", () => {
    expect(problem_of(tiny, { row: 0, col: 0, width: 2, height: 1 })).toBeNull();
    expect(problem_of(tiny, { row: 0, col: 0, width: 1, height: 2 })).toBe(Problem.SHAPE);
    expect(problem_of(tiny, { row: 0, col: 0, width: 1, height: 1 })).toBe(Problem.AREA);
    expect(problem_of(tiny, { row: 0, col: 1, width: 1, height: 1 })).toBe(Problem.NO_CLUE);
    expect(problem_of(tiny, { row: 0, col: 0, width: 2, height: 2 })).toBe(Problem.CLUES);
  });

  test("a new plot replaces the ones it overlaps", () => {
    const plots = place([{ row: 0, col: 0, width: 2, height: 1 }], { row: 0, col: 1, width: 1, height: 2 });
    expect(plots).toEqual([{ row: 0, col: 1, width: 1, height: 2 }]);
  });

  test("solved once every cell is covered and every clue holds", () => {
    expect(is_solved(tiny, tiny.solution)).toBe(true);
    expect(is_solved(tiny, tiny.solution.slice(0, 1))).toBe(false);
  });
});

describe("hint", () => {
  test("takes away a wrong plot first", () => {
    const game = with_plots(tiny_game(), [{ row: 0, col: 0, width: 1, height: 2 }]);
    const next = hint(game)!;
    expect(next).toMatchObject({ rect: null, remove: 0, fix: true });
    expect(apply_hint(game.plots, next)).toEqual([]);
  });

  test("then places the plot logic proves next", () => {
    const next = hint(tiny_game())!;
    expect(next.fix).toBe(false);
    expect(same_rect(next.rect!, tiny.solution[0])).toBe(true);
  });

  test("hints alone solve a generated puzzle", () => {
    let game = new_game(Size.S8, 5);
    for (let guard = 0; !game.solved && guard < 100; guard++) game = with_plots(game, apply_hint(game.plots, hint(game)!));
    expect(game.solved).toBe(true);
  });
});

describe("saves and stats", () => {
  test("a save restores the same plots on the same puzzle", () => {
    const game = new_game(Size.S6, 77);
    const plots = game.puzzle.solution.slice(0, 3);
    const back = restore({ size: Size.S6, seed: 77, plots: plots.map(to_saved), hints: 1, elapsed: 5 })!;
    expect(back.plots).toEqual(plots);
    expect(back.hints).toBe(1);
  });

  test("a plot off the board drops the save", () => {
    expect(restore({ size: Size.S6, seed: 1, plots: [[5, 5, 2, 1]], hints: 0, elapsed: 0 })).toBeNull();
  });

  test("best times count only solves without hints", () => {
    let stats = record(empty_stats(), Size.S7, 5000, 1);
    expect(stats["7"]).toEqual({ solved: 1, best: null });
    stats = record(stats, Size.S7, 9000, 0);
    expect(stats["7"]).toEqual({ solved: 2, best: 9000 });
  });

  test("the daily is 7×7 and the same for everyone", () => {
    expect(daily_game("2026-10-22").puzzle.size).toBe(7);
    expect(daily_game("2026-10-22").puzzle).toEqual(daily_game("2026-10-22").puzzle);
  });
});
