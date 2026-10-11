import { z } from "zod";

export const Mark = { X: "x", O: "o" } as const;
export type Mark = (typeof Mark)[keyof typeof Mark];

export type Cell = Mark | null;
export type Board = readonly Cell[];

export const Mode = { EASY: "easy", MEDIUM: "medium", IMPOSSIBLE: "impossible", LOCAL: "local" } as const;
export type Mode = (typeof Mode)[keyof typeof Mode];

export const MODES: readonly Mode[] = Object.values(Mode);

export type Difficulty = Exclude<Mode, "local">;

export interface GameResult {
  winner: Mark | null;
  line: readonly number[];
}

/** Per-mode tally keyed by mark. Against the computer the player is always X. */
export interface Tally {
  x: number;
  o: number;
  draws: number;
}

export type Stats = Record<Mode, Tally>;

const tally_schema = z.object({
  x: z.number().int().nonnegative(),
  o: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
});

export const stats_schema = z.object({
  easy: tally_schema,
  medium: tally_schema,
  impossible: tally_schema,
  local: tally_schema,
});

export const mode_schema = z.enum(Mode);

export const SIZE = 3;
export const CELLS = SIZE * SIZE;

export const WIN_LINES: readonly (readonly number[])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function empty_stats(): Stats {
  return {
    easy: { x: 0, o: 0, draws: 0 },
    medium: { x: 0, o: 0, draws: 0 },
    impossible: { x: 0, o: 0, draws: 0 },
    local: { x: 0, o: 0, draws: 0 },
  };
}

/** Replays a move list (cell indices, X first) into a board. */
export function board_from(moves: readonly number[]): Board {
  const board: Cell[] = Array(CELLS).fill(null);
  moves.forEach((cell, i) => (board[cell] = i % 2 === 0 ? Mark.X : Mark.O));
  return board;
}

export function turn_of(moves: readonly number[]): Mark {
  return moves.length % 2 === 0 ? Mark.X : Mark.O;
}

export function other(mark: Mark): Mark {
  return mark === Mark.X ? Mark.O : Mark.X;
}

export function free_cells(board: Board): number[] {
  return board.flatMap((cell, i) => (cell === null ? [i] : []));
}

/** The finished game's outcome, or null while it's still being played. */
export function result_of(board: Board): GameResult | null {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    const mark = board[a];
    if (mark && mark === board[b] && mark === board[c]) return { winner: mark, line };
  }
  return board.every((cell) => cell !== null) ? { winner: null, line: [] } : null;
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

/** A free cell that completes a line for `mark`, if there is one. */
function winning_cell(board: Board, mark: Mark): number | null {
  for (const cell of free_cells(board)) {
    const next = board.slice();
    next[cell] = mark;
    if (result_of(next)?.winner === mark) return cell;
  }
  return null;
}

function easy_move(board: Board, random: () => number): number {
  return pick(free_cells(board), random);
}

function medium_move(board: Board, mark: Mark, random: () => number): number {
  const win = winning_cell(board, mark);
  if (win !== null) return win;

  // Misses a block now and then so the mode stays beatable.
  const block = winning_cell(board, other(mark));
  if (block !== null && random() < 0.8) return block;

  const free = free_cells(board);
  if (random() < 0.6) {
    if (board[4] === null) return 4;
    const corners = [0, 2, 6, 8].filter((cell) => board[cell] === null);
    if (corners.length) return pick(corners, random);
  }
  return pick(free, random);
}

function minimax(board: Cell[], to_move: Mark, me: Mark, depth: number): number {
  const result = result_of(board);
  if (result) {
    if (result.winner === null) return 0;
    return result.winner === me ? 10 - depth : depth - 10;
  }

  let best = to_move === me ? -Infinity : Infinity;
  for (const cell of free_cells(board)) {
    board[cell] = to_move;
    const score = minimax(board, other(to_move), me, depth + 1);
    board[cell] = null;
    best = to_move === me ? Math.max(best, score) : Math.min(best, score);
  }
  return best;
}

function impossible_move(board: Board, mark: Mark, random: () => number): number {
  const scratch = board.slice();
  let best_score = -Infinity;
  let best: number[] = [];
  for (const cell of free_cells(board)) {
    scratch[cell] = mark;
    const score = minimax(scratch, other(mark), mark, 1);
    scratch[cell] = null;
    if (score > best_score) {
      best_score = score;
      best = [cell];
    } else if (score === best_score) {
      best.push(cell);
    }
  }
  return pick(best, random);
}

/** The computer's move for `mark`. The board must have a free cell. */
export function choose_move(
  board: Board,
  mark: Mark,
  difficulty: Difficulty,
  random: () => number = Math.random
): number {
  switch (difficulty) {
    case Mode.EASY:
      return easy_move(board, random);
    case Mode.MEDIUM:
      return medium_move(board, mark, random);
    case Mode.IMPOSSIBLE:
      return impossible_move(board, mark, random);
  }
}

/** Moves to take back so it's the player's turn again; vs the computer that includes its reply. */
export function undo_count(moves: readonly number[], vs_computer: boolean): number {
  if (!vs_computer) return Math.min(moves.length, 1);
  if (moves.length === 0) return 0;
  return turn_of(moves) === Mark.O ? 1 : Math.min(moves.length, 2);
}

/** The cell an arrow key moves focus to, clamped at the edges. */
export function step(cell: number, key: string): number {
  const row = Math.floor(cell / SIZE);
  const col = cell % SIZE;
  switch (key) {
    case "ArrowUp":
      return Math.max(row - 1, 0) * SIZE + col;
    case "ArrowDown":
      return Math.min(row + 1, SIZE - 1) * SIZE + col;
    case "ArrowLeft":
      return row * SIZE + Math.max(col - 1, 0);
    case "ArrowRight":
      return row * SIZE + Math.min(col + 1, SIZE - 1);
    default:
      return cell;
  }
}
