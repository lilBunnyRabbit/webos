import { daily_seed } from "$kit/games/time";
import { z } from "zod";
import {
  blocked_by,
  Cell,
  create_board,
  generate,
  next_deduction,
  Rule,
  settle,
  UnitKind,
  type Board,
  type Deduction,
  type Puzzle,
  type Unit,
} from "./puzzle";

export const Size = { S7: "7", S8: "8", S9: "9", S10: "10" } as const;
export type Size = (typeof Size)[keyof typeof Size];
export const SIZES: readonly Size[] = Object.values(Size);
export const size_schema = z.enum(Size);

export const Mark = { EMPTY: 0, CROSS: 1, RABBIT: 2 } as const;
export type Mark = (typeof Mark)[keyof typeof Mark];

export interface Game {
  puzzle: Puzzle;
  board: Board;
  marks: readonly Mark[];
  hints: number;
  solved: boolean;
}

export function new_game(size: Size, seed: number): Game {
  const side = Number(size);
  const puzzle = generate(side, seed);
  return {
    puzzle,
    board: create_board(side, puzzle.regions),
    marks: new Array(side * side).fill(Mark.EMPTY),
    hints: 0,
    solved: false,
  };
}

export function rabbits_of(marks: readonly Mark[]): number[] {
  return marks.flatMap((mark, cell) => (mark === Mark.RABBIT ? [cell] : []));
}

/** Cells a placed rabbit rules out that hold no mark: the auto-crosses, drawn but never stored. */
export function auto_crosses(game: Pick<Game, "board" | "marks">): Set<number> {
  const crossed = new Set<number>();
  for (const rabbit of rabbits_of(game.marks))
    for (const cell of blocked_by(game.board, rabbit)) if (game.marks[cell] === Mark.EMPTY) crossed.add(cell);
  return crossed;
}

export interface Feedback {
  rabbits: Set<number>;
  /** Cells of a row, column or meadow that has no rabbit and no place left for one. */
  dead: Set<number>;
}

export function feedback(game: Pick<Game, "board" | "marks">, crossed: ReadonlySet<number> = new Set()): Feedback {
  const { board, marks } = game;
  const rabbits = new Set<number>();
  const dead = new Set<number>();
  for (const unit of board.units) {
    const placed = unit.cells.filter((cell) => marks[cell] === Mark.RABBIT);
    if (placed.length > 1) placed.forEach((cell) => rabbits.add(cell));
    if (!placed.length && unit.cells.every((cell) => marks[cell] === Mark.CROSS || crossed.has(cell)))
      unit.cells.forEach((cell) => dead.add(cell));
  }
  for (const rabbit of rabbits_of(marks))
    for (const cell of board.around[rabbit]) if (marks[cell] === Mark.RABBIT) rabbits.add(rabbit);
  return { rabbits, dead };
}

/** One rabbit per row and no rule broken is the answer: generated puzzles have only one. */
export function is_solved(game: Pick<Game, "board" | "marks">): boolean {
  return rabbits_of(game.marks).length === game.board.size && feedback(game).rabbits.size === 0;
}

export function with_marks(game: Game, marks: readonly Mark[]): Game {
  const next = { ...game, marks };
  return { ...next, solved: is_solved(next) };
}

export function cycle(mark: Mark): Mark {
  return ((mark + 1) % 3) as Mark;
}

/** The cells a drag crosses between two cells, so a fast finger that skips a cell still paints it. */
export function line_cells(size: number, from: number, to: number): number[] {
  const [r0, c0] = [Math.floor(from / size), from % size];
  const [r1, c1] = [Math.floor(to / size), to % size];
  const steps = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
  const cells: number[] = [];
  for (let step = 1; step <= steps; step++) {
    const r = Math.round(r0 + ((r1 - r0) * step) / steps);
    const c = Math.round(c0 + ((c1 - c0) * step) / steps);
    cells.push(r * size + c);
  }
  return cells;
}

/** A drag that starts on a cross erases crosses; any other drag lays crosses on blank cells. Rabbits stay. */
export function paint(base: readonly Mark[], cells: Iterable<number>, erase: boolean): Mark[] {
  const next = [...base];
  for (const cell of cells) {
    if (erase && base[cell] === Mark.CROSS) next[cell] = Mark.EMPTY;
    else if (!erase && base[cell] === Mark.EMPTY) next[cell] = Mark.CROSS;
  }
  return next;
}

export function is_answer(puzzle: Puzzle, cell: number): boolean {
  return puzzle.solution[Math.floor(cell / puzzle.size)] === cell % puzzle.size;
}

export function mistakes(game: Game): number[] {
  return game.marks.flatMap((mark, cell) => {
    const rabbit = is_answer(game.puzzle, cell);
    return (mark === Mark.RABBIT && !rabbit) || (mark === Mark.CROSS && rabbit) ? [cell] : [];
  });
}

export interface Hint {
  cells: number[];
  mark: Mark;
  /** The row, column or meadow the step is about, to outline. */
  focus: number[];
  reason: string;
  fix: boolean;
}

function unit_name(unit: Unit): string {
  if (unit.kind === UnitKind.ROW) return `row ${unit.index + 1}`;
  if (unit.kind === UnitKind.COL) return `column ${unit.index + 1}`;
  return "the outlined meadow";
}

function lines_name(units: Unit[]): string {
  if (units.length === 1) return unit_name(units[0]);
  if (units[0].kind === UnitKind.MEADOW) return `${units.length} meadows`;
  const numbers = units.map((unit) => unit.index + 1);
  const listed = `${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;
  return `${units[0].kind === UnitKind.ROW ? "rows" : "columns"} ${listed}`;
}

export function explain(deduction: Deduction): string {
  const { units, within } = deduction;
  const [unit] = units;
  if (deduction.rule === Rule.ONLY) {
    const name = unit_name(unit);
    return `${name[0].toUpperCase()}${name.slice(1)} has one place left for its rabbit.`;
  }
  if (deduction.rule === Rule.BLOCKS) return `A rabbit here would leave ${unit_name(unit)} nowhere to go.`;
  const subject = unit.kind === UnitKind.MEADOW && units.length > 1 ? "the outlined meadows" : lines_name(units);
  const meadows = within[0].kind === UnitKind.MEADOW;
  const area = meadows ? (within.length === 1 ? "one meadow" : `${within.length} meadows`) : lines_name(within);
  const rest = meadows ? (within.length === 1 ? "that meadow" : "those meadows") : area;
  return `Every place left for ${subject} is in ${area}, so the rest of ${rest} stays empty.`;
}

/**
 * A wrong mark first, since everything after it builds on it. Otherwise the next step the deduction rules prove from
 * the marks so far, with every cell that step decides, so a hint teaches a move instead of handing out a square.
 */
export function hint(game: Game): Hint | null {
  const { puzzle, board, marks } = game;
  const wrong = mistakes(game);
  if (wrong.length) {
    const cell = wrong[0];
    const rabbit = is_answer(puzzle, cell);
    return {
      cells: [cell],
      mark: rabbit ? Mark.RABBIT : Mark.CROSS,
      focus: [],
      reason: rabbit ? "A rabbit belongs here, not a cross." : "This rabbit can't stay: it's crossed out instead.",
      fix: true,
    };
  }

  const state = Int8Array.from(marks, (mark) =>
    mark === Mark.RABBIT ? Cell.RABBIT : mark === Mark.CROSS ? Cell.EMPTY : Cell.UNKNOWN
  );
  settle(board, state);
  const deduction = next_deduction(board, state);
  if (deduction)
    return {
      cells: deduction.cells,
      mark: deduction.mark === Cell.RABBIT ? Mark.RABBIT : Mark.CROSS,
      focus: deduction.units.flatMap((unit) => unit.cells),
      reason: explain(deduction),
      fix: false,
    };

  const missing = puzzle.solution.map((col, row) => row * puzzle.size + col).find((cell) => marks[cell] !== Mark.RABBIT);
  return missing === undefined
    ? null
    : { cells: [missing], mark: Mark.RABBIT, focus: [], reason: "Here's a rabbit to get you going.", fix: false };
}

export function apply_hint(marks: readonly Mark[], next: Hint): Mark[] {
  const result = [...marks];
  for (const cell of next.cells) result[cell] = next.mark;
  return result;
}

export interface SizeRecord {
  solved: number;
  /** Fastest solve without hints, in milliseconds. */
  best: number | null;
}
export type Stats = Record<Size, SizeRecord>;

const record_schema = z.object({ solved: z.number().int().nonnegative(), best: z.number().nonnegative().nullable() });
export const stats_schema = z.object({
  "7": record_schema,
  "8": record_schema,
  "9": record_schema,
  "10": record_schema,
});

export function empty_stats(): Stats {
  return {
    "7": { solved: 0, best: null },
    "8": { solved: 0, best: null },
    "9": { solved: 0, best: null },
    "10": { solved: 0, best: null },
  };
}

export function record(stats: Stats, size: Size, time: number, hints: number): Stats {
  const current = stats[size];
  const best = hints === 0 && (current.best === null || time < current.best) ? time : current.best;
  return { ...stats, [size]: { solved: current.solved + 1, best } };
}

/** The puzzle is its seed, so a save is only the player's marks on top of it. */
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

export const DAILY_SIZE = Size.S8;

export function daily_game(day: string): Game {
  return new_game(DAILY_SIZE, daily_seed(day, "hutches"));
}

/** A daily puzzle in progress, kept apart from the regular save. */
export const daily_saved_schema = z.object({ day: z.string(), game: saved_schema });
