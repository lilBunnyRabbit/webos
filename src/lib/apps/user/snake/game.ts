import { z } from "zod";
import { Direction } from "$lib/core/games/direction";

export { Direction };

export const Speed = { SLOW: "slow", NORMAL: "normal", FAST: "fast" } as const;
export type Speed = (typeof Speed)[keyof typeof Speed];

export const SPEEDS: readonly Speed[] = Object.values(Speed);

export const STEP_MS: Record<Speed, number> = { slow: 160, normal: 110, fast: 70 };

export const Status = { READY: "ready", PLAYING: "playing", PAUSED: "paused", OVER: "over", WON: "won" } as const;
export type Status = (typeof Status)[keyof typeof Status];

export const speed_schema = z.enum(Speed);
export const high_scores_schema = z.record(z.string(), z.number().int().nonnegative());

export type HighScores = z.infer<typeof high_scores_schema>;

export type Rng = () => number;

export interface Point {
  x: number;
  y: number;
}

export interface GameState {
  width: number;
  height: number;
  /** Head first. */
  snake: readonly Point[];
  direction: Direction;
  /** Turns waiting for the next steps, so two quick presses inside one step both count. */
  queue: readonly Direction[];
  food: Point | null;
  score: number;
  wrap: boolean;
  status: Status;
}

export const GRID = 20;
export const START_LENGTH = 3;
const MAX_QUEUE = 2;

const DELTA: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE: Record<Direction, Direction> = { up: "down", down: "up", left: "right", right: "left" };

export function mode_key(speed: Speed, wrap: boolean): string {
  return `${speed}-${wrap ? "wrap" : "walls"}`;
}

export function same_point(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

export function create_game(rng: Rng, wrap = false, width = GRID, height = GRID): GameState {
  const y = Math.floor(height / 2);
  const head_x = Math.floor(width / 2);
  const snake = Array.from({ length: START_LENGTH }, (_, i) => ({ x: head_x - i, y }));
  return {
    width,
    height,
    snake,
    direction: Direction.RIGHT,
    queue: [],
    food: spawn_food(snake, width, height, rng),
    score: 0,
    wrap,
    status: Status.READY,
  };
}

export function spawn_food(snake: readonly Point[], width: number, height: number, rng: Rng): Point | null {
  const taken = new Set(snake.map((p) => p.y * width + p.x));
  const free: number[] = [];
  for (let i = 0; i < width * height; i++) if (!taken.has(i)) free.push(i);
  if (free.length === 0) return null;
  const index = free[Math.min(free.length - 1, Math.floor(rng() * free.length))];
  return { x: index % width, y: Math.floor(index / width) };
}

/** Checked against the last queued turn, not the current heading, so two quick presses can never add up to a reversal. */
export function turn(state: GameState, direction: Direction): GameState {
  if (state.status === Status.OVER || state.status === Status.WON) return state;
  const last = state.queue.at(-1) ?? state.direction;
  if (direction === last || direction === OPPOSITE[last] || state.queue.length >= MAX_QUEUE) return state;
  return { ...state, queue: [...state.queue, direction] };
}

export function set_status(state: GameState, status: Status): GameState {
  return state.status === status ? state : { ...state, status };
}

export function step(state: GameState, rng: Rng): GameState {
  if (state.status !== Status.PLAYING) return state;

  const [next_direction, ...queue] = state.queue;
  const direction = next_direction ?? state.direction;
  const delta = DELTA[direction];
  const head = state.snake[0];
  let target = { x: head.x + delta.x, y: head.y + delta.y };

  const outside = target.x < 0 || target.y < 0 || target.x >= state.width || target.y >= state.height;
  if (outside) {
    if (!state.wrap) return { ...state, direction, queue, status: Status.OVER };
    target = { x: (target.x + state.width) % state.width, y: (target.y + state.height) % state.height };
  }

  const eats = state.food !== null && same_point(target, state.food);
  // Without growth the tail leaves its cell this step, so the head may move into it.
  const body = eats ? state.snake : state.snake.slice(0, -1);
  if (body.some((p) => same_point(p, target))) return { ...state, direction, queue, status: Status.OVER };

  const snake = [target, ...body];
  if (!eats) return { ...state, snake, direction, queue };

  const food = spawn_food(snake, state.width, state.height, rng);
  return {
    ...state,
    snake,
    direction,
    queue,
    food,
    score: state.score + 1,
    status: food === null ? Status.WON : state.status,
  };
}

/** Capped at `max_steps` so a long frame (a stalled tab, a debugger) doesn't replay seconds of game at once. */
export function fixed_steps(
  accumulator: number,
  elapsed: number,
  step_ms: number,
  max_steps = 5
): { steps: number; remainder: number } {
  const total = accumulator + Math.max(0, elapsed);
  const steps = Math.floor(total / step_ms);
  if (steps > max_steps) return { steps: max_steps, remainder: 0 };
  return { steps, remainder: total - steps * step_ms };
}
