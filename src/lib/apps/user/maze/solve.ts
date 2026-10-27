import { cell_count, exits, type Maze } from "./maze";

export const Solver = { BFS: "bfs", A_STAR: "a-star" } as const;
export type Solver = (typeof Solver)[keyof typeof Solver];

export const SOLVERS: readonly Solver[] = Object.values(Solver);

function path_to(previous: Int32Array, goal: number): number[] {
  const path: number[] = [];
  for (let cell = goal; cell !== -1; cell = previous[cell]) path.push(cell);
  return path.reverse();
}

function* bfs(maze: Maze, start: number, goal: number): Generator<number, number[], undefined> {
  const previous = new Int32Array(cell_count(maze)).fill(-1);
  const seen = new Uint8Array(cell_count(maze));
  const queue = new Int32Array(cell_count(maze));
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  seen[start] = 1;
  while (head < tail) {
    const cell = queue[head++];
    yield cell;
    if (cell === goal) return path_to(previous, goal);
    for (const next of exits(maze, cell)) {
      if (seen[next]) continue;
      seen[next] = 1;
      previous[next] = cell;
      queue[tail++] = next;
    }
  }
  return [];
}

interface Entry {
  f: number;
  h: number;
  cell: number;
}

function before(a: Entry, b: Entry): boolean {
  return a.f < b.f || (a.f === b.f && a.h < b.h);
}

function push(heap: Entry[], entry: Entry): void {
  heap.push(entry);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (!before(heap[i], heap[parent])) break;
    [heap[i], heap[parent]] = [heap[parent], heap[i]];
    i = parent;
  }
}

function pop(heap: Entry[]): Entry {
  const top = heap[0];
  const last = heap.pop()!;
  if (heap.length) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let best = i;
      if (left < heap.length && before(heap[left], heap[best])) best = left;
      if (right < heap.length && before(heap[right], heap[best])) best = right;
      if (best === i) break;
      [heap[i], heap[best]] = [heap[best], heap[i]];
      i = best;
    }
  }
  return top;
}

/** Manhattan distance never overestimates on a grid of unit moves, so the first time the goal is expanded its path is shortest. */
function* a_star(maze: Maze, start: number, goal: number): Generator<number, number[], undefined> {
  const total = cell_count(maze);
  const goal_x = goal % maze.width;
  const goal_y = Math.floor(goal / maze.width);
  const heuristic = (cell: number) =>
    Math.abs((cell % maze.width) - goal_x) + Math.abs(Math.floor(cell / maze.width) - goal_y);
  const cost = new Float64Array(total).fill(Infinity);
  const previous = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const heap: Entry[] = [];
  cost[start] = 0;
  push(heap, { f: heuristic(start), h: heuristic(start), cell: start });
  while (heap.length) {
    const { cell } = pop(heap);
    if (closed[cell]) continue;
    closed[cell] = 1;
    yield cell;
    if (cell === goal) return path_to(previous, goal);
    for (const next of exits(maze, cell)) {
      const g = cost[cell] + 1;
      if (closed[next] || g >= cost[next]) continue;
      cost[next] = g;
      previous[next] = cell;
      const h = heuristic(next);
      push(heap, { f: g + h, h, cell: next });
    }
  }
  return [];
}

const SOLVER_STEPS: Record<
  Solver,
  (maze: Maze, start: number, goal: number) => Generator<number, number[], undefined>
> = {
  bfs,
  "a-star": a_star,
};

export function solve_steps(
  solver: Solver,
  maze: Maze,
  start: number,
  goal: number
): Generator<number, number[], undefined> {
  return SOLVER_STEPS[solver](maze, start, goal);
}

export function solve(solver: Solver, maze: Maze, start: number, goal: number): { path: number[]; expanded: number } {
  const steps = solve_steps(solver, maze, start, goal);
  let expanded = 0;
  for (;;) {
    const next = steps.next();
    if (next.done) return { path: next.value, expanded };
    expanded++;
  }
}

/** The walk never left the shortest way: it marked no more cells than the path has. */
export function straight_shot(maze: Maze, trail: Uint8Array, start: number, goal: number): boolean {
  let walked = 0;
  for (const cell of trail) walked += cell;
  return walked === solve(Solver.BFS, maze, start, goal).path.length;
}
