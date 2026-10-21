import { daily_seed } from "$kit/games/time";
import { z } from "zod";
import { adjacent, cells_mask, MAX_LENGTH, MIN_LENGTH, Size, type Puzzle, type Trie } from "./puzzle";

export { Size };
export const SIZES: readonly Size[] = Object.values(Size);
export const size_schema = z.enum(Size);

export interface Game {
  puzzle: Puzzle;
  /** Tunnel indices in the order they were found, which also picks each one's colour. */
  found: readonly number[];
  revealed: readonly number[];
  hints: number;
  solved: boolean;
}

export function new_game(puzzle: Puzzle): Game {
  return { puzzle, found: [], revealed: puzzle.tunnels.map(() => 0), hints: 0, solved: false };
}

export function is_word(trie: Trie, text: string): boolean {
  let node: Trie | undefined = trie;
  for (const letter of text) if (!(node = node.next.get(letter))) return false;
  return node.end;
}

/**
 * The path after the pointer reaches `cell`: back onto the path cuts it there, a straight run of free cells (a fast
 * finger skips some) joins one at a time, and anything else leaves it be.
 */
export function extend(path: readonly number[], cell: number, cols: number, blocked: (cell: number) => boolean): number[] {
  if (blocked(cell)) return [...path];
  if (!path.length) return [cell];
  const at = path.indexOf(cell);
  if (at !== -1) return path.slice(0, at + 1);
  const next = [...path];
  let last = next[next.length - 1];
  const [row, col] = [Math.floor(cell / cols), cell % cols];
  const [last_row, last_col] = [Math.floor(last / cols), last % cols];
  if (row !== last_row && col !== last_col) return next;
  const step = row === last_row ? Math.sign(col - last_col) : Math.sign(row - last_row) * cols;
  while (last !== cell && next.length < MAX_LENGTH) {
    const ahead = last + step;
    if (!adjacent(cols, last, ahead) || blocked(ahead) || next.includes(ahead)) break;
    next.push((last = ahead));
  }
  return next;
}

export function found_cells(game: Game): Set<number> {
  return new Set(game.found.flatMap((index) => game.puzzle.tunnels[index].cells));
}

export type Verdict =
  | { kind: "found"; tunnel: number }
  | { kind: "short" }
  | { kind: "unknown" }
  | { kind: "elsewhere" };

/** A hidden word locks in when the path covers exactly its cells and spells a word; the order is the player's. */
export function judge(game: Game, path: readonly number[], trie: Trie): Verdict {
  if (path.length < MIN_LENGTH) return { kind: "short" };
  const text = path.map((cell) => game.puzzle.letters[cell]).join("");
  const mask = cells_mask(path);
  const tunnel = game.puzzle.tunnels.findIndex((each, index) => !game.found.includes(index) && cells_mask(each.cells) === mask);
  const word = is_word(trie, text);
  if (tunnel !== -1 && word) return { kind: "found", tunnel };
  return word ? { kind: "elsewhere" } : { kind: "unknown" };
}

export function with_found(game: Game, tunnel: number): Game {
  if (game.found.includes(tunnel)) return game;
  const found = [...game.found, tunnel];
  return { ...game, found, solved: found.length === game.puzzle.tunnels.length };
}

/** The next letter of the word hints already started, else the first letter of the first word still hidden. */
export function hint(game: Game): { game: Game; cell: number } | null {
  if (game.solved) return null;
  const open = game.puzzle.tunnels.map((_, index) => index).filter((index) => !game.found.includes(index));
  const target = open.reduce((best, index) => (game.revealed[index] > game.revealed[best] ? index : best), open[0]);
  const tunnel = game.puzzle.tunnels[target];
  const shown = Math.min(tunnel.cells.length, game.revealed[target] + 1);
  const revealed = game.revealed.map((count, index) => (index === target ? shown : count));
  const next = { ...game, revealed, hints: game.hints + 1 };
  return { game: shown === tunnel.cells.length ? with_found(next, target) : next, cell: tunnel.cells[shown - 1] };
}

/** Hinted letters stay shown: they were paid for. */
export function undo(game: Game): Game {
  if (!game.found.length || game.solved) return game;
  return { ...game, found: game.found.slice(0, -1) };
}

export function reset(game: Game): Game {
  return game.solved ? game : { ...game, found: [] };
}
export function hinted_cells(game: Game): Map<number, number> {
  const cells = new Map<number, number>();
  game.puzzle.tunnels.forEach((tunnel, index) => {
    if (game.found.includes(index)) return;
    for (let i = 0; i < game.revealed[index]; i++) cells.set(tunnel.cells[i], i + 1);
  });
  return cells;
}

export interface SizeRecord {
  solved: number;
  best: number | null;
}
export type Stats = Record<Size, SizeRecord>;

const record_schema = z.object({ solved: z.number().int().nonnegative(), best: z.number().nonnegative().nullable() });
export const stats_schema = z.object({ small: record_schema, medium: record_schema, large: record_schema });

export function empty_stats(): Stats {
  return { small: { solved: 0, best: null }, medium: { solved: 0, best: null }, large: { solved: 0, best: null } };
}

export function record(stats: Stats, size: Size, time: number, hints: number): Stats {
  const current = stats[size];
  const best = hints === 0 && (current.best === null || time < current.best) ? time : current.best;
  return { ...stats, [size]: { solved: current.solved + 1, best } };
}
export const saved_schema = z.object({
  size: size_schema,
  seed: z.number().int().nonnegative(),
  found: z.array(z.number().int().nonnegative()),
  revealed: z.array(z.number().int().nonnegative()),
  hints: z.number().int().nonnegative(),
  elapsed: z.number().nonnegative(),
});
export type Saved = z.infer<typeof saved_schema>;

export function to_saved(game: Game, elapsed: number): Saved {
  const { size, seed } = game.puzzle;
  return { size, seed, found: [...game.found], revealed: [...game.revealed], hints: game.hints, elapsed };
}

/** Null when the save no longer fits its puzzle (the word lists changed). */
export function restore(puzzle: Puzzle, saved: Saved): Game | null {
  const count = puzzle.tunnels.length;
  if (saved.revealed.length !== count || saved.found.some((index) => index >= count)) return null;
  if (saved.revealed.some((shown, index) => shown > puzzle.tunnels[index].cells.length)) return null;
  const game = { ...new_game(puzzle), revealed: saved.revealed, hints: saved.hints };
  return saved.found.reduce(with_found, game);
}

export const DAILY_SIZE = Size.MEDIUM;

export function daily_seed_of(day: string): number {
  return daily_seed(day, "tunnels");
}
export const daily_saved_schema = z.object({ day: z.string(), game: saved_schema });
