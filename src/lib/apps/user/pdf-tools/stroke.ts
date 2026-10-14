export interface Point {
  x: number;
  y: number;
}

export interface StrokePoint extends Point {
  t: number;
  // Only pens report real pressure; mouse and touch give null, and the width comes from speed instead.
  pressure: number | null;
}

export interface WidthPoint extends Point {
  w: number;
}

export interface StrokeOptions {
  min_width: number;
  max_width: number;
  smoothing: number;
  // Speed in units per ms at which a stroke reaches `min_width`.
  max_speed: number;
}

export const DEFAULT_STROKE: StrokeOptions = { min_width: 1.4, max_width: 5, smoothing: 0.45, max_speed: 2.2 };

export interface Signature {
  d: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const CAP_STEPS = 6;
const DOT_STEPS = 12;
const MIN_GAP = 0.4;

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function smooth_points(points: StrokePoint[], smoothing: number): StrokePoint[] {
  if (points.length < 3) return points;
  const keep = 1 - clamp(smoothing, 0, 0.95);
  const out: StrokePoint[] = [points[0]];
  let previous = points[0];
  for (const point of points.slice(1, -1)) {
    const next = { ...point, x: previous.x + (point.x - previous.x) * keep, y: previous.y + (point.y - previous.y) * keep };
    if (distance(next, out[out.length - 1]) < MIN_GAP) continue;
    out.push(next);
    previous = next;
  }
  out.push(points[points.length - 1]);
  return out;
}

export function stroke_widths(points: StrokePoint[], options: StrokeOptions): WidthPoint[] {
  const { min_width, max_width, max_speed } = options;
  const span = max_width - min_width;
  const pressured = points.length > 0 && points.every((point) => point.pressure !== null);
  let width = (min_width + max_width) / 2;
  return points.map((point, index) => {
    let target: number;
    if (pressured) {
      target = min_width + span * clamp(point.pressure ?? 0.5, 0, 1);
    } else if (index === 0) {
      target = width;
    } else {
      const previous = points[index - 1];
      const speed = distance(previous, point) / Math.max(1, point.t - previous.t);
      target = max_width - span * clamp(speed / max_speed, 0, 1);
    }
    width = index === 0 ? target : width + (target - width) * 0.35;
    return { x: point.x, y: point.y, w: width };
  });
}

function circle(center: WidthPoint, steps: number): Point[] {
  const radius = center.w / 2;
  return Array.from({ length: steps }, (_, index) => {
    const angle = (index / steps) * Math.PI * 2;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });
}

export function outline(points: WidthPoint[]): Point[] {
  if (points.length === 0) return [];
  const last = points[points.length - 1];
  if (points.length === 1 || points.every((point) => distance(point, points[0]) < MIN_GAP)) {
    return circle({ ...points[0], w: Math.max(...points.map((point) => point.w)) }, DOT_STEPS);
  }

  const tangents = points.map((point, index) => {
    const before = points[Math.max(0, index - 1)];
    const after = points[Math.min(points.length - 1, index + 1)];
    const length = distance(before, after) || 1;
    return { x: (after.x - before.x) / length, y: (after.y - before.y) / length };
  });
  const left: Point[] = [];
  const right: Point[] = [];
  points.forEach((point, index) => {
    const tangent = tangents[index];
    const radius = point.w / 2;
    left.push({ x: point.x - tangent.y * radius, y: point.y + tangent.x * radius });
    right.push({ x: point.x + tangent.y * radius, y: point.y - tangent.x * radius });
  });

  const cap = (center: WidthPoint, tangent: Point, sign: 1 | -1): Point[] => {
    const normal = { x: -tangent.y * sign, y: tangent.x * sign };
    const forward = { x: tangent.x * sign, y: tangent.y * sign };
    const radius = center.w / 2;
    return Array.from({ length: CAP_STEPS - 1 }, (_, index) => {
      const angle = ((index + 1) / CAP_STEPS) * Math.PI;
      return {
        x: center.x + (normal.x * Math.cos(angle) + forward.x * Math.sin(angle)) * radius,
        y: center.y + (normal.y * Math.cos(angle) + forward.y * Math.sin(angle)) * radius,
      };
    });
  };

  return [...left, ...cap(last, tangents[tangents.length - 1], 1), ...right.reverse(), ...cap(points[0], tangents[0], -1)];
}

export function signed_area(polygon: Point[]): number {
  let area = 0;
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

// Every outline winds the same way, so overlapping strokes add up under the nonzero fill rule instead of cancelling.
export function orient(polygon: Point[]): Point[] {
  return signed_area(polygon) < 0 ? [...polygon].reverse() : polygon;
}

function format(value: number): string {
  return String(Math.round(value * 100) / 100);
}

// Quadratic curves through the edge midpoints, with the vertices as control points: smooth, and every command is
// one pdf-lib's drawSvgPath understands.
export function polygon_path(polygon: Point[], offset: Point = { x: 0, y: 0 }): string {
  if (polygon.length < 3) return "";
  const at = (index: number) => polygon[index % polygon.length];
  const mid = (a: Point, b: Point) => `${format((a.x + b.x) / 2 - offset.x)} ${format((a.y + b.y) / 2 - offset.y)}`;
  const parts = [`M${mid(at(0), at(1))}`];
  for (let index = 1; index <= polygon.length; index++) {
    const control = at(index);
    parts.push(`Q${format(control.x - offset.x)} ${format(control.y - offset.y)} ${mid(control, at(index + 1))}`);
  }
  parts.push("Z");
  return parts.join("");
}

export function stroke_polygon(points: StrokePoint[], options: StrokeOptions = DEFAULT_STROKE): Point[] {
  return orient(outline(stroke_widths(smooth_points(points, options.smoothing), options)));
}

export function strokes_path(strokes: StrokePoint[][], options: StrokeOptions = DEFAULT_STROKE): string {
  return strokes
    .filter((stroke) => stroke.length)
    .map((stroke) => polygon_path(stroke_polygon(stroke, options)))
    .join("");
}

// Moved to the origin with tight bounds plus a hairline of padding, so the viewBox is the signature.
export function build_signature(strokes: StrokePoint[][], options: StrokeOptions = DEFAULT_STROKE, padding = 1): Signature | null {
  const polygons = strokes.filter((stroke) => stroke.length).map((stroke) => stroke_polygon(stroke, options));
  const all = polygons.flat();
  if (all.length === 0) return null;
  const min_x = Math.min(...all.map((point) => point.x));
  const min_y = Math.min(...all.map((point) => point.y));
  const max_x = Math.max(...all.map((point) => point.x));
  const max_y = Math.max(...all.map((point) => point.y));
  const offset = { x: min_x - padding, y: min_y - padding };
  return {
    d: polygons.map((polygon) => polygon_path(polygon, offset)).join(""),
    x: 0,
    y: 0,
    width: Math.ceil(max_x - min_x + padding * 2),
    height: Math.ceil(max_y - min_y + padding * 2),
  };
}

export function signature_svg(signature: Signature, color = "#000000"): string {
  const { x, y, width, height, d } = signature;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${width}" height="${height}"><path d="${d}" fill="${color}"/></svg>\n`;
}

export function parse_signature_svg(text: string): Signature | null {
  const view_box = /viewBox\s*=\s*["']([^"']+)["']/i.exec(text);
  const numbers = view_box?.[1].trim().split(/[\s,]+/).map(Number);
  if (!numbers || numbers.length !== 4 || numbers.some((value) => !Number.isFinite(value)) || numbers[2] <= 0 || numbers[3] <= 0) return null;
  const paths = [...text.matchAll(/<path\b[^>]*?\sd\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1].trim()).filter(Boolean);
  if (paths.length === 0) return null;
  const [x, y, width, height] = numbers;
  return { d: paths.join(" "), x, y, width, height };
}
