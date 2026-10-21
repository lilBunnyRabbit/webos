import { describe, expect, it } from "vitest";
import {
  arrow_step,
  back,
  daily_game,
  draw_to,
  empty_stats,
  hint,
  new_game,
  next_dot,
  record,
  Refusal,
  refusal,
  restore,
  Size,
  to_saved,
  with_path,
  type Game,
} from "./game";
import { Side, type Puzzle } from "./puzzle";

function tiny(walls: number[] = new Array(9).fill(0)): Game {
  const puzzle: Puzzle = {
    size: 3,
    seed: 0,
    numbers: [1, 0, 2, 0, 0, 0, 3, 0, 4],
    walls,
    solution: [0, 1, 2, 5, 4, 3, 6, 7, 8],
  };
  return { puzzle, path: [0], hints: 0, solved: false };
}

describe("drawing", () => {
  it("extends along neighbours and retracts back over the path", () => {
    let game = draw_to(tiny(), 1);
    expect(game.path).toEqual([0, 1]);
    game = draw_to(game, 2);
    game = draw_to(game, 5);
    expect(game.path).toEqual([0, 1, 2, 5]);
    expect(draw_to(game, 1).path).toEqual([0, 1]);
    expect(back(game).path).toEqual([0, 1, 2]);
  });

  it("fills the cells a fast drag skipped", () => {
    expect(draw_to(tiny(), 2).path).toEqual([0, 1, 2]);
  });

  it("refuses a dot out of order, a wall and stepping past the last dot", () => {
    const game = tiny();
    expect(refusal(game.puzzle, [0, 3], 6)).toBe(Refusal.ORDER);
    expect(draw_to(with_path(game, [0, 3]), 6).path).toEqual([0, 3]);
    const walls = new Array(9).fill(0);
    walls[0] |= Side.RIGHT;
    walls[1] |= Side.LEFT;
    expect(refusal(tiny(walls).puzzle, [0], 1)).toBe(Refusal.WALL);
    expect(refusal(game.puzzle, [0, 1, 2, 5, 8], 7)).toBe(Refusal.END);
    expect(refusal(game.puzzle, [0], 4)).toBe(Refusal.FAR);
  });

  it("counts the dots reached", () => {
    const game = tiny();
    expect(next_dot(game.puzzle, [0, 1])).toBe(2);
    expect(next_dot(game.puzzle, [0, 1, 2])).toBe(3);
  });

  it("is solved when the path fills the board", () => {
    let game = tiny();
    for (const cell of game.puzzle.solution.slice(1)) game = draw_to(game, cell);
    expect(game.solved).toBe(true);
  });

  it("arrows step on, and an arrow back toward the path retracts", () => {
    let game = arrow_step(tiny(), "ArrowRight");
    expect(game.path).toEqual([0, 1]);
    game = arrow_step(game, "ArrowLeft");
    expect(game.path).toEqual([0]);
    expect(arrow_step(game, "ArrowUp").path).toEqual([0]);
  });
});

describe("hint", () => {
  it("fixes the first wrong step", () => {
    const game = with_path(tiny(), [0, 3, 4]);
    expect(hint(game)).toEqual({ path: [0, 1], fix: true, cells: [1] });
  });

  it("gives the next step and every forced one after it", () => {
    const next = hint(tiny());
    expect(next?.fix).toBe(false);
    expect(next?.path).toEqual([0, 1, 2, 5, 4, 3, 6, 7, 8]);
  });

  it("stops where a choice begins on a real puzzle", () => {
    const game = new_game(Size.S7, 42);
    const next = hint(game)!;
    expect(next.path.length).toBeGreaterThan(1);
    expect(next.path).toEqual(game.puzzle.solution.slice(0, next.path.length));
  });
});

describe("saving", () => {
  it("restores the drawn path on the same puzzle", () => {
    let game = new_game(Size.S6, 7);
    const head = game.puzzle.solution;
    game = draw_to(draw_to(game, head[1]), head[2]);
    const restored = restore(to_saved({ ...game, hints: 2 }, Size.S6, 1234));
    expect(restored.path).toEqual([head[0], head[1], head[2]]);
    expect(restored.hints).toBe(2);
  });

  it("keeps only the legal prefix of a tampered path", () => {
    const game = new_game(Size.S6, 7);
    const head = game.puzzle.solution;
    const saved = { ...to_saved(game, Size.S6, 0), path: [head[0], head[1], 999, head[2]] };
    expect(restore(saved).path).toEqual([head[0], head[1]]);
  });

  it("dailies are the same for everyone on a day, at 7×7", () => {
    expect(daily_game("2026-10-21").puzzle).toEqual(daily_game("2026-10-21").puzzle);
    expect(daily_game("2026-10-21").puzzle.size).toBe(7);
  });
});

describe("record", () => {
  it("counts a solve and keeps best times only without hints", () => {
    let stats = record(empty_stats(), Size.S7, 5000, 0);
    expect(stats[Size.S7]).toEqual({ solved: 1, best: 5000 });
    stats = record(stats, Size.S7, 3000, 1);
    expect(stats[Size.S7]).toEqual({ solved: 2, best: 5000 });
  });
});
