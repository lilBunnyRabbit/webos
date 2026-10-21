import { describe, expect, test } from "vitest";
import {
  apply_hint,
  auto_crosses,
  cycle,
  daily_game,
  DAILY_SIZE,
  empty_stats,
  feedback,
  hint,
  is_answer,
  line_cells,
  Mark,
  new_game,
  paint,
  record,
  restore,
  Size,
  with_marks,
  type Game,
} from "./game";

function answer_marks(game: Game): Mark[] {
  return game.marks.map((_, cell) => (is_answer(game.puzzle, cell) ? Mark.RABBIT : Mark.EMPTY));
}

describe("play", () => {
  test("the answer solves it; a rabbit too many does not", () => {
    const game = new_game(Size.S8, 11);
    expect(with_marks(game, answer_marks(game)).solved).toBe(true);
    const marks = answer_marks(game);
    marks[marks.indexOf(Mark.RABBIT)] = Mark.EMPTY;
    expect(with_marks(game, marks).solved).toBe(false);
  });

  test("rabbits in one row, or touching, are flagged", () => {
    const game = new_game(Size.S7, 3);
    const marks: Mark[] = new Array(49).fill(Mark.EMPTY);
    marks[0] = Mark.RABBIT;
    marks[3] = Mark.RABBIT;
    marks[8] = Mark.RABBIT;
    const checks = feedback({ board: game.board, marks });
    expect([...checks.rabbits].sort((a, b) => a - b)).toEqual([0, 3, 8]);
  });

  test("a row crossed out without a rabbit is dead", () => {
    const game = new_game(Size.S7, 3);
    const marks: Mark[] = new Array(49).fill(Mark.EMPTY);
    for (let col = 0; col < 7; col++) marks[col] = Mark.CROSS;
    expect(feedback({ board: game.board, marks }).dead.has(3)).toBe(true);
  });

  test("auto-crosses cover what a rabbit rules out, never a marked cell", () => {
    const game = new_game(Size.S7, 3);
    const marks: Mark[] = new Array(49).fill(Mark.EMPTY);
    marks[24] = Mark.RABBIT;
    marks[17] = Mark.CROSS;
    const crossed = auto_crosses({ board: game.board, marks });
    expect(crossed.has(21)).toBe(true);
    expect(crossed.has(16)).toBe(true);
    expect(crossed.has(17)).toBe(false);
    expect(crossed.has(24)).toBe(false);
  });

  test("tap cycles blank, cross, rabbit", () => {
    expect([cycle(Mark.EMPTY), cycle(Mark.CROSS), cycle(Mark.RABBIT)]).toEqual([Mark.CROSS, Mark.RABBIT, Mark.EMPTY]);
  });

  test("a drag paints crosses on blanks, or erases them, and leaves rabbits", () => {
    const base = [Mark.EMPTY, Mark.CROSS, Mark.RABBIT, Mark.EMPTY];
    expect(paint(base, [0, 1, 2, 3], false)).toEqual([Mark.CROSS, Mark.CROSS, Mark.RABBIT, Mark.CROSS]);
    expect(paint(base, [0, 1, 2], true)).toEqual([Mark.EMPTY, Mark.EMPTY, Mark.RABBIT, Mark.EMPTY]);
  });

  test("a drag that skips cells fills them in", () => {
    expect(line_cells(8, 0, 3)).toEqual([1, 2, 3]);
    expect(line_cells(8, 0, 18)).toEqual([9, 18]);
  });
});

describe("hint", () => {
  test("fixes a wrong rabbit first", () => {
    const game = new_game(Size.S8, 5);
    const wrong = game.marks.findIndex((_, cell) => !is_answer(game.puzzle, cell));
    const marks = [...game.marks];
    marks[wrong] = Mark.RABBIT;
    expect(hint(with_marks(game, marks))).toMatchObject({ cells: [wrong], mark: Mark.CROSS, fix: true });
  });

  test("following hints alone solves the puzzle, each step correct", () => {
    for (const size of [Size.S7, Size.S10]) {
      let game = new_game(size, 21);
      for (let step = 0; step < 200 && !game.solved; step++) {
        const next = hint(game)!;
        expect(next.fix).toBe(false);
        expect(next.reason).not.toBe("Here's a rabbit to get you going.");
        for (const cell of next.cells) expect(is_answer(game.puzzle, cell)).toBe(next.mark === Mark.RABBIT);
        game = with_marks(game, apply_hint(game.marks, next));
      }
      expect(game.solved).toBe(true);
    }
  });
});

describe("saves and stats", () => {
  test("a save restores the same puzzle and marks", () => {
    const game = new_game(Size.S9, 77);
    const marks = [...game.marks];
    marks[4] = Mark.CROSS;
    const restored = restore({ size: Size.S9, seed: 77, marks, hints: 2, elapsed: 1000 })!;
    expect(restored.puzzle.regions).toEqual(game.puzzle.regions);
    expect(restored.marks).toEqual(marks);
    expect(restored.hints).toBe(2);
  });

  test("the daily is the same 8×8 for everyone on a day", () => {
    expect(daily_game("2026-10-21").puzzle).toEqual(daily_game("2026-10-21").puzzle);
    expect(daily_game("2026-10-21").puzzle.size).toBe(Number(DAILY_SIZE));
    expect(daily_game("2026-10-22").puzzle.regions).not.toEqual(daily_game("2026-10-21").puzzle.regions);
  });

  test("best times count only solves without hints", () => {
    let stats = record(empty_stats(), Size.S8, 5000, 1);
    expect(stats[Size.S8]).toEqual({ solved: 1, best: null });
    stats = record(stats, Size.S8, 9000, 0);
    stats = record(stats, Size.S8, 7000, 0);
    expect(stats[Size.S8]).toEqual({ solved: 3, best: 7000 });
  });
});
