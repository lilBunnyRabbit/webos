import { to_screen, type View } from "$kit/utils/view";
import { add, distance, inside_polygon, midpoint, scale, segments, sub, unit } from "./geometry";
import { place_labels, text_width, type LabelRequest, type Line, type Rect } from "./labels";
import { BoxSide, point_map, same_target, type Box, type Point, type Sketch, type Target } from "./model";
import { format_length } from "./units";

export const LABEL_FONT = 13;
export const NOTE_FONT = 13;
const LABEL_PAD_X = 5;
const LABEL_HEIGHT = 20;
const ARROW = 7;
const R = Math.SQRT1_2;

export const BOX_BASE = 120;
const BOX_UNMEASURED = 0.6;
const BOX_MIN = 0.25;
const OBLIQUE = 0.5;

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

export interface SceneBox {
  id: string;
  faces: Point[][];
  visible: Line[];
  hidden: Line[];
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

export const LabelKind = { LENGTH: "length", MARKER: "marker", BOX_NOTE: "box-note" } as const;
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
  boxes: SceneBox[];
  points: ScenePoint[];
  markers: SceneMarker[];
  notes: SceneNote[];
  labels: SceneLabel[];
  bounds: Rect | null;
}

export function box_size(box: Box): { w: number; d: number; h: number } {
  const known = [box.w, box.d, box.h].filter((value): value is number => value !== null);
  const largest = Math.max(0, ...known);
  const part = (value: number | null) =>
    value === null || !largest ? BOX_UNMEASURED : Math.max(BOX_MIN, value / largest);
  return { w: BOX_BASE * part(box.w), d: BOX_BASE * part(box.d) * OBLIQUE, h: BOX_BASE * part(box.h) };
}

/** Front bottom left, front bottom right, front top right, front top left, then the same four at the back. */
export function box_corners(box: Box): Point[] {
  const { w, d, h } = box_size(box);
  const depth = { x: d * R, y: -d * R };
  const front = [
    { x: box.x, y: box.y },
    { x: box.x + w, y: box.y },
    { x: box.x + w, y: box.y - h },
    { x: box.x, y: box.y - h },
  ];
  return [...front, ...front.map((corner) => add(corner, depth))];
}

const BOX_VISIBLE: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [3, 7],
  [2, 6],
  [1, 5],
  [7, 6],
  [6, 5],
];
const BOX_HIDDEN: [number, number][] = [
  [0, 4],
  [4, 5],
  [4, 7],
];

function label_box(text: string): { width: number; height: number } {
  return { width: text_width(text, LABEL_FONT) + LABEL_PAD_X * 2, height: LABEL_HEIGHT };
}

function left_normal(a: Point, b: Point): Point {
  const d = unit(sub(b, a));
  return { x: d.y, y: -d.x };
}

const AROUND: Point[] = [
  { x: 0, y: -1 },
  { x: R, y: -R },
  { x: 1, y: 0 },
  { x: R, y: R },
  { x: 0, y: 1 },
  { x: -R, y: R },
  { x: -1, y: 0 },
  { x: -R, y: -R },
];

export function note_rect(at: Point, text: string): Rect {
  const lines = text.split("\n");
  const width = Math.max(...lines.map((line) => text_width(line, NOTE_FONT))) + 12;
  return { x: at.x, y: at.y, w: width, h: lines.length * NOTE_FONT * 1.35 + 10 };
}

function union(a: Rect | null, b: Rect): Rect {
  if (!a) return b;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

function point_rect(p: Point, by = 6): Rect {
  return { x: p.x - by, y: p.y - by, w: by * 2, h: by * 2 };
}

/** Everything the sketch draws, in screen pixels for `view`: lines keep their weight and labels their size at any zoom. */
export function build_scene(sketch: Sketch, view: View): Scene {
  const points = point_map(sketch);
  const screen = (p: Point) => to_screen(view, p.x, p.y);
  const lines: Line[] = [];
  const requests: LabelRequest[] = [];
  const meta = new Map<string, Omit<SceneLabel, "rect">>();
  const request = (label: Omit<SceneLabel, "rect">, anchor: Point, sides: Point[]) => {
    const { width, height } = label_box(label.text);
    requests.push({ id: label.id, anchor, sides, width, height });
    meta.set(label.id, label);
  };

  const edges: SceneEdge[] = [];
  for (const path of sketch.paths) {
    const parts = segments(path, points).map((segment) => ({ ...segment, a: screen(segment.a), b: screen(segment.b) }));
    const corners = path.points.map((id) => screen(points.get(id)!));
    const center = corners.reduce((sum, p) => add(sum, scale(p, 1 / corners.length)), { x: 0, y: 0 });
    for (const segment of parts) {
      const value = path.lengths[segment.index] ?? null;
      edges.push({ path: path.id, index: segment.index, a: segment.a, b: segment.b, measured: value !== null });
      lines.push({ a: segment.a, b: segment.b });
      const mid = midpoint(segment.a, segment.b);
      let normal = left_normal(segment.a, segment.b);
      const outward =
        path.closed && corners.length >= 3
          ? !inside_polygon(add(mid, scale(normal, 2)), corners)
          : normal.x * (mid.x - center.x) + normal.y * (mid.y - center.y) >= 0;
      if (!outward) normal = scale(normal, -1);
      request(
        {
          id: `edge:${path.id}:${segment.index}`,
          kind: LabelKind.LENGTH,
          text: format_length(value, sketch.unit),
          target: { kind: "edge", path: path.id, index: segment.index },
          owner: null,
          measured: value !== null,
        },
        mid,
        [normal, scale(normal, -1)]
      );
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
    const shift = scale(normal, dim.offset * view.scale);
    const a = add(sa, shift);
    const b = add(sb, shift);
    const side = dim.offset < 0 ? -1 : 1;
    const overshoot = scale(normal, side * 6);
    const extensions =
      Math.abs(dim.offset * view.scale) > 4
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
    dims.push({ id: dim.id, a, b, extensions, arrows, normal });
    lines.push({ a, b }, ...extensions);
    const outer = scale(normal, side);
    request(
      {
        id: `dim:${dim.id}`,
        kind: LabelKind.LENGTH,
        text: format_length(dim.length, sketch.unit),
        target: { kind: "dim", id: dim.id },
        owner: null,
        measured: dim.length !== null,
      },
      midpoint(a, b),
      [outer, scale(outer, -1)]
    );
  }

  const boxes: SceneBox[] = [];
  for (const box of sketch.boxes) {
    const corners = box_corners(box).map(screen);
    const visible = BOX_VISIBLE.map(([i, j]) => ({ a: corners[i], b: corners[j] }));
    const hidden = BOX_HIDDEN.map(([i, j]) => ({ a: corners[i], b: corners[j] }));
    const faces = [
      [corners[0], corners[1], corners[2], corners[3]],
      [corners[3], corners[2], corners[6], corners[7]],
      [corners[1], corners[5], corners[6], corners[2]],
    ];
    boxes.push({ id: box.id, faces, visible, hidden });
    lines.push(...visible, ...hidden);
    const sides: [BoxSide, Point, Point][] = [
      [BoxSide.W, midpoint(corners[0], corners[1]), { x: 0, y: 1 }],
      [BoxSide.D, midpoint(corners[1], corners[5]), { x: R, y: R }],
      [BoxSide.H, midpoint(corners[0], corners[3]), { x: -1, y: 0 }],
    ];
    for (const [side, anchor, normal] of sides) {
      const value = box[side];
      request(
        {
          id: `box:${box.id}:${side}`,
          kind: LabelKind.LENGTH,
          text: `${side.toUpperCase()} ${format_length(value, sketch.unit)}`,
          target: { kind: "box", id: box.id, side },
          owner: box.id,
          measured: value !== null,
        },
        anchor,
        [normal, scale(normal, -1)]
      );
    }
    if (box.note) {
      request(
        {
          id: `box-note:${box.id}`,
          kind: LabelKind.BOX_NOTE,
          text: box.note,
          target: null,
          owner: box.id,
          measured: true,
        },
        midpoint(corners[0], corners[1]),
        [
          { x: 0, y: 1 },
          { x: 0, y: -1 },
        ]
      );
    }
  }

  const markers: SceneMarker[] = [];
  for (const marker of sketch.markers) {
    const point = points.get(marker.point);
    if (!point) continue;
    const at = screen(point);
    markers.push({ id: marker.id, point: marker.point, at });
    if (marker.note) {
      request(
        {
          id: `marker:${marker.id}`,
          kind: LabelKind.MARKER,
          text: marker.note,
          target: null,
          owner: marker.id,
          measured: true,
        },
        at,
        AROUND
      );
    }
  }

  const notes: SceneNote[] = sketch.notes.map((note) => ({
    id: note.id,
    text: note.text,
    rect: note_rect(screen(note), note.text),
  }));
  const scene_points: ScenePoint[] = sketch.points.map((point) => ({ id: point.id, at: screen(point) }));
  const blocked = [...notes.map((note) => note.rect), ...scene_points.map((point) => point_rect(point.at))];

  const placed = place_labels(requests, lines, blocked);
  const labels: SceneLabel[] = requests.map((item) => ({ ...meta.get(item.id)!, rect: placed.get(item.id)! }));

  let bounds: Rect | null = null;
  for (const line of lines) bounds = union(union(bounds, point_rect(line.a, 0)), point_rect(line.b, 0));
  for (const point of scene_points) bounds = union(bounds, point_rect(point.at));
  for (const rect of [...labels.map((label) => label.rect), ...notes.map((note) => note.rect)])
    bounds = union(bounds, rect);

  return { edges, dims, boxes, points: scene_points, markers, notes, labels, bounds };
}

export function sketch_bounds(sketch: Sketch): Rect | null {
  let bounds: Rect | null = null;
  for (const point of sketch.points) bounds = union(bounds, point_rect(point, 0));
  for (const box of sketch.boxes) for (const corner of box_corners(box)) bounds = union(bounds, point_rect(corner, 0));
  for (const note of sketch.notes) bounds = union(bounds, point_rect(note, 0));
  return bounds;
}

export function label_center(scene: Scene, target: Target): Point | null {
  const label = scene.labels.find((each) => same_target(each.target, target));
  return label ? { x: label.rect.x + label.rect.w / 2, y: label.rect.y + label.rect.h / 2 } : null;
}
