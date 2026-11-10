import { round_mm } from "$kit/components/length-pad/keys";
import type { View } from "$kit/utils/view";
import { place_labels, text_width, type LabelRequest, type Rect, type Segment } from "./labels";
import { axis_of, face_sides, line_length, point_map, type Axis, type Ink, type Vec3, type Wire } from "./model";
import { basis, projector, type Camera, type Orbit, type Projected } from "./projection";
import { format_length } from "./units";

export const LABEL_FONT = 12;
// Pixels per mm: a 50 m fence still fits a phone, a 5 mm part still fills a window.
export const MIN_ZOOM = 0.002;
export const MAX_ZOOM = 40;

export function clamp_zoom(scale: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale));
}

export function zoom_at(view: View, factor: number, sx: number, sy: number): View {
  const scale = clamp_zoom(view.scale * factor);
  const k = scale / view.scale;
  return { scale, offset_x: sx - (sx - view.offset_x) * k, offset_y: sy - (sy - view.offset_y) * k };
}
const LABEL_PAD_X = 4;
const LABEL_HEIGHT = 18;
// A label on a line shorter than this on screen would sit on top of its neighbours and say little.
export const MIN_LABELLED = 30;

export interface SceneLine {
  id: string;
  a: Projected;
  b: Projected;
  depth: number;
  color: Ink;
  axis: Axis | null;
}

export interface ScenePoint {
  id: string;
  at: Projected;
}

export interface SceneLabel {
  id: string;
  text: string;
  rect: Rect;
}

export interface SceneFace {
  id: string;
  points: Projected[];
  depth: number;
  color: Ink;
}

export type SceneItem =
  | { kind: "face"; id: string; face: SceneFace }
  | { kind: "line"; id: string; line: SceneLine }
  | { kind: "point"; id: string; point: ScenePoint };

export interface Scene {
  lines: SceneLine[];
  points: ScenePoint[];
  faces: SceneFace[];
  /** Back to front: nearer faces cover what's behind them. */
  order: SceneItem[];
  labels: SceneLabel[];
}

function point_rect(p: { x: number; y: number }, by = 5): Rect {
  return { x: p.x - by, y: p.y - by, w: by * 2, h: by * 2 };
}

const pair = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);

export function build_scene(
  wire: Wire,
  camera: Camera,
  all_labels = true,
  forced: ReadonlySet<string> = new Set()
): Scene {
  const to_screen = projector(camera).project;
  const points = point_map(wire);
  const screen = new Map(wire.points.map((point) => [point.id, to_screen(point)]));
  const faces: SceneFace[] = [];
  // A face's own sides and corners are drawn just after it, even where their middle sits behind the face's middle.
  const side_depth = new Map<string, number>();
  const corner_depth = new Map<string, number>();
  for (const face of wire.faces) {
    const corners = face.points.map((id) => screen.get(id));
    if (corners.some((corner) => !corner)) continue;
    const at = corners as Projected[];
    const depth = at.reduce((sum, corner) => sum + corner.depth, 0) / at.length;
    faces.push({ id: face.id, points: at, depth, color: face.color });
    for (const [a, b] of face_sides(face)) {
      side_depth.set(pair(a, b), Math.max(side_depth.get(pair(a, b)) ?? -Infinity, depth));
      corner_depth.set(a, Math.max(corner_depth.get(a) ?? -Infinity, depth));
    }
  }
  const lines: SceneLine[] = [];
  const line_depth = new Map<string, number>();
  for (const line of wire.lines) {
    const a = screen.get(line.a);
    const b = screen.get(line.b);
    if (!a || !b) continue;
    const depth = (a.depth + b.depth) / 2;
    line_depth.set(line.id, Math.max(depth, side_depth.get(pair(line.a, line.b)) ?? -Infinity));
    lines.push({ id: line.id, a, b, depth, color: line.color, axis: axis_of(points.get(line.a)!, points.get(line.b)!) });
  }
  lines.sort((p, q) => p.depth - q.depth);
  const scene_points = wire.points.map((point) => ({ id: point.id, at: screen.get(point.id)! }));
  scene_points.sort((p, q) => p.at.depth - q.at.depth);
  const order: (SceneItem & { depth: number; rank: number })[] = [
    ...faces.map((face) => ({ kind: "face" as const, id: face.id, face, depth: face.depth, rank: 0 })),
    ...lines.map((line) => ({ kind: "line" as const, id: line.id, line, depth: line_depth.get(line.id)!, rank: 1 })),
    ...scene_points.map((point) => ({
      kind: "point" as const,
      id: point.id,
      point,
      depth: Math.max(point.at.depth, corner_depth.get(point.id) ?? -Infinity),
      rank: 2,
    })),
  ];
  order.sort((p, q) => p.depth - q.depth || p.rank - q.rank);
  return {
    lines,
    points: scene_points,
    faces,
    order,
    labels: label_lines(wire, lines, scene_points, faces, forced, all_labels),
  };
}

function inside(polygon: readonly { x: number; y: number }[], p: { x: number; y: number }): boolean {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

function parts(wire: Wire): Map<string, string> {
  const parent = new Map(wire.points.map((point) => [point.id, point.id]));
  const root = (id: string): string => {
    let at = id;
    while (parent.get(at) !== at) at = parent.get(at)!;
    parent.set(id, at);
    return at;
  };
  for (const line of wire.lines) parent.set(root(line.a), root(line.b));
  return new Map(wire.points.map((point) => [point.id, root(point.id)]));
}

// Either way along the line gives one key, so a box's four uprights share theirs.
function direction_key(a: Vec3, b: Vec3, length: number): string {
  const d = [(b.x - a.x) / length, (b.y - a.y) / length, (b.z - a.z) / length];
  const sign = Math.sign(d.find((each) => Math.abs(each) > 1e-6) ?? 1);
  return d.map((each) => Math.round(each * sign * 1000) + 0).join(",");
}

/**
 * Within one connected part, parallel lines of the same length show their length once, so a box reads W × D × H.
 * Lines in `forced` (the selection, the line under the pointer) always show their own.
 */
function label_lines(
  wire: Wire,
  lines: readonly SceneLine[],
  points: readonly ScenePoint[],
  faces: readonly SceneFace[],
  forced: ReadonlySet<string>,
  all: boolean
): SceneLabel[] {
  const segments: Segment[] = lines.map((line) => ({ a: line.a, b: line.b }));
  let cx = 0;
  let cy = 0;
  for (const point of points) {
    cx += point.at.x / points.length;
    cy += point.at.y / points.length;
  }
  const map = point_map(wire);
  const sources = new Map(wire.lines.map((line) => [line.id, line]));
  const sides = new Map(wire.faces.map((face) => [face.id, new Set(face_sides(face).map(([a, b]) => pair(a, b)))]));
  const part = parts(wire);
  const text = new Map<string, string>();
  const requests: (LabelRequest & { span: number })[] = [];
  for (const line of [...lines].reverse()) {
    const span = Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y);
    const is_forced = forced.has(line.id);
    if ((!all || span < MIN_LABELLED) && !is_forced) continue;
    const source = sources.get(line.id)!;
    const middle = { x: (line.a.x + line.b.x) / 2, y: (line.a.y + line.b.y) / 2 };
    // A line behind a face isn't seen, so neither is its length.
    if (!is_forced && faces.some((face) => face.depth > line.depth && !sides.get(face.id)!.has(pair(source.a, source.b)) && inside(face.points, middle)))
      continue;
    const a = map.get(source.a)!;
    const b = map.get(source.b)!;
    const length = line_length(wire, source, map);
    const label = format_length(length, wire.unit);
    text.set(line.id, label);
    const normal = { x: (line.b.y - line.a.y) / span, y: -(line.b.x - line.a.x) / span };
    const outward = normal.x * (middle.x - cx) + normal.y * (middle.y - cy) >= 0 ? normal : { x: -normal.x, y: -normal.y };
    requests.push({
      id: line.id,
      anchor: middle,
      sides: [outward, { x: -outward.x, y: -outward.y }],
      width: text_width(label, LABEL_FONT) + LABEL_PAD_X * 2,
      height: LABEL_HEIGHT,
      span,
      forced: is_forced,
      group: is_forced ? undefined : `${part.get(source.a)}|${direction_key(a, b, length)}|${round_mm(length)}`,
    });
  }
  requests.sort((p, q) => Number(!!q.forced) - Number(!!p.forced) || q.span - p.span);
  const placed = place_labels(
    requests,
    segments,
    points.map((point) => point_rect(point.at))
  );
  return [...placed].map(([id, rect]) => ({ id, text: text.get(id)!, rect }));
}

export function projected_bounds(wire: Wire, orbit: Orbit, pivot: Vec3): Rect | null {
  if (!wire.points.length) return null;
  const b = basis(orbit);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const point of wire.points) {
    const d = { x: point.x - pivot.x, y: point.y - pivot.y, z: point.z - pivot.z };
    const x = b.x.x * d.x + b.x.y * d.y + b.x.z * d.z;
    const y = b.y.x * d.x + b.y.y * d.y + b.y.z * d.z;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function fitted_view(
  wire: Wire,
  orbit: Orbit,
  pivot: Vec3,
  width: number,
  height: number,
  margin: number,
  max_scale = Infinity
): View {
  const bounds = projected_bounds(wire, orbit, pivot);
  if (!bounds) return { scale: 0.5, offset_x: width / 2, offset_y: height / 2 };
  const fit = Math.min((width - margin * 2) / Math.max(bounds.w, 20), (height - margin * 2) / Math.max(bounds.h, 20));
  const scale = clamp_zoom(Math.min(fit, max_scale));
  return {
    scale,
    offset_x: width / 2 - (bounds.x + bounds.w / 2) * scale,
    offset_y: height / 2 - (bounds.y + bounds.h / 2) * scale,
  };
}
