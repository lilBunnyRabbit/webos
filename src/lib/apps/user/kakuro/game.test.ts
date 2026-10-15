import { describe, expect, it } from "vitest";
import {
  clear,
  clue_runs,
  combos_text,
  conflicts,
  daily_game,
  empty_stats,
  first_white,
  hint,
  is_solved,
  key_move,
  new_game,
  place,
  record,
  restore,
  run_combos,
  run_state,
  RunState,
  saved_schema,
  Size,
  toggle_note,
  with_entries,
  type Game,
} from "./game";
import { bit, from_solution } from "./puzzle";

// # # #
// # 1 2
// # 3 4
function tiny(values: number[] = new Array(9).fill(0)): Game {
  const puzzle = from_solution(0, 3, [0, 0, 0, 0, 1, 2, 0, 3, 4]);
  return with_entries({ puzzle, values, notes: new Array(9).fill(0), hints: 0, solved: false }, values);
}

describe("rules", () => {
  it("solves when every run is full and right", () => {
    expect(tiny([0, 0, 0, 0, 1, 2, 0, 3, 4]).solved).toBe(true);
    expect(tiny([0, 0, 0, 0, 1, 2, 0, 3, 0]).solved).toBe(false);
    expect(tiny([0, 0, 0, 0, 2, 1, 0, 4, 3]).solved).toBe(false);
  });

  it("flags repeats and full runs off their sum", () => {
    const game = tiny([0, 0, 0, 0, 1, 1, 0, 0, 0]);
    expect([...conflicts(game)].sort()).toEqual([4, 5]);
    expect(run_state(game.puzzle.runs[0], game.values)).toBe(RunState.WRONG);
    expect(run_state(game.puzzle.runs[2], game.values)).toBe(RunState.OPEN);
    const off = tiny([0, 0, 0, 0, 2, 5, 0, 0, 0]);
    expect(run_state(off.puzzle.runs[0], off.values)).toBe(RunState.WRONG);
    expect(conflicts(off).size).toBe(0);
    expect(run_state(off.puzzle.runs[0], tiny([0, 0, 0, 0, 1, 2, 0, 0, 0]).values)).toBe(RunState.DONE);
  });

  it("solves a generated puzzle from its solution", () => {
    const game = new_game(Size.S8, 5);
    expect(is_solved({ puzzle: game.puzzle, values: game.puzzle.solution })).toBe(true);
    expect(game.solved).toBe(false);
  });
});

describe("entries", () => {
  it("placing a digit clears it from the notes of its runs", () => {
    let game = tiny();
    game = { ...game, ...toggle_note(game, 5, 1) };
    game = { ...game, ...toggle_note(game, 8, 1) };
    expect(game.notes[5]).toBe(bit(1));
    game = { ...game, ...place(game, 4, 1) };
    expect(game.values[4]).toBe(1);
    expect(game.notes[5]).toBe(0);
    expect(game.notes[8]).toBe(bit(1));
    game = { ...game, ...place(game, 4, 2) };
    expect(game.values[4]).toBe(2);
  });

  it("clear empties the digit first, then the notes", () => {
    let game = tiny();
    game = { ...game, ...toggle_note(game, 4, 3) };
    game = { ...game, ...place(game, 4, 1) };
    game = { ...game, ...clear(game, 4) };
    expect([game.values[4], game.notes[4]]).toEqual([0, bit(3)]);
    game = { ...game, ...clear(game, 4) };
    expect(game.notes[4]).toBe(0);
  });

  it("lists the combinations a run can still be", () => {
    const puzzle = from_solution(
      0,
      4,
      [0, 0, 0, 0, 0, 1, 2, 4, 0, 3, 4, 5, 0, 0, 0, 0].map((d, i) => (i >= 12 ? 0 : d))
    );
    const run = puzzle.runs[0];
    expect(run.sum).toBe(7);
    expect(run_combos(run, new Array(16).fill(0))).toEqual(["1+2+4"]);
    const ten = from_solution(0, 3, [0, 0, 0, 0, 1, 9, 0, 3, 4]).runs[0];
    expect(run_combos(ten, new Array(9).fill(0))).toEqual(["1+9", "2+8", "3+7", "4+6"]);
    expect(run_combos(ten, [0, 0, 0, 0, 0, 8, 0, 0, 0])).toEqual(["2+8"]);
    expect(combos_text(ten, new Array(9).fill(0), 2)).toBe("1+9  2+8  +2");
    expect(combos_text(ten, [0, 0, 0, 0, 0, 8, 0, 0, 0], 2)).toBe("2+8");
  });
});

describe("board", () => {
  it("moves the cursor over white cells only", () => {
    const { puzzle } = tiny();
    expect(first_white(puzzle)).toBe(4);
    expect(key_move(puzzle, "ArrowRight", 4)).toBe(5);
    expect(key_move(puzzle, "ArrowRight", 5)).toBe(5);
    expect(key_move(puzzle, "ArrowUp", 4)).toBe(4);
    expect(key_move(puzzle, "ArrowDown", 4)).toBe(7);
    expect(key_move(puzzle, "Home", 5)).toBe(4);
    expect(key_move(puzzle, "End", 7)).toBe(8);
    expect(key_move(puzzle, "x", 4)).toBeNull();
  });

  it("maps each clue cell to the runs it heads", () => {
    const { puzzle } = tiny();
    const clues = clue_runs(puzzle);
    expect(puzzle.runs[clues.get(3)!.across!].cells).toEqual([4, 5]);
    expect(puzzle.runs[clues.get(1)!.down!].cells).toEqual([4, 7]);
    expect(clues.has(0)).toBe(false);
  });
});

describe("hint", () => {
  it("fixes a wrong digit first, otherwise gives a deducible one", () => {
    const game = new_game(Size.S6, 11);
    const wrong = game.puzzle.solution.findIndex((digit) => digit > 0);
    const values = [...game.values];
    values[wrong] = game.puzzle.solution[wrong] === 9 ? 8 : 9;
    expect(hint(with_entries(game, values))).toEqual({ cell: wrong, digit: game.puzzle.solution[wrong], fix: true });
    const next = hint(game)!;
    expect(next.fix).toBe(false);
    expect(next.digit).toBe(game.puzzle.solution[next.cell]);
  });
});

describe("stats", () => {
  it("counts solves and keeps the best hint-free time", () => {
    let stats = record(empty_stats(), Size.S8, 5000, 0);
    stats = record(stats, Size.S8, 3000, 1);
    stats = record(stats, Size.S8, 4000, 0);
    expect(stats["8"]).toEqual({ solved: 3, best: 4000 });
  });
});

describe("save", () => {
  it("restores digits, notes and hints from the seed", () => {
    const game = new_game(Size.S10, 1234);
    const cell = game.puzzle.across_of.findIndex((run) => run >= 0);
    const values = [...game.values];
    const notes = [...game.notes];
    values[cell] = game.puzzle.solution[cell];
    notes[cell + 1] = 0b101;
    const saved = saved_schema.parse({ size: Size.S10, seed: 1234, values, notes, hints: 2, elapsed: 9000 });
    const back = restore(saved)!;
    expect(back.values).toEqual(values);
    expect(back.notes).toEqual(notes);
    expect(back.hints).toBe(2);
    expect(back.puzzle).toEqual(game.puzzle);
  });

  it("rejects a save that doesn't fit the puzzle", () => {
    expect(restore({ size: Size.S6, seed: 1, values: [1], notes: [0], hints: 0, elapsed: 0 })).toBeNull();
    expect(saved_schema.safeParse({ size: "7", seed: 1, values: [], notes: [], hints: 0, elapsed: 0 }).success).toBe(
      false
    );
  });
});

describe("daily", () => {
  it("plays the same 8×8 puzzle all day, a new one the next", () => {
    const today = daily_game("2026-10-14");
    expect(daily_game("2026-10-14").puzzle).toEqual(today.puzzle);
    expect(daily_game("2026-10-15").puzzle).not.toEqual(today.puzzle);
  });
});
