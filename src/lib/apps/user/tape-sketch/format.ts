import { z } from "zod";
import { MAX_SNAP_ANGLES, normalize_snap } from "./geometry";
import { edge_count, new_id, SNAP_45, UNITS, type Marker, type Sketch, type Unit } from "./model";
import { format_length } from "./units";

export const VERSION = 3;
export const EXTENSION = ".tapesketch";

const Id = z.string().min(1).max(64);
const Coordinate = z.number().finite();
const Length = z.number().positive().finite().nullable();
const MAX_TEXT = 2000;
const Text = z.string().max(MAX_TEXT);

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
  snap: z.array(z.number().finite()).min(1).max(MAX_SNAP_ANGLES),
  paths: z.array(PathV1.extend({ check: z.boolean() })),
});

// Version 2 had a height per path and a 3D view; each height becomes a note on the path's first corner.
const SketchV2Schema = z.object({
  version: z.literal(2),
  ...Common,
  paths: z.array(PathV1.extend({ height: Length })),
});

// Version 1 had boxes, a W × D × H symbol; they aren't carried over.
const SketchV1Schema = z.object({
  version: z.literal(1),
  ...Common,
  paths: z.array(PathV1),
  boxes: z.array(z.unknown()),
});

export interface Parsed {
  sketch: Sketch;
  dropped_boxes: number;
  moved_heights: number;
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

/** A marker on the corner already gets the height appended to its note, so one point never carries two notes. */
function heights_to_markers(
  markers: readonly Marker[],
  heights: readonly { point: string | undefined; height: number | null }[],
  unit: Unit
): Marker[] {
  const out = [...markers];
  for (const { point, height } of heights) {
    if (height === null || !point) continue;
    const note = `↑ ${format_length(height, unit)}`;
    const at = out.findIndex((marker) => marker.point === point);
    if (at < 0) out.push({ id: new_id(), point, note });
    else out[at] = { ...out[at], note: out[at].note ? `${out[at].note.slice(0, MAX_TEXT - note.length - 3)} · ${note}` : note };
  }
  return out;
}

function from_v2(data: z.infer<typeof SketchV2Schema>): { sketch: Sketch; moved_heights: number } {
  const { paths, markers, version: _, ...rest } = data;
  const heights = paths.map((path) => ({ point: path.points[0], height: path.height }));
  return {
    sketch: {
      ...rest,
      version: VERSION,
      snap: SNAP_45,
      paths: paths.map(({ height: _, ...path }) => ({ ...path, check: true })),
      markers: heights_to_markers(markers, heights, data.unit),
    },
    moved_heights: heights.filter((each) => each.height !== null).length,
  };
}

function read(json: unknown, version: unknown): Parsed {
  if (version === 1) {
    const result = SketchV1Schema.safeParse(json);
    if (!result.success) throw invalid(result.error);
    const { boxes, paths, ...rest } = result.data;
    const { sketch } = from_v2({ ...rest, version: 2, paths: paths.map((path) => ({ ...path, height: null })) });
    return { sketch, dropped_boxes: boxes.length, moved_heights: 0 };
  }
  if (version === 2) {
    const result = SketchV2Schema.safeParse(json);
    if (!result.success) throw invalid(result.error);
    return { ...from_v2(result.data), dropped_boxes: 0 };
  }
  const result = SketchSchema.safeParse(json);
  if (!result.success) throw invalid(result.error);
  return { sketch: { ...result.data, snap: normalize_snap(result.data.snap) }, dropped_boxes: 0, moved_heights: 0 };
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
    snap: sketch.snap,
    points: sketch.points.map(({ id, x, y }) => ({ id, x: round(x, 1), y: round(y, 1) })),
    paths: sketch.paths.map(({ id, points, closed, lengths, check }) => ({ id, points, closed, lengths, check })),
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
