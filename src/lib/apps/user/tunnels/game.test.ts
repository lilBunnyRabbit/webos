import { describe, expect, it } from "vitest";
import {
  empty_stats,
  extend,
  hint,
  hinted_cells,
  judge,
  new_game,
  record,
  reset,
  restore,
  to_saved,
  undo,
  with_found,
} from "./game";
import { build_trie, Size, type Puzzle } from "./puzzle";

// a b c d e
// j i h g f   "abcdefghij" snakes through the top two rows,
// k l m n o   "klmno" and "tsrqp" read straight across.
// t s r q p
const puzzle: Puzzle = {
  seed: 1,
  size: Size.SMALL,
  rows: 4,
  cols: 5,
  letters: [..."abcdejihgfklmnotsrqp"],
  tunnels: [
    { word: "klmno", cells: [10, 11, 12, 13, 14] },
    { word: "tsrqp", cells: [15, 16, 17, 18, 19] },
    { word: "abcde", cells: [0, 1, 2, 3, 4] },
    { word: "fghij", cells: [9, 8, 7, 6, 5] },
  ],
};
const trie = build_trie(["klmno", "tsrqp", "abcde", "fghij", "onmlk", "abcdejihg"]);
const never = () => false;

describe("extend", () => {
  it("joins orthogonal neighbours and ignores diagonal ones", () => {
    expect(extend([0], 1, 5, never)).toEqual([0, 1]);
    expect(extend([0], 6, 5, never)).toEqual([0]);
  });

  it("fills a straight run a fast finger skipped", () => {
    expect(extend([0], 3, 5, never)).toEqual([0, 1, 2, 3]);
    expect(extend([0], 15, 5, never)).toEqual([0, 5, 10, 15]);
  });

  it("cuts the path back when the finger returns over it", () => {
    expect(extend([0, 1, 2, 7], 1, 5, never)).toEqual([0, 1]);
  });

  it("stops at locked cells", () => {
    expect(extend([0], 3, 5, (cell) => cell === 2)).toEqual([0, 1]);
    expect(extend([], 2, 5, (cell) => cell === 2)).toEqual([]);
  });
});

describe("judge", () => {
  const game = new_game(puzzle);

  it("locks a hidden word traced on its cells, either way it spells a word", () => {
    expect(judge(game, [10, 11, 12, 13, 14], trie)).toEqual({ kind: "found", tunnel: 0 });
    expect(judge(game, [14, 13, 12, 11, 10], trie)).toEqual({ kind: "found", tunnel: 0 });
  });

  it("tells a real word on the wrong cells from a non-word", () => {
    expect(judge(game, [0, 1, 2, 3, 4, 5, 6, 7, 8], trie)).toEqual({ kind: "elsewhere" });
    expect(judge(game, [15, 10, 11, 12, 13], trie)).toEqual({ kind: "unknown" });
    expect(judge(game, [0, 1], trie)).toEqual({ kind: "short" });
  });
});

describe("hints", () => {
  it("reveals the first word's letters one by one, then locks it", () => {
    let game = new_game(puzzle);
    const cells: number[] = [];
    for (let i = 0; i < 5; i++) {
      const next = hint(game)!;
      cells.push(next.cell);
      game = next.game;
    }
    expect(cells).toEqual([10, 11, 12, 13, 14]);
    expect(game.found).toEqual([0]);
    expect(game.hints).toBe(5);
  });

  it("keeps going on the word it started", () => {
    let game = hint(new_game(puzzle))!.game;
    game = with_found(game, 1);
    expect(hint(game)!.cell).toBe(11);
    expect([...hinted_cells(hint(game)!.game)]).toEqual([
      [10, 1],
      [11, 2],
    ]);
  });
});

describe("undo and reset", () => {
  it("takes back the last word, then all of them, keeping hints", () => {
    let game = with_found(with_found(hint(new_game(puzzle))!.game, 2), 3);
    expect(undo(game).found).toEqual([2]);
    game = reset(game);
    expect(game.found).toEqual([]);
    expect(game.revealed[0]).toBe(1);
  });

  it("leaves a solved game alone", () => {
    const solved = [0, 1, 2, 3].reduce(with_found, new_game(puzzle));
    expect(solved.solved).toBe(true);
    expect(undo(solved)).toBe(solved);
  });
});

describe("saves", () => {
  it("round-trips progress on top of the seed", () => {
    const game = with_found(hint(new_game(puzzle))!.game, 3);
    expect(restore(puzzle, to_saved(game, 1234))).toEqual(game);
  });

  it("drops a save that no longer fits the puzzle", () => {
    const saved = to_saved(new_game(puzzle), 0);
    expect(restore(puzzle, { ...saved, found: [9] })).toBeNull();
    expect(restore(puzzle, { ...saved, revealed: [0, 0] })).toBeNull();
  });
});

describe("record", () => {
  it("counts every solve and keeps the best time without hints", () => {
    let stats = record(empty_stats(), Size.SMALL, 9000, 0);
    stats = record(stats, Size.SMALL, 5000, 2);
    expect(stats.small).toEqual({ solved: 2, best: 9000 });
  });
});
