import { describe, expect, it } from "vitest";
import {
  Cell,
  chord,
  clamp_config,
  count_mines,
  Difficulty,
  empty_stats,
  mines_left,
  neighbours,
  new_game,
  place_mines,
  PRESETS,
  record,
  reveal,
  seeded,
  Status,
  step,
  toggle_flag,
  with_mines,
  type Config,
} from "./game";

function board(rows: string[]): { config: Config; mines: boolean[] } {
  const mines = rows.join("").split("").map((c) => c === "*");
  return { config: { width: rows[0].length, height: rows.length, mines: mines.filter(Boolean).length }, mines };
}

function cells_of(game: { cells: readonly Cell[]; config: Config }): string[] {
  const symbol = { [Cell.HIDDEN]: "#", [Cell.REVEALED]: ".", [Cell.FLAGGED]: "F" };
  const rows: string[] = [];
  for (let r = 0; r < game.config.height; r++) {
    rows.push(game.cells.slice(r * game.config.width, (r + 1) * game.config.width).map((c) => symbol[c]).join(""));
  }
  return rows;
}

describe("neighbours", () => {
  it("clips at corners and edges", () => {
    const config = { width: 3, height: 3, mines: 0 };
    expect(neighbours(config, 0).sort()).toEqual([1, 3, 4]);
    expect(neighbours(config, 4)).toHaveLength(8);
    expect(neighbours(config, 5).sort()).toEqual([1, 2, 4, 7, 8]);
  });
});

describe("place_mines", () => {
  it("places the exact count and never in the first click's neighbourhood", () => {
    for (let seed = 1; seed <= 50; seed++) {
      for (const config of Object.values(PRESETS)) {
        const safe = (seed * 37) % (config.width * config.height);
        const mines = place_mines(config, safe, seeded(seed));
        expect(mines.filter(Boolean)).toHaveLength(config.mines);
        expect(mines[safe]).toBe(false);
        for (const n of neighbours(config, safe)) expect(mines[n]).toBe(false);
      }
    }
  });

  it("keeps only the clicked cell safe when the board is too full", () => {
    const config = { width: 5, height: 5, mines: 24 };
    const mines = place_mines(config, 12, seeded(3));
    expect(mines.filter(Boolean)).toHaveLength(24);
    expect(mines[12]).toBe(false);
  });

  it("is deterministic for a seed", () => {
    const config = PRESETS.expert;
    expect(place_mines(config, 0, seeded(42))).toEqual(place_mines(config, 0, seeded(42)));
  });
});

describe("reveal", () => {
  it("never loses on the first click and opens an area", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const game = reveal(new_game(PRESETS.expert), 200, seeded(seed));
      expect(game.status).not.toBe(Status.LOST);
      expect(game.counts[200]).toBe(0);
      expect(game.cells.filter((c) => c === Cell.REVEALED).length).toBeGreaterThan(1);
    }
  });

  it("floods zeros and stops at numbers, leaving flags closed", () => {
    const { config, mines } = board([
      "....*", //
      ".....",
      ".....",
      ".....",
    ]);
    let game = with_mines(config, mines);
    game = toggle_flag(game, 15);
    game = reveal(game, 15);
    expect(game.cells[15]).toBe(Cell.FLAGGED);
    game = reveal(game, 10);
    expect(cells_of(game)).toEqual([
      "....#", //
      ".....",
      ".....",
      "F....",
    ]);
  });

  it("loses on a mine and records which one", () => {
    const { config, mines } = board(["*..", "...", "..."]);
    const game = reveal(with_mines(config, mines), 0);
    expect(game.status).toBe(Status.LOST);
    expect(game.exploded).toBe(0);
    expect(reveal(game, 8)).toBe(game);
  });

  it("wins once every safe cell is open and flags the remaining mines", () => {
    const { config, mines } = board(["*..", "...", "..*"]);
    let game = with_mines(config, mines);
    for (const i of [1, 2, 3, 4, 5, 6, 7]) game = reveal(game, i);
    expect(game.status).toBe(Status.WON);
    expect(game.cells[0]).toBe(Cell.FLAGGED);
    expect(game.cells[8]).toBe(Cell.FLAGGED);
    expect(mines_left(game)).toBe(0);
  });
});

describe("chord", () => {
  const { config, mines } = board([
    "*..", //
    "...",
    "...",
  ]);

  it("opens the other neighbours when the flags match the number", () => {
    let game = reveal(with_mines(config, mines), 4);
    expect(game.counts[4]).toBe(1);
    game = toggle_flag(game, 0);
    game = chord(game, 4);
    expect(game.status).toBe(Status.WON);
  });

  it("does nothing while the flags don't match", () => {
    const game = reveal(with_mines(config, mines), 4);
    expect(chord(game, 4)).toBe(game);
  });

  it("loses when a flag is wrong", () => {
    let game = reveal(with_mines(config, mines), 4);
    game = toggle_flag(game, 1);
    game = chord(game, 4);
    expect(game.status).toBe(Status.LOST);
    expect(game.exploded).toBe(0);
  });
});

describe("toggle_flag", () => {
  it("toggles hidden cells only and counts down the mines", () => {
    const { config, mines } = board(["*..", "...", "..."]);
    let game = reveal(with_mines(config, mines), 4);
    game = toggle_flag(game, 4);
    expect(game.cells[4]).toBe(Cell.REVEALED);
    game = toggle_flag(toggle_flag(game, 1), 2);
    expect(mines_left(game)).toBe(-1);
    game = toggle_flag(game, 2);
    expect(game.cells[2]).toBe(Cell.HIDDEN);
  });
});

describe("count_mines", () => {
  it("counts adjacent mines", () => {
    const { config, mines } = board(["*.*", "...", "*.*"]);
    expect(count_mines(config, mines)[4]).toBe(4);
    expect(count_mines(config, mines)[1]).toBe(2);
  });
});

describe("clamp_config", () => {
  it("keeps the board inside the limits and leaves room for the first click", () => {
    expect(clamp_config({ width: 1, height: 100, mines: 0 })).toEqual({ width: 5, height: 30, mines: 1 });
    expect(clamp_config({ width: 5, height: 5, mines: 999 })).toEqual({ width: 5, height: 5, mines: 16 });
    expect(clamp_config({ width: Number.NaN, height: 9, mines: 10 })).toEqual({ width: 5, height: 9, mines: 10 });
  });
});

describe("record", () => {
  it("counts games and keeps the best preset time", () => {
    let stats = empty_stats();
    stats = record(stats, Difficulty.BEGINNER, true, 30_000);
    stats = record(stats, Difficulty.BEGINNER, false, 5_000);
    stats = record(stats, Difficulty.BEGINNER, true, 20_000);
    stats = record(stats, Difficulty.BEGINNER, true, 25_000);
    expect(stats.beginner).toEqual({ played: 4, won: 3, best: 20_000 });
  });

  it("keeps no best time for custom boards", () => {
    expect(record(empty_stats(), Difficulty.CUSTOM, true, 1_000).custom).toEqual({ played: 1, won: 1, best: null });
  });
});

describe("step", () => {
  it("moves and clamps on a rectangular board", () => {
    const config = { width: 4, height: 2, mines: 1 };
    expect(step(config, 0, "ArrowLeft")).toBe(0);
    expect(step(config, 0, "ArrowDown")).toBe(4);
    expect(step(config, 7, "ArrowRight")).toBe(7);
    expect(step(config, 5, "Home")).toBe(4);
    expect(step(config, 5, "End")).toBe(7);
  });
});
