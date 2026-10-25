import { describe, expect, it } from "vitest";
import { Level } from "../color-recall/modes";
import { is_solved, scramble, sort_puzzle, SORT_CONFIGS, swap, valid_order } from "./sort";

describe("gradient sort", () => {
  const puzzle = sort_puzzle(5, SORT_CONFIGS[Level.EASY]);
  const identity = puzzle.colors.map((_, index) => index);
  const free = puzzle.anchors.flatMap((anchor, index) => (anchor ? [] : [index]));

  it("builds the same board from a seed, corners locked", () => {
    expect(sort_puzzle(5, SORT_CONFIGS[Level.EASY])).toEqual(puzzle);
    const { width, height, anchors } = puzzle;
    expect([0, width - 1, width * (height - 1), width * height - 1].every((index) => anchors[index])).toBe(true);
    expect(sort_puzzle(5, SORT_CONFIGS[Level.HARD]).anchors.filter(Boolean)).toHaveLength(4);
  });

  it("scrambles only the free tiles and never hands over a solved board", () => {
    for (let seed = 0; seed < 50; seed++) {
      const board = sort_puzzle(seed, SORT_CONFIGS[Level.EASY]);
      const order = scramble(board, seed);
      expect(is_solved(order, board.colors)).toBe(false);
      expect(valid_order(order, board)).toBe(true);
    }
  });

  it("is solved when every place shows its colour", () => {
    expect(is_solved(identity, puzzle.colors)).toBe(true);
    const swapped = swap(identity, puzzle.anchors, free[0], free[1])!;
    expect(is_solved(swapped, puzzle.colors)).toBe(false);
    expect(is_solved(swap(swapped, puzzle.anchors, free[0], free[1])!, puzzle.colors)).toBe(true);
  });

  it("counts two tiles of the same colour in either place as solved", () => {
    expect(is_solved([1, 0, 2], ["#111111", "#111111", "#222222"])).toBe(true);
  });

  it("never moves an anchor", () => {
    expect(swap(identity, puzzle.anchors, 0, free[0])).toBeNull();
    expect(swap(identity, puzzle.anchors, free[0], free[0])).toBeNull();
  });

  it("rejects a saved board that doesn't fit", () => {
    expect(valid_order([0, 1], puzzle)).toBe(false);
    expect(valid_order([...identity.slice(0, -1), 1], puzzle)).toBe(false);
    expect(valid_order(swap(identity, puzzle.anchors, free[0], free[1])!, puzzle)).toBe(true);
  });
});
