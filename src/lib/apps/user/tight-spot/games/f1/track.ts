import type { Bounds, Pose, Vec } from "../../core/geometry";
import { SolidKind, type Solid } from "../../core/scene";

export const DS = 1;
export const HALF_WIDTH = 7.5;
export const KERB = 1.5;
/** Grass from the track's edge to the wall, where nothing else is nearer, unless the track sets its own. */
export const RUNOFF = 15;
const WALL_THICKNESS = 1;
const KERB_CURVATURE = 1 / 220;
const KERB_SPREAD = 12;
/** The car's rear axle starts this far behind the line, so its nose sits a few metres short of it. */
export const GRID = 9;

export interface Straight {
  straight: number;
}

/** Positive degrees turn right (clockwise on screen). */
export interface Bend {
  radius: number;
  degrees: number;
}

export type Piece = Straight | Bend;

export interface TrackDef {
  id: string;
  name: string;
  /** The centreline heading east from the origin, in driving order; the turns add up to one right-hand lap. */
  pieces: readonly Piece[];
  /** How far along the pieces the start/finish line sits, on a straight long enough for the grid behind it. */
  line: number;
  /** At most `RUNOFF`. */
  runoff?: number;
}

export interface Track {
  id: string;
  name: string;
  length: number;
  centre: Vec[];
  normal: Vec[];
  heading: number[];
  /** Signed, per metre: positive turns right (clockwise on screen). */
  curvature: number[];
  kerb: boolean[];
  /** How far either side of the centreline the car may go before it's on the grass: the asphalt plus any kerb. */
  edge: number[];
  /** The wall's distance from the centreline on the left (−normal) and the right (+normal). */
  wall_left: number[];
  wall_right: number[];
  /** Collision: one rectangle per two metres of wall. */
  solids: Solid[];
  /** Drawing: each wall as one closed line down its middle, so a translucent stroke shows no seams. */
  walls: [Vec[], Vec[]];
  bounds: Bounds;
  start: Pose;
  sectors: [number, number];
}

const TRACE_STEP = 0.25;

export function trace(pieces: readonly Piece[]): { points: Vec[]; end: Pose } {
  const points: Vec[] = [];
  let pose: Pose = { x: 0, y: 0, heading: 0 };
  for (const piece of pieces) {
    const run = "straight" in piece ? piece.straight : (piece.radius * Math.abs(piece.degrees) * Math.PI) / 180;
    const steps = Math.max(1, Math.round(run / TRACE_STEP));
    const turn = "straight" in piece ? 0 : (piece.degrees * Math.PI) / 180 / steps;
    const chord = run / steps;
    for (let k = 0; k < steps; k++) {
      points.push({ x: pose.x, y: pose.y });
      const mid = pose.heading + turn / 2;
      pose = { x: pose.x + Math.cos(mid) * chord, y: pose.y + Math.sin(mid) * chord, heading: pose.heading + turn };
    }
  }
  return { points, end: pose };
}

// The pieces are laid by hand and rounded, so the end misses the start by a little: spread the miss over the lap.
function closed_path(pieces: readonly Piece[]): Vec[] {
  const { points, end } = trace(pieces);
  const n = points.length;
  return points.map((p, i) => ({ x: p.x - (end.x * i) / n, y: p.y - (end.y * i) / n }));
}

function resample(dense: Vec[], step: number): Vec[] {
  const n = dense.length;
  const cumulative = [0];
  for (let i = 1; i <= n; i++) {
    const a = dense[i - 1];
    const b = dense[i % n];
    cumulative.push(cumulative[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = cumulative[n];
  const count = Math.round(total / step);
  const out: Vec[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const s = (k * total) / count;
    while (cumulative[j + 1] < s) j++;
    const a = dense[j];
    const b = dense[(j + 1) % n];
    const t = (s - cumulative[j]) / Math.max(1e-9, cumulative[j + 1] - cumulative[j]);
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

export function curvature_of(a: Vec, b: Vec, c: Vec): number {
  const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  const ab = Math.hypot(b.x - a.x, b.y - a.y);
  const bc = Math.hypot(c.x - b.x, c.y - b.y);
  const ca = Math.hypot(a.x - c.x, a.y - c.y);
  return (2 * cross) / Math.max(1e-9, ab * bc * ca);
}

// A sample further than CELL from another can't pull its wall in: 0.85 |Δ|² / (2 Δ·n) ≥ 0.85 |Δ| / 2, past any wall's
// reach. So each sample only looks at the samples in its own cell and the eight round it.
const CELL = (2 * (HALF_WIDTH + RUNOFF)) / 0.85;

function grid_of(points: Vec[]): { near: (p: Vec) => number[] } {
  const cells = new Map<string, number[]>();
  const key = (cx: number, cy: number) => `${cx},${cy}`;
  points.forEach((p, i) => {
    const k = key(Math.floor(p.x / CELL), Math.floor(p.y / CELL));
    const cell = cells.get(k);
    if (cell) cell.push(i);
    else cells.set(k, [i]);
  });
  return {
    near(p) {
      const cx = Math.floor(p.x / CELL);
      const cy = Math.floor(p.y / CELL);
      const found: number[] = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) found.push(...(cells.get(key(cx + dx, cy + dy)) ?? []));
      return found;
    },
  };
}

// The wall goes as far out as the runoff, but never past the point where another part of the track is nearer: between
// two close straights it runs down the middle, inside a hairpin it closes in.
function wall_offsets(centre: Vec[], normal: Vec[], side: 1 | -1, runoff: number): number[] {
  const n = centre.length;
  const out: number[] = [];
  const floor = HALF_WIDTH + KERB + 0.5;
  const cells = grid_of(centre);
  for (let i = 0; i < n; i++) {
    let reach = HALF_WIDTH + runoff;
    const along = { x: normal[i].x * side, y: normal[i].y * side };
    for (const j of cells.near(centre[i])) {
      const gap = Math.abs(((j - i + n + n / 2) % n) - n / 2);
      if (gap * DS < 2) continue;
      const dx = centre[j].x - centre[i].x;
      const dy = centre[j].y - centre[i].y;
      const out_by = dx * along.x + dy * along.y;
      if (out_by <= 0) continue;
      const distance_sq = dx * dx + dy * dy;
      // A point d out along the normal is as far from sample j as from its own at d = |Δ|² / (2 Δ·n); 0.85 of that leaves a
      // strip of grass between two walls, and inside a bend a ring of wall instead of a point.
      const even = (0.85 * distance_sq) / (2 * out_by);
      if (even < reach) reach = even;
    }
    out.push(Math.max(floor, reach));
  }
  // A minimum over a window, then an average, so the wall bends smoothly where it closes in.
  const closed = out.map((_, i) => {
    let low = Infinity;
    for (let k = -6; k <= 6; k++) low = Math.min(low, out[(i + k + n) % n]);
    return low;
  });
  return closed.map((_, i) => {
    let sum = 0;
    for (let k = -6; k <= 6; k++) sum += closed[(i + k + n) % n];
    return sum / 13;
  });
}

function wall_solids(centre: Vec[], normal: Vec[], offsets: number[], side: 1 | -1): Solid[] {
  const n = centre.length;
  const at = (i: number): Vec => ({ x: centre[i].x + normal[i].x * offsets[i] * side, y: centre[i].y + normal[i].y * offsets[i] * side });
  const solids: Solid[] = [];
  for (let i = 0; i < n; i += 2) {
    const a = at(i);
    const b = at((i + 2) % n);
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 1e-6) continue;
    // Out from the track: the segment's own perpendicular, so each piece is a true rectangle whatever the bend.
    let ox = -(b.y - a.y) / length;
    let oy = (b.x - a.x) / length;
    if (ox * normal[i].x * side + oy * normal[i].y * side < 0) {
      ox = -ox;
      oy = -oy;
    }
    const t = WALL_THICKNESS;
    solids.push({
      kind: SolidKind.WALL,
      shape: [a, b, { x: b.x + ox * t, y: b.y + oy * t }, { x: a.x + ox * t, y: a.y + oy * t }],
    });
  }
  return solids;
}

export function build_track(def: TrackDef): Track {
  const laid = resample(closed_path(def.pieces), DS);
  const n = laid.length;
  const shift = Math.round(def.line / DS) % n;
  const centre = [...laid.slice(shift), ...laid.slice(0, shift)];
  const length = n * DS;
  const heading: number[] = [];
  const normal: Vec[] = [];
  const curvature: number[] = [];
  for (let i = 0; i < n; i++) {
    const prev = centre[(i - 1 + n) % n];
    const next = centre[(i + 1) % n];
    const angle = Math.atan2(next.y - prev.y, next.x - prev.x);
    heading.push(angle);
    normal.push({ x: -Math.sin(angle), y: Math.cos(angle) });
    curvature.push(curvature_of(centre[(i - 2 + n) % n], centre[i], centre[(i + 2) % n]));
  }
  const kerb = centre.map((_, i) => {
    for (let k = -KERB_SPREAD; k <= KERB_SPREAD; k++) if (Math.abs(curvature[(i + k + n) % n]) > KERB_CURVATURE) return true;
    return false;
  });
  const edge = kerb.map((on) => HALF_WIDTH + (on ? KERB : 0));
  const runoff = Math.min(RUNOFF, def.runoff ?? RUNOFF);
  const wall_left = wall_offsets(centre, normal, -1, runoff);
  const wall_right = wall_offsets(centre, normal, 1, runoff);
  const solids = [...wall_solids(centre, normal, wall_left, -1), ...wall_solids(centre, normal, wall_right, 1)];

  let bounds: Bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const solid of solids)
    for (const p of solid.shape)
      bounds = { x0: Math.min(bounds.x0, p.x), y0: Math.min(bounds.y0, p.y), x1: Math.max(bounds.x1, p.x), y1: Math.max(bounds.y1, p.y) };
  bounds = { x0: bounds.x0 - 4, y0: bounds.y0 - 4, x1: bounds.x1 + 4, y1: bounds.y1 + 4 };

  const wall_line = (offsets: number[], side: 1 | -1) =>
    centre.map((c, i) => ({
      x: c.x + normal[i].x * (offsets[i] + WALL_THICKNESS / 2) * side,
      y: c.y + normal[i].y * (offsets[i] + WALL_THICKNESS / 2) * side,
    }));

  const grid = n - Math.round(GRID / DS);
  return {
    id: def.id,
    name: def.name,
    length,
    centre,
    normal,
    heading,
    curvature,
    kerb,
    edge,
    wall_left,
    wall_right,
    solids,
    walls: [wall_line(wall_left, -1), wall_line(wall_right, 1)],
    bounds,
    start: { x: centre[grid].x, y: centre[grid].y, heading: heading[grid] },
    sectors: [Math.round(length / 3), Math.round((2 * length) / 3)],
  };
}

export interface Located {
  index: number;
  s: number;
  /** Signed distance off the centreline, positive to the right. */
  lateral: number;
}

const WINDOW = 24;

/** The nearest centreline point; with `hint` (the last index) only nearby segments are searched, so close parts of the track can't be confused. */
export function locate(track: Track, p: Vec, hint: number | null = null): Located {
  const n = track.centre.length;
  let best: Located = { index: 0, s: 0, lateral: 0 };
  let best_distance = Infinity;
  const from = hint === null ? 0 : hint - WINDOW;
  const to = hint === null ? n - 1 : hint + WINDOW;
  for (let k = from; k <= to; k++) {
    const i = ((k % n) + n) % n;
    const j = (i + 1) % n;
    const a = track.centre[i];
    const b = track.centre[j];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const span = dx * dx + dy * dy;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / Math.max(1e-9, span)));
    const qx = a.x + dx * t;
    const qy = a.y + dy * t;
    const distance = (p.x - qx) ** 2 + (p.y - qy) ** 2;
    if (distance < best_distance) {
      best_distance = distance;
      const length = Math.sqrt(span);
      const lateral = ((p.x - a.x) * -dy + (p.y - a.y) * dx) / Math.max(1e-9, length);
      best = { index: i, s: (i + t) * DS, lateral };
    }
  }
  return best;
}

/** How far forward from `from` to `to` along a loop of `length`: negative going backwards, at most half a lap either way. */
export function progress(from: number, to: number, length: number): number {
  return ((((to - from + length / 2) % length) + length) % length) - length / 2;
}

export function passes(from: number, delta: number, at: number, length: number): boolean {
  if (delta <= 0) return false;
  const ahead = (((at - from) % length) + length) % length;
  return ahead > 0 && ahead <= delta;
}
