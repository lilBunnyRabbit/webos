import type { Rng } from "$lib/core/utils/random";
import { lerp, oriented_box, rect, type Polygon, type Pose, type Vec } from "./geometry";
import { HATCHBACK } from "./vehicle";
import { MarkKind, Scenario, SolidKind, SurfaceKind, type Bay, type Layout, type Mark, type Solid, type Surface } from "./kinds";

const SIZE = 32;
const EDGE = 1.5;
const GATE_LO = 12;
const GATE_HI = 20;
const DEPTH = 5;
const NORTH = -Math.PI / 2;
const SOUTH = Math.PI / 2;
const PAINTS = 5;

class Builder implements Layout {
  surfaces: Surface[] = [];
  solids: Solid[] = [];
  marks: Mark[] = [];
  bays: Bay[] = [];
  start?: Pose;

  constructor(private readonly rng: Rng) {}

  ground(kind: SurfaceKind, shape: Polygon) {
    this.surfaces.push({ kind, shape });
  }

  solid(kind: SolidKind, shape: Polygon) {
    this.solids.push({ kind, shape });
  }

  block(kind: SolidKind, x0: number, y0: number, x1: number, y1: number) {
    if (x1 - x0 > 1e-6 && y1 - y0 > 1e-6) this.solid(kind, rect(x0, y0, x1, y1));
  }

  line(a: Vec, b: Vec, kind: MarkKind = MarkKind.LINE) {
    this.marks.push({ kind, a, b });
  }

  bay(shape: Polygon, heading: number, either: boolean) {
    this.bays.push({ shape, heading, either });
  }

  car(x: number, y: number, heading: number, room = Infinity) {
    const length = Math.min(room, 3.9 + this.rng() * 0.9);
    const width = 1.72 + this.rng() * 0.13;
    const pose = { x, y, heading };
    const paint = Math.floor(this.rng() * PAINTS);
    this.solids.push({ kind: SolidKind.CAR, shape: oriented_box(x, y, heading, length, width), car: { pose, length, width, paint } });
    return { length, width };
  }

  perimeter(kind: SolidKind) {
    this.block(kind, 0, 0, SIZE, EDGE);
    this.block(kind, 0, EDGE, EDGE, SIZE);
    this.block(kind, SIZE - EDGE, EDGE, SIZE, SIZE);
    this.block(kind, EDGE, SIZE - EDGE, GATE_LO, SIZE);
    this.block(kind, GATE_HI, SIZE - EDGE, SIZE - EDGE, SIZE);
  }
}

function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}

function between(rng: Rng, lo: number, hi: number): number {
  return lo + rng() * (hi - lo);
}

function parallel(d: number, rng: Rng): Layout {
  const b = new Builder(rng);
  const lane = lerp(2.5, 2.3, d);
  const kerb = GATE_HI + lane;
  b.ground(SurfaceKind.ASPHALT, rect(GATE_LO, EDGE, kerb, SIZE));
  b.block(SolidKind.KERB, 0, 0, GATE_LO, SIZE);
  b.block(SolidKind.KERB, kerb, 0, SIZE, SIZE);
  b.block(SolidKind.KERB, GATE_LO, 0, kerb, EDGE);
  b.line({ x: 16, y: EDGE + 0.5 }, { x: 16, y: SIZE }, MarkKind.DASH);
  b.line({ x: GATE_HI, y: EDGE }, { x: GATE_HI, y: SIZE });

  const gap = HATCHBACK.length + lerp(2.4, 1.3, d);
  const centre = between(rng, 10.5, 22);
  const top = centre - gap / 2;
  const bottom = centre + gap / 2;
  const side_x = (width: number) => kerb - 0.18 - rng() * 0.12 - width / 2;
  for (let cursor = top; ; ) {
    const length = 3.9 + rng() * 0.9;
    if (cursor - length < EDGE + 0.3) break;
    const width = 1.72 + rng() * 0.13;
    place_car(b, side_x(width), cursor - length / 2, NORTH, length, width, rng);
    b.line({ x: GATE_HI, y: cursor - length - 0.1 }, { x: kerb, y: cursor - length - 0.1 });
    cursor -= length + between(rng, 0.6, 1.6);
  }
  for (let cursor = bottom; ; ) {
    const length = 3.9 + rng() * 0.9;
    if (cursor + length > SIZE - 0.3) break;
    const width = 1.72 + rng() * 0.13;
    place_car(b, side_x(width), cursor + length / 2, NORTH, length, width, rng);
    b.line({ x: GATE_HI, y: cursor + length + 0.1 }, { x: kerb, y: cursor + length + 0.1 });
    cursor += length + between(rng, 0.6, 1.6);
  }
  b.line({ x: GATE_HI, y: top }, { x: kerb, y: top });
  b.line({ x: GATE_HI, y: bottom }, { x: kerb, y: bottom });
  b.bay(rect(GATE_HI, top + 0.1, kerb, bottom - 0.1), NORTH, true);
  return b;
}

function place_car(b: Builder, x: number, y: number, heading: number, length: number, width: number, rng: Rng) {
  const paint = Math.floor(rng() * PAINTS);
  const pose = { x, y, heading };
  b.solids.push({ kind: SolidKind.CAR, shape: oriented_box(x, y, heading, length, width), car: { pose, length, width, paint } });
}

interface Row {
  xs: number[];
  width: number;
  front: number;
  back: number;
}

function row(from: number, to: number, width: number, front: number, back: number, align: "centre" | "start" | "end"): Row {
  const count = Math.floor((to - from) / width + 1e-9);
  const spare = to - from - count * width;
  const start = align === "centre" ? from + spare / 2 : align === "start" ? from : from + spare;
  return { xs: Array.from({ length: count }, (_, i) => start + i * width), width, front, back };
}

function draw_row(b: Builder, r: Row) {
  for (let i = 0; i <= r.xs.length; i++) {
    const x = i < r.xs.length ? r.xs[i] : r.xs[r.xs.length - 1] + r.width;
    b.line({ x, y: r.front }, { x, y: r.back });
  }
}

const RowsKind = { FORWARD: "forward", REVERSE: "reverse", PILLARS: "pillars" } as const;
type RowsKind = (typeof RowsKind)[keyof typeof RowsKind];

function rows(d: number, rng: Rng, open: boolean, kind: RowsKind): Layout {
  const b = new Builder(rng);
  const indoor = kind === RowsKind.PILLARS;
  const aisle = kind === RowsKind.FORWARD ? lerp(7, 5.8, d) : kind === RowsKind.REVERSE ? lerp(6.6, 5.4, d) : lerp(6.8, 5.8, d);
  const width = lerp(2.7, 2.35, d);
  const north_front = EDGE + DEPTH;
  const south_front = north_front + aisle;
  const south_back = south_front + DEPTH;
  const wall = indoor ? SolidKind.WALL : SolidKind.KERB;

  b.ground(indoor ? SurfaceKind.FLOOR : SurfaceKind.ASPHALT, rect(EDGE, EDGE, SIZE - EDGE, south_back));
  b.ground(SurfaceKind.ASPHALT, rect(GATE_LO, south_back, GATE_HI, SIZE));
  b.perimeter(wall);
  b.block(wall, EDGE, south_back, GATE_LO, SIZE - EDGE);
  b.block(wall, GATE_HI, south_back, SIZE - EDGE, SIZE - EDGE);

  const north = row(EDGE, SIZE - EDGE, width, north_front, EDGE, "centre");
  const west = row(EDGE, GATE_LO, width, south_front, south_back, "end");
  const east = row(GATE_HI, SIZE - EDGE, width, south_front, south_back, "start");
  const all = [north, west, east];
  all.forEach((r) => draw_row(b, r));

  const pillar = lerp(0.45, 0.75, d);
  const pillar_every = 3;
  const has_pillar = (r: Row, boundary: number) => indoor && boundary > 0 && boundary < r.xs.length && boundary % pillar_every === 0;
  const target = 1 + Math.floor(rng() * (north.xs.length - 2));
  // Indoors the target always has a pillar at one front corner, the spot that makes this scenario.
  const target_index = indoor ? Math.max(pillar_every, Math.round(target / pillar_every) * pillar_every) - (chance(rng, 0.5) ? 1 : 0) : target;
  const fill = open ? 0.45 : lerp(0.65, 1, d);
  const slop = indoor ? 0.04 : lerp(0.1, 0.24, d);

  for (const r of all) {
    const facing_in = r === north ? NORTH : SOUTH;
    for (let boundary = 0; boundary <= r.xs.length; boundary++) {
      if (!has_pillar(r, boundary)) continue;
      const x = r.xs[0] + boundary * r.width;
      const inset = lerp(1.1, 0.45, d) + pillar / 2;
      const y = r.front + (r === north ? -inset : inset);
      b.solid(SolidKind.PILLAR, rect(x - pillar / 2, y - pillar / 2, x + pillar / 2, y + pillar / 2));
    }
    r.xs.forEach((x, i) => {
      const shape = rect(x, Math.min(r.front, r.back), x + r.width, Math.max(r.front, r.back));
      const is_target = !open && r === north && i === target_index;
      const free = is_target || !chance(rng, fill);
      if (free) {
        if (open || is_target) {
          const heading = kind === RowsKind.REVERSE ? facing_in + Math.PI : facing_in;
          b.bay(shape, heading, open || kind === RowsKind.PILLARS);
        }
        return;
      }
      const nose_in = chance(rng, 0.6);
      const heading = nose_in ? facing_in : facing_in + Math.PI;
      const length = 3.9 + rng() * 0.9;
      const car_width = 1.72 + rng() * 0.13;
      const skew = (rng() * 2 - 1) * (Math.PI / 180) * lerp(1, 2.5, d) * (indoor ? 0 : 1);
      const swing = car_width / 2 + 0.05 + (length / 2) * Math.abs(Math.sin(skew));
      const lo = x + swing + (has_pillar(r, i) ? pillar / 2 : 0);
      const hi = x + r.width - swing - (has_pillar(r, i + 1) ? pillar / 2 : 0);
      if (lo > hi) return;
      const centre = Math.max(lo, Math.min(hi, x + r.width / 2 + (rng() * 2 - 1) * slop));
      const depth = 0.25 + rng() * 0.3 + length / 2;
      const y = r === north ? r.back + depth : r.back - depth;
      place_car(b, centre, y, heading + skew, length, car_width, rng);
    });
  }
  return b;
}

function angled(d: number, rng: Rng, open: boolean): Layout {
  const b = new Builder(rng);
  const angle = Math.PI / 3;
  const width = lerp(2.7, 2.4, d);
  const pitch = width / Math.sin(angle);
  // Slanted ends cut the corners of a rectangle, so an angled bay is drawn longer than a square one to hold a car.
  const length = 6;
  const run = length * Math.cos(angle);
  const rise = length * Math.sin(angle);
  const aisle = lerp(5.2, 4.2, d);
  const north_front = EDGE + rise;
  const south_front = north_front + aisle;
  const south_back = south_front + rise;

  b.ground(SurfaceKind.ASPHALT, rect(EDGE, EDGE, SIZE - EDGE, south_back));
  b.ground(SurfaceKind.ASPHALT, rect(GATE_LO, south_back, GATE_HI, SIZE));
  b.perimeter(SolidKind.KERB);
  b.block(SolidKind.KERB, EDGE, south_back, GATE_LO, SIZE - EDGE);
  b.block(SolidKind.KERB, GATE_HI, south_back, SIZE - EDGE, SIZE - EDGE);

  const fill = open ? 0.45 : lerp(0.7, 1, d);
  const slant = (x: number, front: number, back: number): Vec[] => {
    return [
      { x, y: front },
      { x: x + pitch, y: front },
      { x: x + pitch + run, y: back },
      { x: x + run, y: back },
    ];
  };
  const make_row = (from: number, to: number, front: number, back: number, heading: number, targets: boolean) => {
    const count = Math.floor((to - from - run) / pitch);
    const lefts = Array.from({ length: count }, (_, i) => from + i * pitch);
    const reachable = lefts.flatMap((x, i) => (x >= 20.5 ? [i] : []));
    const pick = targets && reachable.length > 0 ? reachable[Math.floor(rng() * reachable.length)] : -1;
    for (let i = 0; i <= count; i++) {
      const x = from + i * pitch;
      b.line({ x, y: front }, { x: x + run, y: back });
    }
    lefts.forEach((x, i) => {
      const shape = slant(x, front, back);
      const is_target = !open && i === pick;
      if (is_target || !chance(rng, fill)) {
        if (open || is_target) b.bay(shape, heading, open);
        return;
      }
      const length = 3.9 + rng() * 0.9;
      const car_width = 1.72 + rng() * 0.13;
      const centre = { x: (shape[0].x + shape[1].x + shape[2].x + shape[3].x) / 4, y: (front + back) / 2 };
      const along = 0.2 + rng() * 0.3;
      place_car(b, centre.x + Math.cos(heading) * along, centre.y + Math.sin(heading) * along, heading, length, car_width, rng);
    });
  };
  make_row(EDGE, SIZE - EDGE, north_front, EDGE, -angle, true);
  make_row(EDGE, GATE_LO, south_front, south_back, angle, false);
  make_row(GATE_HI, SIZE - EDGE, south_front, south_back, angle, false);
  return b;
}

function garage(d: number, rng: Rng): Layout {
  const b = new Builder(rng);
  const width = lerp(3.3, 2.55, d);
  const depth = 6.2;
  const back = EDGE + 0.5;
  const door = back + depth;
  const centre = between(rng, 7, 25);
  const x0 = centre - width / 2;
  const x1 = centre + width / 2;
  b.ground(SurfaceKind.ASPHALT, rect(EDGE, door, SIZE - EDGE, SIZE - EDGE));
  b.ground(SurfaceKind.ASPHALT, rect(GATE_LO, SIZE - EDGE, GATE_HI, SIZE));
  b.ground(SurfaceKind.FLOOR, rect(x0, back, x1, door));
  b.perimeter(SolidKind.KERB);
  b.block(SolidKind.WALL, EDGE, EDGE, x0, door);
  b.block(SolidKind.WALL, x1, EDGE, SIZE - EDGE, door);
  b.block(SolidKind.WALL, x0, EDGE, x1, back);
  const post = 0.08;
  b.block(SolidKind.WALL, x0, door - 0.25, x0 + post, door);
  b.block(SolidKind.WALL, x1 - post, door - 0.25, x1, door);
  if (d > 0.35) {
    const shelf = lerp(0.3, 0.4, d);
    if (chance(rng, 0.5)) b.block(SolidKind.SHELF, x0, back, x0 + shelf, back + lerp(1.2, 2.2, d));
    else b.block(SolidKind.SHELF, x1 - shelf, back, x1, back + lerp(1.2, 2.2, d));
  }
  if (d > 0.5) {
    const left = centre > 16;
    const x = left ? x0 - 2.2 : x1 + 2.2;
    if (x > EDGE + 1.2 && x < SIZE - EDGE - 1.2) b.car(x, door + 3.2, NORTH, 4.8);
  }
  const slack = lerp(0.8, 0.35, d);
  const stop = back + HATCHBACK.length + slack;
  b.line({ x: x0, y: stop }, { x: x1, y: stop }, MarkKind.STOP);
  b.bay(rect(x0, back, x1, stop), NORTH, true);
  return b;
}

function door(d: number, rng: Rng): Layout {
  const b = new Builder(rng);
  const aisle = lerp(6, 4.6, d);
  const lo = 16 - aisle / 2;
  const hi = 16 + aisle / 2;
  const opening = lerp(2.9, 2.3, d);
  const wall = 0.25;
  const depth = 6.2;
  const inner = opening + 0.8;
  const at = between(rng, 7, 19);
  const i0 = at - inner / 2;
  const i1 = at + inner / 2;
  const face = hi + wall;
  b.ground(SurfaceKind.ASPHALT, rect(lo, EDGE, hi, SIZE));
  b.ground(SurfaceKind.ASPHALT, rect(GATE_LO, SIZE - EDGE, GATE_HI, SIZE));
  b.ground(SurfaceKind.FLOOR, rect(hi, at - opening / 2, face, at + opening / 2));
  b.ground(SurfaceKind.FLOOR, rect(face, i0, face + depth, i1));
  b.perimeter(SolidKind.KERB);
  b.block(SolidKind.WALL, EDGE, EDGE, lo, SIZE - EDGE);
  b.block(SolidKind.WALL, hi, EDGE, face, at - opening / 2);
  b.block(SolidKind.WALL, hi, at + opening / 2, face, SIZE - EDGE);
  b.block(SolidKind.WALL, face, EDGE, SIZE - EDGE, i0);
  b.block(SolidKind.WALL, face, i1, SIZE - EDGE, SIZE - EDGE);
  b.block(SolidKind.WALL, face + depth, i0, SIZE - EDGE, i1);
  b.block(SolidKind.KERB, GATE_LO, SIZE - EDGE - 0.01, lo, SIZE);
  b.block(SolidKind.KERB, hi, SIZE - EDGE - 0.01, GATE_HI, SIZE);
  b.line({ x: hi, y: at - opening / 2 }, { x: hi, y: at + opening / 2 }, MarkKind.DASH);
  b.bay(rect(face, i0, face + depth, i1), 0, true);
  return chance(rng, 0.5) ? mirror(b) : b;
}

function narrow(d: number, rng: Rng): Layout {
  const b = new Builder(rng);
  const aisle = lerp(6, 4.9, d);
  const width = lerp(2.6, 2.35, d);
  const lo = 16 - aisle / 2;
  const hi = 16 + aisle / 2;
  const end = SIZE - EDGE - 2;
  b.ground(SurfaceKind.ASPHALT, rect(lo - DEPTH, EDGE, hi + DEPTH, end));
  b.ground(SurfaceKind.ASPHALT, rect(lo, end, hi, SIZE));
  b.ground(SurfaceKind.ASPHALT, rect(GATE_LO, SIZE - EDGE, GATE_HI, SIZE));
  b.perimeter(SolidKind.KERB);
  b.block(SolidKind.WALL, EDGE, EDGE, lo - DEPTH, SIZE - EDGE);
  b.block(SolidKind.WALL, hi + DEPTH, EDGE, SIZE - EDGE, SIZE - EDGE);
  b.block(SolidKind.KERB, lo - DEPTH, end, lo, SIZE - EDGE);
  b.block(SolidKind.KERB, hi, end, hi + DEPTH, SIZE - EDGE);
  b.block(SolidKind.KERB, GATE_LO, SIZE - EDGE - 0.01, lo, SIZE);
  b.block(SolidKind.KERB, hi, SIZE - EDGE - 0.01, GATE_HI, SIZE);

  const count = Math.floor((end - EDGE) / width);
  const ys = Array.from({ length: count }, (_, i) => EDGE + i * width);
  const target_side = chance(rng, 0.5) ? -1 : 1;
  const target = 2 + Math.floor(rng() * (count - 4));
  const fill = lerp(0.85, 1, d);
  for (const side of [-1, 1]) {
    const front = side < 0 ? lo : hi;
    const back = front + side * DEPTH;
    const inward = side < 0 ? Math.PI : 0;
    for (let i = 0; i <= count; i++) b.line({ x: front, y: EDGE + i * width }, { x: back, y: EDGE + i * width });
    ys.forEach((y, i) => {
      const shape = rect(Math.min(front, back), y, Math.max(front, back), y + width);
      if (side === target_side && i === target) {
        b.bay(shape, inward, true);
        return;
      }
      if (!chance(rng, fill)) return;
      const length = 3.9 + rng() * 0.9;
      const car_width = 1.72 + rng() * 0.13;
      const room = (width - car_width) / 2 - 0.05;
      const offset = Math.max(-room, Math.min(room, (rng() * 2 - 1) * lerp(0.1, 0.22, d)));
      const x = back - side * (0.3 + rng() * 0.25 + length / 2);
      place_car(b, x, y + width / 2 + offset, chance(rng, 0.5) ? inward : inward + Math.PI, length, car_width, rng);
    });
  }
  return b;
}

function dead_end(d: number, rng: Rng): Layout {
  const b = new Builder(rng);
  const street = lerp(7, 5.4, d);
  const lo = 16 - street / 2;
  const hi = 16 + street / 2;
  b.ground(SurfaceKind.ASPHALT, rect(lo, EDGE, hi, SIZE));
  b.ground(SurfaceKind.ASPHALT, rect(GATE_LO, SIZE - EDGE, GATE_HI, SIZE));
  b.perimeter(SolidKind.KERB);
  const notch = d < 0.5;
  const notch_depth = 5.5;
  const notch_width = 3.2;
  if (notch) {
    b.ground(SurfaceKind.ASPHALT, rect(hi, EDGE, hi + notch_depth, EDGE + notch_width));
    b.block(SolidKind.KERB, hi + notch_depth, EDGE, SIZE - EDGE, EDGE + notch_width);
    b.block(SolidKind.KERB, hi, EDGE + notch_width, SIZE - EDGE, SIZE - EDGE);
  } else b.block(SolidKind.KERB, hi, EDGE, SIZE - EDGE, SIZE - EDGE);
  b.block(SolidKind.KERB, EDGE, EDGE, lo, SIZE - EDGE);
  b.block(SolidKind.KERB, GATE_LO, SIZE - EDGE - 0.01, lo, SIZE);
  b.block(SolidKind.KERB, hi, SIZE - EDGE - 0.01, GATE_HI, SIZE);
  if (d > 0.4) b.car(lo + 0.15 + 0.9, between(rng, 9, 12), NORTH, 4.4);
  // Bollards across the mouth, behind the car: the turn has to happen in the street, not out on the road.
  const mouth = SIZE - EDGE - 0.6;
  for (let x = lo + 0.15; x < hi; x += 1.3) b.block(SolidKind.PILLAR, x, mouth - 0.15, Math.min(hi, x + 0.3), mouth + 0.15);
  b.start = { x: hi - 1.6, y: mouth - 1.6, heading: NORTH };
  const box_x = lo + 0.25;
  const box = rect(box_x, 21, box_x + 2.7, 27.4);
  for (let i = 0; i < 4; i++) b.line(box[i], box[(i + 1) % 4], MarkKind.DASH);
  b.bay(box, SOUTH, false);
  return b;
}

function mirror(layout: Layout): Layout {
  const flip = (p: Vec) => ({ x: SIZE - p.x, y: p.y });
  const shape = (polygon: Polygon) => polygon.map(flip).reverse();
  return {
    surfaces: layout.surfaces.map((s) => ({ ...s, shape: shape(s.shape) })),
    solids: layout.solids.map((s) => ({
      ...s,
      shape: shape(s.shape),
      ...(s.car ? { car: { ...s.car, pose: { ...flip(s.car.pose), heading: Math.PI - s.car.pose.heading } } } : {}),
    })),
    marks: layout.marks.map((m) => ({ ...m, a: flip(m.a), b: flip(m.b) })),
    bays: layout.bays.map((bay) => ({ ...bay, shape: shape(bay.shape), heading: Math.PI - bay.heading })),
    ...(layout.start ? { start: { ...flip(layout.start), heading: Math.PI - layout.start.heading } } : {}),
  };
}

/** A lot laid out in its own frame: 32 m square, the way in through the south edge between x 12 and 20. */
export function build_lot(scenario: Scenario, difficulty: number, open: boolean, rng: Rng): Layout {
  switch (scenario) {
    case Scenario.PARALLEL:
      return parallel(difficulty, rng);
    case Scenario.FORWARD:
      return rows(difficulty, rng, open, RowsKind.FORWARD);
    case Scenario.REVERSE:
      return rows(difficulty, rng, open, RowsKind.REVERSE);
    case Scenario.PILLARS:
      return rows(difficulty, rng, open, RowsKind.PILLARS);
    case Scenario.ANGLED:
      return angled(difficulty, rng, open);
    case Scenario.GARAGE:
      return garage(difficulty, rng);
    case Scenario.DOOR:
      return door(difficulty, rng);
    case Scenario.NARROW:
      return narrow(difficulty, rng);
    case Scenario.DEAD_END:
      return dead_end(difficulty, rng);
  }
}
