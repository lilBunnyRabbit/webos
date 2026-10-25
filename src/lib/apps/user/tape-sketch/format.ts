import { z } from "zod";
import { edge_count, UNITS, type Sketch } from "./model";

export const VERSION = 2;
export const EXTENSION = ".tapesketch";

const Id = z.string().min(1).max(64);
const Coordinate = z.number().finite();
const Length = z.number().positive().finite().nullable();
const Text = z.string().max(2000);

const PathV1 = z.object({ id: Id, points: z.array(Id).min(1), closed: z.boolean(), lengths: z.array(Length) });

const Common = {
  unit: z.enum(UNITS),
  points: z.array(z.object({ id: Id, x: Coordinate, y: Coordinate })),
  dims: z.array(z.object({ id: Id, a: Id, b: Id, length: Length, offset: Coordinate })),
  markers: z.array(z.object({ id: Id, point: Id, note: Text })),
  notes: z.array(z.object({ id: Id, x: Coordinate, y: Coordinate, text: Text })),
};

const SketchSchema = z.object({
  version: z.literal(VERSION),
  ...Common,
  paths: z.array(PathV1.extend({ height: Length })),
});

// Version 1 had boxes, a W × D × H symbol; the 3D view replaced them and they aren't carried over.
const SketchV1Schema = z.object({
  version: z.literal(1),
  ...Common,
  paths: z.array(PathV1),
  boxes: z.array(z.unknown()),
});

export interface Parsed {
  sketch: Sketch;
  dropped_boxes: number;
}

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

function invalid(error: z.ZodError): Error {
  const issue = error.issues[0];
  return new Error(`This isn't a valid Tape Sketch file: ${issue.path.join(".") || "root"} ${issue.message}`);
}

function read(json: unknown, version: unknown): Parsed {
  if (version === 1) {
    const result = SketchV1Schema.safeParse(json);
    if (!result.success) throw invalid(result.error);
    const { boxes, paths, ...rest } = result.data;
    return {
      sketch: { ...rest, version: VERSION, paths: paths.map((path) => ({ ...path, height: null })) },
      dropped_boxes: boxes.length,
    };
  }
  const result = SketchSchema.safeParse(json);
  if (!result.success) throw invalid(result.error);
  return { sketch: result.data, dropped_boxes: 0 };
}

export function parse_sketch(text: string): Parsed {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("This isn't a Tape Sketch file: it isn't JSON");
  }
  const version = (json as { version?: unknown } | null)?.version;
  if (typeof version === "number" && version > VERSION)
    throw new Error(`This file was made by a newer Tape Sketch (format ${version})`);
  const parsed = read(json, version);
  check_references(parsed.sketch);
  return parsed;
}

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;

export function serialize_sketch(sketch: Sketch): string {
  const clean: Sketch = {
    version: VERSION,
    unit: sketch.unit,
    points: sketch.points.map(({ id, x, y }) => ({ id, x: round(x, 1), y: round(y, 1) })),
    paths: sketch.paths.map(({ id, points, closed, lengths, height }) => ({ id, points, closed, lengths, height })),
    dims: sketch.dims.map(({ id, a, b, length, offset }) => ({ id, a, b, length, offset: round(offset, 1) })),
    markers: sketch.markers.map(({ id, point, note }) => ({ id, point, note })),
    notes: sketch.notes.map(({ id, x, y, text }) => ({ id, x: round(x, 1), y: round(y, 1), text })),
  };
  return `${JSON.stringify(clean, null, 2)}\n`;
}

export function is_sketch_name(name: string): boolean {
  return name.toLowerCase().endsWith(EXTENSION);
}

export function sketch_name_for(name: string, stem: string): string {
  return is_sketch_name(name) ? name : `${stem || "Untitled"}${EXTENSION}`;
}
