import { describe, expect, it } from "vitest";
import {
  capsules,
  Difficulty,
  empty_stats,
  hint,
  line_between,
  match,
  new_game,
  record,
  restore,
  saved_schema,
  snap_end,
  with_found,
} from "./game";
import { placement_cells, reverse } from "./puzzle";

describe("line_between", () => {
  it("follows rows, columns and diagonals", () => {
    expect(line_between(4, 0, 3)).toEqual([0, 1, 2, 3]);
    expect(line_between(4, 12, 0)).toEqual([12, 8, 4, 0]);
    expect(line_between(4, 3, 12)).toEqual([3, 6, 9, 12]);
    expect(line_between(4, 5, 5)).toEqual([5]);
  });

  it("rejects cells that don't line up", () => {
    expect(line_between(4, 0, 6)).toBeNull();
  });
});

describe("snap_end", () => {
  it("snaps a wobbly drag onto the nearest direction", () => {
    expect(snap_end(10, 0, 3.2, 0.4)).toBe(3);
    expect(snap_end(10, 0, 2.1, 1.8)).toBe(22);
    expect(snap_end(10, 55, -0.3, -2.9)).toBe(25);
  });

  it("stays on the start for tiny moves and clamps at the edge", () => {
    expect(snap_end(10, 44, 0.2, 0.1)).toBe(44);
    expect(snap_end(10, 7, 9, 0)).toBe(9);
    expect(snap_end(10, 88, 5, 5)).toBe(99);
  });
});

describe("play", () => {
  it("accepts a word selected either way round", () => {
    const game = new_game(Difficulty.HARD, 42);
    const placement = game.puzzle.placements[0];
    const cells = placement_cells(game.puzzle.size, placement);
    expect(match(game.puzzle, cells)?.word).toBe(placement.word);
    expect(match(game.puzzle, [...cells].reverse())?.word).toBe(placement.word);
    expect(match(game.puzzle, cells.slice(0, -1))).toBeNull();
    expect(reverse(placement.word)).not.toBe(placement.word);
  });

  it("is solved once every word is found, and only then", () => {
    let game = new_game(Difficulty.EASY, 7);
    const words = game.puzzle.placements.map((placement) => placement.word);
    for (const word of words.slice(0, -1)) game = with_found(game, word);
    expect(game.solved).toBe(false);
    expect(with_found(game, words[0]).found).toHaveLength(words.length - 1);
    game = with_found(game, words[words.length - 1]);
    expect(game.solved).toBe(true);
  });

  it("colours capsules in the order words were found", () => {
    let game = new_game(Difficulty.MEDIUM, 3);
    const [a, b] = game.puzzle.placements;
    game = with_found(with_found(game, b.word), a.word);
    const [first, second] = capsules(game);
    expect([first.word, first.colour, second.word, second.colour]).toEqual([b.word, 0, a.word, 1]);
    expect([first.row, first.col]).toEqual([b.row, b.col]);
    expect(first.end_row).toBe(b.row + b.dr * (b.word.length - 1));
  });

  it("hints the first letter of a word not found yet", () => {
    let game = new_game(Difficulty.EASY, 11);
    const [first, ...rest] = game.puzzle.placements;
    for (const placement of rest) game = with_found(game, placement.word);
    expect(hint(game, 0.99)).toBe(placement_cells(game.puzzle.size, first)[0]);
    expect(hint(with_found(game, first.word))).toBeNull();
  });
});

describe("persistence", () => {
  it("round-trips a game in progress through its save", () => {
    let game = new_game(Difficulty.MEDIUM, 2024);
    const [a, b] = game.puzzle.placements;
    game = { ...with_found(with_found(game, a.word), b.word), hints: 2 };
    const saved = saved_schema.parse(
      JSON.parse(JSON.stringify({ difficulty: "medium", seed: 2024, found: game.found, hints: 2, elapsed: 1500 }))
    );
    expect(restore(saved)).toEqual(game);
  });

  it("drops a save whose words aren't in the puzzle", () => {
    expect(restore({ difficulty: "easy", seed: 1, found: ["NOTAWORD"], hints: 0, elapsed: 0 })).toBeNull();
  });

  it("records best times only for hint-free solves", () => {
    let stats = record(empty_stats(), Difficulty.EASY, 9000, 0);
    stats = record(stats, Difficulty.EASY, 5000, 1);
    expect(stats.easy).toEqual({ solved: 2, best: 9000 });
    expect(stats.hard).toEqual({ solved: 0, best: null });
  });
});
