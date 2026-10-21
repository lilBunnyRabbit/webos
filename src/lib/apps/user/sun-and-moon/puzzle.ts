import { across_cells, down_cells } from "$kit/games/grid";
import { create_rng, shuffle, type Rng } from "$lib/core/utils/random";

/** Doubles as a bit mask: a cell's candidates are SUN | MOON. */
export const Mark = { EMPTY: 0, SUN: 1, MOON: 2 } as const;
export type Mark = (typeof Mark)[keyof typeof Mark];

export const Edge = { NONE: 0, SAME: 1, DIFF: 2 } as const;
export type Edge = (typeof Edge)[keyof typeof Edge];

export interface Puzzle {
  seed: number;
  size: number;
  solution: readonly Mark[];
  givens: readonly Mark[];
  /** `across[r * (size - 1) + c]` joins (r, c) and (r, c + 1). */
  across: readonly Edge[];
  /** `down[r * size + c]` joins (r, c) and (r + 1, c). */
  down: readonly Edge[];
}

export type Clues = Pick<Puzzle, "size" | "givens" | "across" | "down">;

export const opposite = (mark: Mark): Mark => (mark === Mark.SUN ? Mark.MOON : mark === Mark.MOON ? Mark.SUN : Mark.EMPTY);

export const Axis = { ROW: "row", COL: "col" } as const;
export type Axis = (typeof Axis)[keyof typeof Axis];

export interface Line {
  axis: Axis;
  at: number;
  cells: number[];
  /** `edges[i]` sits between `cells[i]` and `cells[i + 1]`. */
  edges: Edge[];
}

export function lines_of(clues: Clues): Line[] {
  const { size, across, down } = clues;
  const lines: Line[] = [];
  for (let r = 0; r < size; r++) {
    lines.push({
      axis: Axis.ROW,
      at: r,
      cells: Array.from({ length: size }, (_, c) => r * size + c),
      edges: Array.from({ length: size - 1 }, (_, c) => across[r * (size - 1) + c]),
    });
  }
  for (let c = 0; c < size; c++) {
    lines.push({
      axis: Axis.COL,
      at: c,
      cells: Array.from({ length: size }, (_, r) => r * size + c),
      edges: Array.from({ length: size - 1 }, (_, r) => down[r * size + c]),
    });
  }
  return lines;
}

const patterns_by_size = new Map<number, Uint8Array[]>();

export function line_patterns(size: number): Uint8Array[] {
  const cached = patterns_by_size.get(size);
  if (cached) return cached;
  const found: Uint8Array[] = [];
  const line = new Uint8Array(size);
  const fill = (at: number, suns: number, moons: number) => {
    if (at === size) {
      found.push(line.slice());
      return;
    }
    for (const mark of [Mark.SUN, Mark.MOON]) {
      if ((mark === Mark.SUN ? suns : moons) === size / 2) continue;
      if (at >= 2 && line[at - 1] === mark && line[at - 2] === mark) continue;
      line[at] = mark;
      fill(at + 1, suns + (mark === Mark.SUN ? 1 : 0), moons + (mark === Mark.MOON ? 1 : 0));
    }
  };
  fill(0, 0, 0);
  patterns_by_size.set(size, found);
  return found;
}

function edge_holds(edge: Edge, a: number, b: number): boolean {
  return edge === Edge.NONE || (edge === Edge.SAME) === (a === b);
}

function line_union(line: Line, domains: ArrayLike<number>, patterns: Uint8Array[]): number[] | null {
  const union = new Array<number>(line.cells.length).fill(0);
  let any = false;
  outer: for (const pattern of patterns) {
    for (let i = 0; i < pattern.length; i++) if (!(domains[line.cells[i]] & pattern[i])) continue outer;
    for (let i = 0; i < line.edges.length; i++) if (!edge_holds(line.edges[i], pattern[i], pattern[i + 1])) continue outer;
    any = true;
    for (let i = 0; i < pattern.length; i++) union[i] |= pattern[i];
  }
  return any ? union : null;
}

export type Domains = Uint8Array;

const BOTH = Mark.SUN | Mark.MOON;

function domains_of(clues: Clues, entries?: readonly Mark[]): Domains {
  return Uint8Array.from(clues.givens, (given, index) => given || entries?.[index] || BOTH);
}

/**
 * Narrows every row and column to the ways it can still be finished, again until nothing changes; signs across a
 * line meet the cells on both of their lines, so the two directions feed each other. False on a contradiction.
 */
function propagate(lines: Line[], patterns: Uint8Array[], domains: Domains): boolean {
  for (let changed = true; changed; ) {
    changed = false;
    for (const line of lines) {
      const union = line_union(line, domains, patterns);
      if (!union) return false;
      line.cells.forEach((cell, i) => {
        if (domains[cell] !== union[i]) {
          domains[cell] = union[i];
          changed = true;
        }
      });
    }
  }
  return true;
}

export function deduce(clues: Clues): Domains | null {
  const domains = domains_of(clues);
  return propagate(lines_of(clues), line_patterns(clues.size), domains) ? domains : null;
}

const decided = (mask: number) => mask === Mark.SUN || mask === Mark.MOON;

export function logic_solves(clues: Clues): boolean {
  return deduce(clues)?.every(decided) ?? false;
}

export function count_solutions(clues: Clues, limit = 2): number {
  const lines = lines_of(clues);
  const patterns = line_patterns(clues.size);
  const search = (domains: Domains, wanted: number): number => {
    if (!propagate(lines, patterns, domains)) return 0;
    const open = domains.findIndex((mask) => !decided(mask));
    if (open < 0) return 1;
    let found = 0;
    for (const mark of [Mark.SUN, Mark.MOON]) {
      const next = domains.slice();
      next[open] = mark;
      found += search(next, wanted - found);
      if (found >= wanted) break;
    }
    return found;
  };
  return search(domains_of(clues), limit);
}

/** The five things a player notices, simplest first. A hint names the first one that places a mark. */
export const Rule = { SIGN: "sign", PAIR: "pair", GAP: "gap", COUNT: "count", LINE: "line" } as const;
export type Rule = (typeof Rule)[keyof typeof Rule];

export interface Step {
  index: number;
  mark: Mark;
  rule: Rule;
  line: Line;
  edge?: Edge;
}

function sign_steps(line: Line, values: readonly Mark[]): Step[] {
  const steps: Step[] = [];
  line.edges.forEach((edge, i) => {
    if (edge === Edge.NONE) return;
    const [a, b] = [line.cells[i], line.cells[i + 1]];
    const follow = (from: number, to: number) => {
      if (values[from] && !values[to]) {
        steps.push({ index: to, mark: edge === Edge.SAME ? values[from] : opposite(values[from]), rule: Rule.SIGN, line, edge });
      }
    };
    follow(a, b);
    follow(b, a);
  });
  return steps;
}

function pair_steps(line: Line, values: readonly Mark[]): Step[] {
  const steps: Step[] = [];
  const at = (i: number) => values[line.cells[i]];
  for (let i = 0; i + 1 < line.cells.length; i++) {
    if (!at(i) || at(i) !== at(i + 1)) continue;
    for (const end of [i - 1, i + 2]) {
      if (end >= 0 && end < line.cells.length && !at(end)) steps.push({ index: line.cells[end], mark: opposite(at(i)), rule: Rule.PAIR, line });
    }
  }
  return steps;
}

function gap_steps(line: Line, values: readonly Mark[]): Step[] {
  const steps: Step[] = [];
  const at = (i: number) => values[line.cells[i]];
  for (let i = 1; i + 1 < line.cells.length; i++) {
    if (!at(i) && at(i - 1) && at(i - 1) === at(i + 1)) steps.push({ index: line.cells[i], mark: opposite(at(i - 1)), rule: Rule.GAP, line });
  }
  return steps;
}

function count_steps(line: Line, values: readonly Mark[]): Step[] {
  const half = line.cells.length / 2;
  for (const mark of [Mark.SUN, Mark.MOON]) {
    if (line.cells.filter((cell) => values[cell] === mark).length !== half) continue;
    return line.cells.filter((cell) => !values[cell]).map((index) => ({ index, mark: opposite(mark), rule: Rule.COUNT, line }));
  }
  return [];
}

function line_steps(line: Line, values: readonly Mark[], patterns: Uint8Array[]): Step[] {
  const domains = values.map((value) => value || BOTH);
  const union = line_union(line, domains, patterns);
  if (!union) return [];
  return line.cells.flatMap((cell, i) => (!values[cell] && decided(union[i]) ? [{ index: cell, mark: union[i] as Mark, rule: Rule.LINE, line }] : []));
}

/**
 * The next mark a person can place from what's on the board, by the simplest rule that gives one, reading order
 * within a rule. Null when nothing is forced: the entries are wrong, or the board is full.
 */
export function next_step(clues: Clues, entries: readonly Mark[]): Step | null {
  const values = clues.givens.map((given, index) => given || entries[index]);
  const lines = lines_of(clues);
  const patterns = line_patterns(clues.size);
  const by_rule: ((line: Line) => Step[])[] = [
    (line) => sign_steps(line, values),
    (line) => pair_steps(line, values),
    (line) => gap_steps(line, values),
    (line) => count_steps(line, values),
    (line) => line_steps(line, values, patterns),
  ];
  for (const find of by_rule) {
    const steps = lines.flatMap(find);
    if (steps.length) return steps.reduce((first, step) => (step.index < first.index ? step : first));
  }
  return null;
}

export function full_grid(size: number, rng: Rng): Mark[] {
  const grid = new Array<Mark>(size * size).fill(Mark.EMPTY);
  const half = size / 2;
  const fits = (index: number, mark: Mark) => {
    const r = Math.floor(index / size);
    const c = index % size;
    let in_row = 0;
    let in_col = 0;
    for (let i = 0; i < c; i++) if (grid[r * size + i] === mark) in_row++;
    for (let i = 0; i < r; i++) if (grid[i * size + c] === mark) in_col++;
    if (in_row === half || in_col === half) return false;
    if (c >= 2 && grid[index - 1] === mark && grid[index - 2] === mark) return false;
    if (r >= 2 && grid[index - size] === mark && grid[index - 2 * size] === mark) return false;
    return true;
  };
  const fill = (index: number): boolean => {
    if (index === grid.length) return true;
    for (const mark of shuffle([Mark.SUN, Mark.MOON] as Mark[], rng)) {
      if (!fits(index, mark)) continue;
      grid[index] = mark;
      if (fill(index + 1)) return true;
    }
    grid[index] = Mark.EMPTY;
    return false;
  };
  fill(0);
  return grid;
}

/**
 * A full grid with about a third of its signs, then clues taken away, givens first in shuffled order down to one per
 * row, then signs, keeping a removal only while deduction alone still finishes the grid. Deduction never rules out a
 * mark that could be right, so a grid it finishes has exactly one solution. Without the floor, signs carry nearly
 * the whole puzzle (one or two givens); without givens first, a few puzzles end up with no signs at all.
 */
export function generate(size: number, seed: number): Puzzle {
  const rng = create_rng(seed);
  const solution = full_grid(size, rng);
  const edges = (cells: (index: number) => [number, number]) =>
    Array.from({ length: size * (size - 1) }, (_, index): Edge => {
      if (rng() >= SIGN_SHARE) return Edge.NONE;
      const [a, b] = cells(index);
      return solution[a] === solution[b] ? Edge.SAME : Edge.DIFF;
    });
  const clues = {
    size,
    givens: [...solution],
    across: edges((index) => across_cells(size, index)),
    down: edges((index) => down_cells(size, index)),
  };

  let givens = clues.givens.length;
  for (const index of shuffle([...clues.givens.keys()], rng)) {
    if (givens === size) break;
    const kept = clues.givens[index];
    clues.givens[index] = Mark.EMPTY;
    if (logic_solves(clues)) givens--;
    else clues.givens[index] = kept;
  }
  const signs = [
    ...clues.across.flatMap((edge, index) => (edge ? [["across", index] as const] : [])),
    ...clues.down.flatMap((edge, index) => (edge ? [["down", index] as const] : [])),
  ];
  for (const [axis, index] of shuffle(signs, rng)) {
    const kept = clues[axis][index];
    clues[axis][index] = Edge.NONE;
    if (!logic_solves(clues)) clues[axis][index] = kept;
  }
  return { seed, solution, ...clues };
}

const SIGN_SHARE = 0.35;
