import { describe, expect, test } from "vitest";
import {
  can_move,
  Direction,
  empty_cells,
  game_schema,
  key_direction,
  move,
  new_game,
  play,
  shows_win,
  SIZE,
  spawn,
  swipe_direction,
  type Game,
  type Rng,
} from "./game";

function game_of(rows: number[][], extra: Partial<Game> = {}): Game {
  const tiles = rows.flatMap((values, row) =>
    values.flatMap((value, col) => (value ? [{ id: row * SIZE + col, value, row, col }] : []))
  );
  return { tiles, score: 0, next_id: SIZE * SIZE, won: false, keep_going: false, ...extra };
}

function rows_of(game: Game): number[][] {
  const rows = Array.from({ length: SIZE }, () => Array<number>(SIZE).fill(0));
  for (const tile of game.tiles) rows[tile.row][tile.col] = tile.value;
  return rows;
}

function sequence(...values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("move", () => {
  test("slides tiles toward each direction", () => {
    const game = game_of([
      [0, 2, 0, 4],
      [0, 0, 0, 0],
      [8, 0, 0, 0],
      [0, 0, 16, 0],
    ]);
    expect(rows_of(move(game, Direction.LEFT).game)).toEqual([
      [2, 4, 0, 0],
      [0, 0, 0, 0],
      [8, 0, 0, 0],
      [16, 0, 0, 0],
    ]);
    expect(rows_of(move(game, Direction.RIGHT).game)).toEqual([
      [0, 0, 2, 4],
      [0, 0, 0, 0],
      [0, 0, 0, 8],
      [0, 0, 0, 16],
    ]);
    expect(rows_of(move(game, Direction.UP).game)).toEqual([
      [8, 2, 16, 4],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    expect(rows_of(move(game, Direction.DOWN).game)).toEqual([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [8, 2, 16, 4],
    ]);
  });

  test("merges each tile at most once per move", () => {
    const result = move(game_of([[2, 2, 2, 2], [4, 4, 8, 0], [2, 2, 4, 0], [0, 0, 0, 0]]), Direction.LEFT);
    expect(rows_of(result.game).slice(0, 3)).toEqual([
      [4, 4, 0, 0],
      [8, 8, 0, 0],
      [4, 4, 0, 0],
    ]);
  });

  test("merges the pair nearest the edge it slides toward", () => {
    expect(rows_of(move(game_of([[2, 2, 2, 0]]), Direction.RIGHT).game)[0]).toEqual([0, 0, 2, 4]);
    expect(rows_of(move(game_of([[2, 2, 2, 0]]), Direction.LEFT).game)[0]).toEqual([4, 2, 0, 0]);
  });

  test("adds merged values to the score", () => {
    const result = move(game_of([[2, 2, 4, 4]], { score: 10 }), Direction.LEFT);
    expect(result.game.score).toBe(10 + 4 + 8);
  });

  test("gives merged tiles new ids and reports both sources as consumed at the target", () => {
    const game = game_of([[0, 2, 0, 2]]);
    const result = move(game, Direction.LEFT);
    expect(result.merged_ids).toEqual([game.next_id]);
    expect(result.game.next_id).toBe(game.next_id + 1);
    expect(result.consumed.map((tile) => [tile.id, tile.row, tile.col])).toEqual([
      [1, 0, 0],
      [3, 0, 0],
    ]);
  });

  test("keeps ids of tiles that only slide", () => {
    const result = move(game_of([[0, 0, 0, 8]]), Direction.LEFT);
    expect(result.game.tiles).toEqual([{ id: 3, value: 8, row: 0, col: 0 }]);
  });

  test("reports no move and returns the same game when nothing can slide", () => {
    const game = game_of([[2, 4, 0, 0]]);
    const result = move(game, Direction.LEFT);
    expect(result.moved).toBe(false);
    expect(result.game).toBe(game);
  });

  test("marks the game won on reaching 2048", () => {
    expect(move(game_of([[1024, 1024, 0, 0]]), Direction.LEFT).game.won).toBe(true);
    expect(move(game_of([[512, 512, 0, 0]]), Direction.LEFT).game.won).toBe(false);
  });
});

describe("spawn", () => {
  test("places a tile on an empty cell only", () => {
    const game = game_of([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 0, 4],
      [4, 2, 4, 2],
    ]);
    const result = spawn(game, sequence(0.99, 0.5));
    expect(result.game.tiles.at(-1)).toEqual({ id: game.next_id, value: 2, row: 2, col: 2 });
    expect(result.game.next_id).toBe(game.next_id + 1);
  });

  test("picks the cell and the value from the rng", () => {
    const empty = game_of([]);
    expect(spawn(empty, sequence(0, 0.5)).game.tiles[0]).toMatchObject({ row: 0, col: 0, value: 2 });
    expect(spawn(empty, sequence(0.999, 0.05)).game.tiles[0]).toMatchObject({ row: 3, col: 3, value: 4 });
  });

  test("leaves a full board alone", () => {
    const full = game_of([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]);
    expect(spawn(full, Math.random)).toEqual({ game: full, id: null });
  });

  test("new_game starts with two tiles", () => {
    const game = new_game(Math.random);
    expect(game.tiles).toHaveLength(2);
    expect(empty_cells(game.tiles)).toHaveLength(SIZE * SIZE - 2);
  });
});

describe("play", () => {
  test("spawns after a move", () => {
    const result = play(game_of([[0, 0, 0, 2]]), Direction.LEFT, sequence(0.999, 0.5));
    expect(result.game.tiles).toHaveLength(2);
    expect(result.spawned_id).not.toBeNull();
  });

  test("doesn't spawn when nothing moved", () => {
    const game = game_of([[2, 0, 0, 0]]);
    const result = play(game, Direction.LEFT, Math.random);
    expect(result.game).toBe(game);
    expect(result.spawned_id).toBeNull();
  });
});

describe("can_move", () => {
  test("is true with an empty cell", () => {
    expect(can_move(game_of([[2, 4, 2, 0]]))).toBe(true);
  });

  test("is true on a full board with an equal neighbour", () => {
    const horizontal = game_of([
      [2, 2, 8, 16],
      [4, 8, 16, 32],
      [8, 16, 32, 64],
      [16, 32, 64, 128],
    ]);
    const vertical = game_of([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 4],
    ]);
    expect(can_move(horizontal)).toBe(true);
    expect(can_move(vertical)).toBe(true);
  });

  test("is false on a full board with no equal neighbours", () => {
    expect(
      can_move(
        game_of([
          [2, 4, 2, 4],
          [4, 2, 4, 2],
          [2, 4, 2, 4],
          [4, 2, 4, 2],
        ])
      )
    ).toBe(false);
  });
});

describe("shows_win", () => {
  test("shows once won, until the player keeps going", () => {
    expect(shows_win(game_of([], { won: true }))).toBe(true);
    expect(shows_win(game_of([], { won: true, keep_going: true }))).toBe(false);
    expect(shows_win(game_of([]))).toBe(false);
  });
});

describe("input", () => {
  test("swipe_direction picks the dominant axis past the threshold", () => {
    expect(swipe_direction(40, 10, 24)).toBe(Direction.RIGHT);
    expect(swipe_direction(-40, 10, 24)).toBe(Direction.LEFT);
    expect(swipe_direction(5, 30, 24)).toBe(Direction.DOWN);
    expect(swipe_direction(5, -30, 24)).toBe(Direction.UP);
    expect(swipe_direction(10, 10, 24)).toBeNull();
  });

  test("key_direction maps arrows and WASD", () => {
    expect(key_direction("ArrowUp")).toBe(Direction.UP);
    expect(key_direction("KeyA")).toBe(Direction.LEFT);
    expect(key_direction("KeyS")).toBe(Direction.DOWN);
    expect(key_direction("KeyQ")).toBeNull();
  });
});

describe("game_schema", () => {
  test("accepts a real game", () => {
    expect(game_schema.safeParse(new_game(Math.random)).success).toBe(true);
  });

  test("rejects overlapping tiles and non-powers of two", () => {
    const overlap = { ...game_of([[2]]), tiles: [{ id: 0, value: 2, row: 0, col: 0 }, { id: 1, value: 4, row: 0, col: 0 }] };
    expect(game_schema.safeParse(overlap).success).toBe(false);
    expect(game_schema.safeParse(game_of([[6]])).success).toBe(false);
  });
});
