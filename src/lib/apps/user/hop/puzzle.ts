import { create_rng, random_int, shuffle, type Rng } from "$lib/core/utils/random";

export const Side = { UP: 1, RIGHT: 2, DOWN: 4, LEFT: 8 } as const;
export type Side = (typeof Side)[keyof typeof Side];

export interface Board {
  size: number;
  numbers: readonly number[];
  /** Both cells of a walled edge carry the bit. */
  walls: readonly number[];
}

export interface Puzzle extends Board {
  seed: number;
  solution: readonly number[];
}

const BACKBITES_PER_CELL = 24;
const WALL_SHARE = 0.5;
// Search nodes one uniqueness check may spend; past it the dot stays, so a puzzle is only ever proven unique.
const BUDGET = 5_000;

function side_between(size: number, from: number, to: number): Side {
  if (to === from - size) return Side.UP;
  if (to === from + size) return Side.DOWN;
  return to === from + 1 ? Side.RIGHT : Side.LEFT;
}

const OPPOSITE: Record<Side, Side> = { [Side.UP]: Side.DOWN, [Side.DOWN]: Side.UP, [Side.LEFT]: Side.RIGHT, [Side.RIGHT]: Side.LEFT };

export function grid_neighbours(size: number, cell: number): number[] {
  const row = Math.floor(cell / size);
  const col = cell % size;
  const out: number[] = [];
  if (row > 0) out.push(cell - size);
  if (col < size - 1) out.push(cell + 1);
  if (row < size - 1) out.push(cell + size);
  if (col > 0) out.push(cell - 1);
  return out;
}

export function walled(board: Board, from: number, to: number): boolean {
  return (board.walls[from] & side_between(board.size, from, to)) !== 0;
}

export function open_neighbours(board: Board): number[][] {
  return Array.from({ length: board.size * board.size }, (_, cell) =>
    grid_neighbours(board.size, cell).filter((to) => !walled(board, cell, to))
  );
}

export function dot_cells(board: Board): number[] {
  const cells: number[] = [];
  board.numbers.forEach((number, cell) => number && (cells[number - 1] = cell));
  return cells;
}

/**
 * Prunes a cell that can no longer be entered and left (a dead end that isn't the last dot) and unvisited cells that
 * split apart. Colouring needs checking only once: a path alternates colours, so the ends' colours are fixed by the size.
 */
export function solutions(board: Board, limit = 2, budget = Infinity): Search {
  const { size, numbers } = board;
  const total = size * size;
  const dots = dot_cells(board);
  const start = dots[0];
  const end = dots[dots.length - 1];
  const found: number[][] = [];
  const done = (): Search => ({ answers: found, complete: nodes <= budget });
  let nodes = 0;
  if (dots.length < 2 || Array.from(dots).some((cell) => cell === undefined)) return done();

  const colour = (cell: number) => (Math.floor(cell / size) + (cell % size)) & 1;
  if (total % 2 === 0 ? colour(start) === colour(end) : colour(start) !== 0 || colour(end) !== 0) return done();

  const adj = open_neighbours(board);
  const visited = new Uint8Array(total);
  const free = new Uint8Array(total);
  for (let cell = 0; cell < total; cell++) free[cell] = adj[cell].length;
  const path = new Int32Array(total);
  const queue = new Int32Array(total);
  const seen = new Uint32Array(total);
  let stamp = 0;

  const visit = (cell: number) => {
    visited[cell] = 1;
    for (const next of adj[cell]) free[next]--;
  };
  const leave = (cell: number) => {
    visited[cell] = 0;
    for (const next of adj[cell]) free[next]++;
  };

  const dead_end = (old_head: number, head: number) => {
    for (const cell of adj[old_head]) {
      if (visited[cell]) continue;
      const ways = free[cell] + (adj[cell].includes(head) ? 1 : 0);
      if (ways < (cell === end ? 1 : 2)) return true;
    }
    return false;
  };

  const connected = (head: number, left: number) => {
    stamp++;
    let tail = 0;
    queue[tail++] = head;
    seen[head] = stamp;
    for (let at = 0; at < tail; at++) {
      for (const next of adj[queue[at]]) {
        if (!visited[next] && seen[next] !== stamp) {
          seen[next] = stamp;
          queue[tail++] = next;
        }
      }
    }
    return tail - 1 === left;
  };

  const search = (head: number, depth: number, next_dot: number): boolean => {
    if (++nodes > budget) return true;
    if (depth === total) {
      if (head === end) found.push(Array.from(path));
      return found.length >= limit;
    }
    for (const to of adj[head]) {
      if (visited[to]) continue;
      const number = numbers[to];
      if (number && number !== next_dot) continue;
      if (to === end && depth + 1 !== total) continue;
      visit(to);
      path[depth] = to;
      const left = total - depth - 1;
      // A head with one way on can't cut the unvisited cells apart, so only a fork needs the flood.
      if (!dead_end(head, to) && (free[to] < 2 || connected(to, left))) {
        if (search(to, depth + 1, number ? next_dot + 1 : next_dot)) {
          leave(to);
          return true;
        }
      }
      leave(to);
    }
    return false;
  };

  visit(start);
  path[0] = start;
  search(start, 1, 2);
  return done();
}

/** Serpentine, then backbite moves: join an end to one of its grid neighbours and reverse the loop that makes. */
export interface Search {
  answers: number[][];
  /** False when the node budget ran out first, so `answers` may be missing some. */
  complete: boolean;
}

export function random_path(size: number, rng: Rng): number[] {
  const total = size * size;
  const path: number[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) path.push(row * size + (row % 2 ? size - 1 - col : col));
  }
  const at = new Int32Array(total);
  path.forEach((cell, index) => (at[cell] = index));
  const reverse = (from: number, to: number) => {
    for (; from < to; from++, to--) {
      [path[from], path[to]] = [path[to], path[from]];
      at[path[from]] = from;
      at[path[to]] = to;
    }
  };
  for (let move = 0; move < total * BACKBITES_PER_CELL; move++) {
    if (rng() < 0.5) {
      const tail = path[total - 1];
      const options = grid_neighbours(size, tail).filter((cell) => cell !== path[total - 2]);
      const index = at[options[Math.floor(rng() * options.length)]];
      reverse(index + 1, total - 1);
    } else {
      const head = path[0];
      const options = grid_neighbours(size, head).filter((cell) => cell !== path[1]);
      const index = at[options[Math.floor(rng() * options.length)]];
      reverse(0, index - 1);
    }
  }
  return path;
}

function place_walls(size: number, path: readonly number[], rng: Rng): number[] {
  const walls = new Array<number>(size * size).fill(0);
  if (rng() >= WALL_SHARE) return walls;
  const used = new Set<string>();
  for (let i = 1; i < path.length; i++) used.add(`${Math.min(path[i - 1], path[i])}-${Math.max(path[i - 1], path[i])}`);
  const free: [number, number][] = [];
  for (let cell = 0; cell < size * size; cell++) {
    for (const to of grid_neighbours(size, cell)) if (to > cell && !used.has(`${cell}-${to}`)) free.push([cell, to]);
  }
  shuffle(free, rng);
  for (const [a, b] of free.slice(0, random_int(size - 2, size + 2, rng))) {
    const side = side_between(size, a, b);
    walls[a] |= side;
    walls[b] |= OPPOSITE[side];
  }
  return walls;
}

function numbers_from(path: readonly number[], dotted: ReadonlySet<number>): number[] {
  const numbers = new Array<number>(path.length).fill(0);
  let next = 1;
  path.forEach((cell, index) => dotted.has(index) && (numbers[cell] = next++));
  return numbers;
}

/**
 * Another answer leaves the real one at step `i` for a cell the real answer reaches at step `m`. Dotting that cell
 * puts it out of order for the other answer, provided some dot sits between steps i and m of the real answer, so the
 * cell at step i gets one too when none does.
 */
function cut(path: readonly number[], other: readonly number[], dotted: Set<number>): void {
  const i = path.findIndex((cell, index) => other[index] !== cell);
  const m = path.indexOf(other[i]);
  dotted.add(m);
  let between = false;
  for (let index = i; index < m && !between; index++) between = dotted.has(index);
  if (!between) dotted.add(i);
}

function split_widest_gap(dotted: Set<number>): void {
  const sorted = [...dotted].sort((x, y) => x - y);
  let at = 0;
  for (let i = 1; i < sorted.length; i++) if (sorted[i] - sorted[i - 1] > sorted[at + 1] - sorted[at]) at = i - 1;
  dotted.add(Math.floor((sorted[at] + sorted[at + 1]) / 2));
}

export function generate(size: number, seed: number): Puzzle {
  const rng = create_rng(seed);
  const solution = random_path(size, rng);
  const walls = place_walls(size, solution, rng);
  const dotted = new Set([0, solution.length - 1]);
  for (let index = size; index < solution.length - 1; index += size) dotted.add(index);
  const board = (dots: ReadonlySet<number>): Board => ({ size, walls, numbers: numbers_from(solution, dots) });

  for (;;) {
    const { answers, complete } = solutions(board(dotted), 2, BUDGET);
    const other = answers.find((answer) => answer.some((cell, index) => cell !== solution[index]));
    if (other) cut(solution, other, dotted);
    else if (!complete) split_widest_gap(dotted);
    else break;
  }

  for (const index of shuffle([...dotted].filter((index) => index !== 0 && index !== solution.length - 1), rng)) {
    dotted.delete(index);
    const { answers, complete } = solutions(board(dotted), 2, BUDGET);
    if (!complete || answers.length !== 1) dotted.add(index);
  }

  return { ...board(dotted), seed, solution };
}
