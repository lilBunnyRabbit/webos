import { z } from "zod";
import { edge_count, UNITS, type Sketch } from "./model";

export const VERSION = 1;
export const EXTENSION = ".tapesketch";

const Id = z.string().min(1).max(64);
const Coordinate = z.number().finite();
const Length = z.number().positive().finite().nullable();
const Text = z.string().max(2000);

const SketchSchema = z.object({
  version: z.literal(VERSION),
  unit: z.enum(UNITS),
  points: z.array(z.object({ id: Id, x: Coordinate, y: Coordinate })),
  paths: z.array(z.object({ id: Id, points: z.array(Id).min(1), closed: z.boolean(), lengths: z.array(Length) })),
  dims: z.array(z.object({ id: Id, a: Id, b: Id, length: Length, offset: Coordinate })),
  markers: z.array(z.object({ id: Id, point: Id, note: Text })),
  notes: z.array(z.object({ id: Id, x: Coordinate, y: Coordinate, text: Text })),
  boxes: z.array(z.object({ id: Id, x: Coordinate, y: Coordinate, w: Length, d: Length, h: Length, note: Text })),
});

function check_references(sketch: Sketch): void {
  const points = new Set(sketch.points.map((point) => point.id));
  const missing = (id: string, where: string) => {
    if (!points.has(id))
      throw new Error(`This isn't a valid Tape Sketch file: ${where} points at a corner that doesn't exist`);
  };
  for (const path of sketch.paths) {
    path.points.forEach((id) => missing(id, `path ${path.id}`));
    if (path.closed && path.points.length < 3)
      throw new Error(`This isn't a valid Tape Sketch file: closed path ${path.id} has fewer than 3 corners`);
    if (path.lengths.length !== edge_count(path))
      throw new Error(
        `This isn't a valid Tape Sketch file: path ${path.id} has ${path.lengths.length} lengths for ${edge_count(path)} edges`
      );
  }
  for (const dim of sketch.dims) {
    missing(dim.a, `dimension ${dim.id}`);
    missing(dim.b, `dimension ${dim.id}`);
  }
  for (const marker of sketch.markers) missing(marker.point, `marker ${marker.id}`);
}

export function parse_sketch(text: string): Sketch {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("This isn't a Tape Sketch file: it isn't JSON");
  }
  const version = (json as { version?: unknown } | null)?.version;
  if (typeof version === "number" && version > VERSION)
    throw new Error(`This file was made by a newer Tape Sketch (format ${version})`);
  const result = SketchSchema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`This isn't a valid Tape Sketch file: ${issue.path.join(".") || "root"} ${issue.message}`);
  }
  const sketch: Sketch = result.data;
  check_references(sketch);
  return sketch;
}

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

export function serialize_sketch(sketch: Sketch): string {
  const clean: Sketch = {
    version: VERSION,
    unit: sketch.unit,
    points: sketch.points.map(({ id, x, y }) => ({ id, x: round(x, 1), y: round(y, 1) })),
    paths: sketch.paths.map(({ id, points, closed, lengths }) => ({ id, points, closed, lengths })),
    dims: sketch.dims.map(({ id, a, b, length, offset }) => ({ id, a, b, length, offset: round(offset, 1) })),
    markers: sketch.markers.map(({ id, point, note }) => ({ id, point, note })),
    notes: sketch.notes.map(({ id, x, y, text }) => ({ id, x: round(x, 1), y: round(y, 1), text })),
    boxes: sketch.boxes.map(({ id, x, y, w, d, h, note }) => ({ id, x: round(x, 1), y: round(y, 1), w, d, h, note })),
  };
  return `${JSON.stringify(clean, null, 2)}\n`;
}

export function is_sketch_name(name: string): boolean {
  return name.toLowerCase().endsWith(EXTENSION);
}

export function sketch_name_for(name: string, stem: string): string {
  return is_sketch_name(name) ? name : `${stem || "Untitled"}${EXTENSION}`;
}
