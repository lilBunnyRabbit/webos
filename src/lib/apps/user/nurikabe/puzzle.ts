import { create_rng, random_int, shuffle, type Rng } from "$lib/core/utils/random";

export const Cell = { UNKNOWN: 0, SEA: 1, LAND: 2 } as const;
export type Cell = (typeof Cell)[keyof typeof Cell];

export interface Puzzle {
  seed: number;
  width: number;
  height: number;
  clues: readonly number[];
  solution: readonly boolean[];
}

export interface Board {
  width: number;
  height: number;
  clues: readonly number[];
  neighbors: readonly (readonly number[])[];
  blocks: readonly (readonly number[])[];
  cell_blocks: readonly (readonly number[])[];
  land_total: number;
}

export function create_board(width: number, height: number, clues: readonly number[]): Board {
  const neighbors = Array.from({ length: width * height }, (_, index) => {
    const row = Math.floor(index / width);
    const col = index % width;
    const list: number[] = [];
    if (row > 0) list.push(index - width);
    if (col > 0) list.push(index - 1);
    if (col < width - 1) list.push(index + 1);
    if (row < height - 1) list.push(index + width);
    return list;
  });
  const blocks: number[][] = [];
  for (let row = 0; row < height - 1; row++) {
    for (let col = 0; col < width - 1; col++) {
      const index = row * width + col;
      blocks.push([index, index + 1, index + width, index + width + 1]);
    }
  }
  const cell_blocks: number[][] = Array.from({ length: width * height }, () => []);
  blocks.forEach((block, id) => block.forEach((index) => cell_blocks[index].push(id)));
  return { width, height, clues, neighbors, blocks, cell_blocks, land_total: clues.reduce((sum, clue) => sum + clue, 0) };
}

export function initial_cells(board: Board): Int8Array {
  return Int8Array.from(board.clues, (clue) => (clue ? Cell.LAND : Cell.UNKNOWN));
}

interface Island {
  cells: number[];
  clue: number;
  clues: number;
  frontier: number[];
}

function islands_of(board: Board, cells: Int8Array, owner: Int32Array): Island[] {
  owner.fill(-1);
  const islands: Island[] = [];
  const seen = new Int32Array(cells.length).fill(-1);
  for (let start = 0; start < cells.length; start++) {
    if (cells[start] !== Cell.LAND || owner[start] >= 0) continue;
    const id = islands.length;
    const island: Island = { cells: [], clue: 0, clues: 0, frontier: [] };
    owner[start] = id;
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const index = queue[head];
      island.cells.push(index);
      if (board.clues[index]) {
        island.clue = board.clues[index];
        island.clues++;
      }
      for (const next of board.neighbors[index]) {
        if (cells[next] === Cell.LAND && owner[next] < 0) {
          owner[next] = id;
          queue.push(next);
        } else if (cells[next] === Cell.UNKNOWN && seen[next] !== id) {
          seen[next] = id;
          island.frontier.push(next);
        }
      }
    }
    islands.push(island);
  }
  return islands;
}

/**
 * Applies the forced deductions until nothing changes. Returns false on a contradiction. `log` receives the cells it
 * decided, in order, so a hint can show the first step a player could have found.
 */
export function propagate(board: Board, cells: Int8Array, log?: number[], deep = true): boolean {
  const size = cells.length;
  const owner = new Int32Array(size);
  const reach = new Uint8Array(size);
  const dist = new Int32Array(size);
  const seen = new Int32Array(size);
  const touch = new Int32Array(size);
  let stamp = 0;
  let changed = false;
  let failed = false;

  let grew = false;
  const sea_buffers = sea_buffers_of(size);

  const set = (index: number, value: Cell) => {
    if (cells[index] === value) return;
    if (cells[index] !== Cell.UNKNOWN) {
      failed = true;
      return;
    }
    cells[index] = value;
    log?.push(index);
    changed = true;
    if (value === Cell.LAND) grew = true;
  };

  // Rules that only add sea leave the islands as they were, so a round starts over only once land is added.
  for (;;) {
    changed = false;
    grew = false;
    const islands = islands_of(board, cells, owner);

    for (const island of islands) {
      if (island.clues > 1) return false;
      const complete = island.clue > 0 && island.cells.length === island.clue;
      if (island.clue && island.cells.length > island.clue) return false;
      if (complete) island.frontier.forEach((index) => set(index, Cell.SEA));
      else if (!island.frontier.length) return false;
      else if (island.frontier.length === 1) set(island.frontier[0], Cell.LAND);
    }
    if (failed) return false;
    if (grew) continue;

    // A blank cell that would join two numbers, or overfill the one it touches, is sea.
    for (let index = 0; index < size; index++) {
      if (cells[index] !== Cell.UNKNOWN) continue;
      let clue = 0;
      let clues = 0;
      let total = 1;
      let first = -1;
      let second = -1;
      let third = -1;
      for (const next of board.neighbors[index]) {
        const id = owner[next];
        if (id < 0 || id === first || id === second || id === third) continue;
        if (first < 0) first = id;
        else if (second < 0) second = id;
        else third = id;
        total += islands[id].cells.length;
        if (islands[id].clue) {
          clue = islands[id].clue;
          clues++;
        }
      }
      if (clues > 1 || (clues === 1 && total > clue)) set(index, Cell.SEA);
    }

    reach.fill(0);
    touch.fill(-1);
    for (const island of islands) {
      if (!island.clue) continue;
      const id = owner[island.cells[0]];
      for (const index of island.cells) {
        for (const next of board.neighbors[index]) {
          if (owner[next] !== id) touch[next] = touch[next] === -1 || touch[next] === id ? id : -2;
        }
      }
    }
    for (const island of islands) {
      if (!island.clue) continue;
      const id = owner[island.cells[0]];
      const budget = island.clue - island.cells.length;
      for (const index of island.cells) reach[index] = 1;
      if (!budget) continue;
      stamp++;
      const queue: number[] = [];
      for (const index of island.cells) {
        seen[index] = stamp;
        dist[index] = 0;
        queue.push(index);
      }
      let room = island.cells.length;
      for (let head = 0; head < queue.length; head++) {
        const index = queue[head];
        if (dist[index] >= budget) continue;
        for (const next of board.neighbors[index]) {
          if (seen[next] === stamp || cells[next] === Cell.SEA) continue;
          if (owner[next] >= 0 && islands[owner[next]].clue) continue;
          if (touch[next] !== -1 && touch[next] !== id) continue;
          seen[next] = stamp;
          dist[next] = dist[index] + 1;
          reach[next] = 1;
          room++;
          queue.push(next);
        }
      }
      if (room < island.clue) return false;
    }
    for (let index = 0; index < size; index++) {
      if (reach[index]) continue;
      if (cells[index] === Cell.LAND) return false;
      if (cells[index] === Cell.UNKNOWN) set(index, Cell.SEA);
    }

    for (const block of board.blocks) {
      let sea = 0;
      let open = -1;
      for (const index of block) {
        if (cells[index] === Cell.SEA) sea++;
        else if (cells[index] === Cell.UNKNOWN) open = open === -1 ? index : -2;
      }
      if (sea === 4) return false;
      if (sea === 3 && open >= 0) set(open, Cell.LAND);
    }
    if (failed) return false;
    if (grew) continue;

    let land = 0;
    let unknown = 0;
    for (let index = 0; index < size; index++) {
      if (cells[index] === Cell.LAND) land++;
      else if (cells[index] === Cell.UNKNOWN) unknown++;
    }
    if (land > board.land_total || land + unknown < board.land_total) return false;
    if (unknown && (land === board.land_total || land + unknown === board.land_total)) {
      const value = land === board.land_total ? Cell.SEA : Cell.LAND;
      for (let index = 0; index < size; index++) if (cells[index] === Cell.UNKNOWN) set(index, value);
      continue;
    }

    if (!sea_step(board, cells, set, sea_buffers)) return false;
    if (failed) return false;
    if (changed) continue;

    if (!deep) return true;
    if (!shapes_step(board, cells, owner, islands, set)) return false;
    if (failed) return false;
    if (!changed) return true;
  }
}

interface SeaBuffers {
  order: Int32Array;
  low: Int32Array;
  below: Int32Array;
  parent: Int32Array;
  cursor: Int32Array;
  cut: Uint8Array;
}

function sea_buffers_of(size: number): SeaBuffers {
  return {
    order: new Int32Array(size),
    low: new Int32Array(size),
    below: new Int32Array(size),
    parent: new Int32Array(size),
    cursor: new Int32Array(size),
    cut: new Uint8Array(size),
  };
}

const SHAPE_NODES = 200;

interface Shapes {
  count: number;
  /** Per cell, how many of the island's possible shapes contain it, or border it. */
  inside: Int32Array;
  border: Int32Array;
}

/**
 * Every way an unfinished island could still be completed, found by growing it one cell at a time (Redelmeier's
 * method, so each shape comes up once). Null when there are too many to list.
 */
function shapes_of(board: Board, cells: Int8Array, owner: Int32Array, islands: readonly Island[], island: Island): Shapes | null {
  const size = cells.length;
  const id = owner[island.cells[0]];
  const member = new Uint8Array(size);
  const excluded = new Uint8Array(size);
  const stamp = new Int32Array(size);
  const result: Shapes = { count: 0, inside: new Int32Array(size), border: new Int32Array(size) };
  const members = [...island.cells];
  members.forEach((index) => (member[index] = 1));
  let nodes = 0;

  const allowed = (index: number) =>
    cells[index] === Cell.UNKNOWN &&
    !member[index] &&
    !board.neighbors[index].some((next) => owner[next] >= 0 && owner[next] !== id && islands[owner[next]].clue > 0);

  // Joining a cell pulls in any unnumbered land touching it.
  const add = (index: number): number[] => {
    const added = [index];
    member[index] = 1;
    for (let head = 0; head < added.length; head++) {
      for (const next of board.neighbors[added[head]]) {
        if (!member[next] && cells[next] === Cell.LAND) {
          member[next] = 1;
          added.push(next);
        }
      }
    }
    members.push(...added);
    return added;
  };
  const remove = (added: number[]) => {
    added.forEach((index) => (member[index] = 0));
    members.length -= added.length;
  };

  // A finished shape walls itself in with sea; that wall must not make a pool or cut the known sea in two.
  const walled = new Uint8Array(size);
  const fits = (): boolean => {
    walled.fill(0);
    const wall: number[] = [];
    for (const index of members) {
      for (const next of board.neighbors[index]) {
        if (member[next] || walled[next]) continue;
        walled[next] = 1;
        wall.push(next);
      }
    }
    const is_sea = (index: number) => walled[index] === 1 || cells[index] === Cell.SEA;
    for (const index of wall) {
      for (const id of board.cell_blocks[index]) {
        const block = board.blocks[id];
        if (is_sea(block[0]) && is_sea(block[1]) && is_sea(block[2]) && is_sea(block[3])) return false;
      }
    }
    let first = -1;
    let seas = 0;
    for (let index = 0; index < size; index++) {
      if (is_sea(index)) {
        seas++;
        if (first < 0) first = index;
      }
    }
    if (seas < 2) return true;
    const seen = new Uint8Array(size);
    seen[first] = 1;
    const queue = [first];
    let reached = 1;
    for (let head = 0; head < queue.length; head++) {
      for (const next of board.neighbors[queue[head]]) {
        if (seen[next] || member[next] || cells[next] === Cell.LAND) continue;
        seen[next] = 1;
        if (is_sea(next)) reached++;
        queue.push(next);
      }
    }
    return reached === seas;
  };

  const extend = (untried: number[]): boolean => {
    if (++nodes > SHAPE_NODES) return false;
    if (members.length === island.clue) {
      if (!fits()) return true;
      result.count++;
      for (const index of members) {
        result.inside[index]++;
        for (const next of board.neighbors[index]) {
          if (member[next] || stamp[next] === result.count) continue;
          stamp[next] = result.count;
          result.border[next]++;
        }
      }
      return true;
    }
    const pending = [...untried];
    const popped: number[] = [];
    let ok = true;
    while (pending.length && ok) {
      const index = pending.pop()!;
      excluded[index] = 1;
      popped.push(index);
      const added = add(index);
      if (members.length <= island.clue) {
        const fresh: number[] = [];
        for (const cell of added) {
          for (const next of board.neighbors[cell]) {
            if (!excluded[next] && allowed(next) && !pending.includes(next) && !fresh.includes(next)) fresh.push(next);
          }
        }
        ok = extend([...pending, ...fresh]);
      }
      remove(added);
    }
    popped.forEach((index) => (excluded[index] = 0));
    return ok;
  };

  const start: number[] = [];
  for (const index of island.cells) {
    for (const next of board.neighbors[index]) if (allowed(next) && !start.includes(next)) start.push(next);
  }
  return extend(start) ? result : null;
}

/**
 * A cell in every possible shape of an island is land, a cell bordering every shape is sea. When every island could be
 * listed, a cell no shape covers is sea as well.
 */
function shapes_step(
  board: Board,
  cells: Int8Array,
  owner: Int32Array,
  islands: readonly Island[],
  set: (index: number, value: Cell) => void
): boolean {
  const size = cells.length;
  const covered = new Uint8Array(size);
  const land: number[] = [];
  const sea: number[] = [];
  let listed = true;
  // Smallest gap first and stop at the first island that gives something: the cheap rules take it from there.
  const open = islands.filter((island) => island.clue && island.cells.length < island.clue);
  open.sort((a, b) => a.clue - a.cells.length - (b.clue - b.cells.length));
  for (const island of islands) if (island.clue && island.cells.length === island.clue) island.cells.forEach((index) => (covered[index] = 1));
  for (const island of open) {
    const shapes = shapes_of(board, cells, owner, islands, island);
    if (!shapes) {
      listed = false;
      continue;
    }
    if (!shapes.count) return false;
    for (let index = 0; index < size; index++) {
      if (shapes.inside[index]) covered[index] = 1;
      if (cells[index] !== Cell.UNKNOWN) continue;
      if (shapes.inside[index] === shapes.count) land.push(index);
      else if (shapes.border[index] === shapes.count) sea.push(index);
    }
    if (land.length || sea.length) {
      listed = false;
      break;
    }
  }
  if (listed) {
    for (let index = 0; index < size; index++) {
      if (covered[index]) continue;
      if (cells[index] === Cell.LAND) return false;
      if (cells[index] === Cell.UNKNOWN) sea.push(index);
    }
  }
  land.forEach((index) => set(index, Cell.LAND));
  sea.forEach((index) => set(index, Cell.SEA));
  return true;
}

/**
 * The sea must stay one piece: every shaded cell has to reach every other through cells that may still be sea, and a
 * blank cell the sea cannot do without (an articulation point between shaded cells) is sea.
 */
function sea_step(board: Board, cells: Int8Array, set: (index: number, value: Cell) => void, buffers: SeaBuffers): boolean {
  const size = cells.length;
  let first = -1;
  let seas = 0;
  for (let index = 0; index < size; index++) {
    if (cells[index] === Cell.SEA) {
      if (first < 0) first = index;
      seas++;
    }
  }
  if (seas < 2) return true;

  // Tarjan over the cells that may be sea, rooted at a shaded one; `below` counts shaded cells in each subtree.
  const { order, low, below, parent, cursor, cut } = buffers;
  order.fill(-1);
  parent.fill(-1);
  cursor.fill(0);
  cut.fill(0);
  let counter = 0;
  const stack = [first];
  order[first] = low[first] = counter++;
  below[first] = 1;
  while (stack.length) {
    const index = stack[stack.length - 1];
    const around = board.neighbors[index];
    if (cursor[index] < around.length) {
      const next = around[cursor[index]++];
      if (cells[next] === Cell.LAND) continue;
      if (order[next] < 0) {
        parent[next] = index;
        order[next] = low[next] = counter++;
        below[next] = cells[next] === Cell.SEA ? 1 : 0;
        stack.push(next);
      } else if (next !== parent[index]) low[index] = Math.min(low[index], order[next]);
      continue;
    }
    stack.pop();
    const up = parent[index];
    if (up < 0) continue;
    low[up] = Math.min(low[up], low[index]);
    below[up] += below[index];
    // Removing `up` cuts this subtree off; it matters when the subtree holds sea and so does the rest.
    if (low[index] >= order[up] && below[index] > 0 && below[index] < seas && cells[up] === Cell.UNKNOWN && up !== first) {
      cut[up] = 1;
    }
  }
  if (below[first] < seas) return false;
  for (let index = 0; index < size; index++) if (cut[index]) set(index, Cell.SEA);
  return true;
}

export function is_valid(board: Board, sea: readonly boolean[]): boolean {
  const size = sea.length;
  for (const block of board.blocks) if (block.every((index) => sea[index])) return false;
  for (let index = 0; index < size; index++) if (board.clues[index] && sea[index]) return false;

  const seen = new Uint8Array(size);
  let sea_parts = 0;
  for (let start = 0; start < size; start++) {
    if (seen[start]) continue;
    seen[start] = 1;
    const queue = [start];
    let clue = 0;
    let clues = 0;
    for (let head = 0; head < queue.length; head++) {
      const index = queue[head];
      if (board.clues[index]) {
        clue = board.clues[index];
        clues++;
      }
      for (const next of board.neighbors[index]) {
        if (!seen[next] && sea[next] === sea[start]) {
          seen[next] = 1;
          queue.push(next);
        }
      }
    }
    if (sea[start]) sea_parts++;
    else if (clues !== 1 || queue.length !== clue) return false;
  }
  return sea_parts <= 1;
}

export interface Count {
  solutions: boolean[][];
  exhausted: boolean;
}

export function count_solutions(board: Board, limit = 2, budget = 4000, start = initial_cells(board), deep = true): Count {
  const result: Count = { solutions: [], exhausted: false };
  let nodes = 0;

  const search = (cells: Int8Array) => {
    if (!propagate(board, cells, undefined, deep)) return;
    if (++nodes > budget) {
      result.exhausted = true;
      return;
    }
    const index = branch_cell(board, cells);
    if (index < 0) {
      const sea = Array.from(cells, (cell) => cell === Cell.SEA);
      if (is_valid(board, sea)) result.solutions.push(sea);
      return;
    }
    for (const value of [Cell.LAND, Cell.SEA]) {
      const next = cells.slice();
      next[index] = value;
      search(next);
      if (result.solutions.length >= limit || result.exhausted) return;
    }
  };

  search(start.slice());
  return result;
}

function branch_cell(board: Board, cells: Int8Array): number {
  let fallback = -1;
  for (let index = 0; index < cells.length; index++) {
    if (cells[index] !== Cell.UNKNOWN) continue;
    if (board.neighbors[index].some((next) => cells[next] === Cell.LAND)) return index;
    if (fallback < 0) fallback = index;
  }
  return fallback;
}

interface Shape {
  max_island: number;
  land: number;
}

function shape_of(side: number): Shape {
  if (side <= 5) return { max_island: 4, land: 0.2 };
  if (side <= 7) return { max_island: 5, land: 0.22 };
  if (side <= 9) return { max_island: 6, land: 0.22 };
  // Wider islands on the big board leave so many shapes open that proving one answer blows the generation budget.
  return { max_island: 4, land: 0.22 };
}

class Layout {
  readonly island: Int32Array;
  readonly sizes: number[] = [];
  sea: number;

  readonly board: Board;

  constructor(board: Board) {
    this.board = board;
    this.island = new Int32Array(board.width * board.height).fill(-1);
    this.sea = this.island.length;
  }

  touching(index: number): number[] {
    const ids: number[] = [];
    for (const next of this.board.neighbors[index]) {
      const id = this.island[next];
      if (id >= 0 && !ids.includes(id)) ids.push(id);
    }
    return ids;
  }

  sea_holds_without(index: number): boolean {
    const { neighbors } = this.board;
    const start = neighbors[index].find((next) => this.island[next] < 0);
    if (start === undefined) return this.sea === 1;
    const seen = new Uint8Array(this.island.length);
    seen[index] = 1;
    seen[start] = 1;
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      for (const next of neighbors[queue[head]]) {
        if (!seen[next] && this.island[next] < 0) {
          seen[next] = 1;
          queue.push(next);
        }
      }
    }
    return queue.length === this.sea - 1;
  }

  can_raise(index: number, cap: number, merge: boolean): boolean {
    if (this.island[index] >= 0) return false;
    const ids = this.touching(index);
    if (ids.length > 1 && !merge) return false;
    if (ids.reduce((total, id) => total + this.sizes[id], 1) > cap) return false;
    return this.sea_holds_without(index);
  }

  raise(index: number) {
    const ids = this.touching(index);
    const id = ids.length ? ids[0] : this.sizes.push(0) - 1;
    for (const other of ids.slice(1)) {
      this.island.forEach((owner, cell) => owner === other && (this.island[cell] = id));
      this.sizes[id] += this.sizes[other];
      this.sizes[other] = 0;
    }
    this.island[index] = id;
    this.sizes[id]++;
    this.sea--;
  }

  clone(): Layout {
    const copy = new Layout(this.board);
    copy.island.set(this.island);
    copy.sizes.push(...this.sizes);
    copy.sea = this.sea;
    return copy;
  }

  pools(): number[][] {
    return this.board.blocks.filter((block) => block.every((index) => this.island[index] < 0)) as number[][];
  }
}

function grow_islands(layout: Layout, shape: Shape, rng: Rng) {
  const { board } = layout;
  const size = board.width * board.height;
  const target = Math.round(size * shape.land);
  let land = 0;
  for (let attempt = 0; attempt < size * 2 && land < target; attempt++) {
    const seed = Math.floor(rng() * size);
    if (layout.island[seed] >= 0 || layout.touching(seed).length || !layout.can_raise(seed, 1, false)) continue;
    layout.raise(seed);
    land++;
    const id = layout.island[seed];
    const goal = random_int(2, shape.max_island, rng);
    while (layout.sizes[id] < goal) {
      const frontier: number[] = [];
      for (let index = 0; index < size; index++) {
        if (layout.island[index] !== id) continue;
        for (const next of board.neighbors[index]) {
          if (layout.island[next] < 0 && !frontier.includes(next) && layout.touching(next).length === 1) frontier.push(next);
        }
      }
      const pick = shuffle(frontier, rng).find((index) => layout.can_raise(index, shape.max_island, false));
      if (pick === undefined) break;
      layout.raise(pick);
      land++;
    }
  }
}

/** Breaks the pool with the fewest ways out first, so the tight corners aren't left for last. */
function break_pools(layout: Layout, shape: Shape, rng: Rng): boolean {
  for (;;) {
    const pools = layout.pools();
    if (!pools.length) return true;
    let best: number[] | null = null;
    for (const pool of shuffle(pools, rng)) {
      const options = pool.filter((index) => layout.can_raise(index, shape.max_island, true));
      if (!options.length) return false;
      if (!best || options.length < best.length) best = options;
      if (best.length === 1) break;
    }
    layout.raise(best![Math.floor(rng() * best!.length)]);
  }
}

function clues_of(layout: Layout, rng: Rng): number[] {
  const clues = new Array<number>(layout.island.length).fill(0);
  layout.sizes.forEach((size, id) => {
    if (!size) return;
    const cells: number[] = [];
    layout.island.forEach((owner, index) => owner === id && cells.push(index));
    const reach = cells.map((cell) => eccentricity(layout, cell));
    const centre = cells.filter((_, index) => reach[index] === Math.min(...reach));
    clues[centre[Math.floor(rng() * centre.length)]] = size;
  });
  return clues;
}

function eccentricity(layout: Layout, start: number): number {
  const id = layout.island[start];
  const dist = new Map([[start, 0]]);
  const queue = [start];
  let far = 0;
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    far = dist.get(index)!;
    for (const next of layout.board.neighbors[index]) {
      if (layout.island[next] === id && !dist.has(next)) {
        dist.set(next, far + 1);
        queue.push(next);
      }
    }
  }
  return far;
}

function deduce(width: number, height: number, clues: readonly number[], deep: boolean): Int8Array | null {
  const board = create_board(width, height, clues);
  const cells = initial_cells(board);
  return propagate(board, cells, undefined, deep) ? cells : null;
}

function open_cells(cells: Int8Array): number[] {
  const open: number[] = [];
  cells.forEach((cell, index) => cell === Cell.UNKNOWN && open.push(index));
  return open;
}

interface Edit {
  layout: Layout;
  clues: number[];
}

/** One small change around a cell the solver is stuck on. Every edit keeps the layout a valid answer. */
function propose(layout: Layout, clues: readonly number[], open: readonly number[], shape: Shape, rng: Rng): Edit | null {
  const target = open[Math.floor(rng() * open.length)];
  const next = layout.clone();
  const next_clues = [...clues];
  const move_clue = (id: number, to: number) => {
    const from = next_clues.findIndex((clue, index) => clue && next.island[index] === id);
    if (from === to) return;
    next_clues[to] = next_clues[from];
    next_clues[from] = 0;
  };

  if (next.island[target] >= 0) {
    move_clue(next.island[target], target);
    return { layout: next, clues: next_clues };
  }
  if (rng() < 0.5 && next.can_raise(target, shape.max_island + 1, false)) {
    next.raise(target);
    renumber(next, next_clues, target);
    return { layout: next, clues: next_clues };
  }
  const near = next.touching(target);
  if (!near.length) return null;
  const id = near[Math.floor(rng() * near.length)];
  const cells: number[] = [];
  next.island.forEach((owner, index) => owner === id && cells.push(index));
  move_clue(id, cells[Math.floor(rng() * cells.length)]);
  return { layout: next, clues: next_clues };
}

function renumber(layout: Layout, clues: number[], raised: number) {
  const id = layout.island[raised];
  const numbered = clues.findIndex((clue, index) => clue && layout.island[index] === id);
  if (numbered >= 0) clues[numbered] = layout.sizes[id];
  else clues[raised] = 1;
}

/**
 * Rules out a second answer: raise a cell that is sea here but land there, or, since both answers have the same amount
 * of land, move a number onto a cell of its island that the other answer leaves as sea.
 */
function rule_out(layout: Layout, clues: readonly number[], other: readonly boolean[], shape: Shape, rng: Rng): Edit {
  const next = layout.clone();
  const next_clues = [...clues];
  if (rng() < 0.5) {
    const raises = shuffle(
      other.flatMap((sea, index) => (!sea && next.island[index] < 0 ? [index] : [])),
      rng
    );
    const raised = raises.find((index) => next.can_raise(index, shape.max_island + 1, false));
    if (raised !== undefined) {
      next.raise(raised);
      renumber(next, next_clues, raised);
      return { layout: next, clues: next_clues };
    }
  }
  const moves = other.flatMap((sea, index) => (sea && next.island[index] >= 0 ? [index] : []));
  const target = moves[Math.floor(rng() * moves.length)];
  const id = next.island[target];
  const from = next_clues.findIndex((clue, index) => clue && next.island[index] === id);
  next_clues[target] = next_clues[from];
  next_clues[from] = 0;
  return { layout: next, clues: next_clues };
}

const TRIALS = 3;
const STALL = 2;
const STEPS = 60;
const SEARCH_NODES = 600;

/**
 * Islands are grown on an all-sea grid while the sea stays connected, the pools left over get broken (most
 * constrained first), and each island gets its number near its middle. Then the solver's rules run. While they leave
 * cells open, small edits near those cells (move a number within its island, raise a stuck sea cell) are tried and the
 * one leaving the fewest open cells kept. Once that stalls, a search from the stuck position either proves the answer
 * unique or finds a second one, and an edit that rules it out is made. Everything draws from one seeded stream.
 */
export function generate(width: number, height: number, seed: number): Puzzle {
  const rng = create_rng(seed);
  const shape = shape_of(Math.max(width, height));
  const empty = create_board(width, height, new Array<number>(width * height).fill(0));

  for (;;) {
    let layout = new Layout(empty);
    grow_islands(layout, shape, rng);
    if (!break_pools(layout, shape, rng)) continue;
    let clues = clues_of(layout, rng);
    let state = deduce(width, height, clues, false);
    let stale = 0;
    for (let step = 0; state && step < STEPS; step++) {
      const open = open_cells(state);
      const solution = Array.from(layout.island, (id) => id < 0);
      if (!open.length) return { seed, width, height, clues, solution };

      if (stale >= STALL) {
        const count = count_solutions(create_board(width, height, clues), 2, SEARCH_NODES, state, false);
        if (count.exhausted) break;
        const other = count.solutions.find((answer) => answer.some((sea, index) => sea !== solution[index]));
        if (!other) return { seed, width, height, clues, solution };
        ({ layout, clues } = rule_out(layout, clues, other, shape, rng));
        state = deduce(width, height, clues, false);
        stale = 0;
        continue;
      }

      let best: (Edit & { state: Int8Array; open: number }) | null = null;
      for (let trial = 0; trial < TRIALS; trial++) {
        const edit = propose(layout, clues, open, shape, rng);
        const next = edit && deduce(width, height, edit.clues, false);
        if (!edit || !next) continue;
        const left = open_cells(next).length;
        if (!best || left < best.open) best = { ...edit, state: next, open: left };
      }
      if (!best || best.open >= open.length) {
        stale++;
        continue;
      }
      stale = 0;
      layout = best.layout;
      clues = best.clues;
      state = best.state;
    }
  }
}
