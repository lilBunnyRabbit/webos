export const Unit = { MM: "mm", CM: "cm", M: "m", IN: "in" } as const;
export type Unit = (typeof Unit)[keyof typeof Unit];
export const UNITS: Unit[] = [Unit.MM, Unit.CM, Unit.M, Unit.IN];

export interface Point {
  x: number;
  y: number;
}

export interface SketchPoint extends Point {
  id: string;
}

/** `lengths[i]` (mm) is the edge from `points[i]` to the next, wrapping on a closed path. `check` off: not a flat shape. */
export interface SketchPath {
  id: string;
  points: string[];
  closed: boolean;
  lengths: (number | null)[];
  check: boolean;
}

export interface Dim {
  id: string;
  a: string;
  b: string;
  length: number | null;
  offset: number;
}

export interface Marker {
  id: string;
  point: string;
  note: string;
}

export interface TextNote {
  id: string;
  x: number;
  y: number;
  text: string;
}

/** `snap`: the magnet's angles in degrees, counter-clockwise from right; each also stands for its opposite (+180°). */
export interface Sketch {
  version: 3;
  unit: Unit;
  snap: number[];
  points: SketchPoint[];
  paths: SketchPath[];
  dims: Dim[];
  markers: Marker[];
  notes: TextNote[];
}

export type Target = { kind: "edge"; path: string; index: number } | { kind: "dim"; id: string };

export const SNAP_45 = [0, 45, 90, 135];

export function create_sketch(unit: Unit = Unit.CM, snap: number[] = SNAP_45): Sketch {
  return { version: 3, unit, snap, points: [], paths: [], dims: [], markers: [], notes: [] };
}

export function new_id(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function edge_count(path: SketchPath): number {
  if (path.points.length < 2) return 0;
  return path.closed ? path.points.length : path.points.length - 1;
}

export function point_map(sketch: Sketch): Map<string, SketchPoint> {
  return new Map(sketch.points.map((point) => [point.id, point]));
}

export function same_target(a: Target | null, b: Target | null): boolean {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "edge" && b.kind === "edge") return a.path === b.path && a.index === b.index;
  if (a.kind === "dim" && b.kind === "dim") return a.id === b.id;
  return false;
}

export function is_empty(sketch: Sketch): boolean {
  return !sketch.points.length && !sketch.notes.length;
}
