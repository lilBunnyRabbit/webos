import { describe, expect, it } from "vitest";
import {
  clear_notes,
  conflicts,
  daily_game,
  digit_counts,
  empty_stats,
  fill_notes,
  hint,
  mistakes,
  new_game,
  place,
  record,
  restore,
  saved_schema,
  SignState,
  sign_states,
  Size,
  to_saved,
  toggle_note,
  with_cells,
  type Game,
} from "./game";
import { across_cells, Relation } from "./puzzle";

function open_cells(game: Game): number[] {
  return game.puzzle.givens.flatMap((given, index) => (given ? [] : [index]));
}

function solve(game: Game): Game {
  return open_cells(game).reduce((next, index) => place(next, index, game.puzzle.solution[index]), game);
}

describe("new_game", () => {
  it("starts with the givens placed and nothing else", () => {
    const game = new_game(Size.S6, 12);
    expect(game.values).toEqual(game.puzzle.givens);
    expect(game.notes.every((mask) => mask === 0)).toBe(true);
    expect(game.solved).toBe(false);
  });
});

describe("place", () => {
  it("never changes a given", () => {
    for (let seed = 0; seed < 30; seed++) {
      const game = new_game(Size.S7, seed);
      const given = game.puzzle.givens.findIndex(Boolean);
      if (given < 0) continue;
      expect(place(game, given, 0)).toBe(game);
      return;
    }
    throw new Error("no seed with a given");
  });

  it("removes the digit from notes in the same row and column only", () => {
    let game = new_game(Size.S5, 3);
    const notes = new Array(25).fill(0b111110);
    game = with_cells(game, game.values.map(() => 0), notes);
    game = place(game, 12, 3);
    const bit = 1 << 3;
    expect(game.notes[10] & bit).toBe(0);
    expect(game.notes[2] & bit).toBe(0);
    expect(game.notes[0] & bit).toBe(bit);
    expect(game.notes[12]).toBe(0b111110);
  });

  it("wins when the last correct digit goes in", () => {
    const game = new_game(Size.S4, 21);
    const open = open_cells(game);
    const almost = open.slice(0, -1).reduce((next, index) => place(next, index, game.puzzle.solution[index]), game);
    expect(almost.solved).toBe(false);
    const last = open[open.length - 1];
    expect(place(almost, last, game.puzzle.solution[last]).solved).toBe(true);
  });
});

describe("conflicts and signs", () => {
  it("flags repeated digits in a row", () => {
    const game = new_game(Size.S5, 4);
    const blank = with_cells(game, game.values.map(() => 0), game.notes);
    const marked = with_cells(blank, blank.values.map((_, index) => (index === 0 || index === 4 ? 2 : 0)), game.notes);
    expect([...conflicts(marked)].sort()).toEqual([0, 4]);
  });

  it("marks a sign met, broken or open, and a broken sign's cells as conflicts", () => {
    const game = new_game(Size.S6, 9);
    const index = game.puzzle.across.findIndex((relation) => relation !== Relation.NONE);
    const [a, b] = across_cells(6, index);
    const less = game.puzzle.across[index] === Relation.LESS;
    const values = new Array(36).fill(0);
    const blank = { ...with_cells(game, values, game.notes), puzzle: { ...game.puzzle, givens: values } };
    expect(sign_states(blank).across[index]).toBe(SignState.OPEN);
    const met = with_cells(blank, values.map((_, i) => (i === a ? (less ? 1 : 2) : i === b ? (less ? 2 : 1) : 0)), game.notes);
    expect(sign_states(met).across[index]).toBe(SignState.MET);
    expect(conflicts(met).size).toBe(0);
    const broken = with_cells(blank, values.map((_, i) => (i === a ? (less ? 2 : 1) : i === b ? (less ? 1 : 2) : 0)), game.notes);
    expect(sign_states(broken).across[index]).toBe(SignState.BROKEN);
    expect([...conflicts(broken)].sort()).toEqual([a, b].sort());
  });

  it("never reports a sign that isn't there", () => {
    const game = solve(new_game(Size.S7, 77));
    const states = sign_states(game);
    game.puzzle.across.forEach((relation, index) => relation === Relation.NONE && expect(states.across[index]).toBe(SignState.OPEN));
    expect(conflicts(game).size).toBe(0);
    expect(game.solved).toBe(true);
  });
});

describe("notes", () => {
  it("toggles a note and clears them all", () => {
    let game = new_game(Size.S5, 5);
    const cell = open_cells(game)[0];
    game = toggle_note(toggle_note(game, cell, 2), cell, 4);
    expect(game.notes[cell]).toBe((1 << 2) | (1 << 4));
    game = toggle_note(game, cell, 2);
    expect(game.notes[cell]).toBe(1 << 4);
    expect(clear_notes(game, cell).notes[cell]).toBe(0);
  });

  it("pencils in candidates that always include the answer", () => {
    for (let seed = 0; seed < 20; seed++) {
      const game = fill_notes(new_game(Size.S6, seed));
      for (const index of open_cells(game)) {
        expect(game.notes[index] & (1 << game.puzzle.solution[index])).not.toBe(0);
      }
    }
  });

  it("rules out the extremes beside a sign", () => {
    const game = new_game(Size.S5, 6);
    const index = game.puzzle.across.findIndex((relation, i) => {
      const [a, b] = across_cells(5, i);
      return relation !== Relation.NONE && !game.values[a] && !game.values[b];
    });
    const [a] = across_cells(5, index);
    const filled = fill_notes(game);
    const forbidden = game.puzzle.across[index] === Relation.LESS ? 5 : 1;
    expect(filled.notes[a] & (1 << forbidden)).toBe(0);
  });
});

describe("hint", () => {
  it("fixes a wrong digit first", () => {
    const game = new_game(Size.S5, 10);
    const cell = open_cells(game)[2];
    const wrong_digit = (game.puzzle.solution[cell] % 5) + 1;
    const wrong = place(game, cell, wrong_digit);
    expect(mistakes(wrong)).toEqual([cell]);
    expect(hint(wrong)).toEqual({ index: cell, digit: game.puzzle.solution[cell], fix: true });
  });

  it("otherwise gives a correct new digit, and repeated hints solve the puzzle", () => {
    for (const size of [Size.S4, Size.S7]) {
      let game = new_game(size, 42);
      for (let step = 0; step < 49 && !game.solved; step++) {
        const next = hint(game)!;
        expect(next.fix).toBe(false);
        expect(game.values[next.index]).toBe(0);
        expect(next.digit).toBe(game.puzzle.solution[next.index]);
        game = place(game, next.index, next.digit);
      }
      expect(game.solved).toBe(true);
      expect(hint(game)).toBeNull();
    }
  });
});

describe("digit_counts", () => {
  it("counts each digit on the board", () => {
    const game = solve(new_game(Size.S4, 1));
    expect(digit_counts(game).slice(1)).toEqual([4, 4, 4, 4]);
  });
});

describe("stats", () => {
  it("keeps the best time only for hint-free solves", () => {
    let stats = empty_stats();
    stats = record(stats, Size.S5, 60_000, 0);
    stats = record(stats, Size.S5, 30_000, 2);
    stats = record(stats, Size.S5, 45_000, 0);
    expect(stats[Size.S5]).toEqual({ solved: 3, best: 45_000 });
    expect(stats[Size.S4]).toEqual({ solved: 0, best: null });
  });
});

describe("save and restore", () => {
  it("round-trips digits, notes and hints through the schema", () => {
    let game = new_game(Size.S6, 2024);
    const [a, b] = open_cells(game);
    game = place(game, a, game.puzzle.solution[a]);
    game = toggle_note(game, b, 3);
    game = { ...game, hints: 2 };
    const saved = saved_schema.parse(JSON.parse(JSON.stringify(to_saved(game, Size.S6, 1234))));
    const restored = restore(saved)!;
    expect(restored.values).toEqual(game.values);
    expect(restored.notes).toEqual(game.notes);
    expect(restored.hints).toBe(2);
    expect(restored.puzzle).toEqual(game.puzzle);
    expect(saved.elapsed).toBe(1234);
  });

  it("rejects a save whose grid doesn't fit the size", () => {
    const saved = to_saved(new_game(Size.S4, 1), Size.S5, 0);
    expect(restore(saved)).toBeNull();
  });

  it("keeps the givens even when a save overwrote them", () => {
    for (let seed = 0; seed < 30; seed++) {
      const game = new_game(Size.S7, seed);
      const given = game.puzzle.givens.findIndex(Boolean);
      if (given < 0) continue;
      const saved = to_saved(game, Size.S7, 0);
      saved.values[given] = 0;
      expect(restore(saved)!.values[given]).toBe(game.puzzle.givens[given]);
      return;
    }
  });
});

describe("daily", () => {
  it("plays the same 5×5 puzzle all day, a new one the next", () => {
    const today = daily_game("2026-10-14");
    expect(daily_game("2026-10-14").puzzle).toEqual(today.puzzle);
    expect(daily_game("2026-10-15").puzzle).not.toEqual(today.puzzle);
  });
});
