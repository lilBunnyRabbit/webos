import type { View } from "$kit/utils/view";
import { AXES, axis_vector, sub3, type Axis, type Sign, type Vec3 } from "./model";

export interface Point {
  x: number;
  y: number;
}

/**
 * Radians. `yaw` turns the world about Z, `pitch` lifts the eye above the floor (π/2 looks straight down). `oblique`
 * blends the orthographic orbit toward the cavalier projection: 1 is cavalier, 0 a plain orbit.
 */
export interface Orbit {
  yaw: number;
  pitch: number;
  oblique: number;
}

export interface Camera {
  orbit: Orbit;
  pivot: Vec3;
  view: View;
}

export interface Basis {
  x: Vec3;
  y: Vec3;
}

const DEG = Math.PI / 180;
export const MIN_PITCH = -90 * DEG;
export const MAX_PITCH = 90 * DEG;
const ISO_PITCH = Math.asin(Math.tan(30 * DEG));
export const CAVALIER_ANGLE = 30 * DEG;

// What the owner's Inkscape sketches use: X across, Z up, Y at 30° and full length.
const CAVALIER: Basis = {
  x: { x: 1, y: Math.cos(CAVALIER_ANGLE), z: 0 },
  y: { x: 0, y: -Math.sin(CAVALIER_ANGLE), z: -1 },
};

export const ViewPreset = {
  CAVALIER: "cavalier",
  ISOMETRIC: "isometric",
  FRONT: "front",
  SIDE: "side",
  TOP: "top",
} as const;
export type ViewPreset = (typeof ViewPreset)[keyof typeof ViewPreset];

export const PRESETS: Record<ViewPreset, Orbit> = {
  [ViewPreset.CAVALIER]: { yaw: 30 * DEG, pitch: 20 * DEG, oblique: 1 },
  [ViewPreset.ISOMETRIC]: { yaw: 45 * DEG, pitch: ISO_PITCH, oblique: 0 },
  [ViewPreset.FRONT]: { yaw: 0, pitch: 0, oblique: 0 },
  [ViewPreset.SIDE]: { yaw: 90 * DEG, pitch: 0, oblique: 0 },
  [ViewPreset.TOP]: { yaw: 0, pitch: MAX_PITCH, oblique: 0 },
};

export const PRESET_LABELS: Record<ViewPreset, string> = {
  [ViewPreset.CAVALIER]: "Cavalier",
  [ViewPreset.ISOMETRIC]: "Isometric",
  [ViewPreset.FRONT]: "Front",
  [ViewPreset.SIDE]: "Side",
  [ViewPreset.TOP]: "Top",
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  z: lerp(a.z, b.z, t),
});
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

export function basis(orbit: Orbit): Basis {
  const cy = Math.cos(orbit.yaw);
  const sy = Math.sin(orbit.yaw);
  const cp = Math.cos(orbit.pitch);
  const sp = Math.sin(orbit.pitch);
  const ortho: Basis = { x: { x: cy, y: sy, z: 0 }, y: { x: sy * sp, y: -cy * sp, z: -cp } };
  if (orbit.oblique <= 0) return ortho;
  return { x: mix(ortho.x, CAVALIER.x, orbit.oblique), y: mix(ortho.y, CAVALIER.y, orbit.oblique) };
}

export function view_direction(b: Basis): Vec3 {
  const n = cross(b.x, b.y);
  const length = Math.hypot(n.x, n.y, n.z) || 1;
  return { x: n.x / length, y: n.y / length, z: n.z / length };
}

export interface Projected extends Point {
  /** Larger is nearer the viewer. */
  depth: number;
}

export interface Projector {
  basis: Basis;
  project: (p: Vec3) => Projected;
  direction: (v: Vec3) => Point;
}

export function projector(camera: Camera): Projector {
  const b = basis(camera.orbit);
  const away = view_direction(b);
  const { scale, offset_x, offset_y } = camera.view;
  return {
    basis: b,
    project(p) {
      const d = sub3(p, camera.pivot);
      return { x: offset_x + dot(b.x, d) * scale, y: offset_y + dot(b.y, d) * scale, depth: -dot(away, d) };
    },
    direction: (v) => ({ x: dot(b.x, v) * scale, y: dot(b.y, v) * scale }),
  };
}

export function repivot(camera: Camera, pivot: Vec3): Camera {
  const b = basis(camera.orbit);
  const d = sub3(pivot, camera.pivot);
  const { scale } = camera.view;
  return {
    ...camera,
    pivot,
    view: {
      ...camera.view,
      offset_x: camera.view.offset_x + dot(b.x, d) * scale,
      offset_y: camera.view.offset_y + dot(b.y, d) * scale,
    },
  };
}

const ORBIT_SPEED = 0.008;
// Orbiting out of cavalier fades the shear over this much drag instead of jumping to the plain orbit.
const OBLIQUE_FADE = 160;

export function clamp_pitch(pitch: number): number {
  return Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));
}

export function wrap(angle: number): number {
  const turn = Math.PI * 2;
  return ((((angle + Math.PI) % turn) + turn) % turn) - Math.PI;
}

export function orbit_by(orbit: Orbit, dx: number, dy: number): Orbit {
  return {
    yaw: wrap(orbit.yaw - dx * ORBIT_SPEED),
    pitch: clamp_pitch(orbit.pitch + dy * ORBIT_SPEED),
    oblique: Math.max(0, orbit.oblique - Math.hypot(dx, dy) / OBLIQUE_FADE),
  };
}

export function lerp_orbit(from: Orbit, to: Orbit, t: number): Orbit {
  return {
    yaw: wrap(from.yaw + wrap(to.yaw - from.yaw) * t),
    pitch: lerp(from.pitch, to.pitch, t),
    oblique: lerp(from.oblique, to.oblique, t),
  };
}

export function preset_of(orbit: Orbit): ViewPreset | null {
  for (const [preset, value] of Object.entries(PRESETS) as [ViewPreset, Orbit][]) {
    if (
      Math.abs(wrap(orbit.yaw - value.yaw)) < 1e-4 &&
      Math.abs(orbit.pitch - value.pitch) < 1e-4 &&
      Math.abs(orbit.oblique - value.oblique) < 1e-4
    )
      return preset;
  }
  return null;
}

export interface AxisDirection {
  axis: Axis;
  sign: Sign;
  at: Point;
  reach: number;
}

// An axis seen this nearly end-on is a dot: a stroke along it would be a guess, so it isn't offered.
const MIN_REACH = 0.2;
// Two directions closer than this on screen can't be told apart by a drag.
export const MIN_SEPARATION = 14 * DEG;

export function axis_directions(b: Basis): AxisDirection[] {
  const reaches = AXES.map((axis) => {
    const v = axis_vector(axis);
    return { axis, x: dot(b.x, v), y: dot(b.y, v) };
  });
  const longest = Math.max(...reaches.map((each) => Math.hypot(each.x, each.y)));
  const out: AxisDirection[] = [];
  for (const each of reaches) {
    const reach = Math.hypot(each.x, each.y);
    if (reach < longest * MIN_REACH) continue;
    for (const sign of [1, -1] as Sign[])
      out.push({ axis: each.axis, sign, at: { x: (each.x / reach) * sign, y: (each.y / reach) * sign }, reach });
  }
  return out;
}

function angle_between(a: Point, b: Point): number {
  return Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y)));
}

export function overlapping(directions: readonly AxisDirection[]): [Axis, Axis] | null {
  for (let i = 0; i < directions.length; i++)
    for (let j = i + 1; j < directions.length; j++) {
      const a = directions[i];
      const b = directions[j];
      if (a.axis !== b.axis && angle_between(a.at, b.at) < MIN_SEPARATION) return [a.axis, b.axis];
    }
  return null;
}

export function nearest_axis(directions: readonly AxisDirection[], toward: Point): AxisDirection | null {
  const length = Math.hypot(toward.x, toward.y);
  if (length < 1e-9) return null;
  const unit = { x: toward.x / length, y: toward.y / length };
  let best: AxisDirection | null = null;
  let best_angle = Infinity;
  for (const direction of directions) {
    const angle = angle_between(direction.at, unit);
    if (angle < best_angle) {
      best_angle = angle;
      best = direction;
    }
  }
  return best;
}

export function drag_length(direction: AxisDirection, drag: Point, scale: number): number {
  return (direction.at.x * drag.x + direction.at.y * drag.y) / (direction.reach * scale);
}

const NICE_STEPS = [1, 5, 10, 50, 100, 500, 1000, 5000];

export function round_drag(mm: number, reach: number, scale: number): number {
  const step = NICE_STEPS.find((each) => each * reach * scale >= 8) ?? NICE_STEPS.at(-1)!;
  return Math.max(step, Math.round(mm / step) * step);
}
