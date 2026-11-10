import { z } from "zod";
import { is_hex, LINE_COLORS, UNITS, type HexColor, type Wire } from "./model";
import { round_mm } from "$kit/components/length-pad/keys";

export const VERSION = 1;
export const EXTENSION = ".wire";

const Id = z.string().min(1).max(64);
const Coordinate = z.number().finite();

const WireSchema = z.object({
  version: z.literal(VERSION),
  unit: z.enum(UNITS),
  points: z.array(z.object({ id: Id, x: Coordinate, y: Coordinate, z: Coordinate })),
  lines: z.array(
    z.object({
      id: Id,
      a: Id,
      b: Id,
      color: z.union([z.enum(LINE_COLORS), z.custom<HexColor>(is_hex)]).nullable(),
    })
  ),
});

const invalid = (why: string) => new Error(`This isn't a valid Wireframe file: ${why}`);

function check_references(wire: Wire): void {
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
  const wire = result.data as Wire;
  check_references(wire);
  return wire;
}

export function serialize_wire(wire: Wire): string {
  const clean: Wire = {
    version: VERSION,
    unit: wire.unit,
    points: wire.points.map(({ id, x, y, z }) => ({ id, x: round_mm(x), y: round_mm(y), z: round_mm(z) })),
    lines: wire.lines.map(({ id, a, b, color }) => ({ id, a, b, color })),
  };
  return `${JSON.stringify(clean, null, 2)}\n`;
}

export function is_wire_name(name: string): boolean {
  return name.toLowerCase().endsWith(EXTENSION);
}

export function wire_name_for(name: string, stem: string): string {
  return is_wire_name(name) ? name : `${stem || "Untitled"}${EXTENSION}`;
}
