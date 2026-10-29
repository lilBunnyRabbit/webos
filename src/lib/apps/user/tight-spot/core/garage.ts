import type { Rng } from "$lib/core/utils/random";
import { lerp, rect, type Polygon, type Vec } from "./geometry";
import {
  Builder,
  chance,
  FLARE,
  lane,
  LANE_WALL as WALL,
  chevrons,
  draw_row,
  EDGE,
  level_sign,
  NORTH,
  place_car,
  row,
  SIZE,
  SOUTH,
  type Fit,
  type Layout,
  type Passage,
  type Row,
} from "./lot-layout";
import { MarkKind, SolidKind, SurfaceKind } from "./scene";
import { DriveKind, HATCHBACK, VAN, type VehicleSpec } from "./vehicle";

/** Cars and vans only: a trailer, a bus, a machine or anything that turns wider than the van stays above ground. */
export function under_headroom(spec: VehicleSpec): boolean {
  return (
    spec.hitches.length === 0 &&
    !spec.forks &&
    spec.drive.kind === DriveKind.ACKERMANN &&
    spec.length <= VAN.length &&
    spec.width <= VAN.width &&
    spec.turning_radius <= VAN.turning_radius
  );
}

const MOUTH = 0.5;
const MID = SIZE / 2;
// The ramp between the top two floors crosses here: halfway between floor −1's aisle and floor −2's, which mirror
// each other about the middle, so both floors keep the same reach of lane either side of it.
const CROSSING = MID;
const STEP = Math.PI / 12;

interface Sizes {
  depth: number;
  aisle: number;
  bay: number;
  lane: number;
  pillar: number;
  /** Lane kept clear past a mouth for the vehicle's front, on the floor it leaves and the floor it reaches. */
  reach: number;
  slack: number;
}

function sizes(d: number, fit: Fit): Sizes {
  return {
    depth: fit.depth,
    aisle: lerp(6.1, 4.4, d) * fit.turn,
    bay: lerp(2.7, 2.5, d) + fit.wider,
    lane: lerp(3.8, 3.1, d) + fit.wider,
    pillar: lerp(0.4, 0.5, d),
    reach: fit.length - fit.rear + 0.6,
    slack: lerp(0.6, 0.25, d),
  };
}

interface Helix {
  x: number;
  y: number;
  inner: number;
  outer: number;
  /** Half the square it's walled into. */
  half: number;
}

// The lane is the hatchback's swept ring at full lock, grown by the vehicle's turning circle and width, plus slack.
function helix_for(s: Sizes, fit: Fit, bottom: number): Helix {
  const turning = HATCHBACK.turning_radius * fit.turn;
  const axle = Math.sqrt(turning ** 2 - HATCHBACK.wheelbase ** 2) - HATCHBACK.track / 2;
  const half_width = (HATCHBACK.width + fit.wider) / 2;
  const front = fit.length - fit.rear;
  const inner = axle - half_width - s.slack;
  const outer = Math.hypot(axle * 1.15 + half_width, front) + s.slack;
  const half = outer + WALL;
  return { x: MID, y: bottom - half, inner, outer, half };
}

function polar(h: Helix, radius: number, angle: number): Vec {
  return { x: h.x + Math.cos(angle) * radius, y: h.y + Math.sin(angle) * radius };
}

function on_square(h: Helix, angle: number): Vec {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = h.half / Math.max(Math.abs(c), Math.abs(s));
  return { x: h.x + c * t, y: h.y + s * t };
}

const deg = (value: number) => (value * Math.PI) / 180;

/** Angles from east, clockwise on screen: 90° is the bottom, where it opens onto the aisle. */
const OPENING: [number, number] = [deg(45), deg(135)];

function arc_steps(from: number, to: number): number[] {
  const steps: number[] = [];
  for (let a = from; a < to - 1e-9; a += STEP) steps.push(a);
  return steps;
}

// Down is anticlockwise on screen: in along the aisle heading east, round the east side, through the top to the floor
// below, round its west side and out heading east again. The side a floor doesn't use is walled off.
function helix(b: Builder, h: Helix, closed: [number, number]) {
  for (const a of arc_steps(-Math.PI, Math.PI)) {
    b.ground(SurfaceKind.RAMP, [polar(h, h.inner, a), polar(h, h.outer, a), polar(h, h.outer, a + STEP), polar(h, h.inner, a + STEP)]);
  }
  const core: Vec[] = arc_steps(-Math.PI, Math.PI).map((a) => polar(h, h.inner, a));
  b.solid(SolidKind.WALL, core);
  for (const a of arc_steps(OPENING[1], OPENING[0] + 2 * Math.PI)) {
    b.solid(SolidKind.WALL, [polar(h, h.outer, a), on_square(h, a), on_square(h, a + STEP), polar(h, h.outer, a + STEP)]);
  }
  for (const a of arc_steps(closed[0], closed[1])) {
    b.solid(SolidKind.WALL, [polar(h, h.inner, a), polar(h, h.outer + 0.05, a), polar(h, h.outer + 0.05, a + STEP), polar(h, h.inner, a + STEP)]);
  }
  for (const a of arc_steps(-Math.PI, Math.PI)) {
    if (a >= closed[0] - 1e-9 && a < closed[1] - 1e-9) continue;
    const mid = (h.inner + h.outer) / 2;
    const tip = polar(h, mid, a - deg(6));
    const sweep = 0.7;
    b.line(polar(h, mid - sweep, a), tip, MarkKind.LINE);
    b.line(polar(h, mid + sweep, a), tip, MarkKind.LINE);
  }
}

function helix_mouth(h: Helix, way: 1 | -1): Polygon {
  const top = -Math.PI / 2;
  const span = MOUTH / h.inner;
  const a = way < 0 ? top - span : top;
  const z = way < 0 ? top : top + span;
  return [polar(h, h.inner, a), polar(h, h.outer, a), polar(h, h.outer, z), polar(h, h.inner, z)];
}

interface Floor {
  b: Builder;
  rows: { row: Row; facing: number }[];
}

function perimeter(b: Builder, gate: [number, number] | null) {
  b.block(SolidKind.WALL, 0, 0, SIZE, EDGE);
  b.block(SolidKind.WALL, 0, EDGE, EDGE, SIZE);
  b.block(SolidKind.WALL, SIZE - EDGE, EDGE, SIZE, SIZE);
  if (!gate) return b.block(SolidKind.WALL, EDGE, SIZE - EDGE, SIZE - EDGE, SIZE);
  b.block(SolidKind.WALL, EDGE, SIZE - EDGE, gate[0], SIZE);
  b.block(SolidKind.WALL, gate[1], SIZE - EDGE, SIZE - EDGE, SIZE);
}

/** Splits `[from, to]` round the gaps; pieces too narrow for a bay become wall from `y0` to `y1`. */
function segments(b: Builder, from: number, to: number, gaps: [number, number][], width: number, y0: number, y1: number): [number, number][] {
  const sorted = [...gaps].sort((p, q) => p[0] - q[0]);
  const pieces: [number, number][] = [];
  let at = from;
  for (const [lo, hi] of sorted) {
    if (lo > at) pieces.push([at, lo]);
    at = Math.max(at, hi);
  }
  if (to > at) pieces.push([at, to]);
  return pieces.filter(([lo, hi]) => {
    if (hi - lo >= width) return true;
    b.block(SolidKind.WALL, lo, Math.min(y0, y1), hi, Math.max(y0, y1));
    return false;
  });
}

export interface GarageOptions {
  floors: number;
  /** The floor (0 is the lot's own, −1) whose one free bay is the target; null for the open lot, every free bay a target. */
  target: number | null;
}

/**
 * Floor −1 is the lot, entered from the gate down a walled ramp; −2 and −3 are laid out in the same frame and placed
 * beside it by the world. A straight ramp along the west wall links −1 and −2; in a three-floor garage a helix in the
 * middle of −2 links it to −3, its stair core inside. −1 has its aisle north and −2, −3 theirs south, so each ramp
 * comes out straight into an aisle with parked cars right in front of it.
 */
export function garage(d: number, rng: Rng, fit: Fit, options: GarageOptions): Layout {
  const s = sizes(d, fit);
  const count = Math.max(2, Math.min(3, options.floors));
  const open = options.target === null;
  const a0 = EDGE + s.depth;
  const a1 = a0 + s.aisle;
  const s1 = a1 + s.depth;
  const b1 = SIZE - EDGE - s.depth;
  const b0 = b1 - s.aisle;
  const n0 = b0 - s.depth;
  const l0 = EDGE;
  const l1 = l0 + s.lane;
  const e0 = MID - s.lane / 2;
  const e1 = MID + s.lane / 2;
  const h = count > 2 ? helix_for(s, fit, b0) : null;
  const floors: Floor[] = Array.from({ length: count }, () => ({ b: new Builder(rng), rows: [] }));

  const top = floors[0];
  const t = top.b;
  t.ground(SurfaceKind.GARAGE, rect(EDGE, EDGE, SIZE - EDGE, SIZE - EDGE));
  perimeter(t, [e0 - WALL, e1 + WALL]);
  lane(t, e0, e1, a1, SIZE, { top: ["w", "e"] });
  lane(t, l0, l1, a1, CROSSING + s.reach, { top: ["e"] });
  t.block(SolidKind.WALL, l0 - WALL, CROSSING + s.reach, l1 + WALL, SIZE - EDGE);
  for (const [lo, hi] of [
    [EDGE, l0 - WALL],
    [l1 + WALL, e0 - WALL],
    [e1 + WALL, SIZE - EDGE],
  ] as const) {
    t.block(SolidKind.WALL, lo, s1, hi, SIZE - EDGE);
  }
  for (const [lo, hi] of [
    [l1 + WALL, l1 + WALL + FLARE],
    [e0 - WALL - FLARE, e0 - WALL],
    [e1 + WALL, e1 + WALL + FLARE],
  ] as const) {
    t.block(SolidKind.WALL, lo, a1 + FLARE, hi, s1);
  }
  level_sign(t, MID, SIZE - 1 - 1.5 - 0.6);
  chevrons(t, MID, s1 + 0.6, SIZE - 1 - 1.5 - 1.4, -1, Math.min(1.6, s.lane / 2 - 0.4));
  chevrons(t, (l0 + l1) / 2, a1 + 0.6, CROSSING - 0.4, 1, Math.min(1.6, s.lane / 2 - 0.4));
  t.headroom = [rect(e0 - WALL, SIZE - 0.95, e1 + WALL, SIZE - 0.65)];
  top.rows.push({ row: row(EDGE, SIZE - EDGE, s.bay, a0, EDGE, "centre"), facing: NORTH });
  for (const [lo, hi] of segments(t, EDGE, SIZE - EDGE, [[l0 - WALL, l1 + WALL + FLARE], [e0 - WALL - FLARE, e1 + WALL + FLARE]], s.bay, a1, s1)) {
    top.rows.push({ row: row(lo, hi, s.bay, a1, s1, lo < MID ? "end" : "start"), facing: SOUTH });
  }

  floors.slice(1).forEach((floor, i) => {
    const level = i + 1;
    const f = floor.b;
    f.ground(SurfaceKind.GARAGE, rect(EDGE, EDGE, SIZE - EDGE, SIZE - EDGE));
    perimeter(f, null);
    const gaps: [number, number][] = [];
    if (level === 1) {
      lane(f, l0, l1, CROSSING - s.reach, b0, { bottom: ["e"] });
      f.block(SolidKind.WALL, l0 - WALL, EDGE, l1 + WALL, CROSSING - s.reach);
      f.block(SolidKind.WALL, l1 + WALL, EDGE, l1 + WALL + FLARE, b0 - FLARE);
      chevrons(f, (l0 + l1) / 2, CROSSING + 0.4, b0 - 0.4, 1, Math.min(1.6, s.lane / 2 - 0.4));
      gaps.push([l0 - WALL, l1 + WALL + FLARE]);
    }
    if (h) {
      helix(f, h, level === 1 ? [OPENING[1], deg(200)] : [deg(-15), OPENING[0]]);
      gaps.push([h.x - h.half, h.x + h.half]);
      if (h.y - h.half > EDGE) f.block(SolidKind.WALL, h.x - h.half, EDGE, h.x + h.half, h.y - h.half);
    }
    for (const [lo, hi] of segments(f, EDGE, SIZE - EDGE, gaps, s.bay, EDGE, b0)) {
      // The open lot's van only gets into the row beside the ramp's foot by reversing, after a 20 s search a bay: a wall
      // there keeps every free bay below provable in a test's time.
      if (open) {
        f.block(SolidKind.WALL, lo, EDGE, hi, b0);
        continue;
      }
      f.block(SolidKind.WALL, lo, EDGE, hi, n0);
      floor.rows.push({ row: row(lo, hi, s.bay, b0, n0, lo < MID ? "end" : "start"), facing: NORTH });
    }
    floor.rows.push({ row: row(EDGE, SIZE - EDGE, s.bay, b1, SIZE - EDGE, "centre"), facing: SOUTH });
  });

  const passages: Passage[] = [
    { mouth: rect(l0, CROSSING, l1, CROSSING + MOUTH), heading: SOUTH, at: { x: l0, y: CROSSING }, from: 0, to: 1 },
    { mouth: rect(l0, CROSSING - MOUTH, l1, CROSSING), heading: NORTH, at: { x: l0, y: CROSSING }, from: 1, to: 0 },
  ];
  if (h) {
    const mid = (h.inner + h.outer) / 2;
    const at = (angle: number, heading: number) => ({ ...polar(h, mid, angle), heading });
    passages.push(
      { mouth: helix_mouth(h, -1), heading: Math.PI, at: { x: h.x, y: h.y }, from: 1, to: 2, lead: [at(Math.PI / 2, 0), at(0, -Math.PI / 2)] },
      { mouth: helix_mouth(h, 1), heading: 0, at: { x: h.x, y: h.y }, from: 2, to: 1, lead: [at(Math.PI / 2, Math.PI), at(Math.PI, -Math.PI / 2)] }
    );
  }

  const level = options.target ?? 0;
  // Below −1 the bay is the way the ramp sends you, east, so the round is the ramps and the turns, not a three-point turn.
  const from = level === 0 ? EDGE : level === 1 && !h ? l1 + WALL + FLARE + s.bay : MID;
  const target = open ? null : pick_target(floors[level], rng, from, [l0, l1], level === 0 ? [e0, e1] : null);
  floors.forEach((floor) => fill(floor, d, rng, open, s, target));

  const [first, ...rest] = floors.map((floor) => floor.b);
  first.floors = rest;
  first.passages = passages;
  return first;
}

interface Target {
  row: Row;
  index: number;
}

// Never at a row's end, never straight ahead of a ramp's end: down, a turn, then in between two parked cars.
function pick_target(floor: Floor, rng: Rng, from: number, west_lane: [number, number], entry: [number, number] | null): Target {
  const ahead = (x: number, width: number, [lo, hi]: [number, number]) => x < hi + 0.5 && x + width > lo - 0.5;
  const candidates = floor.rows.flatMap(({ row: r }) =>
    r.xs.flatMap((x, index) => {
      if (index === 0 || index === r.xs.length - 1 || x < from) return [];
      if (ahead(x, r.width, west_lane)) return [];
      if (entry && ahead(x, r.width, entry)) return [];
      return [{ row: r, index }];
    })
  );
  const pool = candidates.length > 0 ? candidates : floor.rows.flatMap(({ row: r }) => r.xs.map((_, index) => ({ row: r, index })));
  return pool[Math.floor(rng() * pool.length)];
}

function fill(floor: Floor, d: number, rng: Rng, open: boolean, s: Sizes, target: Target | null) {
  const b = floor.b;
  const taken = open ? 0.45 : lerp(0.8, 1, d);
  for (const { row: r, facing } of floor.rows) {
    draw_row(b, r);
    const north = facing === NORTH;
    const has_pillar = (boundary: number) => boundary > 0 && boundary < r.xs.length;
    for (let boundary = 1; boundary < r.xs.length; boundary++) {
      const x = r.xs[0] + boundary * r.width;
      const inset = lerp(1.1, 0.45, d) + s.pillar / 2;
      const y = r.front + (north ? -inset : inset);
      b.solid(SolidKind.PILLAR, rect(x - s.pillar / 2, y - s.pillar / 2, x + s.pillar / 2, y + s.pillar / 2));
    }
    r.xs.forEach((x, i) => {
      const shape = rect(x, Math.min(r.front, r.back), x + r.width, Math.max(r.front, r.back));
      const is_target = target !== null && target.row === r && target.index === i;
      const beside = target !== null && target.row === r && Math.abs(i - target.index) === 1;
      // In the open lot a row's end bay, in a corner against the wall, is always taken: no van could be proven into it.
      const end = open && (i === 0 || i === r.xs.length - 1);
      if (is_target || (!beside && !end && !chance(rng, taken))) {
        if (open || is_target) b.bay(shape, facing, true);
        return;
      }
      const heading = chance(rng, 0.6) ? facing : facing + Math.PI;
      const length = 3.9 + rng() * 0.9;
      const width = 1.72 + rng() * 0.13;
      const lo = x + width / 2 + 0.05 + (has_pillar(i) ? s.pillar / 2 : 0);
      const hi = x + r.width - width / 2 - 0.05 - (has_pillar(i + 1) ? s.pillar / 2 : 0);
      if (lo > hi) return;
      const centre = Math.max(lo, Math.min(hi, x + r.width / 2 + (rng() * 2 - 1) * 0.04));
      const depth = 0.25 + rng() * 0.3 + length / 2;
      place_car(b, centre, north ? r.back + depth : r.back - depth, heading, length, width, rng);
    });
  }
}
