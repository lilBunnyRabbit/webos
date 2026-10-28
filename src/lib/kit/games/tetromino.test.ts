import { describe, expect, test } from "vitest";
import { create_rng } from "$lib/core/utils/random";
import { fill_queue, kicks, Piece, PIECE_TOKENS, PIECES, SHAPES } from "./tetromino";

describe("tetromino", () => {
  test("every piece has four cells in each of four rotations, and a full turn comes back", () => {
    for (const piece of PIECES) {
      expect(SHAPES[piece]).toHaveLength(4);
      for (const cells of SHAPES[piece]) expect(cells).toHaveLength(4);
    }
    expect(SHAPES.t[0]).toEqual([{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }]);
  });

  test("O never kicks, I uses its own table", () => {
    expect(kicks(Piece.O, 0, 1)).toEqual([[0, 0]]);
    expect(kicks(Piece.I, 0, 1)[1]).toEqual([-2, 0]);
    expect(kicks(Piece.T, 0, 1)[1]).toEqual([-1, 0]);
  });

  test("fills whole bags up to the minimum and keeps what was queued", () => {
    const queue = fill_queue([Piece.I], create_rng(3), 6);
    expect(queue[0]).toBe(Piece.I);
    expect(queue).toHaveLength(8);
    expect(new Set(queue.slice(1))).toEqual(new Set(PIECES));
  });

  test("every piece has a colour token", () => {
    for (const piece of PIECES) expect(PIECE_TOKENS[piece]).toBeTruthy();
  });
});
