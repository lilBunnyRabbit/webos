import { describe, expect, test } from "vitest";
import {
  empty_stats,
  hint,
  line_done,
  Mark,
  mistakes,
  new_game,
  paint,
  record,
  restore,
  runs_done,
  saved_schema,
  stroke_cells,
  with_marks,
} from "./game";

const { EMPTY: _, FILLED: F, CROSSED: X } = Mark;

describe("line_done", () => {
  test("matches runs and ignores crosses", () => {
    expect(line_done([2, 1], [F, F, X, F, _])).toBe(true);
    expect(line_done([2, 1], [F, F, F, _, _])).toBe(false);
    expect(line_done([], [X, _, X])).toBe(true);
  });
});

describe("a game", () => {
  test("is solved once the solution is filled in", () => {
    const game = new_game("5", 42);
    const marks = game.puzzle.solution.map((filled) => (filled ? F : _));
    expect(with_marks(game, marks).solved).toBe(true);
    expect(game.solved).toBe(false);
  });

  test("hints fix a wrong mark first", () => {
    const game = new_game("10", 7);
    const wrong = game.puzzle.solution.findIndex((filled) => !filled);
    const marks = [...game.marks];
    marks[wrong] = F;
    const next = with_marks(game, marks);
    expect(mistakes(next)).toEqual([wrong]);
    expect(hint(next)).toEqual({ index: wrong, mark: X, fix: true });
  });

  test("following hints alone solves the puzzle", () => {
    let game = new_game("15", 99);
    for (let step = 0; step < 15 * 15 && !game.solved; step++) {
      const next = hint(game)!;
      expect(next.fix).toBe(false);
      expect(next.mark).toBe(game.puzzle.solution[next.index] ? F : X);
      const marks = [...game.marks];
      marks[next.index] = next.mark;
      game = with_marks(game, marks);
    }
    expect(game.solved).toBe(true);
  });
});

describe("strokes", () => {
  test("stay on one axis", () => {
    expect(stroke_cells(5, 0, 3, "row")).toEqual([0, 1, 2, 3]);
    expect(stroke_cells(5, 12, 2, "col")).toEqual([12, 7, 2]);
  });

  test("paint blanks only, or erase their own mark only", () => {
    expect(paint([_, X, F, _], [0, 1, 2, 3], F, false)).toEqual([F, X, F, F]);
    expect(paint([F, X, F, _], [0, 1, 2, 3], F, true)).toEqual([_, X, _, _]);
  });
});

describe("stats", () => {
  test("best only counts solves without hints", () => {
    let stats = record(empty_stats(), "10", 90_000, 0);
    stats = record(stats, "10", 30_000, 2);
    expect(stats["10"]).toEqual({ solved: 2, best: 90_000 });
  });
});

describe("saves", () => {
  test("round-trip through the seed", () => {
    const game = new_game("10", 555);
    const marks = [...game.marks];
    marks[3] = F;
    marks[4] = X;
    const saved = saved_schema.parse({ size: "10", seed: 555, marks, hints: 1, elapsed: 1000 });
    const back = restore(saved)!;
    expect(back.puzzle).toEqual(game.puzzle);
    expect(back.marks).toEqual(marks);
    expect(back.hints).toBe(1);
  });
});

describe("runs_done", () => {
  test("settles runs walled in from either end", () => {
    expect(runs_done([2, 1, 3], [F, F, X, _, _, _, X, F, F, F])).toEqual([true, false, true]);
    expect(runs_done([2, 1, 3], [F, F, X, _, _, _, _, F, F, F])).toEqual([true, false, false]);
    expect(runs_done([2, 1], [X, F, F, X, _])).toEqual([true, false]);
  });

  test("an open-ended run stays unsettled", () => {
    expect(runs_done([2, 1], [F, F, _, _, _])).toEqual([false, false]);
    expect(runs_done([3], [_, F, F, F, _])).toEqual([true]);
  });

  test("a wrong length stops the match", () => {
    expect(runs_done([2, 1], [F, X, _, _, _])).toEqual([false, false]);
  });
});
