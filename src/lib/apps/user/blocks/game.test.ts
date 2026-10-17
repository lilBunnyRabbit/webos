import { describe, expect, test } from "vitest";
import { create_rng } from "$lib/core/utils/random";
import {
  BUFFER,
  collapse,
  create_game,
  drop_distance,
  empty_board,
  fill_queue,
  full_rows,
  gravity_ms,
  hard_drop,
  hold,
  kicks,
  LOCK_MS,
  lock,
  Mode,
  move,
  Piece,
  PIECES,
  piece_cells,
  record_marathon,
  record_sprint,
  empty_stats,
  repeats,
  rotate,
  ROWS,
  set_status,
  SHAPES,
  soft_drop,
  SPRINT_LINES,
  Status,
  tick,
  WIDTH,
  type Active,
  type Cell,
  type GameState,
  type Piece as PieceType,
} from "./game";

const sorted = (pieces: readonly PieceType[]) => [...pieces].sort().join("");

function with_board(rows: string[]): Cell[] {
  const board = empty_board();
  rows.forEach((line, i) => {
    const row = ROWS - rows.length + i;
    [...line].forEach((char, col) => {
      if (char === "#") board[row * WIDTH + col] = Piece.O;
    });
  });
  return board;
}

function playing(
  active: Partial<Active> & { piece: PieceType },
  board: Cell[] = empty_board(),
  overrides: Partial<GameState> = {}
): GameState {
  const game = set_status(create_game(create_rng(1)), Status.PLAYING);
  const full: Active = { rotation: 0, x: 3, y: 0, lowest: active.y ?? 0, resets: 0, lock_ms: 0, ...active };
  return { ...game, board, active: full, ...overrides };
}

describe("bag randomizer", () => {
  test("the same seed deals the same pieces", () => {
    const a = fill_queue([], create_rng(42), 70);
    const b = fill_queue([], create_rng(42), 70);
    expect(a).toEqual(b);
    expect(fill_queue([], create_rng(43), 70)).not.toEqual(a);
  });

  test("every bag of seven holds each piece once", () => {
    const queue = fill_queue([], create_rng(7), 70);
    for (let i = 0; i < queue.length; i += 7) expect(sorted(queue.slice(i, i + 7))).toBe(sorted(PIECES));
  });

  test("a daily game replays the same order across lock and spawn", () => {
    const play = () => {
      const rng = create_rng(2026);
      let game = set_status(create_game(rng), Status.PLAYING);
      const seen: PieceType[] = [];
      for (let i = 0; i < 10; i++) {
        seen.push(game.active!.piece);
        game = hard_drop(game, rng, 0);
      }
      return seen;
    };
    expect(play()).toEqual(play());
  });

  test("keeps the next queue filled", () => {
    const rng = create_rng(3);
    let game = set_status(create_game(rng), Status.PLAYING);
    for (let i = 0; i < 20 && game.status === Status.PLAYING; i++) {
      game = hard_drop(move(move(game, -1), -1), rng, 0);
      expect(game.queue.length).toBeGreaterThanOrEqual(6);
    }
  });
});

describe("shapes", () => {
  test("every rotation has four cells, and four turns come back to the start", () => {
    for (const piece of PIECES) {
      for (const cells of SHAPES[piece]) expect(cells).toHaveLength(4);
    }
    let game = playing({ piece: Piece.T, y: 5 });
    for (let i = 0; i < 4; i++) game = rotate(game, 1);
    expect(game.active!.rotation).toBe(0);
    expect(piece_cells(game.active!)).toEqual(piece_cells({ piece: Piece.T, rotation: 0, x: 3, y: 5 }));
  });

  test("O never moves when rotated", () => {
    const game = playing({ piece: Piece.O, x: 4, y: 5 });
    const turned = rotate(game, 1);
    const key = (active: Active) =>
      piece_cells(active)
        .map(({ x, y }) => `${x},${y}`)
        .sort();
    expect(key(turned.active!)).toEqual(key(game.active!));
    expect(kicks(Piece.O, 0, 1)).toEqual([[0, 0]]);
  });
});

describe("rotation and wall kicks", () => {
  test("rotates in place when there's room", () => {
    const game = rotate(playing({ piece: Piece.T, y: 5 }), 1);
    expect(game.active).toMatchObject({ rotation: 1, x: 3, y: 5 });
  });

  test("kicks off the left wall", () => {
    const game = playing({ piece: Piece.T, rotation: 1, x: -1, y: 5 });
    const turned = rotate(game, 1);
    expect(turned.active).toMatchObject({ rotation: 2, x: 0, y: 5 });
  });

  test("I kicks off the right wall with the I table", () => {
    const game = playing({ piece: Piece.I, rotation: 1, x: 7, y: 5 });
    const turned = rotate(game, -1);
    expect(turned.active!.rotation).toBe(0);
    expect(Math.max(...piece_cells(turned.active!).map((c) => c.x))).toBe(WIDTH - 1);
    expect(turned.active!.x).toBe(6);
  });

  test("uses a floor kick (T-spin triple shape) when the plain turn is blocked", () => {
    const board = with_board(["##.#######", "#..#######", "##.#######"]);
    const game = playing({ piece: Piece.T, rotation: 1, x: 1, y: ROWS - 5 }, board);
    const turned = rotate(game, 1);
    expect(turned).not.toBe(game);
    for (const { x, y } of piece_cells(turned.active!)) expect(board[y * WIDTH + x]).toBeNull();
  });

  test("stays put when no kick fits", () => {
    const filled = empty_board().map((_, i) => (Math.floor(i / WIDTH) >= 3 && i % WIDTH !== 4 ? Piece.Z : null));
    const game = playing({ piece: Piece.I, rotation: 1, x: 2, y: 3 }, filled);
    expect(rotate(game, 1)).toBe(game);
  });
});

describe("moving and dropping", () => {
  test("walls stop sideways moves", () => {
    const game = playing({ piece: Piece.O, x: 0, y: 5 });
    expect(move(game, -1)).toBe(game);
    expect(move(game, 1).active!.x).toBe(1);
  });

  test("soft drop scores a point per row, hard drop two", () => {
    const game = playing({ piece: Piece.O, x: 4, y: 0 });
    expect(soft_drop(game).score).toBe(game.score + 1);
    const distance = drop_distance(game.board, game.active!);
    expect(distance).toBe(ROWS - 2);
    const dropped = hard_drop(game, create_rng(1), 0);
    expect(dropped.score).toBe(distance * 2);
    expect(dropped.board[(ROWS - 1) * WIDTH + 4]).toBe(Piece.O);
  });

  test("hold swaps once per piece", () => {
    const rng = create_rng(5);
    const game = set_status(create_game(rng), Status.PLAYING);
    const first = game.active!.piece;
    const held = hold(game, rng);
    expect(held.hold).toBe(first);
    expect(held.active!.piece).toBe(game.queue[0]);
    expect(hold(held, rng)).toBe(held);
    const next = hard_drop(held, rng, 0);
    expect(next.can_hold).toBe(true);
    expect(hold(next, rng).active!.piece).toBe(first);
  });
});

describe("lock delay", () => {
  test("a grounded piece locks after the delay", () => {
    const rng = create_rng(1);
    const game = playing({ piece: Piece.O, x: 4, y: ROWS - 2 });
    const waiting = tick(game, 0, LOCK_MS - 1, false, rng, 0).state;
    expect(waiting.active).toMatchObject({ y: ROWS - 2 });
    const locked = tick(waiting, 0, 2, false, rng, 0).state;
    expect(locked.pieces).toBe(1);
    expect(locked.board[(ROWS - 1) * WIDTH + 4]).toBe(Piece.O);
  });

  test("a move resets the delay, up to the limit", () => {
    let game = playing({ piece: Piece.O, x: 4, y: ROWS - 2 });
    game = { ...game, active: { ...game.active!, lock_ms: 400 } };
    const moved = move(game, -1);
    expect(moved.active).toMatchObject({ lock_ms: 0, resets: 1 });
    const spent = move({ ...game, active: { ...game.active!, resets: 15 } }, -1);
    expect(spent.active!.lock_ms).toBe(400);
  });

  test("gravity follows the level", () => {
    expect(gravity_ms(1)).toBe(1000);
    expect(gravity_ms(5)).toBeLessThan(gravity_ms(4));
    const rng = create_rng(1);
    const game = playing({ piece: Piece.T, y: 1 });
    const after = tick(game, 0, 999, false, rng);
    expect(after.state).toBe(game);
    expect(after.carry).toBe(999);
    expect(tick(game, after.carry, 1, false, rng).state.active!.y).toBe(2);
  });
});

describe("line clears", () => {
  test("finds full rows and collapses them", () => {
    const board = with_board(["#.........", "##########", "#####.####", "##########"]);
    const rows = full_rows(board);
    expect(rows).toEqual([ROWS - 3, ROWS - 1]);
    const after = collapse(board, rows);
    expect(after).toHaveLength(ROWS * WIDTH);
    expect(full_rows(after)).toEqual([]);
    expect(after[(ROWS - 1) * WIDTH + 5]).toBeNull();
    expect(after[(ROWS - 2) * WIDTH]).toBe(Piece.O);
  });

  test("an I into a four-row well clears four lines and scores 800 × level", () => {
    const well = with_board(Array(4).fill("#########."));
    const rng = create_rng(1);
    const game = playing({ piece: Piece.I, rotation: 1, x: 7, y: 0 }, well, { level: 2, start_level: 2 });
    const dropped = hard_drop(game, rng, 0);
    expect(dropped.last_clear).toBe(4);
    expect(dropped.lines).toBe(4);
    expect(dropped.score).toBe(800 * 2 + drop_distance(game.board, game.active!) * 2);
    expect(dropped.board.every((cell) => cell === null)).toBe(true);
  });

  test("flashes the rows first, then collapses on the tick that runs out", () => {
    const rng = create_rng(1);
    const game = playing({ piece: Piece.I, x: 0, y: ROWS - 2 }, with_board(["....######"]));
    const locked = lock(game, rng, 200);
    expect(locked.clearing).toEqual({ rows: [ROWS - 1], ms: 200 });
    expect(locked.active).toBeNull();
    const half = tick(locked, 0, 100, false, rng, 200).state;
    expect(half.clearing!.ms).toBe(100);
    const done = tick(half, 0, 100, false, rng, 200).state;
    expect(done.clearing).toBeNull();
    expect(done.active).not.toBeNull();
    expect(done.board.every((cell) => cell === null)).toBe(true);
  });

  test("scores single to four lines and levels up every ten lines", () => {
    const rng = create_rng(1);
    const cases: [number, number][] = [
      [1, 100],
      [2, 300],
      [3, 500],
    ];
    for (const [rows, points] of cases) {
      const game = playing(
        { piece: Piece.I, rotation: 1, x: 7, y: ROWS - 4 },
        with_board(Array(rows).fill("#########.")),
        { lines: 9 }
      );
      const locked = lock(game, rng, 0);
      expect(locked.score).toBe(points);
      expect(locked.level).toBe(2);
    }
  });

  test("a sprint ends won at forty lines", () => {
    const rng = create_rng(1);
    const game = playing({ piece: Piece.I, x: 0, y: ROWS - 2 }, with_board(["....######"]), {
      mode: Mode.SPRINT,
      lines: SPRINT_LINES - 1,
    });
    const done = lock(game, rng, 0);
    expect(done.status).toBe(Status.WON);
    expect(done.level).toBe(1);
  });

  test("locking inside the hidden rows ends the game", () => {
    const rng = create_rng(1);
    const game = playing({ piece: Piece.O, x: 0, y: BUFFER - 2 });
    expect(lock(game, rng, 0).status).toBe(Status.OVER);
  });
});

describe("auto-repeat", () => {
  test("waits for the delay, then repeats at the rate", () => {
    expect(repeats(0, 100, 160, 50)).toBe(0);
    expect(repeats(100, 160, 160, 50)).toBe(1);
    expect(repeats(160, 260, 160, 50)).toBe(2);
  });
});

describe("statistics", () => {
  test("keeps the top scores and bests", () => {
    let stats = empty_stats();
    const game = { ...create_game(create_rng(1)), score: 1200, lines: 12, level: 2 };
    stats = record_marathon(stats, game, "2026-10-17");
    stats = record_marathon(stats, { ...game, score: 3000, lines: 25, level: 3 }, "2026-10-17");
    expect(stats.marathon).toMatchObject({
      played: 2,
      best_score: 3000,
      best_lines: 25,
      best_level: 3,
      total_lines: 37,
    });
    expect(stats.scores.map((s) => s.score)).toEqual([3000, 1200]);
    stats = record_sprint(stats, null);
    stats = record_sprint(stats, 90_000);
    stats = record_sprint(stats, 120_000);
    expect(stats.sprint).toEqual({ played: 3, finished: 2, best_ms: 90_000 });
  });
});
