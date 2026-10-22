import { create_rng, shuffle, type Rng } from "$lib/core/utils/random";

export const Shape = { SQUARE: "square", TALL: "tall", WIDE: "wide", ANY: "any" } as const;
export type Shape = (typeof Shape)[keyof typeof Shape];

export interface Rect {
  row: number;
  col: number;
  width: number;
  height: number;
}

export interface Clue {
  cell: number;
  /** Cells the plot covers; null when the clue gives only its shape. */
  area: number | null;
  shape: Shape;
}

export interface Puzzle {
  size: number;
  seed: number;
  clues: Clue[];
  solution: Rect[];
}

export function shape_of(rect: Pick<Rect, "width" | "height">): Shape {
  if (rect.width === rect.height) return Shape.SQUARE;
  return rect.height > rect.width ? Shape.TALL : Shape.WIDE;
}

export function area_of(rect: Rect): number {
  return rect.width * rect.height;
}

export function rect_cells(rect: Rect, size: number): number[] {
  const cells: number[] = [];
  for (let r = rect.row; r < rect.row + rect.height; r++)
    for (let c = rect.col; c < rect.col + rect.width; c++) cells.push(r * size + c);
  return cells;
}

export function contains(rect: Rect, size: number, cell: number): boolean {
  const row = Math.floor(cell / size);
  const col = cell % size;
  return row >= rect.row && row < rect.row + rect.height && col >= rect.col && col < rect.col + rect.width;
}

export function same_rect(a: Rect, b: Rect): boolean {
  return a.row === b.row && a.col === b.col && a.width === b.width && a.height === b.height;
}

export function span(size: number, from: number, to: number): Rect {
  const [r0, c0, r1, c1] = [Math.floor(from / size), from % size, Math.floor(to / size), to % size];
  return {
    row: Math.min(r0, r1),
    col: Math.min(c0, c1),
    width: Math.abs(c1 - c0) + 1,
    height: Math.abs(r1 - r0) + 1,
  };
}

export function fits(clue: Clue, rect: Pick<Rect, "width" | "height">): boolean {
  if (clue.area !== null && rect.width * rect.height !== clue.area) return false;
  return clue.shape === Shape.ANY || shape_of(rect) === clue.shape;
}

export interface Candidate {
  clue: number;
  rect: Rect;
  cells: number[];
}

export function candidates(size: number, clues: readonly Clue[]): Candidate[] {
  const owner = new Int16Array(size * size).fill(-1);
  clues.forEach((clue, index) => (owner[clue.cell] = index));
  const result: Candidate[] = [];
  clues.forEach((clue, index) => {
    const row = Math.floor(clue.cell / size);
    const col = clue.cell % size;
    for (let height = 1; height <= size; height++)
      for (let width = 1; width <= size; width++) {
        if (!fits(clue, { width, height })) continue;
        for (let top = Math.max(0, row - height + 1); top <= Math.min(row, size - height); top++)
          for (let left = Math.max(0, col - width + 1); left <= Math.min(col, size - width); left++) {
            const rect = { row: top, col: left, width, height };
            const cells = rect_cells(rect, size);
            if (cells.every((cell) => owner[cell] === -1 || owner[cell] === index)) result.push({ clue: index, rect, cells });
          }
      }
  });
  return result;
}

/**
 * Exact cover over cells: always branch on the open cell with the fewest live rectangles left (DLX's column rule),
 * kept as counts that cover/uncover update, so a dead cell is seen at once. A rectangle covers its clue's cell, so
 * covering every cell once also gives every clue exactly one plot. Stops at `limit` answers.
 */
export function solve(size: number, clues: readonly Clue[], limit = 2): Rect[][] {
  const total = size * size;
  const list = candidates(size, clues);
  const by_cell: number[][] = Array.from({ length: total }, () => []);
  list.forEach((candidate, index) => candidate.cells.forEach((cell) => by_cell[cell].push(index)));

  const covered = new Uint8Array(total);
  const blocked = new Uint16Array(list.length);
  const live = Int32Array.from(by_cell, (cands) => cands.length);
  const chosen: number[] = [];
  const answers: Rect[][] = [];

  function cover(index: number) {
    for (const cell of list[index].cells) {
      covered[cell] = 1;
      for (const other of by_cell[cell]) if (blocked[other]++ === 0) for (const touched of list[other].cells) live[touched]--;
    }
  }

  function uncover(index: number) {
    for (const cell of list[index].cells) {
      covered[cell] = 0;
      for (const other of by_cell[cell]) if (--blocked[other] === 0) for (const touched of list[other].cells) live[touched]++;
    }
  }

  function search(): boolean {
    let best = -1;
    for (let cell = 0; cell < total; cell++) {
      if (covered[cell]) continue;
      if (best === -1 || live[cell] < live[best]) best = cell;
      if (live[best] === 0) return false;
    }
    if (best === -1) {
      answers.push(chosen.map((index) => list[index]).sort((a, b) => a.clue - b.clue).map((candidate) => candidate.rect));
      return answers.length >= limit;
    }
    for (const index of by_cell[best]) {
      if (blocked[index]) continue;
      cover(index);
      chosen.push(index);
      const done = search();
      chosen.pop();
      uncover(index);
      if (done) return true;
    }
    return false;
  }

  search();
  return answers;
}

export function count_solutions(size: number, clues: readonly Clue[], limit = 2): number {
  return solve(size, clues, limit).length;
}

export function max_area(size: number): number {
  return Math.round(size * 1.5);
}

/**
 * Greedy fill in reading order: the first open cell is the top-left corner of the next plot. The target area is drawn
 * first, uniform over 2…max, so small and large plots come up alike; long one-cell strips are rarer than blocks.
 * A cell boxed in so only 1×1 fits fails the layout and the caller draws again.
 */
export function partition(size: number, rng: Rng): Rect[] | null {
  const taken = new Uint8Array(size * size);
  const rects: Rect[] = [];
  const largest = max_area(size);
  for (let start = 0; start < size * size; start++) {
    if (taken[start]) continue;
    const row = Math.floor(start / size);
    const col = start % size;
    const options: { width: number; height: number; weight: number }[] = [];
    let reach = size - col;
    for (let height = 1; row + height <= size; height++) {
      let width = 0;
      while (width < reach && !taken[(row + height - 1) * size + col + width]) width++;
      reach = width;
      if (!reach) break;
      for (let w = 1; w <= reach; w++) {
        const area = w * height;
        if (area < 2 || area > largest) continue;
        const strip = (w === 1 || height === 1) && area > 3;
        options.push({ width: w, height, weight: strip ? 0.35 : 1 });
      }
    }
    if (!options.length) return null;
    const target = 2 + Math.floor(rng() * (largest - 1));
    const distance = (option: { width: number; height: number }) => Math.abs(option.width * option.height - target);
    const nearest = Math.min(...options.map(distance));
    const pool = options.filter((option) => distance(option) <= nearest + 1);
    let roll = rng() * pool.reduce((sum, option) => sum + option.weight, 0);
    const picked = pool.find((option) => (roll -= option.weight) < 0) ?? pool[pool.length - 1];
    const rect = { row, col, width: picked.width, height: picked.height };
    for (const cell of rect_cells(rect, size)) taken[cell] = 1;
    rects.push(rect);
  }
  return rects;
}

export const Rule = { ONLY_FIT: "only-fit", ONLY_ROOM: "only-room" } as const;
export type Rule = (typeof Rule)[keyof typeof Rule];

export interface Step {
  rule: Rule;
  clue: number;
  rect: Rect;
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.row < b.row + b.height && b.row < a.row + a.height && a.col < b.col + b.width && b.col < a.col + a.width;
}

function free_candidates(size: number, clues: readonly Clue[], placed: readonly (Rect | null)[]): Candidate[][] {
  const covered = new Uint8Array(size * size);
  for (const rect of placed) if (rect) for (const cell of rect_cells(rect, size)) covered[cell] = 1;
  const per: Candidate[][] = clues.map(() => []);
  for (const candidate of candidates(size, clues))
    if (!placed[candidate.clue] && candidate.cells.every((cell) => !covered[cell])) per[candidate.clue].push(candidate);
  return per;
}

/**
 * Per clue, the plots still possible next to the ones already placed (`placed[i]` for clue i, or null). Two
 * eliminations run to a fixpoint: a plot that overlaps every option of another clue is out (that clue would have no
 * room), and a cell only one clue can still reach belongs to it, so that clue's plots missing the cell are out.
 */
export function plot_options(size: number, clues: readonly Clue[], placed: readonly (Rect | null)[]): Candidate[][] {
  const per = free_candidates(size, clues, placed);
  const covered = new Uint8Array(size * size);
  for (const rect of placed) if (rect) for (const cell of rect_cells(rect, size)) covered[cell] = 1;
  const open = clues.map((_, index) => index).filter((index) => !placed[index]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const a of open) {
      const kept = per[a].filter((candidate) =>
        open.every((b) => b === a || per[b].some((other) => !overlaps(other.rect, candidate.rect)))
      );
      if (kept.length < per[a].length) [per[a], changed] = [kept, true];
    }
    const reach: number[][] = Array.from({ length: size * size }, () => []);
    for (const index of open)
      for (const candidate of per[index])
        for (const cell of candidate.cells) if (reach[cell].at(-1) !== index) reach[cell].push(index);
    reach.forEach((owners, cell) => {
      if (covered[cell] || owners.length !== 1) return;
      const kept = per[owners[0]].filter((candidate) => candidate.cells.includes(cell));
      if (kept.length < per[owners[0]].length) [per[owners[0]], changed] = [kept, true];
    });
  }
  return per;
}

/**
 * The next plot logic proves from the placed ones, simplest first: a clue with one plot left that fits at all, then
 * one that is down to one once the other clues keep their room. Assumes the placed plots are right.
 */
export function next_step(size: number, clues: readonly Clue[], placed: readonly (Rect | null)[]): Step | null {
  const free = free_candidates(size, clues, placed);
  const per = plot_options(size, clues, placed);
  const open = clues.map((_, index) => index).filter((index) => !placed[index] && per[index].length === 1);
  const simple = open.find((index) => free[index].length === 1);
  const clue = simple ?? open[0];
  if (clue === undefined) return null;
  return { rule: simple !== undefined ? Rule.ONLY_FIT : Rule.ONLY_ROOM, clue, rect: per[clue][0].rect };
}

/** Whether `next_step` alone places every plot from an empty board and covers it; that also proves one answer. */
export function solves_by_logic(size: number, clues: readonly Clue[]): boolean {
  const placed: (Rect | null)[] = clues.map(() => null);
  for (let step = next_step(size, clues, placed); step; step = next_step(size, clues, placed)) placed[step.clue] = step.rect;
  return placed.every(Boolean) && placed.reduce((sum, rect) => sum + area_of(rect!), 0) === size * size;
}

const THIN_AREA = 0.35;
const THIN_SHAPE = 0.6;

function thinned(clue: Clue, drop: "area" | "shape"): Clue | null {
  if (drop === "area") return clue.area !== null && clue.shape !== Shape.ANY ? { ...clue, area: null } : null;
  return clue.shape !== Shape.ANY && clue.area !== null ? { ...clue, shape: Shape.ANY } : null;
}

/**
 * Plots first: a random partition, one clue cell in each with its area and shape. Then clues are thinned in random
 * order, a step kept only while the deduction rules still place every plot from an empty board, so every puzzle has
 * one answer and Hint always has a next step. Numbers drop on at most about a third of the clues and shapes on a bit
 * over half, so a puzzle stays mostly numbers. Clues are listed in reading order of their cells.
 */
export function generate(size: number, seed: number): Puzzle {
  const rng = create_rng(seed);
  for (;;) {
    const rects = partition(size, rng);
    if (!rects) continue;
    const pairs = rects
      .map((rect) => {
        const cells = rect_cells(rect, size);
        const cell = cells[Math.floor(rng() * cells.length)];
        const clue: Clue = { cell, area: area_of(rect), shape: shape_of(rect) };
        return { rect, clue };
      })
      .sort((a, b) => a.clue.cell - b.clue.cell);
    const clues = pairs.map((pair) => pair.clue);
    const solution = pairs.map((pair) => pair.rect);
    if (!solves_by_logic(size, clues)) continue;

    const cap = { area: Math.floor(clues.length * THIN_AREA), shape: Math.floor(clues.length * THIN_SHAPE) };
    const steps = shuffle(
      clues.flatMap((_, index) => [
        { index, drop: "area" as const },
        { index, drop: "shape" as const },
      ]),
      rng
    );
    for (const step of steps) {
      if (!cap[step.drop]) continue;
      const next = thinned(clues[step.index], step.drop);
      if (!next) continue;
      const before = clues[step.index];
      clues[step.index] = next;
      if (solves_by_logic(size, clues)) cap[step.drop]--;
      else clues[step.index] = before;
    }
    return { size, seed, clues, solution };
  }
}

