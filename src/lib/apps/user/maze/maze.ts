import { create_rng, pick, shuffle, type Rng } from "$lib/core/utils/random";

export const Direction = { N: "n", E: "e", S: "s", W: "w" } as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

export const DIRECTIONS: readonly Direction[] = Object.values(Direction);

const BIT: Record<Direction, number> = { n: 1, e: 2, s: 4, w: 8 };
const DX: Record<Direction, number> = { n: 0, e: 1, s: 0, w: -1 };
const DY: Record<Direction, number> = { n: -1, e: 0, s: 1, w: 0 };
const OPPOSITE: Record<Direction, Direction> = { n: "s", e: "w", s: "n", w: "e" };

/** Cells are indexed `y * width + x`; `open[cell]` holds one bit per direction with a passage. */
export interface Maze {
  readonly width: number;
  readonly height: number;
  readonly open: Uint8Array;
}

export function create_maze(width: number, height: number): Maze {
  return { width, height, open: new Uint8Array(width * height) };
}

export function cell_count(maze: Maze): number {
  return maze.width * maze.height;
}

export function neighbour(maze: Maze, cell: number, direction: Direction): number | null {
  const x = (cell % maze.width) + DX[direction];
  const y = Math.floor(cell / maze.width) + DY[direction];
  if (x < 0 || y < 0 || x >= maze.width || y >= maze.height) return null;
  return y * maze.width + x;
}

export function neighbours(maze: Maze, cell: number): number[] {
  const result: number[] = [];
  for (const direction of DIRECTIONS) {
    const next = neighbour(maze, cell, direction);
    if (next !== null) result.push(next);
  }
  return result;
}

export function is_open(maze: Maze, cell: number, direction: Direction): boolean {
  return (maze.open[cell] & BIT[direction]) !== 0;
}

export function exits(maze: Maze, cell: number): number[] {
  const result: number[] = [];
  for (const direction of DIRECTIONS) {
    if (is_open(maze, cell, direction)) result.push(neighbour(maze, cell, direction)!);
  }
  return result;
}

function direction_between(maze: Maze, from: number, to: number): Direction {
  const found = DIRECTIONS.find((direction) => neighbour(maze, from, direction) === to);
  if (!found) throw new Error(`Cells ${from} and ${to} are not adjacent`);
  return found;
}

export function carve(maze: Maze, from: number, to: number): void {
  const direction = direction_between(maze, from, to);
  maze.open[from] |= BIT[direction];
  maze.open[to] |= BIT[OPPOSITE[direction]];
}

export function passage_count(maze: Maze): number {
  let bits = 0;
  for (const value of maze.open) {
    for (let v = value; v; v &= v - 1) bits++;
  }
  return bits / 2;
}

export const Carver = { BACKTRACKER: "backtracker", PRIM: "prim", KRUSKAL: "kruskal", WILSON: "wilson" } as const;
export type Carver = (typeof Carver)[keyof typeof Carver];

export const CARVERS: readonly Carver[] = Object.values(Carver);

export interface CarveStep {
  head: number | null;
  marks?: readonly number[];
}

function* backtracker(maze: Maze, rng: Rng): Generator<CarveStep, void, undefined> {
  const visited = new Uint8Array(cell_count(maze));
  const start = Math.floor(rng() * cell_count(maze));
  const stack = [start];
  visited[start] = 1;
  yield { head: start };
  while (stack.length) {
    const cell = stack[stack.length - 1];
    const options = neighbours(maze, cell).filter((next) => !visited[next]);
    if (!options.length) {
      stack.pop();
      yield { head: stack.at(-1) ?? null };
      continue;
    }
    const next = pick(options, rng);
    carve(maze, cell, next);
    visited[next] = 1;
    stack.push(next);
    yield { head: next };
  }
}

function* prim(maze: Maze, rng: Rng): Generator<CarveStep, void, undefined> {
  const inside = new Uint8Array(cell_count(maze));
  const queued = new Uint8Array(cell_count(maze));
  const frontier: number[] = [];
  const add = (cell: number) => {
    inside[cell] = 1;
    for (const next of neighbours(maze, cell)) {
      if (inside[next] || queued[next]) continue;
      queued[next] = 1;
      frontier.push(next);
    }
  };
  const start = Math.floor(rng() * cell_count(maze));
  add(start);
  yield { head: start, marks: frontier };
  while (frontier.length) {
    const index = Math.floor(rng() * frontier.length);
    const cell = frontier[index];
    frontier[index] = frontier[frontier.length - 1];
    frontier.pop();
    carve(
      maze,
      cell,
      pick(
        neighbours(maze, cell).filter((next) => inside[next]),
        rng
      )
    );
    add(cell);
    yield { head: cell, marks: frontier };
  }
}

function* kruskal(maze: Maze, rng: Rng): Generator<CarveStep, void, undefined> {
  const parent = Int32Array.from({ length: cell_count(maze) }, (_, i) => i);
  const find = (cell: number): number => {
    while (parent[cell] !== cell) {
      parent[cell] = parent[parent[cell]];
      cell = parent[cell];
    }
    return cell;
  };
  const edges: [number, number][] = [];
  for (let cell = 0; cell < cell_count(maze); cell++) {
    for (const direction of [Direction.E, Direction.S]) {
      const next = neighbour(maze, cell, direction);
      if (next !== null) edges.push([cell, next]);
    }
  }
  for (const [a, b] of shuffle(edges, rng)) {
    const root_a = find(a);
    const root_b = find(b);
    if (root_a === root_b) continue;
    parent[root_a] = root_b;
    carve(maze, a, b);
    yield { head: b };
  }
}

/** Loop-erased random walks: unbiased (every spanning tree equally likely), slow to start on big grids. */
function* wilson(maze: Maze, rng: Rng): Generator<CarveStep, void, undefined> {
  const total = cell_count(maze);
  const inside = new Uint8Array(total);
  const position = new Int32Array(total).fill(-1);
  const order = shuffle(
    Array.from({ length: total }, (_, i) => i),
    rng
  );
  inside[order[0]] = 1;
  yield { head: order[0] };
  for (const origin of order) {
    if (inside[origin]) continue;
    const walk = [origin];
    position[origin] = 0;
    let cell = origin;
    while (!inside[cell]) {
      const next = pick(neighbours(maze, cell), rng);
      if (position[next] !== -1) {
        for (const erased of walk.splice(position[next] + 1)) position[erased] = -1;
      } else {
        position[next] = walk.length;
        walk.push(next);
      }
      cell = next;
      yield { head: cell, marks: walk };
    }
    for (let i = 0; i < walk.length - 1; i++) {
      carve(maze, walk[i], walk[i + 1]);
      inside[walk[i]] = 1;
      position[walk[i]] = -1;
    }
    position[walk[walk.length - 1]] = -1;
    yield { head: cell };
  }
}

const CARVER_STEPS: Record<Carver, (maze: Maze, rng: Rng) => Generator<CarveStep, void, undefined>> = {
  backtracker,
  prim,
  kruskal,
  wilson,
};

export function carve_steps(carver: Carver, maze: Maze, rng: Rng): Generator<CarveStep, void, undefined> {
  return CARVER_STEPS[carver](maze, rng);
}

export function generate(carver: Carver, width: number, height: number, seed: number): Maze {
  const maze = create_maze(width, height);
  for (const _ of carve_steps(carver, maze, create_rng(seed)));
  return maze;
}

export function step(maze: Maze, cell: number, direction: Direction): number {
  return is_open(maze, cell, direction) ? neighbour(maze, cell, direction)! : cell;
}

/** Moves one cell, then follows the corridor (round corners too) until a junction, a dead end or `goal`. */
export function run(maze: Maze, from: number, direction: Direction, goal: number): number[] {
  let previous = from;
  let cell = step(maze, from, direction);
  if (cell === from) return [];
  const path = [cell];
  while (cell !== goal) {
    const onward = exits(maze, cell).filter((next) => next !== previous);
    if (onward.length !== 1) break;
    previous = cell;
    cell = onward[0];
    path.push(cell);
  }
  return path;
}
