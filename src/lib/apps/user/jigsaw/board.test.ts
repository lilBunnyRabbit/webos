import { describe, expect, it } from "vitest";
import {
  create_board,
  drop,
  fits,
  group_count,
  inner_groups,
  is_complete,
  is_placed,
  members,
  move_group,
  neighbours,
  placed_count,
  positions_of,
  raise,
  scatter,
  settle,
  table_for,
  UnionFind,
  type Board,
  type Saved,
} from "./board";
import { grid_for, home, type Layout } from "./cuts";

const layout: Layout = { cols: 3, rows: 2, width: 300, height: 200, piece_width: 100, piece_height: 100 };

function loose(): Board {
  return create_board(layout, Array.from({ length: 6 }, (_, i) => [i * 300, 1000]).flat());
}

function place(board: Board, piece: number, x: number, y: number) {
  board.x[piece] = x;
  board.y[piece] = y;
}

describe("UnionFind", () => {
  it("joins sets and tracks their size", () => {
    const sets = new UnionFind(5);
    expect(sets.union(0, 1)).toBe(true);
    expect(sets.union(3, 4)).toBe(true);
    expect(sets.union(1, 0)).toBe(false);
    expect(sets.union(1, 4)).toBe(true);
    expect(sets.find(0)).toBe(sets.find(3));
    expect(sets.size(4)).toBe(4);
    expect(sets.size(2)).toBe(1);
  });
});

describe("neighbours", () => {
  it("lists the cells sharing a side", () => {
    expect(neighbours(layout, 0).sort()).toEqual([1, 3]);
    expect(neighbours(layout, 4).sort()).toEqual([1, 3, 5]);
  });
});

describe("drop", () => {
  it("snaps a piece onto a nearby matching neighbour and joins them", () => {
    const board = loose();
    place(board, 1, 500 + 100 + 7, 500 - 4);
    place(board, 0, 500, 500);
    const result = drop(board, 1, 20);
    expect(result.joined).toBe(true);
    expect(board.x[1]).toBe(600);
    expect(board.y[1]).toBe(500);
    expect(members(board, 0).sort()).toEqual([0, 1]);
  });

  it("leaves a piece alone when nothing fits within the tolerance", () => {
    const board = loose();
    place(board, 1, 640, 500);
    place(board, 0, 500, 500);
    expect(drop(board, 1, 20)).toEqual({ joined: false, placed: false });
    expect(board.x[1]).toBe(640);
  });

  it("never joins pieces that aren't neighbours in the picture", () => {
    const board = loose();
    place(board, 0, 500, 500);
    place(board, 2, 600, 500);
    expect(drop(board, 2, 20).joined).toBe(false);
  });

  it("snaps a group to its place in the frame and locks it there", () => {
    const board = loose();
    place(board, 4, 112, 95);
    const result = drop(board, 4, 20);
    expect(result.placed).toBe(true);
    expect(is_placed(board, 4)).toBe(true);
    expect(placed_count(board)).toBe(1);
  });

  it("moves the whole dragged group and pulls other loose groups into line", () => {
    const board = loose();
    place(board, 0, 0 + 500, 500);
    place(board, 1, 100 + 500, 500);
    drop(board, 1, 20);
    move_group(board, members(board, 0), 3, 3);
    place(board, 3, 500 + 2, 600 + 5);
    place(board, 4, 600 - 4, 600 + 1);
    drop(board, 3, 20);
    drop(board, 4, 20);
    expect(members(board, 0).sort()).toEqual([0, 1, 3, 4]);
    expect(board.x[4] - board.x[3]).toBeCloseTo(100);
    expect(board.y[3] - board.y[0]).toBeCloseTo(100);
  });

  it("never drags a placed group off its place to join it", () => {
    const board = loose();
    place(board, 0, 0, 0);
    drop(board, 0, 20);
    place(board, 1, 100 + 30, 0);
    place(board, 4, 100 + 30, 100 + 8);
    drop(board, 4, 20);
    expect(is_placed(board, 0)).toBe(true);
  });
});

describe("completion", () => {
  it("is complete once every piece is in one group, wherever it lies", () => {
    const board = create_board(
      layout,
      Array.from({ length: 6 }, (_, piece) => [home(layout, piece).x + 900, home(layout, piece).y + 40]).flat()
    );
    expect(is_complete(board)).toBe(true);
    expect(group_count(board)).toBe(1);
    settle(board);
    expect(placed_count(board)).toBe(6);
  });

  it("is not complete with two groups", () => {
    const board = loose();
    expect(is_complete(board)).toBe(false);
    expect(group_count(board)).toBe(6);
  });
});

describe("create_board", () => {
  it("rebuilds groups from saved positions alone", () => {
    const board = loose();
    place(board, 0, 500, 500);
    place(board, 1, 600, 500);
    drop(board, 1, 20);
    const restored = create_board(layout, positions_of(board));
    expect(members(restored, 0).sort()).toEqual([0, 1]);
    expect(group_count(restored)).toBe(5);
  });
});

describe("raise", () => {
  it("moves a group to the top of the draw order, keeping its own order", () => {
    const board = loose();
    raise(board, [1, 3]);
    expect(board.order).toEqual([0, 2, 4, 5, 1, 3]);
  });
});

describe("inner_groups", () => {
  it("hides only groups without an edge piece", () => {
    const big: Layout = { cols: 3, rows: 3, width: 300, height: 300, piece_width: 100, piece_height: 100 };
    const board = create_board(big, Array.from({ length: 9 }, (_, i) => [i * 300, 1000]).flat());
    const hidden = inner_groups(board);
    expect([...hidden]).toEqual([board.sets.find(4)]);
    board.sets.union(4, 1);
    expect(inner_groups(board).size).toBe(0);
  });
});

describe("scatter", () => {
  const big = grid_for(100, 1600, 1000);

  it("is the same for the same seed", () => {
    expect(scatter(big, 3, 1.5)).toEqual(scatter(big, 3, 1.5));
  });

  it("puts every piece around the frame, none on it, and none joined", () => {
    const positions = scatter(big, 3, 1.5);
    const { table } = table_for(big, 1.5);
    for (let i = 0; i < positions.length; i += 2) {
      const cx = positions[i] + big.piece_width / 2;
      const cy = positions[i + 1] + big.piece_height / 2;
      expect(cx >= table.x && cx <= table.x + table.width && cy >= table.y && cy <= table.y + table.height).toBe(true);
      expect(cx > 0 && cx < big.width && cy > 0 && cy < big.height).toBe(false);
    }
    expect(group_count(create_board(big, positions))).toBe(big.cols * big.rows);
  });

  it("shapes the table like the viewport", () => {
    const wide = table_for(big, 3).table;
    const tall = table_for(big, 0.6).table;
    expect(wide.width / wide.height).toBeCloseTo(3);
    expect(tall.width / tall.height).toBeCloseTo(0.6);
  });
});

describe("fits", () => {
  it("rejects a save made for another size or count", () => {
    const saved: Saved = { path: "/a.png", pieces: 24, seed: 1, width: 300, height: 200, positions: new Array(12).fill(0), elapsed: 0 };
    expect(fits(saved, layout)).toBe(true);
    expect(fits({ ...saved, width: 301 }, layout)).toBe(false);
    expect(fits({ ...saved, positions: [0, 0] }, layout)).toBe(false);
  });
});
