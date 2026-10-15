import { describe, expect, it } from "vitest";
import {
  apply_hint,
  auto_notes,
  completed_units,
  conflicts,
  daily_game,
  Difficulty,
  digit_counts,
  empty_stats,
  erase,
  first_blank,
  hint,
  HintKind,
  is_solved,
  new_game,
  place,
  record,
  restore,
  saved_schema,
  to_saved,
  toggle_note,
  wave_delays,
  with_board,
  type Game,
} from "./game";
import { bit, candidates } from "./puzzle";

const game = new_game(Difficulty.MEDIUM, 7);
const blanks = game.puzzle.givens.flatMap((given, cell) => (given ? [] : [cell]));
const given = game.puzzle.givens.findIndex(Boolean);

function solve_all(of: Game): Game {
  return with_board(of, { values: of.puzzle.solution, notes: of.notes });
}

describe("rules", () => {
  it("a fresh game holds only the givens", () => {
    expect(game.values).toEqual(game.puzzle.givens);
    expect(game.solved).toBe(false);
    expect(conflicts(game.values).size).toBe(0);
  });

  it("is solved exactly when the grid is full and conflict-free", () => {
    expect(solve_all(game).solved).toBe(true);
    const almost = [...game.puzzle.solution];
    almost[blanks[0]] = 0;
    expect(is_solved(almost)).toBe(false);
    const swapped = [...game.puzzle.solution];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    expect(is_solved(swapped)).toBe(false);
  });

  it("flags every copy of a repeated digit", () => {
    const cell = blanks.find((c) => Math.floor(c / 9) === Math.floor(given / 9))!;
    const board = place(game, cell, game.values[given]);
    expect(conflicts(board.values)).toEqual(new Set([cell, given]));
  });

  it("counts digits on the board", () => {
    const counts = digit_counts(game.puzzle.solution);
    expect(counts.slice(1)).toEqual(new Array(9).fill(9));
  });

  it("finds rows, columns and boxes a placement completes", () => {
    const full = [...game.puzzle.solution];
    const cell = blanks[0];
    const before = [...full];
    before[cell] = 0;
    const others = full.map((value, c) => (c === cell ? value : 0));
    expect(completed_units(before, full, cell)).toHaveLength(3);
    expect(completed_units(before, others, cell)).toHaveLength(0);
  });

  it("lights finished units in a wave from the placed cell", () => {
    const delays = wave_delays(
      [
        [0, 1, 2],
        [2, 11, 20],
      ],
      2
    );
    expect(delays.get(2)).toBe(0);
    expect(delays.get(0)).toBe(90);
    expect(delays.get(20)).toBe(90);
  });

  it("starts the cursor on the first blank, else the centre", () => {
    expect(first_blank([5, 0, 3])).toBe(1);
    expect(first_blank(new Array(81).fill(1))).toBe(40);
  });
});

describe("editing", () => {
  it("never changes a given", () => {
    expect(place(game, given, 1)).toBe(game);
    expect(erase(game, given)).toBe(game);
  });

  it("places, then clears on the same digit", () => {
    const cell = blanks[0];
    const placed = place(game, cell, 5);
    expect(placed.values[cell]).toBe(5);
    expect(place({ ...game, ...placed }, cell, 5).values[cell]).toBe(0);
  });

  it("removes a placed digit from notes in its row, column and box only", () => {
    const [cell] = blanks;
    const notes = new Array(81).fill(bit(4) | bit(6));
    const board = place({ ...game, notes }, cell, 4);
    expect(board.notes[cell]).toBe(0);
    for (let c = 0; c < 81; c++) {
      if (c === cell) continue;
      const peer =
        Math.floor(c / 9) === Math.floor(cell / 9) ||
        c % 9 === cell % 9 ||
        (Math.floor(c / 27) === Math.floor(cell / 27) && Math.floor((c % 9) / 3) === Math.floor((cell % 9) / 3));
      expect(board.notes[c]).toBe(peer ? bit(6) : bit(4) | bit(6));
    }
  });

  it("toggles notes on blank cells only", () => {
    const [cell] = blanks;
    const once = toggle_note(game, cell, 3);
    expect(once.notes[cell]).toBe(bit(3));
    expect(toggle_note({ ...game, ...once }, cell, 3).notes[cell]).toBe(0);
    expect(toggle_note(game, given, 3)).toBe(game);
  });

  it("erases the value first, then the notes", () => {
    const [cell] = blanks;
    const board = {
      ...game,
      values: game.values.map((v, c) => (c === cell ? 2 : v)),
      notes: game.notes.map((n, c) => (c === cell ? bit(1) : n)),
    };
    const once = erase(board, cell);
    expect(once.values[cell]).toBe(0);
    expect(once.notes[cell]).toBe(bit(1));
    expect(erase({ ...board, ...once }, cell).notes[cell]).toBe(0);
  });

  it("fills notes with the candidates", () => {
    const board = auto_notes(game);
    expect(board.notes).toEqual(candidates(game.values));
    for (const cell of blanks) expect(board.notes[cell] & bit(game.puzzle.solution[cell])).toBeTruthy();
  });
});

describe("hint", () => {
  it("fixes a wrong entry first", () => {
    const cell = blanks[3];
    const wrong = (game.puzzle.solution[cell] % 9) + 1;
    const board = with_board(game, place(game, cell, wrong));
    expect(hint(board)).toEqual({ cell, digit: game.puzzle.solution[cell], kind: HintKind.FIX });
  });

  it("otherwise places a cell logic proves, with its technique", () => {
    const next = hint(game)!;
    expect(next.kind).toBe(HintKind.DEDUCE);
    expect(next.technique).toBeTruthy();
    expect(next.digit).toBe(game.puzzle.solution[next.cell]);
    expect(game.values[next.cell]).toBe(0);
  });

  it("finishes any puzzle when applied repeatedly", () => {
    for (const difficulty of [Difficulty.EASY, Difficulty.EXPERT]) {
      let current = new_game(difficulty, 99);
      for (let i = 0; i < 81 && !current.solved; i++)
        current = with_board(current, apply_hint(current, hint(current)!));
      expect(current.solved).toBe(true);
    }
  });

  it("returns nothing on a solved grid", () => {
    expect(hint(solve_all(game))).toBeNull();
  });
});

describe("persistence", () => {
  it("round-trips a game in progress", () => {
    const [a, b] = blanks;
    let played = with_board(game, place(game, a, game.puzzle.solution[a]));
    played = with_board(played, toggle_note(played, b, 7));
    played = { ...played, hints: 2 };
    const saved = saved_schema.parse(JSON.parse(JSON.stringify(to_saved(played, 61000))));
    const back = restore(saved)!;
    expect(back.values).toEqual(played.values);
    expect(back.notes).toEqual(played.notes);
    expect(back.hints).toBe(2);
    expect(back.puzzle).toEqual(played.puzzle);
    expect(saved.elapsed).toBe(61000);
  });

  it("rejects a save whose givens don't match its seed", () => {
    const saved = to_saved(game, 0);
    saved.values[given] = (saved.values[given] % 9) + 1;
    expect(restore(saved)).toBeNull();
  });

  it("rejects malformed saves", () => {
    expect(saved_schema.safeParse({ ...to_saved(game, 0), values: [1, 2, 3] }).success).toBe(false);
    expect(saved_schema.safeParse({ ...to_saved(game, 0), difficulty: "insane" }).success).toBe(false);
  });
});

describe("stats", () => {
  it("keeps the best time only for hint-free solves", () => {
    let stats = record(empty_stats(), Difficulty.HARD, 300000, 0);
    stats = record(stats, Difficulty.HARD, 200000, 1);
    stats = record(stats, Difficulty.HARD, 250000, 0);
    expect(stats.hard).toEqual({ solved: 3, best: 250000 });
    expect(stats.easy).toEqual({ solved: 0, best: null });
  });
});

describe("daily", () => {
  it("plays the same medium puzzle all day, a new one the next", () => {
    const today = daily_game("2026-10-14");
    expect(today.difficulty).toBe(Difficulty.MEDIUM);
    expect(daily_game("2026-10-14").puzzle.givens).toEqual(today.puzzle.givens);
    expect(daily_game("2026-10-15").puzzle.givens).not.toEqual(today.puzzle.givens);
  });
});
