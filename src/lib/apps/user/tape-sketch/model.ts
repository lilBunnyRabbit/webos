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

/**
 * `lengths[i]` is the edge from `points[i]` to the next point, wrapping to the first on a closed path. In mm, as is
 * `height`: how far the path rises off the floor, a room's walls or a fence's boards.
 */
export interface SketchPath {
  id: string;
  points: string[];
  closed: boolean;
  lengths: (number | null)[];
  height: number | null;
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

export interface Sketch {
  version: 2;
  unit: Unit;
  points: SketchPoint[];
  paths: SketchPath[];
  dims: Dim[];
  markers: Marker[];
  notes: TextNote[];
}

export type Target =
  { kind: "edge"; path: string; index: number } | { kind: "dim"; id: string } | { kind: "height"; path: string };

export function create_sketch(unit: Unit = Unit.CM): Sketch {
  return { version: 2, unit, points: [], paths: [], dims: [], markers: [], notes: [] };
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
  if (a.kind === "height" && b.kind === "height") return a.path === b.path;
  return false;
}

export function is_empty(sketch: Sketch): boolean {
  return !sketch.points.length && !sketch.notes.length;
}
