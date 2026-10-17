import { shuffle, type Rng } from "$lib/core/utils/random";
import { z } from "zod";

export type { Rng };

export const WIDTH = 10;
export const HEIGHT = 20;
/** Hidden rows above the field: pieces spawn here, and a piece locked entirely inside them ends the game. */
export const BUFFER = 2;
export const ROWS = HEIGHT + BUFFER;
export const NEXT_COUNT = 5;
export const LOCK_MS = 500;
export const MAX_LOCK_RESETS = 15;
export const CLEAR_MS = 240;
export const SOFT_DROP_MS = 33;
export const SPRINT_LINES = 40;
export const LINES_PER_LEVEL = 10;
export const MAX_LEVEL = 20;
export const DAS_MS = 160;
export const ARR_MS = 45;

export const Piece = { I: "i", O: "o", T: "t", S: "s", Z: "z", J: "j", L: "l" } as const;
export type Piece = (typeof Piece)[keyof typeof Piece];
export const PIECES: readonly Piece[] = Object.values(Piece);

export const Mode = { MARATHON: "marathon", SPRINT: "sprint" } as const;
export type Mode = (typeof Mode)[keyof typeof Mode];
export const MODES: readonly Mode[] = Object.values(Mode);

export const Status = { READY: "ready", PLAYING: "playing", PAUSED: "paused", OVER: "over", WON: "won" } as const;
export type Status = (typeof Status)[keyof typeof Status];

export type Rotation = 0 | 1 | 2 | 3;
export type Cell = Piece | null;

export interface Point {
  x: number;
  y: number;
}

export interface Active {
  piece: Piece;
  rotation: Rotation;
  x: number;
  y: number;
  lowest: number;
  resets: number;
  lock_ms: number;
}

export interface Clearing {
  rows: readonly number[];
  ms: number;
}

export interface GameState {
  mode: Mode;
  board: readonly Cell[];
  active: Active | null;
  hold: Piece | null;
  can_hold: boolean;
  queue: readonly Piece[];
  clearing: Clearing | null;
  score: number;
  lines: number;
  level: number;
  start_level: number;
  pieces: number;
  last_clear: number;
  status: Status;
}

const BASE: Record<Piece, readonly string[]> = {
  i: ["....", "####", "....", "...."],
  o: ["##", "##"],
  t: [".#.", "###", "..."],
  s: [".##", "##.", "..."],
  z: ["##.", ".##", "..."],
  j: ["#..", "###", "..."],
  l: ["..#", "###", "..."],
};

function rotations(piece: Piece): Point[][] {
  const rows = BASE[piece];
  const size = rows.length;
  const states: Point[][] = [rows.flatMap((row, y) => [...row].flatMap((char, x) => (char === "#" ? [{ x, y }] : [])))];
  for (let i = 1; i < 4; i++) states.push(states[i - 1].map(({ x, y }) => ({ x: size - 1 - y, y: x })));
  return states;
}

export const SHAPES: Record<Piece, readonly (readonly Point[])[]> = {
  i: rotations(Piece.I),
  o: rotations(Piece.O),
  t: rotations(Piece.T),
  s: rotations(Piece.S),
  z: rotations(Piece.Z),
  j: rotations(Piece.J),
  l: rotations(Piece.L),
};

type Kick = readonly [number, number];

const parse_kicks = (table: Record<string, string>): Record<string, readonly Kick[]> =>
  Object.fromEntries(
    Object.entries(table).map(([turn, list]) => [
      turn,
      list.split(" ").map((pair): Kick => {
        const [x, y] = pair.split(",").map(Number);
        return [x, y];
      }),
    ])
  );

// SRS tables as published, with y pointing up; `rotate` flips y for the board, whose rows grow downwards.
const JLSTZ_KICKS = parse_kicks({
  "0>1": "0,0 -1,0 -1,1 0,-2 -1,-2",
  "1>0": "0,0 1,0 1,-1 0,2 1,2",
  "1>2": "0,0 1,0 1,-1 0,2 1,2",
  "2>1": "0,0 -1,0 -1,1 0,-2 -1,-2",
  "2>3": "0,0 1,0 1,1 0,-2 1,-2",
  "3>2": "0,0 -1,0 -1,-1 0,2 -1,2",
  "3>0": "0,0 -1,0 -1,-1 0,2 -1,2",
  "0>3": "0,0 1,0 1,1 0,-2 1,-2",
});

const I_KICKS = parse_kicks({
  "0>1": "0,0 -2,0 1,0 -2,-1 1,2",
  "1>0": "0,0 2,0 -1,0 2,1 -1,-2",
  "1>2": "0,0 -1,0 2,0 -1,2 2,-1",
  "2>1": "0,0 1,0 -2,0 1,-2 -2,1",
  "2>3": "0,0 2,0 -1,0 2,1 -1,-2",
  "3>2": "0,0 -2,0 1,0 -2,-1 1,2",
  "3>0": "0,0 1,0 -2,0 1,-2 -2,1",
  "0>3": "0,0 -1,0 2,0 -1,2 2,-1",
});

const NO_KICKS: readonly Kick[] = [[0, 0]];

export function kicks(piece: Piece, from: Rotation, to: Rotation): readonly Kick[] {
  if (piece === Piece.O) return NO_KICKS;
  return (piece === Piece.I ? I_KICKS : JLSTZ_KICKS)[`${from}>${to}`] ?? NO_KICKS;
}

export const empty_board = (): Cell[] => Array<Cell>(ROWS * WIDTH).fill(null);

export function piece_cells(active: Pick<Active, "piece" | "rotation" | "x" | "y">): Point[] {
  return SHAPES[active.piece][active.rotation].map(({ x, y }) => ({ x: active.x + x, y: active.y + y }));
}

export function fits(board: readonly Cell[], piece: Piece, rotation: Rotation, x: number, y: number): boolean {
  for (const cell of SHAPES[piece][rotation]) {
    const bx = x + cell.x;
    const by = y + cell.y;
    if (bx < 0 || bx >= WIDTH || by < 0 || by >= ROWS) return false;
    if (board[by * WIDTH + bx] !== null) return false;
  }
  return true;
}

function grounded(board: readonly Cell[], active: Active): boolean {
  return !fits(board, active.piece, active.rotation, active.x, active.y + 1);
}

export function drop_distance(board: readonly Cell[], active: Active): number {
  let distance = 0;
  while (fits(board, active.piece, active.rotation, active.x, active.y + distance + 1)) distance++;
  return distance;
}

/** Appends whole shuffled bags, so every run of seven pieces holds each piece once. */
export function fill_queue(queue: readonly Piece[], rng: Rng, min = NEXT_COUNT + 1): Piece[] {
  const next = [...queue];
  while (next.length < min) next.push(...shuffle([...PIECES], rng));
  return next;
}

export function gravity_ms(level: number): number {
  return Math.max(1, 1000 * Math.pow(0.8 - (level - 1) * 0.007, level - 1));
}

const LINE_SCORES = [0, 100, 300, 500, 800];

export function line_score(rows: number, level: number): number {
  return (LINE_SCORES[rows] ?? 0) * level;
}

export function level_for(lines: number, start_level: number): number {
  return Math.min(MAX_LEVEL, start_level + Math.floor(lines / LINES_PER_LEVEL));
}

function playable(state: GameState): state is GameState & { active: Active } {
  return state.status === Status.PLAYING && state.active !== null && state.clearing === null;
}

function enter(state: GameState, piece: Piece): GameState {
  const x = piece === Piece.O ? 4 : 3;
  if (!fits(state.board, piece, 0, x, 0)) return { ...state, active: null, status: Status.OVER };
  const y = fits(state.board, piece, 0, x, 1) ? 1 : 0;
  return { ...state, active: { piece, rotation: 0, x, y, lowest: y, resets: 0, lock_ms: 0 } };
}

function spawn(state: GameState, rng: Rng): GameState {
  const [piece, ...rest] = state.queue;
  return enter({ ...state, queue: fill_queue(rest, rng) }, piece);
}

export interface GameOptions {
  mode?: Mode;
  start_level?: number;
}

export function create_game(rng: Rng, { mode = Mode.MARATHON, start_level = 1 }: GameOptions = {}): GameState {
  const level = Math.min(MAX_LEVEL, Math.max(1, Math.floor(start_level)));
  const state: GameState = {
    mode,
    board: empty_board(),
    active: null,
    hold: null,
    can_hold: true,
    queue: fill_queue([], rng),
    clearing: null,
    score: 0,
    lines: 0,
    level,
    start_level: level,
    pieces: 0,
    last_clear: 0,
    status: Status.READY,
  };
  return spawn(state, rng);
}

export function set_status(state: GameState, status: Status): GameState {
  return state.status === status ? state : { ...state, status };
}

// Guideline move reset: a new low restores the resets; a move while resting restarts the lock delay, at most MAX_LOCK_RESETS times, so a piece can't stall forever.
function settle(board: readonly Cell[], previous: Active, next: Active): Active {
  if (next.y > next.lowest) return { ...next, lowest: next.y, resets: 0, lock_ms: 0 };
  if (!grounded(board, previous)) return { ...next, lock_ms: 0 };
  if (next.resets >= MAX_LOCK_RESETS) return next;
  return { ...next, lock_ms: 0, resets: next.resets + 1 };
}

function shift(state: GameState, dx: number, dy: number): GameState {
  if (!playable(state)) return state;
  const active = state.active;
  if (!fits(state.board, active.piece, active.rotation, active.x + dx, active.y + dy)) return state;
  return { ...state, active: settle(state.board, active, { ...active, x: active.x + dx, y: active.y + dy }) };
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

export function rotate(state: GameState, direction: 1 | -1): GameState {
  if (!playable(state)) return state;
  const active = state.active;
  const to = ((active.rotation + direction + 4) % 4) as Rotation;
  for (const [kx, ky] of kicks(active.piece, active.rotation, to)) {
    const x = active.x + kx;
    const y = active.y - ky;
    if (fits(state.board, active.piece, to, x, y)) {
      return { ...state, active: settle(state.board, active, { ...active, rotation: to, x, y }) };
    }
  }
  return state;
}

export function full_rows(board: readonly Cell[]): number[] {
  const rows: number[] = [];
  for (let row = 0; row < ROWS; row++) {
    let full = true;
    for (let col = 0; col < WIDTH && full; col++) full = board[row * WIDTH + col] !== null;
    if (full) rows.push(row);
  }
  return rows;
}

export function collapse(board: readonly Cell[], rows: readonly number[]): Cell[] {
  const gone = new Set(rows);
  const kept: Cell[] = [];
  for (let row = 0; row < ROWS; row++) {
    if (!gone.has(row)) kept.push(...board.slice(row * WIDTH, (row + 1) * WIDTH));
  }
  return [...Array<Cell>(rows.length * WIDTH).fill(null), ...kept];
}

function finish_clear(state: GameState, rows: readonly number[], rng: Rng): GameState {
  const next = { ...state, board: collapse(state.board, rows), clearing: null };
  if (next.mode === Mode.SPRINT && next.lines >= SPRINT_LINES) return { ...next, status: Status.WON };
  return spawn(next, rng);
}

export function lock(state: GameState, rng: Rng, clear_ms = CLEAR_MS): GameState {
  if (state.status !== Status.PLAYING || !state.active) return state;
  const cells = piece_cells(state.active);
  const board = [...state.board];
  for (const { x, y } of cells) board[y * WIDTH + x] = state.active.piece;

  const rows = full_rows(board);
  const lines = state.lines + rows.length;
  const next: GameState = {
    ...state,
    board,
    active: null,
    can_hold: true,
    score: state.score + line_score(rows.length, state.level),
    lines,
    level: state.mode === Mode.MARATHON ? level_for(lines, state.start_level) : state.level,
    pieces: state.pieces + 1,
    last_clear: rows.length,
  };

  if (cells.every(({ y }) => y < BUFFER)) return { ...next, status: Status.OVER };
  if (rows.length === 0) return spawn(next, rng);
  if (clear_ms > 0) return { ...next, clearing: { rows, ms: clear_ms } };
  return finish_clear(next, rows, rng);
}

export function hard_drop(state: GameState, rng: Rng, clear_ms = CLEAR_MS): GameState {
  if (!playable(state)) return state;
  const distance = drop_distance(state.board, state.active);
  const dropped = {
    ...state,
    active: { ...state.active, y: state.active.y + distance },
    score: state.score + distance * 2,
  };
  return lock(dropped, rng, clear_ms);
}

export function hold(state: GameState, rng: Rng): GameState {
  if (!playable(state) || !state.can_hold) return state;
  const parked = { ...state, hold: state.active.piece, can_hold: false, active: null };
  return state.hold === null ? spawn(parked, rng) : enter(parked, state.hold);
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
    return { state: finish_clear(state, state.clearing.rows, rng), carry: 0 };
  }
  if (!state.active) return { state, carry: 0 };

  const interval = soft ? Math.min(SOFT_DROP_MS, gravity_ms(state.level)) : gravity_ms(state.level);
  let total = carry + Math.max(0, elapsed);
  let next = state;
  // Capped at a field's height, so high-level gravity drops straight to the floor in one frame without spinning.
  for (let steps = 0; total >= interval && steps < ROWS; steps++) {
    total -= interval;
    const moved = soft ? soft_drop(next) : gravity(next);
    if (moved === next) {
      total = 0;
      break;
    }
    next = moved;
  }

  const active = next.active!;
  if (!grounded(next.board, active)) return { state: next, carry: total };
  const lock_ms = active.lock_ms + elapsed;
  if (lock_ms >= LOCK_MS) return { state: lock(next, rng, clear_ms), carry: 0 };
  return { state: { ...next, active: { ...active, lock_ms } }, carry: 0 };
}

/** Extra moves a held key earns between `before` and `after` ms of holding: none until `delay`, then one per `rate`. */
export function repeats(before: number, after: number, delay = DAS_MS, rate = ARR_MS): number {
  const count = (held: number) => (held < delay ? 0 : Math.floor((held - delay) / rate) + 1);
  return count(after) - count(before);
}

export function clear_name(rows: number): string {
  return ["", "Single", "Double", "Triple", "Four lines"][rows] ?? "";
}

const count = z.number().int().nonnegative();

export const high_score_schema = z.object({ score: count, lines: count, level: count, day: z.string() });
export type HighScore = z.infer<typeof high_score_schema>;

export const stats_schema = z.object({
  marathon: z.object({ played: count, best_score: count, best_lines: count, best_level: count, total_lines: count }),
  sprint: z.object({ played: count, finished: count, best_ms: z.number().nonnegative().nullable() }),
  scores: z.array(high_score_schema),
});
export type Stats = z.infer<typeof stats_schema>;

export const mode_schema = z.enum(Mode);

export const HIGH_SCORES = 5;

export function empty_stats(): Stats {
  return {
    marathon: { played: 0, best_score: 0, best_lines: 0, best_level: 0, total_lines: 0 },
    sprint: { played: 0, finished: 0, best_ms: null },
    scores: [],
  };
}

export function record_marathon(stats: Stats, game: GameState, day: string): Stats {
  const marathon = stats.marathon;
  const scores = [...stats.scores, { score: game.score, lines: game.lines, level: game.level, day }]
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, HIGH_SCORES);
  return {
    ...stats,
    marathon: {
      played: marathon.played + 1,
      best_score: Math.max(marathon.best_score, game.score),
      best_lines: Math.max(marathon.best_lines, game.lines),
      best_level: Math.max(marathon.best_level, game.level),
      total_lines: marathon.total_lines + game.lines,
    },
    scores,
  };
}

export function record_sprint(stats: Stats, ms: number | null): Stats {
  const sprint = stats.sprint;
  return {
    ...stats,
    sprint: {
      played: sprint.played + 1,
      finished: sprint.finished + (ms === null ? 0 : 1),
      best_ms: ms === null ? sprint.best_ms : sprint.best_ms === null ? ms : Math.min(sprint.best_ms, ms),
    },
  };
}
