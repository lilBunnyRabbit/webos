import { z } from "zod";
import { is_hex, LINE_COLORS, UNITS, type HexColor, type Wire, type WireFace, type WireLine, type WirePoint } from "./model";
import { round_mm } from "$kit/components/length-pad/keys";

export const VERSION = 2;
export const EXTENSION = ".wire";

const Id = z.string().min(1).max(64);
const Coordinate = z.number().finite();

const Color = z.union([z.enum(LINE_COLORS), z.custom<HexColor>(is_hex)]).nullable();

export const PointsSchema = z.array(z.object({ id: Id, x: Coordinate, y: Coordinate, z: Coordinate }));
export const LinesSchema = z.array(z.object({ id: Id, a: Id, b: Id, color: Color }));
export const FacesSchema = z.array(z.object({ id: Id, points: z.array(Id).min(3), color: Color }));

const WireSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  unit: z.enum(UNITS),
  points: PointsSchema,
  lines: LinesSchema,
  faces: FacesSchema.default([]),
});

const invalid = (why: string) => new Error(`This isn't a valid Wireframe file: ${why}`);

export interface Shape {
  points: WirePoint[];
  lines: WireLine[];
  faces: WireFace[];
}

export function check_references(wire: Shape): void {
  const points = new Set<string>();
  for (const point of wire.points) {
    if (points.has(point.id)) throw invalid(`point ${point.id} is listed twice`);
    points.add(point.id);
  }
  const lines = new Set<string>();
  for (const line of wire.lines) {
    if (lines.has(line.id)) throw invalid(`line ${line.id} is listed twice`);
    lines.add(line.id);
    if (!points.has(line.a) || !points.has(line.b))
      throw invalid(`line ${line.id} points at a corner that doesn't exist`);
    if (line.a === line.b) throw invalid(`line ${line.id} starts and ends on the same point`);
  }
  const faces = new Set<string>();
  for (const face of wire.faces) {
    if (faces.has(face.id)) throw invalid(`face ${face.id} is listed twice`);
    faces.add(face.id);
    if (!face.points.every((id) => points.has(id))) throw invalid(`face ${face.id} points at a corner that doesn't exist`);
    if (new Set(face.points).size !== face.points.length) throw invalid(`face ${face.id} goes through a corner twice`);
  }
}

export function parse_wire(text: string): Wire {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("This isn't a Wireframe file: it isn't JSON");
  }
  const version = (json as { version?: unknown } | null)?.version;
  if (typeof version === "number" && version > VERSION)
    throw new Error(`This file was made by a newer Wireframe (format ${version})`);
  const result = WireSchema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw invalid(`${issue.path.join(".") || "root"} ${issue.message}`);
  }
  const wire: Wire = { ...(result.data as Omit<Wire, "version">), version: VERSION };
  check_references(wire);
  return wire;
}

export function serialize_wire(wire: Wire): string {
  const clean: Wire = {
    version: VERSION,
    unit: wire.unit,
    points: wire.points.map(({ id, x, y, z }) => ({ id, x: round_mm(x), y: round_mm(y), z: round_mm(z) })),
    lines: wire.lines.map(({ id, a, b, color }) => ({ id, a, b, color })),
    faces: wire.faces.map(({ id, points, color }) => ({ id, points, color })),
  };
  return `${JSON.stringify(clean, null, 2)}\n`;
}

export function is_wire_name(name: string): boolean {
  return name.toLowerCase().endsWith(EXTENSION);
}

export function wire_name_for(name: string, stem: string): string {
  return is_wire_name(name) ? name : `${stem || "Untitled"}${EXTENSION}`;
}
