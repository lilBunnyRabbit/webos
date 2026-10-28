import { Direction } from "$kit/games/direction";
import { fill_queue, kicks, Piece, SHAPES, type Point, type Rotation } from "$kit/games/tetromino";
import { pick, type Rng } from "$lib/core/utils/random";
import { z } from "zod";

export { Direction, Piece, type Point, type Rng, type Rotation };

/** Cells per side. Playtested at 12, 14 and 16: see docs/apps/four-walls.md. */
export const BOARD_SIZE = 14;
export const NEXT_COUNT = 5;
export const LOCK_MS = 500;
export const MAX_LOCK_RESETS = 15;
export const CLEAR_MS = 240;
export const SOFT_DROP_MS = 33;
export const LINES_PER_LEVEL = 10;
export const MAX_LEVEL = 20;
export const DAS_MS = 160;
export const ARR_MS = 45;
export const CYCLE_RUN = 10;

export const CYCLE: readonly Direction[] = [Direction.DOWN, Direction.LEFT, Direction.UP, Direction.RIGHT];

export const Mode = { CYCLE: "cycle", RANDOM: "random" } as const;
export type Mode = (typeof Mode)[keyof typeof Mode];
export const MODES: readonly Mode[] = Object.values(Mode);

export const Status = { READY: "ready", PLAYING: "playing", PAUSED: "paused", OVER: "over" } as const;
export type Status = (typeof Status)[keyof typeof Status];

export type Cell = Piece | null;

export interface Turn {
  piece: Piece;
  direction: Direction;
}

/** `x`, `y` are in the piece's own frame: the board turned so its wall is at the bottom. */
export interface Active extends Turn {
  rotation: Rotation;
  x: number;
  y: number;
  lowest: number;
  resets: number;
  lock_ms: number;
}

export interface ZoneLine {
  zone: Direction;
  depth: number;
}

export interface Clearing {
  lines: readonly ZoneLine[];
  ms: number;
}

export interface GameState {
  mode: Mode;
  size: number;
  board: readonly Cell[];
  active: Active | null;
  hold: Piece | null;
  can_hold: boolean;
  queue: readonly Turn[];
  dealt: number;
  clearing: Clearing | null;
  score: number;
  lines: number;
  level: number;
  pieces: number;
  last_clear: number;
  last_zones: number;
  walls: number;
  status: Status;
}

const ROTATION_OF: Record<Direction, Rotation> = { down: 0, left: 1, up: 2, right: 3 };

export function screen_rotation(direction: Direction, rotation: Rotation = 0): Rotation {
  return ((rotation + ROTATION_OF[direction]) % 4) as Rotation;
}

export function to_board(size: number, direction: Direction, x: number, y: number): Point {
  const last = size - 1;
  switch (direction) {
    case Direction.DOWN:
      return { x, y };
    case Direction.LEFT:
      return { x: last - y, y: x };
    case Direction.UP:
      return { x: last - x, y: last - y };
    case Direction.RIGHT:
      return { x: y, y: last - x };
  }
}

export function to_frame(direction: Direction, dx: number, dy: number): Point {
  switch (direction) {
    case Direction.DOWN:
      return { x: dx, y: dy };
    case Direction.LEFT:
      return { x: dy, y: -dx };
    case Direction.UP:
      return { x: -dx, y: -dy };
    case Direction.RIGHT:
      return { x: -dy, y: dx };
  }
}

const STEPS: Record<Direction, Point> = {
  down: { x: 0, y: 1 },
  up: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function step_of(direction: Direction): Point {
  return STEPS[direction];
}

export function arrow_for(direction: Direction, local: Point): Direction {
  const found = CYCLE.find((arrow) => {
    const step = to_frame(direction, STEPS[arrow].x, STEPS[arrow].y);
    return step.x === local.x && step.y === local.y;
  });
  return found ?? Direction.DOWN;
}

export interface Zones {
  zone_of: readonly Direction[];
  /** Lines to fill, wall outward: every cell `depth` from the wall between the diagonals, both diagonal cells included. */
  rows: Record<Direction, readonly (readonly number[])[]>;
  /** The cells each zone moves when it collapses, by depth: its line less the diagonal cell the next zone owns. */
  owned: Record<Direction, readonly (readonly number[])[]>;
}

const zones_cache = new Map<number, Zones>();

// Ownership splits the diagonals like a pinwheel: bottom-right to the bottom wall, bottom-left to the left, top-left
// to the top, top-right to the right. A line still runs corner to corner, so each diagonal cell sits in two lines and
// clears with either; ownership only decides which zone moves it on a collapse. The two-cell inner lines (the middle
// 2 × 2, where every piece enters) are left out: they never clear and never move.
export function zones(size: number): Zones {
  const cached = zones_cache.get(size);
  if (cached) return cached;
  const zone_of: Direction[] = Array<Direction>(size * size);
  const rows = {} as Record<Direction, number[][]>;
  const owned = {} as Record<Direction, number[][]>;
  for (const zone of CYCLE) {
    rows[zone] = [];
    owned[zone] = [];
    for (let depth = 0; depth < size / 2; depth++) {
      const line: number[] = [];
      for (let x = depth; x <= size - 1 - depth; x++) {
        const cell = to_board(size, zone, x, size - 1 - depth);
        line.push(cell.y * size + cell.x);
      }
      const mine = line.slice(1);
      for (const index of mine) zone_of[index] = zone;
      if (line.length > 2) {
        rows[zone].push(line);
        owned[zone].push(mine);
      }
    }
  }
  const result = { zone_of, rows, owned };
  zones_cache.set(size, result);
  return result;
}

export const empty_board = (size: number): Cell[] => Array<Cell>(size * size).fill(null);

export function piece_cells(size: number, active: Pick<Active, "piece" | "rotation" | "x" | "y" | "direction">): Point[] {
  return SHAPES[active.piece][active.rotation].map((cell) =>
    to_board(size, active.direction, active.x + cell.x, active.y + cell.y)
  );
}

export function fits(state: Pick<GameState, "board" | "size">, active: Omit<Active, "lowest" | "resets" | "lock_ms">): boolean {
  const { size, board } = state;
  for (const cell of SHAPES[active.piece][active.rotation]) {
    const x = active.x + cell.x;
    const y = active.y + cell.y;
    if (x < 0 || x >= size || y < 0 || y >= size) return false;
    const at = to_board(size, active.direction, x, y);
    if (board[at.y * size + at.x] !== null) return false;
  }
  return true;
}

function grounded(state: GameState, active: Active): boolean {
  return !fits(state, { ...active, y: active.y + 1 });
}

export function drop_distance(state: Pick<GameState, "board" | "size">, active: Active): number {
  let distance = 0;
  while (fits(state, { ...active, y: active.y + distance + 1 })) distance++;
  return distance;
}

export function cycle_direction(index: number): Direction {
  let at = 0;
  for (let i = 1; i <= index; i++) at += Math.floor(i / CYCLE_RUN) % 2 === 0 ? 1 : -1;
  return CYCLE[((at % 4) + 4) % 4];
}

/** Whole 7-bags, each piece given its wall as it's dealt, so a seeded game deals the same turns whatever the player does. */
export function fill_turns(state: Pick<GameState, "queue" | "dealt" | "mode">, rng: Rng, min = NEXT_COUNT + 1) {
  if (state.queue.length >= min) return { queue: state.queue, dealt: state.dealt };
  const pieces = fill_queue([], rng, min - state.queue.length);
  const queue = [...state.queue];
  let dealt = state.dealt;
  for (const piece of pieces) {
    const direction = state.mode === Mode.CYCLE ? cycle_direction(dealt) : pick(CYCLE, rng);
    queue.push({ piece, direction });
    dealt++;
  }
  return { queue, dealt };
}

export function gravity_ms(level: number): number {
  return Math.max(1, 1000 * Math.pow(0.8 - (level - 1) * 0.007, level - 1));
}

const LINE_SCORES = [0, 100, 300, 500, 800];

/** Blocks' table; one piece can fill lines in two zones, so past four each line adds another 400. */
export function line_score(lines: number, level: number): number {
  const base = lines <= 4 ? LINE_SCORES[lines] : 800 + (lines - 4) * 400;
  return base * level;
}

export function level_for(lines: number): number {
  return Math.min(MAX_LEVEL, 1 + Math.floor(lines / LINES_PER_LEVEL));
}

function playable(state: GameState): state is GameState & { active: Active } {
  return state.status === Status.PLAYING && state.active !== null && state.clearing === null;
}

export function spawn_point(size: number, piece: Piece): Point {
  const half = size / 2;
  return { x: piece === Piece.O ? half - 1 : half - 2, y: piece === Piece.I ? half - 2 : half - 1 };
}

function enter(state: GameState, turn: Turn): GameState {
  const { x, y } = spawn_point(state.size, turn.piece);
  const active: Active = { ...turn, rotation: 0, x, y, lowest: y, resets: 0, lock_ms: 0 };
  if (!fits(state, active)) return { ...state, active: null, status: Status.OVER };
  return { ...state, active };
}

function spawn(state: GameState, rng: Rng): GameState {
  const filled = fill_turns(state, rng);
  const [turn, ...rest] = filled.queue;
  return enter({ ...state, queue: rest, dealt: filled.dealt }, turn);
}

export interface GameOptions {
  mode?: Mode;
  size?: number;
}

export function create_game(rng: Rng, { mode = Mode.CYCLE, size = BOARD_SIZE }: GameOptions = {}): GameState {
  const state: GameState = {
    mode,
    size,
    board: empty_board(size),
    active: null,
    hold: null,
    can_hold: true,
    queue: [],
    dealt: 0,
    clearing: null,
    score: 0,
    lines: 0,
    level: 1,
    pieces: 0,
    last_clear: 0,
    last_zones: 0,
    walls: 0,
    status: Status.READY,
  };
  return spawn(state, rng);
}

export function set_status(state: GameState, status: Status): GameState {
  return state.status === status ? state : { ...state, status };
}

// Blocks' move reset: a new low restores the resets; a move while resting restarts the lock delay, at most MAX_LOCK_RESETS times.
function settle(state: GameState, previous: Active, next: Active): Active {
  if (next.y > next.lowest) return { ...next, lowest: next.y, resets: 0, lock_ms: 0 };
  if (!grounded(state, previous)) return { ...next, lock_ms: 0 };
  if (next.resets >= MAX_LOCK_RESETS) return next;
  return { ...next, lock_ms: 0, resets: next.resets + 1 };
}

function shift(state: GameState, dx: number, dy: number): GameState {
  if (!playable(state)) return state;
  const active = state.active;
  const next = { ...active, x: active.x + dx, y: active.y + dy };
  if (!fits(state, next)) return state;
  return { ...state, active: settle(state, active, next) };
}

export function move(state: GameState, dx: -1 | 1): GameState {
  return shift(state, dx, 0);
}

export function gravity(state: GameState): GameState {
  return shift(state, 0, 1);
}

export function soft_drop(state: GameState): GameState {
  const next = shift(state, 0, 1);
  return next === state ? state : { ...next, score: next.score + 1 };
}

export function rotate(state: GameState, turn: 1 | -1): GameState {
  if (!playable(state)) return state;
  const active = state.active;
  const to = ((active.rotation + turn + 4) % 4) as Rotation;
  for (const [kx, ky] of kicks(active.piece, active.rotation, to)) {
    const next = { ...active, rotation: to, x: active.x + kx, y: active.y - ky };
    if (fits(state, next)) return { ...state, active: settle(state, active, next) };
  }
  return state;
}

export function full_lines(board: readonly Cell[], size: number): ZoneLine[] {
  const { rows } = zones(size);
  const lines: ZoneLine[] = [];
  for (const zone of CYCLE) {
    rows[zone].forEach((line, depth) => {
      if (line.every((index) => board[index] !== null)) lines.push({ zone, depth });
    });
  }
  return lines;
}

export function collapse(board: readonly Cell[], size: number, lines: readonly ZoneLine[]): Cell[] {
  const { rows, owned } = zones(size);
  const cleared = [...board];
  for (const line of lines) for (const index of rows[line.zone][line.depth]) cleared[index] = null;
  const next = [...cleared];
  for (const zone of CYCLE) {
    const gone = new Set(lines.filter((line) => line.zone === zone).map((line) => line.depth));
    if (gone.size === 0) continue;
    const zone_rows = owned[zone];
    const kept = zone_rows.map((_, depth) => depth).filter((depth) => !gone.has(depth));
    zone_rows.forEach((line, depth) => {
      const source = kept[depth];
      // Line `depth + k` is `2k` cells shorter, centred on the same axis, so it lands `k` cells into the longer line.
      const from = source === undefined ? null : zone_rows[source];
      const offset = source === undefined ? 0 : source - depth;
      line.forEach((index, i) => {
        const j = i - offset;
        next[index] = from && j >= 0 && j < from.length ? cleared[from[j]] : null;
      });
    });
  }
  return next;
}

function finish_clear(state: GameState, lines: readonly ZoneLine[], rng: Rng): GameState {
  return spawn({ ...state, board: collapse(state.board, state.size, lines), clearing: null }, rng);
}

export function lock(state: GameState, rng: Rng, clear_ms = CLEAR_MS): GameState {
  if (state.status !== Status.PLAYING || !state.active) return state;
  const size = state.size;
  const board = [...state.board];
  for (const { x, y } of piece_cells(size, state.active)) board[y * size + x] = state.active.piece;

  const lines = full_lines(board, size);
  const cleared_zones = new Set(lines.map((line) => line.zone));
  let walls = state.walls;
  for (const zone of cleared_zones) walls |= 1 << CYCLE.indexOf(zone);
  const total = state.lines + lines.length;
  const next: GameState = {
    ...state,
    board,
    active: null,
    can_hold: true,
    score: state.score + line_score(lines.length, state.level),
    lines: total,
    level: level_for(total),
    pieces: state.pieces + 1,
    last_clear: lines.length,
    last_zones: cleared_zones.size,
    walls,
  };

  if (lines.length === 0) return spawn(next, rng);
  if (clear_ms > 0) return { ...next, clearing: { lines, ms: clear_ms } };
  return finish_clear(next, lines, rng);
}

export function hard_drop(state: GameState, rng: Rng, clear_ms = CLEAR_MS): GameState {
  if (!playable(state)) return state;
  const distance = drop_distance(state, state.active);
  const dropped = {
    ...state,
    active: { ...state.active, y: state.active.y + distance },
    score: state.score + distance * 2,
  };
  return lock(dropped, rng, clear_ms);
}

/** The held piece comes back on the wall of the piece it swaps with: the wall belongs to the turn, not the piece. */
export function hold(state: GameState, rng: Rng): GameState {
  if (!playable(state) || !state.can_hold) return state;
  const parked = { ...state, hold: state.active.piece, can_hold: false, active: null };
  return state.hold === null ? spawn(parked, rng) : enter(parked, { piece: state.hold, direction: state.active.direction });
}

export interface TickResult {
  state: GameState;
  carry: number;
}

export function tick(
  state: GameState,
  carry: number,
  elapsed: number,
  soft: boolean,
  rng: Rng,
  clear_ms = CLEAR_MS
): TickResult {
  if (state.status !== Status.PLAYING) return { state, carry: 0 };

  if (state.clearing) {
    const ms = state.clearing.ms - elapsed;
    if (ms > 0) return { state: { ...state, clearing: { ...state.clearing, ms } }, carry: 0 };
    return { state: finish_clear(state, state.clearing.lines, rng), carry: 0 };
  }
  if (!state.active) return { state, carry: 0 };

  const interval = soft ? Math.min(SOFT_DROP_MS, gravity_ms(state.level)) : gravity_ms(state.level);
  let total = carry + Math.max(0, elapsed);
  let next = state;
  for (let steps = 0; total >= interval && steps < state.size; steps++) {
    total -= interval;
    const moved = soft ? soft_drop(next) : gravity(next);
    if (moved === next) {
      total = 0;
      break;
    }
    next = moved;
  }

  const active = next.active!;
  if (!grounded(next, active)) return { state: next, carry: total };
  const lock_ms = active.lock_ms + elapsed;
  if (lock_ms >= LOCK_MS) return { state: lock(next, rng, clear_ms), carry: 0 };
  return { state: { ...next, active: { ...active, lock_ms } }, carry: 0 };
}

export function repeats(before: number, after: number, delay = DAS_MS, rate = ARR_MS): number {
  const count = (held: number) => (held < delay ? 0 : Math.floor((held - delay) / rate) + 1);
  return count(after) - count(before);
}

export function clear_name(lines: number, zones: number): string {
  const name = lines === 1 ? "One line" : `${lines} lines`;
  return zones > 1 ? `${name}, ${zones} walls` : name;
}

export const ALL_WALLS = 0b1111;

const count = z.number().int().nonnegative();
const best_entry = z.object({ score: count, lines: count });

export const best_schema = z.object({ cycle: best_entry, random: best_entry });
export type Best = z.infer<typeof best_schema>;

export const mode_schema = z.enum(Mode);

export function empty_best(): Best {
  return { cycle: { score: 0, lines: 0 }, random: { score: 0, lines: 0 } };
}

export function record_best(best: Best, game: Pick<GameState, "mode" | "score" | "lines">): Best {
  const entry = best[game.mode];
  return {
    ...best,
    [game.mode]: { score: Math.max(entry.score, game.score), lines: Math.max(entry.lines, game.lines) },
  };
}
