import { daily_seed } from "$lib/core/games/time";
import { z } from "zod";
import { Cell, create_board, generate, is_valid, propagate, type Board, type Puzzle } from "./puzzle";

export const Size = { S5: "5", S7: "7", S9: "9", S12: "12" } as const;
export type Size = (typeof Size)[keyof typeof Size];
export const SIZES: readonly Size[] = Object.values(Size);
export const size_schema = z.enum(Size);

export const Mark = { EMPTY: 0, SEA: 1, DOT: 2 } as const;
export type Mark = (typeof Mark)[keyof typeof Mark];

export const Tool = { SEA: "sea", DOT: "dot" } as const;
export type Tool = (typeof Tool)[keyof typeof Tool];

export interface Game {
  puzzle: Puzzle;
  board: Board;
  marks: readonly Mark[];
  hints: number;
  solved: boolean;
}

export function new_game(size: Size, seed: number): Game {
  const side = Number(size);
  const puzzle = generate(side, side, seed);
  const board = create_board(side, side, puzzle.clues);
  return { puzzle, board, marks: new Array(side * side).fill(Mark.EMPTY), hints: 0, solved: false };
}

/** Dots are only the player's notes: the shading alone decides, and with one answer valid shading is that answer. */
export function is_solved(game: Pick<Game, "board" | "marks">): boolean {
  return is_valid(
    game.board,
    game.marks.map((mark) => mark === Mark.SEA)
  );
}

export function with_marks(game: Game, marks: readonly Mark[]): Game {
  const next = { ...game, marks };
  return { ...next, solved: is_solved(next) };
}

export function cycle(mark: Mark, tool: Tool, backward: boolean): Mark {
  const order: Mark[] = tool === Tool.SEA ? [Mark.EMPTY, Mark.SEA, Mark.DOT] : [Mark.EMPTY, Mark.DOT, Mark.SEA];
  const step = backward ? 2 : 1;
  return order[(order.indexOf(mark) + step) % 3];
}

export interface Feedback {
  pools: boolean[];
  /** Cells of an island that breaks a rule: two numbers, too big, walled in too small, or no number at all. */
  errors: boolean[];
  complete: boolean[];
}

export function feedback(game: Pick<Game, "board" | "marks">): Feedback {
  const { board, marks } = game;
  const size = marks.length;
  const pools = new Array<boolean>(size).fill(false);
  const errors = new Array<boolean>(size).fill(false);
  const complete = new Array<boolean>(size).fill(false);
  for (const block of board.blocks) {
    if (block.every((index) => marks[index] === Mark.SEA)) block.forEach((index) => (pools[index] = true));
  }

  const land = (index: number) => board.clues[index] > 0 || marks[index] === Mark.DOT;
  const regions = (inside: (index: number) => boolean, visit: (cells: number[], clues: number[]) => void) => {
    const seen = new Uint8Array(size);
    for (let start = 0; start < size; start++) {
      if (seen[start] || !inside(start)) continue;
      seen[start] = 1;
      const queue = [start];
      const clues: number[] = [];
      for (let head = 0; head < queue.length; head++) {
        const index = queue[head];
        if (board.clues[index]) clues.push(board.clues[index]);
        for (const next of board.neighbors[index]) {
          if (!seen[next] && inside(next)) {
            seen[next] = 1;
            queue.push(next);
          }
        }
      }
      visit(queue, clues);
    }
  };

  regions(land, (cells, clues) => {
    if (clues.length > 1 || (clues.length === 1 && cells.length > clues[0]))
      cells.forEach((index) => (errors[index] = true));
  });
  // Everything not shaded is one region per pocket the sea has walled off, so a pocket's size is final.
  regions(
    (index) => marks[index] !== Mark.SEA,
    (cells, clues) => {
      if (clues.length === 1 && cells.length === clues[0]) cells.forEach((index) => (complete[index] = true));
      else if (clues.length === 1 && cells.length < clues[0])
        cells.forEach((index) => land(index) && (errors[index] = true));
      else if (!clues.length) cells.forEach((index) => marks[index] === Mark.DOT && (errors[index] = true));
    }
  );
  return { pools, errors, complete };
}

export function mistakes(game: Game): number[] {
  return game.marks.flatMap((mark, index) => {
    const sea = game.puzzle.solution[index];
    return (mark === Mark.SEA && !sea) || (mark === Mark.DOT && sea) ? [index] : [];
  });
}

export interface Hint {
  index: number;
  mark: Mark;
  fix: boolean;
}

/**
 * A wrong mark first, since everything after it builds on sand. Otherwise the first cell the solver's rules deduce
 * from the marks so far, so a hint teaches the next step instead of giving away a random square.
 */
export function hint(game: Game): Hint | null {
  const { puzzle, board, marks } = game;
  const answer = (index: number): Mark => (puzzle.solution[index] ? Mark.SEA : Mark.DOT);
  const wrong = mistakes(game);
  if (wrong.length) return { index: wrong[0], mark: answer(wrong[0]), fix: true };

  const open = (index: number) => marks[index] === Mark.EMPTY && !puzzle.clues[index];
  const cells = Int8Array.from(marks, (mark, index) =>
    puzzle.clues[index] || mark === Mark.DOT ? Cell.LAND : mark === Mark.SEA ? Cell.SEA : Cell.UNKNOWN
  );
  const log: number[] = [];
  propagate(board, cells, log);
  const deduced = log.find(open);
  if (deduced !== undefined) return { index: deduced, mark: answer(deduced), fix: false };
  const index = marks.findIndex((_, i) => open(i) && puzzle.solution[i]);
  return index >= 0 ? { index, mark: Mark.SEA, fix: false } : null;
}

/**
 * A stroke sets its first cell to `mark` whatever it held, then paints `mark` onto the blank cells it crosses, or,
 * when `mark` is blank, erases the mark the first cell had. Numbers are never touched.
 */
export function paint(
  base: readonly Mark[],
  clues: readonly number[],
  cells: readonly number[],
  mark: Mark,
  erased: Mark
): Mark[] {
  const next = [...base];
  cells.forEach((index, position) => {
    if (clues[index]) return;
    if (position === 0) next[index] = mark;
    else if (mark === Mark.EMPTY ? base[index] === erased : base[index] === Mark.EMPTY) next[index] = mark;
  });
  return next;
}

export interface SizeRecord {
  solved: number;
  /** Fastest solve without hints, in milliseconds. */
  best: number | null;
}
export type Stats = Record<Size, SizeRecord>;

const record_schema = z.object({ solved: z.number().int().nonnegative(), best: z.number().nonnegative().nullable() });
export const stats_schema = z.object({
  "5": record_schema,
  "7": record_schema,
  "9": record_schema,
  "12": record_schema,
});

export function empty_stats(): Stats {
  return {
    "5": { solved: 0, best: null },
    "7": { solved: 0, best: null },
    "9": { solved: 0, best: null },
    "12": { solved: 0, best: null },
  };
}

export function record(stats: Stats, size: Size, time: number, hints: number): Stats {
  const current = stats[size];
  const best = hints === 0 && (current.best === null || time < current.best) ? time : current.best;
  return { ...stats, [size]: { solved: current.solved + 1, best } };
}

/** The puzzle itself is its seed, so a save is only the player's marks on top of it. */
export const saved_schema = z.object({
  size: size_schema,
  seed: z.number().int().nonnegative(),
  marks: z.array(z.union([z.literal(0), z.literal(1), z.literal(2)])),
  hints: z.number().int().nonnegative(),
  elapsed: z.number().nonnegative(),
});
export type Saved = z.infer<typeof saved_schema>;

export function restore(saved: Saved): Game | null {
  const game = new_game(saved.size, saved.seed);
  if (saved.marks.length !== game.marks.length) return null;
  return { ...with_marks(game, saved.marks), hints: saved.hints };
}

export const DAILY_SIZE = Size.S7;

export function daily_game(day: string): Game {
  return new_game(DAILY_SIZE, daily_seed(day, "nurikabe"));
}

/** A daily puzzle in progress, kept apart from the regular save. */
export const daily_saved_schema = z.object({ day: z.string(), game: saved_schema });
