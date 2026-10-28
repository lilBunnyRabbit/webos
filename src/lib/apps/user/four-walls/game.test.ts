import { describe, expect, test } from "vitest";
import { create_rng } from "$lib/core/utils/random";
import {
  ALL_WALLS,
  arrow_for,
  BOARD_SIZE,
  collapse,
  create_game,
  CYCLE,
  cycle_direction,
  Direction,
  drop_distance,
  empty_best,
  fill_turns,
  fits,
  full_lines,
  hard_drop,
  hold,
  line_score,
  lock,
  Mode,
  move,
  Piece,
  piece_cells,
  record_best,
  rotate,
  screen_rotation,
  set_status,
  spawn_point,
  Status,
  to_board,
  to_frame,
  zones,
  type Active,
  type Cell,
  type GameState,
} from "./game";

const SIZE = 8;

function playing(state: GameState): GameState {
  return set_status(state, Status.PLAYING);
}

function with_active(state: GameState, piece: Piece, direction: Direction): GameState {
  const { x, y } = spawn_point(state.size, piece);
  const active: Active = { piece, direction, rotation: 0, x, y, lowest: y, resets: 0, lock_ms: 0 };
  return { ...state, active };
}

function game(size = SIZE, mode: Mode = Mode.CYCLE): GameState {
  return playing(create_game(create_rng(1), { size, mode }));
}

describe("zones", () => {
  test.each([8, 12, 14, 16])("split a %i board into four zones whose lines shrink by two toward the centre", (size) => {
    const { zone_of, rows } = zones(size);
    const seen = new Set<number>();
    for (const zone of CYCLE) {
      expect(rows[zone].map((line) => line.length)).toEqual(
        Array.from({ length: size / 2 }, (_, depth) => size - 1 - depth * 2)
      );
      for (const line of rows[zone]) for (const index of line) seen.add(index);
    }
    expect(seen.size).toBe(size * size);
    expect(zone_of.filter(Boolean)).toHaveLength(size * size);
  });

  test("the diagonals go round like a pinwheel", () => {
    const { zone_of } = zones(SIZE);
    const at = (x: number, y: number) => zone_of[y * SIZE + x];
    expect(at(SIZE - 1, SIZE - 1)).toBe(Direction.DOWN);
    expect(at(0, SIZE - 1)).toBe(Direction.LEFT);
    expect(at(0, 0)).toBe(Direction.UP);
    expect(at(SIZE - 1, 0)).toBe(Direction.RIGHT);
    expect(at(3, 3)).toBe(Direction.UP);
    expect(at(4, 4)).toBe(Direction.DOWN);
    expect(at(3, 7)).toBe(Direction.DOWN);
    expect(at(0, 3)).toBe(Direction.LEFT);
  });
});

describe("frames", () => {
  test("a piece's own +y is its wall on the board", () => {
    for (const direction of CYCLE) {
      const a = to_board(SIZE, direction, 2, 3);
      const b = to_board(SIZE, direction, 2, 4);
      const step = { x: b.x - a.x, y: b.y - a.y };
      const frame = to_frame(direction, step.x, step.y);
      expect([frame.x + 0, frame.y]).toEqual([0, 1]);
      expect(arrow_for(direction, { x: 0, y: 1 })).toBe(direction);
    }
  });

  test("steering arrows lie across the way", () => {
    expect(arrow_for(Direction.LEFT, { x: 1, y: 0 })).toBe(Direction.DOWN);
    expect(arrow_for(Direction.LEFT, { x: -1, y: 0 })).toBe(Direction.UP);
    expect(arrow_for(Direction.UP, { x: 1, y: 0 })).toBe(Direction.LEFT);
    expect(screen_rotation(Direction.RIGHT)).toBe(3);
  });
});

describe("cycle", () => {
  test("goes down, left, up, right and turns round every ten pieces", () => {
    const dealt = Array.from({ length: 22 }, (_, i) => cycle_direction(i));
    expect(dealt.slice(0, 10)).toEqual(["down", "left", "up", "right", "down", "left", "up", "right", "down", "left"]);
    expect(dealt.slice(10, 14)).toEqual(["down", "right", "up", "left"]);
    expect(dealt.slice(18, 22)).toEqual(["down", "right", "down", "left"]);
  });

  test("a seeded random game deals the same pieces and walls", () => {
    const a = fill_turns({ queue: [], dealt: 0, mode: Mode.RANDOM }, create_rng(9), 40);
    const b = fill_turns({ queue: [], dealt: 0, mode: Mode.RANDOM }, create_rng(9), 40);
    expect(a).toEqual(b);
    expect(new Set(a.queue.map((turn) => turn.direction)).size).toBe(4);
  });
});

describe("play", () => {
  test("a piece spawns at the centre and drops onto its own wall", () => {
    for (const direction of CYCLE) {
      const state = with_active(game(), Piece.O, direction);
      const cells = piece_cells(SIZE, state.active!);
      for (const cell of cells) {
        expect(cell.x).toBeGreaterThanOrEqual(2);
        expect(cell.x).toBeLessThanOrEqual(5);
        expect(cell.y).toBeGreaterThanOrEqual(2);
        expect(cell.y).toBeLessThanOrEqual(5);
      }
      const dropped = hard_drop(state, create_rng(2), 0);
      const placed = dropped.board.flatMap((cell, index) => (cell ? [index] : []));
      const coords = placed.map((index) => ({ x: index % SIZE, y: Math.floor(index / SIZE) }));
      const touches = {
        down: coords.some((c) => c.y === SIZE - 1),
        up: coords.some((c) => c.y === 0),
        left: coords.some((c) => c.x === 0),
        right: coords.some((c) => c.x === SIZE - 1),
      };
      expect(touches[direction]).toBe(true);
      expect(dropped.score).toBe(2 * drop_distance(state, state.active!));
    }
  });

  test("steering moves across the way, never along it", () => {
    const state = with_active(game(), Piece.T, Direction.LEFT);
    const before = piece_cells(SIZE, state.active!);
    const after = piece_cells(SIZE, move(state, 1).active!);
    expect(after.map((c) => c.x)).toEqual(before.map((c) => c.x));
    expect(after.map((c) => c.y)).toEqual(before.map((c) => c.y + 1));
  });

  test("rotation keeps the piece in its frame and kicks off a wall", () => {
    let state = with_active(game(), Piece.I, Direction.RIGHT);
    state = rotate(state, 1);
    expect(state.active!.rotation).toBe(1);
    for (let i = 0; i < SIZE; i++) state = move(state, -1);
    const turned = rotate(state, 1);
    expect(turned.active!.rotation).toBe(2);
    expect(fits(turned, turned.active!)).toBe(true);
  });

  test("a full zone line clears and the zone collapses toward its wall", () => {
    const { rows } = zones(SIZE);
    const board: Cell[] = Array<Cell>(SIZE * SIZE).fill(null);
    for (const index of rows.down[0]) board[index] = Piece.Z;
    board[rows.down[1][0]] = Piece.T;
    board[rows.left[0][0]] = Piece.L;
    const lines = full_lines(board, SIZE);
    expect(lines).toEqual([{ zone: Direction.DOWN, depth: 0 }]);
    const next = collapse(board, SIZE, lines);
    expect(next[rows.down[0][1]]).toBe(Piece.T);
    expect(next[rows.down[1][0]]).toBeNull();
    expect(next[rows.left[0][0]]).toBe(Piece.L);
    expect(next.filter(Boolean)).toHaveLength(2);
  });

  test("a lock that fills lines in two zones scores them together and marks both walls", () => {
    const { rows } = zones(SIZE);
    const corner = { ...with_active(game(), Piece.O, Direction.DOWN).active!, x: 0, y: SIZE - 2 };
    const target = new Set(piece_cells(SIZE, corner).map(({ x, y }) => y * SIZE + x));
    const board: Cell[] = Array<Cell>(SIZE * SIZE).fill(null);
    for (const line of [rows.down[0], rows.left[0], rows.left[1]]) {
      for (const index of line) if (!target.has(index)) board[index] = Piece.S;
    }
    const placed = lock({ ...game(), board, active: corner }, create_rng(3), 0);
    expect(placed.last_clear).toBe(3);
    expect(placed.last_zones).toBe(2);
    expect(placed.walls).toBe(0b0011);
    expect(placed.score).toBe(line_score(3, 1));
    expect(placed.board.filter(Boolean)).toHaveLength(0);
  });

  test("a blocked spawn ends the game", () => {
    const state = with_active(game(), Piece.O, Direction.DOWN);
    const board: Cell[] = Array<Cell>(SIZE * SIZE).fill(null);
    board[4 * SIZE + 2] = Piece.J;
    const queue = [{ piece: Piece.T, direction: Direction.DOWN }, ...state.queue];
    const over = hold({ ...state, board, queue }, create_rng(4));
    expect(over.status).toBe(Status.OVER);
    expect(over.active).toBeNull();
  });

  test("a piece that locks over the centre ends the game", () => {
    const state = with_active(game(), Piece.T, Direction.DOWN);
    const board: Cell[] = Array<Cell>(SIZE * SIZE).fill(null);
    for (let x = 0; x < SIZE; x++) board[5 * SIZE + x] = x === 0 ? null : Piece.J;
    const over = hard_drop({ ...state, board }, create_rng(4), 0);
    expect(over.status).toBe(Status.OVER);
    expect(over.lines).toBe(0);
  });

  test("hold swaps the piece but keeps the wall", () => {
    let state = with_active(game(), Piece.T, Direction.UP);
    state = hold(state, create_rng(5));
    expect(state.hold).toBe(Piece.T);
    expect(state.can_hold).toBe(false);
    state = { ...state, can_hold: true, active: { ...state.active!, direction: Direction.LEFT } };
    const swapped = hold(state, create_rng(5));
    expect(swapped.active!.piece).toBe(Piece.T);
    expect(swapped.active!.direction).toBe(Direction.LEFT);
  });

  test("the default board is the tuned size", () => {
    expect(create_game(create_rng(1)).size).toBe(BOARD_SIZE);
    expect(ALL_WALLS).toBe(15);
  });
});

describe("best", () => {
  test("keeps the best score and lines per mode", () => {
    let best = record_best(empty_best(), { mode: Mode.CYCLE, score: 300, lines: 2 });
    best = record_best(best, { mode: Mode.CYCLE, score: 100, lines: 5 });
    expect(best.cycle).toEqual({ score: 300, lines: 5 });
    expect(best.random).toEqual({ score: 0, lines: 0 });
  });
});
