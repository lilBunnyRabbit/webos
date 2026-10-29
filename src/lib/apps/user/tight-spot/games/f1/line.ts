import type { Vec } from "../../core/geometry";
import { max_steer, steer_base } from "../../core/vehicle";
import { A_LAT, SPEC, top_speed } from "./grip";
import { curvature_of, DS, HALF_WIDTH, type Track } from "./track";

export const LINE_ROOM = HALF_WIDTH - SPEC.width / 2 - 0.3;
const ITERATIONS = 400;
const STRIDES = [16, 8, 4, 2, 1];
const RELAX = 1.7;

export interface RacingLine {
  points: Vec[];
  offset: number[];
  curvature: number[];
  speed: number[];
  /** Lap time from the line back to it at speed, milliseconds. */
  ms: number;
  /** Time from the line to each sector line on a flying lap. */
  splits: [number, number];
}

/**
 * The minimum-curvature line: each point slides along its normal, inside the track less the car, to where the bend
 * through its neighbours is least (the sum of squared second differences, by projected over-relaxation). Relaxation
 * only smooths what a few points see, so it runs coarse to fine: every 16th point first, then halving the stride.
 */
export function min_curvature(track: Track): number[] {
  const { centre, normal } = track;
  const n = centre.length;
  const offset = new Array<number>(n).fill(0);
  const px = centre.map((c) => c.x);
  const py = centre.map((c) => c.y);
  const place = (i: number, value: number) => {
    offset[i] = value;
    px[i] = centre[i].x + normal[i].x * value;
    py[i] = centre[i].y + normal[i].y * value;
  };
  for (const stride of STRIDES) {
    const count = Math.floor(n / stride);
    for (let iteration = 0; iteration < ITERATIONS; iteration++) {
      for (let k = 0; k < count; k++) {
        const i = k * stride;
        const a = ((k - 2 + count) % count) * stride;
        const b = ((k - 1 + count) % count) * stride;
        const c = ((k + 1) % count) * stride;
        const d = ((k + 2) % count) * stride;
        const tx = (4 * (px[b] + px[c]) - px[a] - px[d]) / 6;
        const ty = (4 * (py[b] + py[c]) - py[a] - py[d]) / 6;
        const want = (tx - centre[i].x) * normal[i].x + (ty - centre[i].y) * normal[i].y;
        place(i, Math.max(-LINE_ROOM, Math.min(LINE_ROOM, offset[i] + RELAX * (want - offset[i]))));
      }
    }
    for (let k = 0; k < count; k++) {
      const from = k * stride;
      const to = k + 1 < count ? (k + 1) * stride : n;
      for (let i = from + 1; i < to; i++) place(i, offset[from] + (offset[to % n] - offset[from]) * ((i - from) / (to - from)));
    }
  }
  return offset;
}

/**
 * The fastest the car takes the line: each point's speed is capped by the grip (A_LAT / curvature), then a pass forward
 * with the car's acceleration and one backward with its brakes, twice round so the lap joins up.
 */
export function speed_profile(points: Vec[], curvature: number[]): number[] {
  const n = points.length;
  const top = top_speed(SPEC);
  const ds = points.map((p, i) => Math.hypot(points[(i + 1) % n].x - p.x, points[(i + 1) % n].y - p.y));
  const cap = curvature.map((k) => Math.min(top, Math.sqrt(A_LAT / Math.max(1e-9, Math.abs(k)))));
  const forward = [...cap];
  let v = Math.min(...cap);
  for (let k = 0; k < n * 2; k++) {
    const i = k % n;
    const j = (i + 1) % n;
    const push = SPEC.accel * Math.max(0, 1 - v / SPEC.max_forward) - SPEC.rolling;
    v = Math.min(cap[j], Math.sqrt(Math.max(0, v * v + 2 * push * ds[i])));
    forward[j] = v;
  }
  const speed = [...forward];
  v = Math.min(...cap);
  const stop = SPEC.brake + SPEC.rolling;
  for (let k = n * 2; k > 0; k--) {
    const j = k % n;
    const i = (j - 1 + n) % n;
    v = Math.min(forward[i], Math.sqrt(v * v + 2 * stop * ds[i]));
    speed[i] = Math.min(speed[i], v);
  }
  return speed;
}

const lines = new WeakMap<Track, RacingLine>();

export function racing_line(track: Track): RacingLine {
  const found = lines.get(track);
  if (found) return found;
  const offset = min_curvature(track);
  const n = offset.length;
  const points = track.centre.map((c, i) => ({ x: c.x + track.normal[i].x * offset[i], y: c.y + track.normal[i].y * offset[i] }));
  const curvature = points.map((p, i) => curvature_of(points[(i - 2 + n) % n], p, points[(i + 2) % n]));
  const speed = speed_profile(points, curvature);
  const at = track.sectors.map((s) => Math.round(s / DS) % n);
  let ms = 0;
  const splits: number[] = [];
  for (let i = 0; i < n; i++) {
    if (at.includes(i)) splits.push(ms);
    const j = (i + 1) % n;
    const ds = Math.hypot(points[j].x - points[i].x, points[j].y - points[i].y);
    ms += (ds / ((speed[i] + speed[j]) / 2)) * 1000;
  }
  const line: RacingLine = { points, offset, curvature, speed, ms, splits: [splits[0], splits[1]] };
  lines.set(track, line);
  return line;
}

export function lock_curvature(): number {
  return Math.tan(max_steer(SPEC)) / steer_base(SPEC);
}
