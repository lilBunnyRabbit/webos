import { describe, expect, test } from "vitest";
import {
  empty_stats,
  hint,
  Mode,
  resume,
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
import type { Clue } from "./puzzle";

const { EMPTY: _, FILLED: F, CROSSED: X } = Mark;
const bw = (...lengths: number[]): Clue => lengths.map((length) => ({ length, color: 1 }));

describe("line_done", () => {
  test("matches runs and ignores crosses", () => {
    expect(line_done(bw(2, 1), [F, F, X, F, _])).toBe(true);
    expect(line_done(bw(2, 1), [F, F, F, _, _])).toBe(false);
    expect(line_done(bw(), [X, _, X])).toBe(true);
  });
});

describe("a game", () => {
  test("is solved once the solution is filled in", () => {
    const game = new_game("5", 42);
    const marks = game.puzzle.solution.map((cell) => (cell ? F : _));
    expect(with_marks(game, marks).solved).toBe(true);
    expect(game.solved).toBe(false);
  });

  test("hints fix a wrong mark first", () => {
    const game = new_game("10", 7);
    const wrong = game.puzzle.solution.findIndex((cell) => !cell);
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
    expect(runs_done(bw(2, 1, 3), [F, F, X, _, _, _, X, F, F, F])).toEqual([true, false, true]);
    expect(runs_done(bw(2, 1, 3), [F, F, X, _, _, _, _, F, F, F])).toEqual([true, false, false]);
    expect(runs_done(bw(2, 1), [X, F, F, X, _])).toEqual([true, false]);
  });

  test("an open-ended run stays unsettled", () => {
    expect(runs_done(bw(2, 1), [F, F, _, _, _])).toEqual([false, false]);
    expect(runs_done(bw(3), [_, F, F, F, _])).toEqual([true]);
  });

  test("a wrong length stops the match", () => {
    expect(runs_done(bw(2, 1), [F, X, _, _, _])).toEqual([false, false]);
  });
});

describe("colour games", () => {
  const runs = (...pairs: [number, number][]): Clue => pairs.map(([length, color]) => ({ length, color }));

  test("touching colours are separate runs, settled when walled in", () => {
    expect(line_done(runs([2, 1], [1, 2]), [1, 1, 2, X])).toBe(true);
    expect(runs_done(runs([2, 1], [1, 2], [1, 1]), [1, 1, 2, _, _, _])).toEqual([true, false, false]);
    expect(runs_done(runs([2, 1], [1, 2], [1, 1]), [1, 1, 2, X, _, _])).toEqual([true, true, false]);
    expect(runs_done(runs([2, 1]), [2, 2, X])).toEqual([false]);
  });

  test("a wrong colour is a mistake, and the hint names the right one", () => {
    const game = new_game("10", 21, Mode.COLOR);
    const index = game.puzzle.solution.findIndex((cell) => cell > 0);
    const wrong = (game.puzzle.solution[index] % game.puzzle.palette.length) + 1;
    const marks = [...game.marks];
    marks[index] = wrong;
    const next = with_marks(game, marks);
    expect(mistakes(next)).toEqual([index]);
    expect(hint(next)).toEqual({ index, mark: game.puzzle.solution[index], fix: true });
  });

  test("following hints alone solves a colour puzzle", () => {
    let game = new_game("15", 4242, Mode.COLOR);
    expect(game.puzzle.palette.length).toBeGreaterThan(1);
    for (let step = 0; step < 15 * 15 && !game.solved; step++) {
      const next = hint(game)!;
      expect(next.fix).toBe(false);
      const marks = [...game.marks];
      marks[next.index] = next.mark;
      game = with_marks(game, marks);
    }
    expect(game.solved).toBe(true);
    expect(game.marks.map((mark) => Math.max(0, mark))).toEqual(game.puzzle.solution);
  });

  test("the editor paints over other colours; EMPTY clears", () => {
    expect(paint([1, 2, _, X], [0, 1, 2, 3], 2, false, true)).toEqual([2, 2, 2, 2]);
    expect(paint([1, 2, _], [0, 1, 2], _, false)).toEqual([_, _, _]);
  });
});

describe("restoring", () => {
  test("old saves stored a cross as 2", () => {
    const game = new_game("5", 8);
    const marks = game.marks.map((_, index) => (index === 0 ? 2 : 0));
    expect(restore(saved_schema.parse({ size: "5", seed: 8, marks, hints: 0, elapsed: 0 }))!.marks[0]).toBe(X);
  });

  test("marks that don't fit the puzzle are refused", () => {
    const game = new_game("5", 8);
    expect(resume(game, [F], 0)).toBeNull();
    expect(resume(game, game.marks.map(() => 3), 0)).toBeNull();
  });
});
