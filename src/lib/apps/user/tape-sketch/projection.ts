import { distance_to_segment } from "./geometry";
import type { Point } from "./model";

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** Radians. `yaw` turns the floor about the vertical; `pitch` is the view's angle above the floor, π/2 straight down. */
export interface Orbit {
  yaw: number;
  pitch: number;
}

export interface Projected extends Point {
  /** Larger is nearer the viewer. */
  depth: number;
}

const DEG = Math.PI / 180;
export const MIN_PITCH = 4 * DEG;
export const MAX_PITCH = 90 * DEG;

export const ViewPreset = { THREE_QUARTER: "three-quarter", TOP: "top", FRONT: "front", SIDE: "side" } as const;
export type ViewPreset = (typeof ViewPreset)[keyof typeof ViewPreset];

export const PRESETS: Record<ViewPreset, Orbit> = {
  [ViewPreset.THREE_QUARTER]: { yaw: -30 * DEG, pitch: 32 * DEG },
  [ViewPreset.TOP]: { yaw: 0, pitch: MAX_PITCH },
  [ViewPreset.FRONT]: { yaw: 0, pitch: MIN_PITCH },
  [ViewPreset.SIDE]: { yaw: -90 * DEG, pitch: MIN_PITCH },
};

export function clamp_pitch(pitch: number): number {
  return Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));
}

/**
 * Orthographic. The floor is the sketch's own plane (x right, y down the page) and z rises off it. At yaw 0 straight
 * down the floor reads exactly as the 2D sketch; lowering the pitch tips the far side (small y) away and up the screen.
 */
export function project(orbit: Orbit, p: Point3): Projected {
  const cos_yaw = Math.cos(orbit.yaw);
  const sin_yaw = Math.sin(orbit.yaw);
  const x = p.x * cos_yaw - p.y * sin_yaw;
  const y = p.x * sin_yaw + p.y * cos_yaw;
  const sin_pitch = Math.sin(orbit.pitch);
  const cos_pitch = Math.cos(orbit.pitch);
  return { x, y: y * sin_pitch - p.z * cos_pitch, depth: y * cos_pitch + p.z * sin_pitch };
}

const ORBIT_SPEED = 0.008;

export function orbit_by(orbit: Orbit, dx: number, dy: number): Orbit {
  return { yaw: wrap(orbit.yaw - dx * ORBIT_SPEED), pitch: clamp_pitch(orbit.pitch + dy * ORBIT_SPEED) };
}

function wrap(angle: number): number {
  const turn = Math.PI * 2;
  return ((((angle + Math.PI) % turn) + turn) % turn) - Math.PI;
}

export function preset_of(orbit: Orbit): ViewPreset | null {
  for (const [preset, value] of Object.entries(PRESETS) as [ViewPreset, Orbit][]) {
    if (Math.abs(wrap(orbit.yaw - value.yaw)) < 1e-6 && Math.abs(orbit.pitch - value.pitch) < 1e-6) return preset;
  }
  return null;
}

export function back_to_front<T extends { depth: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.depth - b.depth);
}

export function mean_depth(points: readonly Projected[]): number {
  return points.reduce((sum, p) => sum + p.depth, 0) / Math.max(1, points.length);
}

export interface HitLine<T> {
  a: Point;
  b: Point;
  value: T;
}

// A line seen nearly end-on is a dot under the finger; it loses a near tie to a line the user can actually see.
const SHORT = 10;
const SHORT_PENALTY = 6;

export function nearest_line<T>(lines: readonly HitLine<T>[], p: Point, radius: number): T | null {
  let best: T | null = null;
  let best_score = Infinity;
  for (const line of lines) {
    const gap = distance_to_segment(p, line.a, line.b);
    if (gap > radius) continue;
    const short = Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y) < SHORT;
    const score = gap + (short ? SHORT_PENALTY : 0);
    if (score < best_score) {
      best_score = score;
      best = line.value;
    }
  }
  return best;
}
