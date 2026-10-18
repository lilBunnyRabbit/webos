import { z } from "zod";
import { Direction } from "$kit/games/direction";

export const SIZE = 4;
export const WIN_VALUE = 2048;
const FOUR_CHANCE = 0.1;

export { Direction };

export type Rng = () => number;

export interface Tile {
  id: number;
  value: number;
  row: number;
  col: number;
}

export interface Game {
  tiles: Tile[];
  score: number;
  next_id: number;
  won: boolean;
  keep_going: boolean;
}

export interface MoveResult {
  game: Game;
  moved: boolean;
  /** Tiles that merged away, placed where they merged, so they can slide there before the new tile covers them. */
  consumed: Tile[];
  merged_ids: number[];
}

export interface PlayResult extends MoveResult {
  spawned_id: number | null;
}

const tile_schema = z.object({
  id: z.number().int().nonnegative(),
  value: z
    .number()
    .int()
    .min(2)
    .refine((value) => (value & (value - 1)) === 0, "not a power of two"),
  row: z
    .number()
    .int()
    .min(0)
    .max(SIZE - 1),
  col: z
    .number()
    .int()
    .min(0)
    .max(SIZE - 1),
});

export const game_schema = z
  .object({
    tiles: z.array(tile_schema).max(SIZE * SIZE),
    score: z.number().int().nonnegative(),
    next_id: z.number().int().nonnegative(),
    won: z.boolean(),
    keep_going: z.boolean(),
  })
  .refine((game) => new Set(game.tiles.map((tile) => tile.row * SIZE + tile.col)).size === game.tiles.length, {
    message: "two tiles share a cell",
  })
  .refine((game) => game.tiles.every((tile) => tile.id < game.next_id), { message: "tile id from the future" });

export const saved_schema = z.object({ game: game_schema, previous: game_schema.nullable() });
export type Saved = z.infer<typeof saved_schema>;

export function empty_game(): Game {
  return { tiles: [], score: 0, next_id: 0, won: false, keep_going: false };
}

export function new_game(rng: Rng): Game {
  return spawn(spawn(empty_game(), rng).game, rng).game;
}

export function empty_cells(tiles: readonly Tile[]): [number, number][] {
  const taken = new Set(tiles.map((tile) => tile.row * SIZE + tile.col));
  const cells: [number, number][] = [];
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (!taken.has(row * SIZE + col)) cells.push([row, col]);
    }
  }
  return cells;
}

export function spawn(game: Game, rng: Rng): { game: Game; id: number | null } {
  const cells = empty_cells(game.tiles);
  if (cells.length === 0) return { game, id: null };
  const [row, col] = cells[Math.min(cells.length - 1, Math.floor(rng() * cells.length))];
  const value = rng() < FOUR_CHANCE ? 4 : 2;
  const id = game.next_id;
  return { game: { ...game, tiles: [...game.tiles, { id, value, row, col }], next_id: id + 1 }, id };
}

function line_cell(direction: Direction, line: number, index: number): [number, number] {
  switch (direction) {
    case Direction.LEFT:
      return [line, index];
    case Direction.RIGHT:
      return [line, SIZE - 1 - index];
    case Direction.UP:
      return [index, line];
    case Direction.DOWN:
      return [SIZE - 1 - index, line];
  }
}

export function move(game: Game, direction: Direction): MoveResult {
  const grid = new Map(game.tiles.map((tile) => [tile.row * SIZE + tile.col, tile]));
  let next_id = game.next_id;
  let gained = 0;
  let moved = false;
  const tiles: Tile[] = [];
  const consumed: Tile[] = [];
  const merged_ids: number[] = [];

  for (let line = 0; line < SIZE; line++) {
    const line_tiles: Tile[] = [];
    for (let index = 0; index < SIZE; index++) {
      const [row, col] = line_cell(direction, line, index);
      const tile = grid.get(row * SIZE + col);
      if (tile) line_tiles.push(tile);
    }

    let target = 0;
    for (let i = 0; i < line_tiles.length; i++) {
      const tile = line_tiles[i];
      const next = line_tiles[i + 1];
      const [row, col] = line_cell(direction, line, target++);
      if (next && next.value === tile.value) {
        const merged: Tile = { id: next_id++, value: tile.value * 2, row, col };
        consumed.push({ ...tile, row, col }, { ...next, row, col });
        tiles.push(merged);
        merged_ids.push(merged.id);
        gained += merged.value;
        moved = true;
        i++;
      } else {
        if (tile.row !== row || tile.col !== col) moved = true;
        tiles.push({ ...tile, row, col });
      }
    }
  }

  if (!moved) return { game, moved, consumed: [], merged_ids: [] };
  return {
    game: {
      ...game,
      tiles,
      next_id,
      score: game.score + gained,
      won: game.won || tiles.some((tile) => tile.value >= WIN_VALUE),
    },
    moved,
    consumed,
    merged_ids,
  };
}

export function play(game: Game, direction: Direction, rng: Rng): PlayResult {
  const result = move(game, direction);
  if (!result.moved) return { ...result, spawned_id: null };
  const spawned = spawn(result.game, rng);
  return { ...result, game: spawned.game, spawned_id: spawned.id };
}

export function can_move(game: Game): boolean {
  if (game.tiles.length < SIZE * SIZE) return true;
  const values = new Map(game.tiles.map((tile) => [tile.row * SIZE + tile.col, tile.value]));
  for (const tile of game.tiles) {
    if (tile.col < SIZE - 1 && values.get(tile.row * SIZE + tile.col + 1) === tile.value) return true;
    if (tile.row < SIZE - 1 && values.get((tile.row + 1) * SIZE + tile.col) === tile.value) return true;
  }
  return false;
}

export function shows_win(game: Game): boolean {
  return game.won && !game.keep_going;
}
