import type { View } from "$kit/utils/view";
import { place_labels, text_width, type LabelRequest, type Rect, type Segment } from "./labels";
import { axis_of, line_length, point_map, type Axis, type Ink, type Vec3, type Wire } from "./model";
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

export interface Scene {
  lines: SceneLine[];
  points: ScenePoint[];
  labels: SceneLabel[];
}

function point_rect(p: { x: number; y: number }, by = 5): Rect {
  return { x: p.x - by, y: p.y - by, w: by * 2, h: by * 2 };
}

export function build_scene(wire: Wire, camera: Camera, labelled = true): Scene {
  const to_screen = projector(camera).project;
  const points = point_map(wire);
  const screen = new Map(wire.points.map((point) => [point.id, to_screen(point)]));
  const lines: SceneLine[] = [];
  for (const line of wire.lines) {
    const a = screen.get(line.a);
    const b = screen.get(line.b);
    if (!a || !b) continue;
    lines.push({
      id: line.id,
      a,
      b,
      depth: (a.depth + b.depth) / 2,
      color: line.color,
      axis: axis_of(points.get(line.a)!, points.get(line.b)!),
    });
  }
  lines.sort((p, q) => p.depth - q.depth);
  const scene_points = wire.points.map((point) => ({ id: point.id, at: screen.get(point.id)! }));
  scene_points.sort((p, q) => p.at.depth - q.at.depth);
  return { lines, points: scene_points, labels: labelled ? label_lines(wire, lines, scene_points) : [] };
}

function label_lines(wire: Wire, lines: readonly SceneLine[], points: readonly ScenePoint[]): SceneLabel[] {
  const segments: Segment[] = lines.map((line) => ({ a: line.a, b: line.b }));
  let cx = 0;
  let cy = 0;
  for (const point of points) {
    cx += point.at.x / points.length;
    cy += point.at.y / points.length;
  }
  const map = point_map(wire);
  const sources = new Map(wire.lines.map((line) => [line.id, line]));
  const text = new Map<string, string>();
  const requests: (LabelRequest & { span: number })[] = [];
  // Lines that cover each other on screen (a box seen square-on) would stack identical labels; one is enough.
  const shown = new Set<string>();
  const key = (p: { x: number; y: number }) => `${Math.round(p.x / 3)},${Math.round(p.y / 3)}`;
  for (const line of [...lines].reverse()) {
    const span = Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y);
    if (span < MIN_LABELLED) continue;
    const ends = [key(line.a), key(line.b)].sort().join(":");
    if (shown.has(ends)) continue;
    shown.add(ends);
    const source = sources.get(line.id)!;
    const label = format_length(line_length(wire, source, map), wire.unit);
    text.set(line.id, label);
    const normal = { x: (line.b.y - line.a.y) / span, y: -(line.b.x - line.a.x) / span };
    const mid = { x: (line.a.x + line.b.x) / 2, y: (line.a.y + line.b.y) / 2 };
    const outward = normal.x * (mid.x - cx) + normal.y * (mid.y - cy) >= 0 ? normal : { x: -normal.x, y: -normal.y };
    requests.push({
      id: line.id,
      anchor: mid,
      sides: [outward, { x: -outward.x, y: -outward.y }],
      width: text_width(label, LABEL_FONT) + LABEL_PAD_X * 2,
      height: LABEL_HEIGHT,
      span,
    });
  }
  requests.sort((p, q) => q.span - p.span);
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
