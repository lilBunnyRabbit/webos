import type { Hazards } from "./flight";
import { ROLL_ASPHALT, ROLL_GRASS, type Env } from "./plane";
import { air_at, type Weather } from "./weather";

export const SurfaceKind = { ASPHALT: "asphalt", WET: "wet", GRASS: "grass", DIRT: "dirt", SAND: "sand", WATER: "water" } as const;
export type SurfaceKind = (typeof SurfaceKind)[keyof typeof SurfaceKind];

export const ObstacleKind = { TREES: "trees", HOUSE: "house", MAST: "mast", HEDGE: "hedge" } as const;
export type ObstacleKind = (typeof ObstacleKind)[keyof typeof ObstacleKind];

export interface Span {
  x0: number;
  x1: number;
}

export interface Surface extends Span {
  kind: SurfaceKind;
}

/** A runway or a landing strip: where a round starts on the ground and where a landing must stop. */
export interface Strip extends Span {
  kind: SurfaceKind;
}

/** Something solid standing on the ground from `x0` to `x1`, `top` metres tall: touching it ends the flight. */
export interface Obstacle extends Span {
  top: number;
  kind: ObstacleKind;
}

/**
 * A level's world, along one line that repeats every `wrap` metres: the ground as a polyline of (x, height) over
 * 0..wrap (it ends at the height it starts), what lies on it, and the weather.
 */
export interface Course {
  wrap: number;
  ground: readonly [number, number][];
  surfaces: readonly Surface[];
  obstacles: readonly Obstacle[];
  strips: readonly Strip[];
  weather: Weather;
}

const ROLL: Record<SurfaceKind, number> = {
  [SurfaceKind.ASPHALT]: ROLL_ASPHALT,
  [SurfaceKind.WET]: ROLL_ASPHALT,
  [SurfaceKind.GRASS]: ROLL_GRASS,
  [SurfaceKind.DIRT]: 0.04,
  [SurfaceKind.SAND]: 0.1,
  [SurfaceKind.WATER]: 0.3,
};

/** Brake grip on a surface: a wet runway halves it. */
const GRIP: Record<SurfaceKind, number> = {
  [SurfaceKind.ASPHALT]: 1,
  [SurfaceKind.WET]: 0.45,
  [SurfaceKind.GRASS]: 0.75,
  [SurfaceKind.DIRT]: 0.85,
  [SurfaceKind.SAND]: 0.7,
  [SurfaceKind.WATER]: 0.3,
};

/** Air flowing onto a slope rises with it: this share of the wind times the slope, fading out above the ground. */
const RIDGE_LIFT = 0.9;
const RIDGE_DEPTH = 250;

export function local(course: Course, x: number): number {
  return x - course.wrap * Math.floor(x / course.wrap);
}

export function ground_at(course: Course, x: number): number {
  const at = local(course, x);
  const g = course.ground;
  let lo = 0;
  let hi = g.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (g[mid][0] <= at) lo = mid;
    else hi = mid;
  }
  const [x0, h0] = g[lo];
  const [x1, h1] = g[hi];
  return x1 > x0 ? h0 + ((h1 - h0) * (at - x0)) / (x1 - x0) : h0;
}

function within(course: Course, x: number, span: Span): boolean {
  const at = local(course, x);
  return at >= span.x0 && at <= span.x1;
}

export function surface_at(course: Course, x: number): SurfaceKind {
  for (const s of course.surfaces) if (within(course, x, s)) return s.kind;
  return SurfaceKind.GRASS;
}

export function on_strip(course: Course, strip: Strip, x: number): boolean {
  return within(course, x, strip);
}

export function hazards(course: Course, stall_floor: number | undefined): Hazards {
  return {
    solid: (x, height) => {
      for (const o of course.obstacles) if (within(course, x, o) && height < ground_at(course, (o.x0 + o.x1) / 2) + o.top) return true;
      return false;
    },
    water: (x) => surface_at(course, x) === SurfaceKind.WATER,
    stall_floor,
  };
}

/** The air and ground under a plane at `x`, `agl` up, at `time`, with the wind lifted where it blows onto a slope. */
export function course_env(course: Course, x: number, agl: number, time: number): Env {
  const air = air_at(course.weather, x, agl, time, course.wrap);
  const slope = (ground_at(course, x + 40) - ground_at(course, x - 40)) / 80;
  const ridge = RIDGE_LIFT * air.wind * slope * Math.max(0, 1 - agl / RIDGE_DEPTH);
  const kind = surface_at(course, x);
  return { wind: air.wind, updraft: air.updraft + ridge, roll: ROLL[kind], grip: GRIP[kind], ground: (at) => ground_at(course, at) };
}

/** Metres along the facing to the strip's near end, round the wrap; null over it. */
export function strip_ahead(course: Course, strip: Strip, x: number, face: number): number | null {
  if (within(course, x, strip)) return null;
  const end = face > 0 ? strip.x0 : strip.x1;
  const distance = (end - local(course, x)) * face;
  return distance - course.wrap * Math.floor(distance / course.wrap);
}
