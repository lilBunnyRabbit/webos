import { to_screen, type View } from "$kit/utils/view";
import { add, distance, inside_polygon, midpoint, scale, segments, sub, unit } from "./geometry";
import { place_labels, text_width, type LabelRequest, type Line, type Rect } from "./labels";
import { point_map, same_target, type Point, type Sketch, type Target } from "./model";
import { format_length } from "./units";

export const LABEL_FONT = 13;
export const NOTE_FONT = 13;
const LABEL_PAD_X = 5;
const LABEL_HEIGHT = 20;
const ARROW = 7;
const R = Math.SQRT1_2;

export interface SceneEdge {
  path: string;
  index: number;
  a: Point;
  b: Point;
  measured: boolean;
}

export interface SceneDim {
  id: string;
  a: Point;
  b: Point;
  extensions: Line[];
  arrows: Point[][];
  normal: Point;
}

export interface ScenePoint {
  id: string;
  at: Point;
}

export interface SceneMarker {
  id: string;
  point: string;
  at: Point;
}

export interface SceneNote {
  id: string;
  rect: Rect;
  text: string;
}

export const LabelKind = { LENGTH: "length", MARKER: "marker" } as const;
export type LabelKind = (typeof LabelKind)[keyof typeof LabelKind];

export interface SceneLabel {
  id: string;
  kind: LabelKind;
  text: string;
  rect: Rect;
  target: Target | null;
  owner: string | null;
  measured: boolean;
}

export interface Scene {
  edges: SceneEdge[];
  dims: SceneDim[];
  points: ScenePoint[];
  markers: SceneMarker[];
  notes: SceneNote[];
  labels: SceneLabel[];
  bounds: Rect | null;
}

export function height_text(height: number | null, unit: Sketch["unit"]): string {
  return `↑ ${format_length(height, unit)}`;
}

function left_normal(a: Point, b: Point): Point {
  const d = unit(sub(b, a));
  return { x: d.y, y: -d.x };
}

export function outward_normal(a: Point, b: Point, corners: readonly Point[], closed: boolean): Point {
  const mid = midpoint(a, b);
  const normal = left_normal(a, b);
  const center = corners.reduce((sum, p) => add(sum, scale(p, 1 / corners.length)), { x: 0, y: 0 });
  const outward =
    closed && corners.length >= 3
      ? !inside_polygon(add(mid, scale(normal, 2)), corners)
      : normal.x * (mid.x - center.x) + normal.y * (mid.y - center.y) >= 0;
  return outward ? normal : scale(normal, -1);
}

export const AROUND: Point[] = [
  { x: 0, y: -1 },
  { x: R, y: -R },
  { x: 1, y: 0 },
  { x: R, y: R },
  { x: 0, y: 1 },
  { x: -R, y: R },
  { x: -1, y: 0 },
  { x: -R, y: -R },
];

export function around_from(prefer: Point): Point[] {
  const start = AROUND.reduce(
    (best, side, i) =>
      side.x * prefer.x + side.y * prefer.y > AROUND[best].x * prefer.x + AROUND[best].y * prefer.y ? i : best,
    0
  );
  return [...AROUND.slice(start), ...AROUND.slice(0, start)];
}

export function note_rect(at: Point, text: string): Rect {
  const lines = text.split("\n");
  const width = Math.max(...lines.map((line) => text_width(line, NOTE_FONT))) + 12;
  return { x: at.x, y: at.y, w: width, h: lines.length * NOTE_FONT * 1.35 + 10 };
}

export function union(a: Rect | null, b: Rect): Rect {
  if (!a) return b;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function point_rect(p: Point, by = 6): Rect {
  return { x: p.x - by, y: p.y - by, w: by * 2, h: by * 2 };
}

export function dim_shape(id: string, sa: Point, sb: Point, normal: Point, shift: number): SceneDim {
  const a = add(sa, scale(normal, shift));
  const b = add(sb, scale(normal, shift));
  const side = shift < 0 ? -1 : 1;
  const overshoot = scale(normal, side * 6);
  const extensions =
    Math.abs(shift) > 4
      ? [
          { a: add(sa, scale(normal, side * 3)), b: add(a, overshoot) },
          { a: add(sb, scale(normal, side * 3)), b: add(b, overshoot) },
        ]
      : [];
  const along = unit(sub(b, a));
  const wing = scale(normal, ARROW * 0.45);
  const arrows = [
    [a, add(add(a, scale(along, ARROW)), wing), add(add(a, scale(along, ARROW)), scale(wing, -1))],
    [b, add(add(b, scale(along, -ARROW)), wing), add(add(b, scale(along, -ARROW)), scale(wing, -1))],
  ];
  return { id, a, b, extensions, arrows, normal: scale(normal, side) };
}

export class Labeller {
  readonly lines: Line[] = [];
  private readonly requests: LabelRequest[] = [];
  private readonly meta = new Map<string, Omit<SceneLabel, "rect">>();

  request(label: Omit<SceneLabel, "rect">, anchor: Point, sides: Point[]): void {
    const width = text_width(label.text, LABEL_FONT) + LABEL_PAD_X * 2;
    this.requests.push({ id: label.id, anchor, sides, width, height: LABEL_HEIGHT });
    this.meta.set(label.id, label);
  }

  place(blocked: readonly Rect[]): SceneLabel[] {
    const placed = place_labels(this.requests, this.lines, blocked);
    return this.requests.map((item) => ({ ...this.meta.get(item.id)!, rect: placed.get(item.id)! }));
  }
}

export function dim_label(id: string, length: number | null, unit: Sketch["unit"]): Omit<SceneLabel, "rect"> {
  return {
    id: `dim:${id}`,
    kind: LabelKind.LENGTH,
    text: format_length(length, unit),
    target: { kind: "dim", id },
    owner: null,
    measured: length !== null,
  };
}

export function marker_label(id: string, note: string): Omit<SceneLabel, "rect"> {
  return { id: `marker:${id}`, kind: LabelKind.MARKER, text: note, target: null, owner: id, measured: true };
}

export function edge_label(
  path: string,
  index: number,
  value: number | null,
  unit: Sketch["unit"]
): Omit<SceneLabel, "rect"> {
  return {
    id: `edge:${path}:${index}`,
    kind: LabelKind.LENGTH,
    text: format_length(value, unit),
    target: { kind: "edge", path, index },
    owner: null,
    measured: value !== null,
  };
}

export function height_label(path: string, height: number | null, unit: Sketch["unit"]): Omit<SceneLabel, "rect"> {
  return {
    id: `height:${path}`,
    kind: LabelKind.LENGTH,
    text: height_text(height, unit),
    target: { kind: "height", path },
    owner: null,
    measured: height !== null,
  };
}

export function bounds_of(lines: readonly Line[], rects: readonly Rect[]): Rect | null {
  let bounds: Rect | null = null;
  for (const line of lines) bounds = union(union(bounds, point_rect(line.a, 0)), point_rect(line.b, 0));
  for (const rect of rects) bounds = union(bounds, rect);
  return bounds;
}

/** Everything the sketch draws, in screen pixels for `view`: lines keep their weight and labels their size at any zoom. */
export function build_scene(sketch: Sketch, view: View): Scene {
  const points = point_map(sketch);
  const screen = (p: Point) => to_screen(view, p.x, p.y);
  const labeller = new Labeller();
  const lines = labeller.lines;

  const edges: SceneEdge[] = [];
  for (const path of sketch.paths) {
    const parts = segments(path, points).map((segment) => ({ ...segment, a: screen(segment.a), b: screen(segment.b) }));
    const corners = path.points.map((id) => screen(points.get(id)!));
    for (const segment of parts) {
      const value = path.lengths[segment.index] ?? null;
      edges.push({ path: path.id, index: segment.index, a: segment.a, b: segment.b, measured: value !== null });
      lines.push({ a: segment.a, b: segment.b });
      const normal = outward_normal(segment.a, segment.b, corners, path.closed);
      labeller.request(edge_label(path.id, segment.index, value, sketch.unit), midpoint(segment.a, segment.b), [
        normal,
        scale(normal, -1),
      ]);
    }
    if (parts.length) {
      const center = corners.reduce((sum, p) => add(sum, scale(p, 1 / corners.length)), { x: 0, y: 0 });
      const away = distance(corners[0], center) > 1e-6 ? unit(sub(corners[0], center)) : { x: 0, y: -1 };
      labeller.request(height_label(path.id, path.height, sketch.unit), corners[0], around_from(away));
    }
  }

  const dims: SceneDim[] = [];
  for (const dim of sketch.dims) {
    const pa = points.get(dim.a);
    const pb = points.get(dim.b);
    if (!pa || !pb) continue;
    const sa = screen(pa);
    const sb = screen(pb);
    const normal = distance(sa, sb) > 1e-6 ? left_normal(sa, sb) : { x: 0, y: -1 };
    const shape = dim_shape(dim.id, sa, sb, normal, dim.offset * view.scale);
    dims.push({ ...shape, normal });
    lines.push({ a: shape.a, b: shape.b }, ...shape.extensions);
    labeller.request(dim_label(dim.id, dim.length, sketch.unit), midpoint(shape.a, shape.b), [
      shape.normal,
      scale(shape.normal, -1),
    ]);
  }

  const markers: SceneMarker[] = [];
  for (const marker of sketch.markers) {
    const point = points.get(marker.point);
    if (!point) continue;
    const at = screen(point);
    markers.push({ id: marker.id, point: marker.point, at });
    if (marker.note) labeller.request(marker_label(marker.id, marker.note), at, AROUND);
  }

  const notes: SceneNote[] = sketch.notes.map((note) => ({
    id: note.id,
    text: note.text,
    rect: note_rect(screen(note), note.text),
  }));
  const scene_points: ScenePoint[] = sketch.points.map((point) => ({ id: point.id, at: screen(point) }));
  const labels = labeller.place([
    ...notes.map((note) => note.rect),
    ...scene_points.map((point) => point_rect(point.at)),
  ]);
  const bounds = bounds_of(lines, [
    ...scene_points.map((point) => point_rect(point.at)),
    ...labels.map((label) => label.rect),
    ...notes.map((note) => note.rect),
  ]);
  return { edges, dims, points: scene_points, markers, notes, labels, bounds };
}

export function sketch_bounds(sketch: Sketch): Rect | null {
  let bounds: Rect | null = null;
  for (const point of sketch.points) bounds = union(bounds, point_rect(point, 0));
  for (const note of sketch.notes) bounds = union(bounds, point_rect(note, 0));
  return bounds;
}

export function label_center(labels: readonly SceneLabel[], target: Target): Point | null {
  const label = labels.find((each) => same_target(each.target, target));
  return label ? { x: label.rect.x + label.rect.w / 2, y: label.rect.y + label.rect.h / 2 } : null;
}

// The numpad sheet rises from below, so the bottom keeps the most room clear.
export function into_view(at: Point, width: number, height: number): Point {
  const side = Math.min(56, width / 4);
  const top = Math.min(48, height / 4);
  const bottom = Math.min(150, height / 3);
  const x = at.x < side ? side - at.x : at.x > width - side ? width - side - at.x : 0;
  const y = at.y < top ? top - at.y : at.y > height - bottom ? height - bottom - at.y : 0;
  return { x, y };
}
