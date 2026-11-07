import { hash } from "$kit/games/play2d/seed";
import { ground_speed, ROLL_ASPHALT, ROLL_GRASS, type Plane } from "./plane";

export interface Span {
  x0: number;
  x1: number;
}

export interface Tree {
  x: number;
  height: number;
  r: number;
}

export interface Field {
  runway: Span;
  apron: Span;
  hangar: Span & { height: number };
  /** Where a flight starts and a crash puts you back: on the apron, facing the runway. */
  start: number;
  windsock: number;
  trees: Tree[];
  /** Stands along the apron left of the hangar: a level of the plane's track, random, the daily. */
  gates: Gate[];
}

export type GateId = number | "random" | "daily";

export interface Gate {
  id: GateId;
  x: number;
}

const GATES: GateId[] = [1, 2, 3, 4, 5, "random", "daily"];

/** The world is a loop this long: flying on brings the plane back to the home field from behind. */
export const WRAP = 8000;

/**
 * `x` in the home field's frame, the nearest copy: the plane's `x` grows without bound as it flies round, so the
 * camera never jumps at a seam, and everything tied to the field reads it through here.
 */
export function home_x(field: Field, x: number): number {
  const middle = (field.runway.x0 + field.runway.x1) / 2;
  return x - WRAP * Math.round((x - middle) / WRAP);
}

/** Metres to the near end of the runway the way the nose points, round the wrap; null over the runway. */
export function runway_ahead(field: Field, x: number, face: number): number | null {
  const at = home_x(field, x);
  if (at >= field.runway.x0 && at <= field.runway.x1) return null;
  const end = face > 0 ? field.runway.x0 : field.runway.x1;
  const distance = (end - at) * face;
  return distance - WRAP * Math.floor(distance / WRAP);
}

/** World offsets of the home field's copies within `x0`..`x1`, for drawing. */
export function field_copies(field: Field, x0: number, x1: number): number[] {
  const left = Math.min(field.apron.x0, ...field.trees.map((t) => t.x - t.r)) - 20;
  const right = Math.max(field.runway.x1, ...field.trees.map((t) => t.x + t.r)) + 20;
  const copies: number[] = [];
  for (let k = Math.ceil((x0 - right) / WRAP); k <= Math.floor((x1 - left) / WRAP); k++) copies.push(k * WRAP);
  return copies;
}

export function build_field(): Field {
  const trees: Tree[] = [];
  const grove = (from: number, to: number, seed: number) => {
    for (let x = from, i = 0; x < to; i++) {
      const h = hash(seed, i);
      trees.push({ x, height: 7 + (h % 9), r: 2.5 + ((h >> 4) % 3) });
      x += 9 + ((h >> 8) % 14);
    }
  };
  grove(-900, -560, 1);
  grove(2620, 2950, 2);
  return {
    runway: { x0: 0, x1: 2400 },
    apron: { x0: -470, x1: 0 },
    hangar: { x0: -160, x1: -118, height: 9 },
    start: -95,
    windsock: 340,
    trees,
    gates: GATES.map((id, i) => ({ id, x: -215 - i * 36 })),
  };
}

export function at_gate(field: Field, plane: Plane): Gate | null {
  if (!plane.main_on || Math.abs(ground_speed(plane)) > 1.5) return null;
  const at = home_x(field, plane.x);
  return field.gates.find((gate) => Math.abs(gate.x - at) < 7) ?? null;
}

export function surface_roll(field: Field, x: number): number {
  const at = home_x(field, x);
  return at >= field.apron.x0 && at <= field.runway.x1 ? ROLL_ASPHALT : ROLL_GRASS;
}

export function in_hangar(field: Field, plane: Plane): boolean {
  const at = home_x(field, plane.x);
  return plane.main_on && Math.abs(ground_speed(plane)) < 3 && at > field.hangar.x0 + 2 && at < field.hangar.x1 - 1;
}
