import type { Vec } from "../../core/geometry";
import { collide, obstacles } from "../../core/obstacles";
import { body_centre, create_car, Gear, shift, step, type Car, type Input } from "../../core/vehicle";
import { record_frame, type Ghost } from "./ghost";
import { GRASS_SPEC, SPEC } from "./spec";
import { racing_line } from "./line";
import { locate, passes, progress, type Located, type Track } from "./track";
import { TRACK_IDS, track_of, type TrackId } from "./tracks";

export const Status = {
  READY: "ready",
  DRIVING: "driving",
  PAUSED: "paused",
  DONE: "done",
} as const;
export type Status = (typeof Status)[keyof typeof Status];

export const LAPS = 3;
/** Within this share of par a lap earns three stars, within `TWO_STARS` two; any clean lap one. */
export const THREE_STARS = 1.08;
export const TWO_STARS = 1.2;

export interface Round {
  track: TrackId;
  daily?: string;
}

export interface Lap {
  start_ms: number;
  splits: number[];
  clean: boolean;
  /** The ghost being recorded, appended to in place as the lap runs. */
  frames: number[];
}

export interface LapResult {
  ms: number;
  splits: number[];
  clean: boolean;
  frames: number[];
}

export interface GameState {
  round: Round;
  track: Track;
  car: Car;
  status: Status;
  ms: number;
  at: Located;
  /** Null before the car first crosses the line, and after the last lap. */
  lap: Lap | null;
  laps: LapResult[];
  grass: boolean;
  contact: { at: Vec; ms: number } | null;
}

export function create_game(round: Round): GameState {
  const track = track_of(round.track);
  const car = create_car(track.start, Gear.DRIVE, SPEC);
  return {
    round,
    track,
    car,
    status: Status.READY,
    ms: 0,
    at: locate(track, body_centre(car, SPEC)),
    lap: null,
    laps: [],
    grass: false,
    contact: null,
  };
}

export function set_status(state: GameState, status: Status): GameState {
  return state.status === status ? state : { ...state, status };
}

export function change_gear(state: GameState, gear: Gear): GameState {
  if (state.status !== Status.DRIVING) return state;
  const car = shift(state.car, gear, SPEC);
  return car === state.car ? state : { ...state, car };
}

// A wall is only worth testing once the car could reach one: the nearest wall at that point, less the car's half-diagonal.
function near_wall(track: Track, at: Located): boolean {
  const wall = at.lateral >= 0 ? track.wall_right[at.index] : track.wall_left[at.index];
  return Math.abs(at.lateral) + 4 >= wall;
}

function new_lap(start_ms: number): Lap {
  return { start_ms, splits: [], clean: true, frames: [] };
}

/**
 * One step. The core holds the wheel to the race spec's grip; on the grass the car drags. A wall stops
 * the car where it was and voids the lap; the laps run from the start/finish line through both sector lines in order.
 */
export function advance(state: GameState, input: Input, dt: number): GameState {
  if (state.status !== Status.DRIVING) return state;
  const { track } = state;
  const spec = state.grass ? GRASS_SPEC : SPEC;
  let car = step(state.car, input, dt, spec);
  const ms = state.ms + dt * 1000;
  let lap = state.lap;
  let contact = state.contact;
  let at = locate(track, body_centre(car, SPEC), state.at.index);
  if (near_wall(track, at)) {
    const hit = collide(car, obstacles(track), SPEC);
    if (hit) {
      car = { ...state.car, steer: car.steer, throttle: car.throttle, brake: car.brake, speed: 0 };
      at = state.at;
      contact = { at: hit.at, ms };
      if (lap?.clean) lap = { ...lap, clean: false };
    }
  }
  const grass = Math.abs(at.lateral) > track.edge[at.index];
  let laps = state.laps;
  let status: Status = state.status;
  const delta = progress(state.at.s, at.s, track.length);
  const crossed = (line: number) => passes(state.at.s, delta, line, track.length);
  // When in the step the line was passed, so a lap's time doesn't round to the step.
  const when = (line: number) => state.ms + dt * 1000 * ((((line - state.at.s) % track.length) + track.length) % track.length) / delta;
  if (!lap) {
    if (state.laps.length < LAPS && crossed(0)) lap = new_lap(when(0));
  } else {
    const next = lap.splits.length < 2 ? track.sectors[lap.splits.length] : 0;
    if (crossed(next)) {
      const t = when(next);
      if (lap.splits.length < 2) lap = { ...lap, splits: [...lap.splits, t - lap.start_ms] };
      else {
        laps = [...laps, { ms: t - lap.start_ms, splits: lap.splits, clean: lap.clean, frames: lap.frames }];
        if (laps.length >= LAPS) {
          lap = null;
          status = Status.DONE;
        } else lap = new_lap(t);
      }
    }
  }
  if (lap) record_frame(lap.frames, ms - lap.start_ms, car);
  return { ...state, car, ms, at, lap, laps, grass, contact, status };
}

export function par_ms(track: Track): number {
  return racing_line(track).ms;
}

export function lap_stars(lap: Pick<LapResult, "ms" | "clean">, par: number): 0 | 1 | 2 | 3 {
  if (!lap.clean) return 0;
  if (lap.ms <= par * THREE_STARS) return 3;
  if (lap.ms <= par * TWO_STARS) return 2;
  return 1;
}

export function best_lap(laps: readonly LapResult[]): LapResult | null {
  let best: LapResult | null = null;
  for (const lap of laps) if (lap.clean && (!best || lap.ms < best.ms)) best = lap;
  return best;
}

export function beats(ghost: Ghost | null, lap: LapResult): boolean {
  return lap.clean && lap.frames.length > 0 && (!ghost || lap.ms < ghost.ms);
}

export function to_ghost(lap: LapResult): Ghost {
  return { ms: Math.round(lap.ms), splits: lap.splits.map(Math.round), frames: lap.frames };
}

export function daily_track(seed: number): TrackId {
  return TRACK_IDS[seed % TRACK_IDS.length];
}

export function lap_time(state: Pick<GameState, "lap" | "ms">): number | null {
  return state.lap ? state.ms - state.lap.start_ms : null;
}

export function lap_text(ms: number): string {
  const hundredths = Math.max(0, Math.round(ms / 10));
  const minutes = Math.floor(hundredths / 6000);
  const seconds = (hundredths % 6000) / 100;
  return minutes > 0 ? `${minutes}:${seconds.toFixed(2).padStart(5, "0")}` : seconds.toFixed(2);
}

/** Negative is ahead of the best lap at that line. */
export function split_delta(split: number, best: number): number {
  return split - best;
}
