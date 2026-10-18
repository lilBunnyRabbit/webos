import { Direction } from "$kit/games/direction";
import { create_rng, random_int, shuffle, type Rng } from "$lib/core/utils/random";

export const Tile = { VOID: 0, WALL: 1, FLOOR: 2 } as const;
export type Tile = (typeof Tile)[keyof typeof Tile];

export const DIRECTIONS: readonly Direction[] = [Direction.UP, Direction.RIGHT, Direction.DOWN, Direction.LEFT];

export const MOVE_CHARS: Record<Direction, string> = { up: "u", right: "r", down: "d", left: "l" };
export const CHAR_DIRECTIONS: Record<string, Direction> = { u: "up", r: "right", d: "down", l: "left" };

export interface Level {
  width: number;
  height: number;
  tiles: readonly Tile[];
  goals: readonly number[];
  boxes: readonly number[];
  player: number;
  /** LURD notation, from the pulls that built the level; valid but not the shortest. */
  solution: string;
}

export interface GenerateOptions {
  side: number;
  boxes: number;
  floor: number;
  min_pushes: number;
  pulls: number;
}

export function offset(width: number, direction: Direction): number {
  switch (direction) {
    case Direction.UP:
      return -width;
    case Direction.DOWN:
      return width;
    case Direction.LEFT:
      return -1;
    case Direction.RIGHT:
      return 1;
  }
}

export function opposite(direction: Direction): Direction {
  switch (direction) {
    case Direction.UP:
      return Direction.DOWN;
    case Direction.DOWN:
      return Direction.UP;
    case Direction.LEFT:
      return Direction.RIGHT;
    case Direction.RIGHT:
      return Direction.LEFT;
  }
}

interface Room {
  width: number;
  height: number;
  tiles: Tile[];
}

function carve(side: number, share: number, rng: Rng): Room {
  const width = side + 2;
  const floor = new Uint8Array(width * width);
  const target = Math.round(side * side * share);
  const inside = (row: number, col: number) => row >= 1 && row <= side && col >= 1 && col <= side;
  let row = random_int(1, side, rng);
  let col = random_int(1, side, rng);
  let direction = DIRECTIONS[random_int(0, 3, rng)];
  let count = 0;
  const dig = (r: number, c: number) => {
    if (!inside(r, c) || floor[r * width + c]) return;
    floor[r * width + c] = 1;
    count++;
  };

  while (count < target) {
    dig(row, col);
    if (rng() < 0.18) {
      dig(row + 1, col);
      dig(row, col + 1);
      dig(row + 1, col + 1);
    }
    if (rng() < 0.4) direction = DIRECTIONS[random_int(0, 3, rng)];
    const next_row = row + (direction === Direction.DOWN ? 1 : direction === Direction.UP ? -1 : 0);
    const next_col = col + (direction === Direction.RIGHT ? 1 : direction === Direction.LEFT ? -1 : 0);
    if (inside(next_row, next_col)) {
      row = next_row;
      col = next_col;
    } else direction = DIRECTIONS[random_int(0, 3, rng)];
  }

  const tiles = Array<Tile>(width * width).fill(Tile.VOID);
  for (let i = 0; i < tiles.length; i++) {
    if (floor[i]) {
      tiles[i] = Tile.FLOOR;
      continue;
    }
    const r = Math.floor(i / width);
    const c = i % width;
    for (let dr = -1; dr <= 1 && tiles[i] === Tile.VOID; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && rr < width && cc >= 0 && cc < width && floor[rr * width + cc]) {
          tiles[i] = Tile.WALL;
          break;
        }
      }
    }
  }
  return { width, height: width, tiles };
}

export function reach(width: number, tiles: readonly Tile[], occupied: Uint8Array, from: number): Uint8Array {
  const seen = new Uint8Array(tiles.length);
  const queue = [from];
  seen[from] = 1;
  const steps = [-width, 1, width, -1];
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    for (const step of steps) {
      const next = cell + step;
      if (!seen[next] && tiles[next] === Tile.FLOOR && !occupied[next]) {
        seen[next] = 1;
        queue.push(next);
      }
    }
  }
  return seen;
}

export function walk(
  width: number,
  tiles: readonly Tile[],
  occupied: Uint8Array,
  from: number,
  to: number
): string | null {
  if (from === to) return "";
  const came = new Int32Array(tiles.length).fill(-1);
  const via: Direction[] = [];
  came[from] = from;
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    for (const direction of DIRECTIONS) {
      const next = cell + offset(width, direction);
      if (came[next] !== -1 || tiles[next] !== Tile.FLOOR || occupied[next]) continue;
      came[next] = cell;
      via[next] = direction;
      if (next === to) {
        let path = "";
        for (let at = to; at !== from; at = came[at]) path = MOVE_CHARS[via[at]] + path;
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

interface Pull {
  box: number;
  direction: Direction;
}

interface Walked {
  boxes: number[];
  player: number;
  solution: string;
  pulls: number;
}

/**
 * Plays backwards from the solved position: boxes start on the goals and the player pulls them away. Every pull is a
 * push in reverse, so replaying the pulls backwards solves the level, which makes it solvable by construction.
 */
function reverse_walk(room: Room, goals: readonly number[], start: number, pulls: number, rng: Rng): Walked {
  const { width, tiles } = room;
  const boxes = [...goals];
  const occupied = new Uint8Array(tiles.length);
  for (const box of boxes) occupied[box] = 1;
  let player = start;
  const history: { boxes: number[]; pull: Pull; player_after: number }[] = [];
  let last = -1;

  for (let n = 0; n < pulls; n++) {
    const area = reach(width, tiles, occupied, player);
    const options: Pull[] = [];
    for (let box = 0; box < boxes.length; box++) {
      for (const direction of DIRECTIONS) {
        const step = offset(width, direction);
        const stand = boxes[box] + step;
        const back = stand + step;
        if (area[stand] && tiles[back] === Tile.FLOOR && !occupied[back]) options.push({ box, direction });
      }
    }
    if (!options.length) break;
    // Leaning on the last box makes longer runs, and boxes still sitting on goals get pulled off sooner.
    const same = options.filter((option) => option.box === last);
    const resting = options.filter((option) => goals.includes(boxes[option.box]));
    const pool = same.length && rng() < 0.55 ? same : resting.length && rng() < 0.5 ? resting : options;
    const pull = pool[Math.floor(rng() * pool.length)];
    const step = offset(width, pull.direction);
    const from = boxes[pull.box];
    occupied[from] = 0;
    boxes[pull.box] = from + step;
    occupied[from + step] = 1;
    player = from + 2 * step;
    last = pull.box;
    history.push({ boxes: [...boxes], pull, player_after: player });
  }

  const area = reach(width, tiles, occupied, player);
  const cells: number[] = [];
  for (let i = 0; i < area.length; i++) if (area[i]) cells.push(i);
  const begin = cells[Math.floor(rng() * cells.length)];

  let solution = "";
  let at = begin;
  for (let i = history.length - 1; i >= 0; i--) {
    const { boxes: before, pull, player_after } = history[i];
    const marks = new Uint8Array(tiles.length);
    for (const box of before) marks[box] = 1;
    solution += walk(width, tiles, marks, at, player_after) ?? "";
    const push = opposite(pull.direction);
    solution += MOVE_CHARS[push].toUpperCase();
    at = player_after + offset(width, push);
  }

  return { boxes, player: begin, solution, pulls: history.length };
}

/** A box on any other cell can never reach a goal, so the solver drops those states. */
export function live_cells(width: number, tiles: readonly Tile[], goals: readonly number[]): Uint8Array {
  const live = new Uint8Array(tiles.length);
  const queue = [...goals];
  for (const goal of goals) live[goal] = 1;
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    for (const direction of DIRECTIONS) {
      const step = offset(width, direction);
      const next = cell + step;
      if (!live[next] && tiles[next] === Tile.FLOOR && tiles[next + step] === Tile.FLOOR) {
        live[next] = 1;
        queue.push(next);
      }
    }
  }
  return live;
}

export interface SolveResult {
  pushes: number | null;
  depth: number;
  states: number;
  aborted: boolean;
}

export interface SolveLimits {
  max_depth?: number;
  max_states?: number;
}

/**
 * Breadth-first over pushes, with the player reduced to the area it can walk: the first solved state found has the
 * fewest pushes. Boxes on dead cells are pruned.
 */
export function solve(
  level: Pick<Level, "width" | "tiles" | "goals" | "boxes" | "player">,
  limits: SolveLimits = {}
): SolveResult {
  const { width, tiles, goals } = level;
  const max_depth = limits.max_depth ?? Infinity;
  const max_states = limits.max_states ?? 200_000;
  const live = live_cells(width, tiles, goals);
  const goal_set = new Uint8Array(tiles.length);
  for (const goal of goals) goal_set[goal] = 1;
  const steps = DIRECTIONS.map((direction) => offset(width, direction));
  const solved = (boxes: readonly number[]) => boxes.every((box) => goal_set[box]);
  if (solved(level.boxes)) return { pushes: 0, depth: 0, states: 1, aborted: false };

  const occupied = new Uint8Array(tiles.length);
  const area = new Uint32Array(tiles.length);
  const queue = new Int32Array(tiles.length);
  let stamp = 0;
  const seen = new Set<number>();

  // The flood fill doubles as the player's normal form: its lowest cell stands for the whole area.
  const flood = (from: number): number => {
    stamp++;
    area[from] = stamp;
    queue[0] = from;
    let lowest = from;
    let tail = 1;
    for (let head = 0; head < tail; head++) {
      const cell = queue[head];
      for (const step of steps) {
        const next = cell + step;
        if (area[next] !== stamp && tiles[next] === Tile.FLOOR && !occupied[next]) {
          area[next] = stamp;
          queue[tail++] = next;
          if (next < lowest) lowest = next;
        }
      }
    }
    return lowest;
  };

  let layer: { boxes: number[]; player: number }[] = [{ boxes: [...level.boxes], player: level.player }];
  let depth = 0;
  while (layer.length && depth < max_depth) {
    const next_layer: { boxes: number[]; player: number }[] = [];
    for (const state of layer) {
      for (const box of state.boxes) occupied[box] = 1;
      let key = flood(state.player);
      for (const box of state.boxes.slice().sort((a, b) => a - b)) key = key * 256 + box;
      if (!seen.has(key)) {
        seen.add(key);
        for (let i = 0; i < state.boxes.length; i++) {
          const box = state.boxes[i];
          for (const step of steps) {
            const target = box + step;
            if (area[box - step] !== stamp || tiles[target] !== Tile.FLOOR || occupied[target] || !live[target]) continue;
            const boxes = state.boxes.slice();
            boxes[i] = target;
            if (solved(boxes)) return { pushes: depth + 1, depth: depth + 1, states: seen.size, aborted: false };
            next_layer.push({ boxes, player: box });
          }
        }
      }
      for (const box of state.boxes) occupied[box] = 0;
      if (seen.size > max_states) return { pushes: null, depth, states: seen.size, aborted: true };
    }
    layer = next_layer;
    depth++;
  }
  return { pushes: null, depth, states: seen.size, aborted: false };
}

function crop(room: Room, cells: { goals: number[]; boxes: number[]; player: number }) {
  let top = room.height;
  let left = room.width;
  let bottom = 0;
  let right = 0;
  room.tiles.forEach((tile, i) => {
    if (tile === Tile.VOID) return;
    const r = Math.floor(i / room.width);
    const c = i % room.width;
    top = Math.min(top, r);
    bottom = Math.max(bottom, r);
    left = Math.min(left, c);
    right = Math.max(right, c);
  });
  const width = right - left + 1;
  const height = bottom - top + 1;
  const map = (i: number) => (Math.floor(i / room.width) - top) * width + (i % room.width) - left;
  const tiles: Tile[] = [];
  for (let r = top; r <= bottom; r++) for (let c = left; c <= right; c++) tiles.push(room.tiles[r * room.width + c]);
  return { width, height, tiles, goals: cells.goals.map(map), boxes: cells.boxes.map(map), player: map(cells.player) };
}

/** Pushes a lone box needs from each cell to `goal`, ignoring other boxes; -1 where it never gets there. */
function push_distances(width: number, tiles: readonly Tile[], goal: number): Int16Array {
  const distance = new Int16Array(tiles.length).fill(-1);
  distance[goal] = 0;
  const queue = [goal];
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    for (const direction of DIRECTIONS) {
      const step = offset(width, direction);
      const from = cell + step;
      if (distance[from] === -1 && tiles[from] === Tile.FLOOR && tiles[from + step] === Tile.FLOOR) {
        distance[from] = distance[cell] + 1;
        queue.push(from);
      }
    }
  }
  return distance;
}

/** A lower bound on pushes: each box alone to a goal of its own, over the cheapest assignment. */
export function push_bound(level: Pick<Level, "width" | "tiles" | "goals" | "boxes">): number {
  return matching(
    level.goals.map((goal) => push_distances(level.width, level.tiles, goal)),
    level.boxes
  );
}

function matching(tables: readonly Int16Array[], boxes: readonly number[]): number {
  let best = Infinity;
  const used = new Uint8Array(tables.length);
  const assign = (box: number, total: number) => {
    if (total >= best) return;
    if (box === boxes.length) {
      best = total;
      return;
    }
    for (let goal = 0; goal < tables.length; goal++) {
      const distance = tables[goal][boxes[box]];
      if (used[goal] || distance < 0) continue;
      used[goal] = 1;
      assign(box + 1, total + distance);
      used[goal] = 0;
    }
  };
  assign(0, 0);
  return best;
}

const MAX_ATTEMPTS = 400;
const WALKS_PER_ROOM = 4;
const SOLVER_STATES = 8_000;
/** Spread over every attempt, so one seed can't stall the window however unlucky its rooms. */
const STATE_BUDGET = 40_000;

/**
 * A level from its seed. Each attempt carves a room, drops goals, then pulls boxes off them backwards. It is kept
 * when no box starts on a goal and either the push lower bound or the solver shows no solution takes fewer than
 * `min_pushes` pushes. A search that runs out of states counts once it got most of the way: that many positions
 * within so few pushes is no easy level either. When nothing qualifies, the hardest attempt seen is used, which is
 * still solvable.
 */
export function generate(options: GenerateOptions, seed: number): Level {
  const rng = create_rng(seed);
  let fallback: { level: Level; score: number } | null = null;
  let budget = STATE_BUDGET;

  for (let attempt = 0; attempt < MAX_ATTEMPTS && budget > 0; attempt++) {
    const room = carve(options.side, options.floor, rng);
    const floor: number[] = [];
    room.tiles.forEach((tile, i) => tile === Tile.FLOOR && floor.push(i));
    if (floor.length < options.boxes * 3 + WALKS_PER_ROOM) continue;
    shuffle(floor, rng);
    const goals = floor.slice(0, options.boxes);
    const tables = goals.map((goal) => push_distances(room.width, room.tiles, goal));
    // A few walks per room, keeping the one that left its boxes farthest from home: the bound is cheap, the solver isn't.
    let walked: Walked | null = null;
    let bound = -1;
    for (let walk = 0; walk < WALKS_PER_ROOM; walk++) {
      const candidate = reverse_walk(room, goals, floor[options.boxes + walk], options.pulls, rng);
      if (candidate.boxes.some((box) => goals.includes(box))) continue;
      const candidate_bound = matching(tables, candidate.boxes);
      if (candidate_bound > bound) [walked, bound] = [candidate, candidate_bound];
    }
    if (!walked) continue;

    const level: Level = {
      ...crop(room, { goals, boxes: walked.boxes, player: walked.player }),
      solution: walked.solution,
    };
    if (bound >= options.min_pushes) return level;

    const result = solve(level, { max_depth: options.min_pushes - 1, max_states: SOLVER_STATES });
    budget -= result.states;
    if (result.pushes === null && (!result.aborted || result.depth + 1 >= options.min_pushes * 0.6)) return level;
    const score = result.pushes ?? Math.max(bound, result.depth + 1);
    if (!fallback || score > fallback.score) fallback = { level, score };
  }

  if (fallback) return fallback.level;
  throw new Error(`[sokoban] no level for seed ${seed}`);
}
