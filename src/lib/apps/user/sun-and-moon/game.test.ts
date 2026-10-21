import { across_cells } from "$kit/games/grid";
import { describe, expect, it } from "vitest";
import {
  conflicts,
  cycle,
  daily_game,
  empty_stats,
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
  with_values,
  type Game,
} from "./game";
import { Edge, Mark } from "./puzzle";

function open_cells(game: Game): number[] {
  return game.puzzle.givens.flatMap((given, index) => (given ? [] : [index]));
}

function solve(game: Game): Game {
  return with_values(game, game.puzzle.solution);
}

describe("new_game", () => {
  it("starts from the givens, unsolved", () => {
    const game = new_game(Size.S6, 42);
    expect(game.values).toEqual(game.puzzle.givens);
    expect(game.solved).toBe(false);
    expect(game.puzzle.size).toBe(6);
  });
});

describe("cycle", () => {
  it("goes empty, sun, moon, empty and leaves givens alone", () => {
    const game = new_game(Size.S6, 7);
    const cell = open_cells(game)[0];
    const sun = cycle(game, cell);
    expect(sun.values[cell]).toBe(Mark.SUN);
    const moon = cycle(sun, cell);
    expect(moon.values[cell]).toBe(Mark.MOON);
    expect(cycle(moon, cell).values[cell]).toBe(Mark.EMPTY);
    const given = game.puzzle.givens.findIndex(Boolean);
    expect(cycle(game, given)).toBe(game);
  });
});

describe("conflicts", () => {
  it("marks three alike in a row", () => {
    const game = new_game(Size.S6, 3);
    const values = new Array(36).fill(Mark.EMPTY);
    values[0] = values[1] = values[2] = Mark.SUN;
    const found = conflicts({ ...game, values });
    expect([...found].sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it("marks a line with more than half of one mark", () => {
    const game = new_game(Size.S6, 3);
    const values = new Array(36).fill(Mark.EMPTY);
    for (const cell of [0, 2, 4, 5]) values[cell] = Mark.MOON;
    const found = conflicts({ ...game, values });
    for (const cell of [0, 2, 4, 5]) expect(found.has(cell)).toBe(true);
  });

  it("marks both sides of a broken sign and dims a met one", () => {
    let seed = 1;
    let game = new_game(Size.S6, seed);
    while (!game.puzzle.across.some(Boolean)) game = new_game(Size.S6, ++seed);
    const index = game.puzzle.across.findIndex(Boolean);
    const [a, b] = across_cells(6, index);
    const same = game.puzzle.across[index] === Edge.SAME;
    const values = new Array(36).fill(Mark.EMPTY);
    values[a] = Mark.SUN;
    values[b] = same ? Mark.MOON : Mark.SUN;
    const broken = { ...game, values };
    expect(sign_states(broken).across[index]).toBe(SignState.BROKEN);
    expect(conflicts(broken).has(a) && conflicts(broken).has(b)).toBe(true);
    values[b] = same ? Mark.SUN : Mark.MOON;
    expect(sign_states({ ...game, values }).across[index]).toBe(SignState.MET);
  });

  it("finds nothing in the solution, which counts as solved", () => {
    const game = solve(new_game(Size.S8, 11));
    expect(conflicts(game).size).toBe(0);
    expect(game.solved).toBe(true);
  });
});

describe("hint", () => {
  it("fixes the first wrong mark", () => {
    const game = new_game(Size.S6, 5);
    const cell = open_cells(game)[0];
    const wrong = game.puzzle.solution[cell] === Mark.SUN ? Mark.MOON : Mark.SUN;
    const next = hint(place(game, cell, wrong));
    expect(next).toMatchObject({ index: cell, mark: game.puzzle.solution[cell], fix: true });
    expect(mistakes(place(game, cell, wrong))).toEqual([cell]);
  });

  it("otherwise places a forced mark and says why", () => {
    const game = new_game(Size.S6, 5);
    const next = hint(game)!;
    expect(next.fix).toBe(false);
    expect(next.mark).toBe(game.puzzle.solution[next.index]);
    expect(next.reason.length).toBeGreaterThan(10);
  });

  it("has nothing to give on a solved board", () => {
    expect(hint(solve(new_game(Size.S6, 5)))).toBeNull();
  });
});

describe("saves", () => {
  it("round-trip the marks, hints and puzzle", () => {
    const game = new_game(Size.S8, 99);
    const cell = open_cells(game)[0];
    const played = { ...cycle(game, cell), hints: 2 };
    const saved = saved_schema.parse(JSON.parse(JSON.stringify(to_saved(played, Size.S8, 1234))));
    const back = restore(saved)!;
    expect(back.values).toEqual(played.values);
    expect(back.hints).toBe(2);
    expect(back.puzzle).toEqual(game.puzzle);
  });

  it("refuse a save of the wrong length", () => {
    const saved = to_saved(new_game(Size.S6, 1), Size.S6, 0);
    expect(restore({ ...saved, values: saved.values.slice(1) })).toBeNull();
  });
});

describe("stats", () => {
  it("count solves and keep the best time without hints", () => {
    let stats = record(empty_stats(), Size.S6, 5000, 0);
    stats = record(stats, Size.S6, 3000, 1);
    stats = record(stats, Size.S6, 4000, 0);
    expect(stats[Size.S6]).toEqual({ solved: 3, best: 4000 });
    expect(stats[Size.S8]).toEqual({ solved: 0, best: null });
  });
});

describe("daily_game", () => {
  it("is the same 6×6 puzzle for everyone on a day", () => {
    expect(daily_game("2026-10-21").puzzle).toEqual(daily_game("2026-10-21").puzzle);
    expect(daily_game("2026-10-21").puzzle.size).toBe(6);
    expect(daily_game("2026-10-21").puzzle).not.toEqual(daily_game("2026-10-22").puzzle);
  });
});
