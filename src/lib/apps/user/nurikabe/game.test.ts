import { describe, expect, it } from "vitest";
import {
  cycle,
  empty_stats,
  feedback,
  hint,
  Mark,
  mistakes,
  new_game,
  paint,
  record,
  restore,
  saved_schema,
  Size,
  stroke_cells,
  Tool,
  with_marks,
  type Game,
} from "./game";
import { create_board } from "./puzzle";

function solved_marks(game: Game, dots = false): Mark[] {
  return game.puzzle.solution.map((sea, index) => (sea ? Mark.SEA : dots && !game.puzzle.clues[index] ? Mark.DOT : Mark.EMPTY));
}

function fixture(marks: Mark[]): Pick<Game, "board" | "marks"> {
  return { board: create_board(4, 4, [3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]), marks };
}

describe("rules", () => {
  it("is solved once the shading matches, with or without dots", () => {
    const game = new_game(Size.S7, 99);
    expect(game.solved).toBe(false);
    expect(with_marks(game, solved_marks(game)).solved).toBe(true);
    expect(with_marks(game, solved_marks(game, true)).solved).toBe(true);

    const missing = solved_marks(game);
    missing[missing.indexOf(Mark.SEA)] = Mark.EMPTY;
    expect(with_marks(game, missing).solved).toBe(false);
  });

  it("flags a 2×2 pool", () => {
    const marks = new Array<Mark>(16).fill(Mark.EMPTY);
    [5, 6, 9, 10].forEach((index) => (marks[index] = Mark.SEA));
    const { pools, errors } = feedback(fixture(marks));
    expect(pools.flatMap((on, index) => (on ? [index] : []))).toEqual([5, 6, 9, 10]);
    expect(errors.some(Boolean)).toBe(false);
  });

  it("flags an island that is too big or holds two numbers", () => {
    const big = new Array<Mark>(16).fill(Mark.EMPTY);
    [1, 2, 3].forEach((index) => (big[index] = Mark.DOT));
    expect(feedback(fixture(big)).errors.slice(0, 4)).toEqual([true, true, true, true]);

    const joined = new Array<Mark>(16).fill(Mark.EMPTY);
    [4, 8, 12, 13, 14].forEach((index) => (joined[index] = Mark.DOT));
    expect(feedback(fixture(joined)).errors[15]).toBe(true);
  });

  it("flags an island walled in short and a dot cut off from every number", () => {
    const short = new Array<Mark>(16).fill(Mark.EMPTY);
    [1, 4].forEach((index) => (short[index] = Mark.SEA));
    expect(feedback(fixture(short)).errors[0]).toBe(true);

    const stray = new Array<Mark>(16).fill(Mark.EMPTY);
    [2, 5, 7, 10].forEach((index) => (stray[index] = Mark.SEA));
    stray[6] = Mark.DOT;
    expect(feedback(fixture(stray)).errors[6]).toBe(true);
  });

  it("marks an island complete when the sea closes it at its size", () => {
    const marks = new Array<Mark>(16).fill(Mark.EMPTY);
    [2, 5, 8, 11, 14].forEach((index) => (marks[index] = Mark.SEA));
    const { complete, errors } = feedback(fixture(marks));
    expect([complete[0], complete[4], complete[15]]).toEqual([true, true, true]);
    expect(errors.some(Boolean)).toBe(false);
  });
});

describe("input", () => {
  it("cycles the tool's mark first and runs backwards for right-click", () => {
    expect([Mark.EMPTY, Mark.SEA, Mark.DOT].map((mark) => cycle(mark, Tool.SEA, false))).toEqual([Mark.SEA, Mark.DOT, Mark.EMPTY]);
    expect([Mark.EMPTY, Mark.DOT, Mark.SEA].map((mark) => cycle(mark, Tool.DOT, false))).toEqual([Mark.DOT, Mark.SEA, Mark.EMPTY]);
    expect(cycle(Mark.EMPTY, Tool.SEA, true)).toBe(Mark.DOT);
  });

  it("paints blanks, overrides the first cell, erases only its mark and never a number", () => {
    const clues = [0, 0, 2, 0, 0];
    const base = [Mark.DOT, Mark.EMPTY, Mark.EMPTY, Mark.DOT, Mark.SEA];
    expect(paint(base, clues, [0, 1, 2, 3, 4], Mark.SEA, Mark.DOT)).toEqual([Mark.SEA, Mark.SEA, Mark.EMPTY, Mark.DOT, Mark.SEA]);
    expect(paint(base, clues, [3, 4, 0], Mark.EMPTY, Mark.DOT)).toEqual([Mark.EMPTY, Mark.EMPTY, Mark.EMPTY, Mark.EMPTY, Mark.SEA]);
  });

  it("strokes along one axis", () => {
    expect(stroke_cells(5, 6, 9, "row")).toEqual([6, 7, 8, 9]);
    expect(stroke_cells(5, 16, 1, "col")).toEqual([16, 11, 6, 1]);
  });
});

describe("hint", () => {
  it("fixes a wrong mark first", () => {
    const game = new_game(Size.S5, 7);
    const land = game.puzzle.solution.findIndex((sea, index) => !sea && !game.puzzle.clues[index]);
    const marks = [...game.marks];
    marks[land] = Mark.SEA;
    const wrong = with_marks(game, marks);
    expect(mistakes(wrong)).toEqual([land]);
    expect(hint(wrong)).toEqual({ index: land, mark: Mark.DOT, fix: true });
  });

  it("only ever gives correct marks and solves the puzzle on its own", () => {
    for (const size of [Size.S5, Size.S9]) {
      let game = new_game(size, 2024);
      for (let step = 0; step < game.marks.length && !game.solved; step++) {
        const next = hint(game);
        expect(next).not.toBeNull();
        const answer = game.puzzle.solution[next!.index] ? Mark.SEA : Mark.DOT;
        expect(next!.mark).toBe(answer);
        const marks = [...game.marks];
        marks[next!.index] = next!.mark;
        game = with_marks(game, marks);
      }
      expect(game.solved).toBe(true);
    }
  });
});

describe("persistence", () => {
  it("restores a saved game from its seed and marks", () => {
    const game = new_game(Size.S9, 31337);
    const marks = solved_marks(game).map((mark, index) => (index % 3 ? mark : Mark.EMPTY));
    const saved = saved_schema.parse(JSON.parse(JSON.stringify({ size: Size.S9, seed: 31337, marks, hints: 2, elapsed: 4200 })));
    const back = restore(saved)!;
    expect(back.puzzle).toEqual(game.puzzle);
    expect(back.marks).toEqual(marks);
    expect(back.hints).toBe(2);
  });

  it("rejects a save whose marks don't fit the board", () => {
    expect(restore({ size: Size.S5, seed: 1, marks: [0, 1], hints: 0, elapsed: 0 })).toBeNull();
    expect(saved_schema.safeParse({ size: "6", seed: 1, marks: [], hints: 0, elapsed: 0 }).success).toBe(false);
  });

  it("keeps the best time only for hint-free solves", () => {
    let stats = record(empty_stats(), Size.S7, 90_000, 0);
    stats = record(stats, Size.S7, 60_000, 1);
    stats = record(stats, Size.S7, 80_000, 0);
    expect(stats[Size.S7]).toEqual({ solved: 3, best: 80_000 });
  });
});
