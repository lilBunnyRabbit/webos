export const Unit = { MM: "mm", CM: "cm", M: "m" } as const;
export type Unit = (typeof Unit)[keyof typeof Unit];
export const UNITS: Unit[] = [Unit.MM, Unit.CM, Unit.M];

export const Axis = { X: "x", Y: "y", Z: "z" } as const;
export type Axis = (typeof Axis)[keyof typeof Axis];
export const AXES: Axis[] = [Axis.X, Axis.Y, Axis.Z];

export type Sign = 1 | -1;

export const LineColor = {
  PRIMARY: "primary",
  SECONDARY: "secondary",
  TERTIARY: "tertiary",
  ACCENT: "accent",
  INFO: "info",
  SUCCESS: "success",
  WARNING: "warning",
} as const;
export type LineColor = (typeof LineColor)[keyof typeof LineColor];
export const LINE_COLORS = Object.values(LineColor);

export type HexColor = `#${string}`;
export type Ink = LineColor | HexColor | null;

const HEX = /^#[0-9a-f]{6}$/i;
export const is_hex = (value: unknown): value is HexColor => typeof value === "string" && HEX.test(value);

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Millimetres. */
export interface WirePoint extends Vec3 {
  id: string;
}

export interface WireLine {
  id: string;
  a: string;
  b: string;
  color: Ink;
}

export interface Wire {
  version: 1;
  unit: Unit;
  points: WirePoint[];
  lines: WireLine[];
}

export function create_wire(unit: Unit = Unit.CM): Wire {
  return { version: 1, unit, points: [], lines: [] };
}

export function new_id(): string {
  return crypto.randomUUID();
}

export const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };

export function axis_vector(axis: Axis, sign: Sign = 1): Vec3 {
  return { x: axis === Axis.X ? sign : 0, y: axis === Axis.Y ? sign : 0, z: axis === Axis.Z ? sign : 0 };
}

export function add3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale3(a: Vec3, k: number): Vec3 {
  return { x: a.x * k, y: a.y * k, z: a.z * k };
}

export function length3(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

/** Two coordinates closer than this are the same point: typed lengths are rounded to 0.01 mm. */
export const SAME = 0.005;

export function same_place(a: Vec3, b: Vec3, tolerance = SAME): boolean {
  return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance && Math.abs(a.z - b.z) <= tolerance;
}

export function axis_of(a: Vec3, b: Vec3): Axis | null {
  const d = sub3(b, a);
  const off = AXES.filter((axis) => Math.abs(d[axis]) > SAME);
  return off.length === 1 ? off[0] : null;
}

export function point_map(wire: Wire): Map<string, WirePoint> {
  return new Map(wire.points.map((point) => [point.id, point]));
}

export function line_length(wire: Wire, line: WireLine, points = point_map(wire)): number {
  const a = points.get(line.a);
  const b = points.get(line.b);
  return a && b ? length3(sub3(b, a)) : 0;
}
