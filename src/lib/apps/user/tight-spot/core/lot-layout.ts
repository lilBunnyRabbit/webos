import type { Rng } from "$lib/core/utils/random";
import { lerp, oriented_box, rect, type Polygon, type Pose, type Vec } from "./geometry";
import { MarkKind, SolidKind, SurfaceKind, type Bay, type Mark, type Solid, type Surface } from "./scene";
import { BOX_TRUCK, BUS, CARAVAN_TRAILER, HATCHBACK, rig_ends, rig_length, Vehicle, type VehicleSpec } from "./vehicle";

/** A lot is laid out in its own frame: 32 m square, the way in through the south edge between x 12 and 20. */
export const SIZE = 32;
export const EDGE = 1.5;
export const GATE_LO = 12;
export const GATE_HI = 20;
export const NORTH = -Math.PI / 2;
export const SOUTH = Math.PI / 2;
const PAINTS = 5;
export const BUS_LENGTH = BUS.length;
export const BUS_WIDTH = BUS.width;
export const CARAVAN_LENGTH = CARAVAN_TRAILER.box_length + CARAVAN_TRAILER.drawbar;
export const CARAVAN_WIDTH = CARAVAN_TRAILER.width;
export const DROPPED_TRAILER = { length: 13.6, width: 2.55 };

/** A portal in a lot's own frame, between two of its floors (0 is the lot itself, 1 the floor below it, …). */
export interface Passage {
  mouth: Polygon;
  heading: number;
  /** Any point: the floors are laid out alike, so it maps to the same spot on both. */
  at: Vec;
  from: number;
  to: number;
  lead?: readonly Pose[];
}

export interface Layout {
  surfaces: Surface[];
  solids: Solid[];
  marks: Mark[];
  bays: Bay[];
  /** Where the car waits when the lot has its own start instead of the street leading in. */
  start?: Pose;
  /** The floors below the lot, in its own frame, the next one down first. */
  floors?: Layout[];
  passages?: Passage[];
  /** Bars at a garage's way in that a vehicle taller than a car or a van can't pass under. */
  headroom?: Polygon[];
}

export class Builder implements Layout {
  surfaces: Surface[] = [];
  solids: Solid[] = [];
  marks: Mark[] = [];
  bays: Bay[] = [];
  start?: Pose;
  floors?: Layout[];
  passages?: Passage[];
  headroom?: Polygon[];

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
    this.solids.push({
      kind: SolidKind.CAR,
      shape: oriented_box(x, y, heading, length, width),
      car: { pose, length, width, paint },
    });
    return { length, width };
  }

  bus(x: number, y: number, heading: number) {
    const pose = { x, y, heading };
    const paint = Math.floor(this.rng() * PAINTS);
    const car = { pose, length: BUS_LENGTH, width: BUS_WIDTH, paint, vehicle: Vehicle.BUS };
    this.solids.push({ kind: SolidKind.CAR, shape: oriented_box(x, y, heading, BUS_LENGTH, BUS_WIDTH), car });
  }

  truck(x: number, y: number, heading: number, vehicle: typeof Vehicle.SEMI | typeof Vehicle.BOX_TRUCK) {
    const { length, width } = vehicle === Vehicle.SEMI ? DROPPED_TRAILER : BOX_TRUCK;
    const pose = { x, y, heading };
    const paint = Math.floor(this.rng() * PAINTS);
    this.solids.push({ kind: SolidKind.CAR, shape: oriented_box(x, y, heading, length, width), car: { pose, length, width, paint, vehicle } });
    return length;
  }

  caravan(x: number, y: number, heading: number) {
    const pose = { x, y, heading };
    const paint = Math.floor(this.rng() * PAINTS);
    const car = { pose, length: CARAVAN_LENGTH, width: CARAVAN_WIDTH, paint, vehicle: Vehicle.CARAVAN };
    this.solids.push({ kind: SolidKind.CAR, shape: oriented_box(x, y, heading, CARAVAN_LENGTH, CARAVAN_WIDTH), car });
  }

  perimeter(kind: SolidKind) {
    this.block(kind, 0, 0, SIZE, EDGE);
    this.block(kind, 0, EDGE, EDGE, SIZE);
    this.block(kind, SIZE - EDGE, EDGE, SIZE, SIZE);
    this.block(kind, EDGE, SIZE - EDGE, GATE_LO, SIZE);
    this.block(kind, GATE_HI, SIZE - EDGE, SIZE - EDGE, SIZE);
  }
}

export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}

export function between(rng: Rng, lo: number, hi: number): number {
  return lo + rng() * (hi - lo);
}

export function place_car(b: Builder, x: number, y: number, heading: number, length: number, width: number, rng: Rng) {
  const paint = Math.floor(rng() * PAINTS);
  const pose = { x, y, heading };
  b.solids.push({
    kind: SolidKind.CAR,
    shape: oriented_box(x, y, heading, length, width),
    car: { pose, length, width, paint },
  });
}

export interface Row {
  xs: number[];
  width: number;
  front: number;
  back: number;
}

export function row(
  from: number,
  to: number,
  width: number,
  front: number,
  back: number,
  align: "centre" | "start" | "end"
): Row {
  const count = Math.floor((to - from) / width + 1e-9);
  const spare = to - from - count * width;
  const start = align === "centre" ? from + spare / 2 : align === "start" ? from : from + spare;
  return { xs: Array.from({ length: count }, (_, i) => start + i * width), width, front, back };
}

export function draw_row(b: Builder, r: Row) {
  for (let i = 0; i <= r.xs.length; i++) {
    const x = i < r.xs.length ? r.xs[i] : r.xs[r.xs.length - 1] + r.width;
    b.line({ x, y: r.front }, { x, y: r.back });
  }
}

export const RowsKind = { FORWARD: "forward", REVERSE: "reverse", PILLARS: "pillars", GARAGE: "garage" } as const;
export type RowsKind = (typeof RowsKind)[keyof typeof RowsKind];

const LETTER = 1.5;

// Painted strokes, not text: marks turn with the lot, so the sign reads upright for the driver coming in.
export function level_sign(b: Builder, centre: number, top: number) {
  const h = LETTER;
  const w = h * 0.55;
  const x = centre - 1.6;
  const y = top;
  b.line({ x, y: y + h }, { x, y });
  b.line({ x, y }, { x: x + w, y });
  b.line({ x: x + w, y }, { x: x + w, y: y + h / 2 });
  b.line({ x: x + w, y: y + h / 2 }, { x, y: y + h / 2 });
  b.line({ x: x + 1.2, y: y + h / 2 }, { x: x + 1.9, y: y + h / 2 });
  const one = x + 2.6;
  b.line({ x: one, y }, { x: one, y: y + h });
  b.line({ x: one - 0.35, y: y + 0.35 }, { x: one, y });
  b.line({ x: one - 0.35, y: y + h }, { x: one + 0.35, y: y + h });
}

export function ramp(b: Builder, from: number, to: number, half = 1.6) {
  const centre = (GATE_LO + GATE_HI) / 2;
  const top = to - 1 - LETTER;
  if (top - from > 0.5) level_sign(b, centre, top);
  chevrons(b, centre, from + 0.8, top - 0.8, -1, half);
}

/** `way` −1 points them north, 1 south: the way down the ramp. */
export function chevrons(b: Builder, centre: number, from: number, to: number, way: 1 | -1, half = 1.6) {
  for (let y = from; y + 0.8 <= to; y += 1.8) {
    const tip = way < 0 ? y : y + 0.8;
    const arms = way < 0 ? y + 0.8 : y;
    b.line({ x: centre - half, y: arms }, { x: centre, y: tip });
    b.line({ x: centre, y: tip }, { x: centre + half, y: arms });
  }
}

export const FLARE = 1.2;
export const LANE_WALL = 0.3;

type Flares = { top?: readonly ("w" | "e")[]; bottom?: readonly ("w" | "e")[] };

// A wall end that opens onto an aisle is cut at 45°, the way real ramps are, or no car could turn into a lane this narrow.
export function lane(b: Builder, x0: number, x1: number, y0: number, y1: number, flares: Flares = {}) {
  b.ground(SurfaceKind.RAMP, rect(x0, y0, x1, y1));
  for (const side of ["w", "e"] as const) {
    const top = flares.top?.includes(side) ? FLARE : 0;
    const bottom = flares.bottom?.includes(side) ? FLARE : 0;
    const face = side === "w" ? x0 : x1;
    const out = side === "w" ? -1 : 1;
    b.block(SolidKind.WALL, Math.min(face, face + out * LANE_WALL), y0 + top, Math.max(face, face + out * LANE_WALL), y1 - bottom);
    const chamfer = (edge: number, inward: number): Vec[] => {
      const corner = { x: face + out * FLARE, y: edge };
      const shape = [
        { x: face, y: edge + inward * FLARE },
        corner,
        { x: corner.x + out * LANE_WALL, y: edge },
        { x: corner.x + out * LANE_WALL, y: edge + inward * FLARE },
      ];
      b.ground(SurfaceKind.RAMP, [{ x: face, y: edge }, corner, { x: face, y: edge + inward * FLARE }]);
      return (out > 0) === (inward > 0) ? shape : [...shape].reverse();
    };
    if (top) b.solid(SolidKind.WALL, chamfer(y0, 1));
    if (bottom) b.solid(SolidKind.WALL, chamfer(y1, -1));
  }
}

export function rows(d: number, rng: Rng, open: boolean, kind: RowsKind, fit: Fit): Layout {
  const b = new Builder(rng);
  const garage = kind === RowsKind.GARAGE;
  const indoor = kind === RowsKind.PILLARS || garage;
  const aisle =
    (kind === RowsKind.FORWARD
      ? lerp(7, 5.8, d)
      : kind === RowsKind.REVERSE
        ? lerp(6.6, 5.4, d)
        : garage
          ? open
            ? lerp(6.6, 5.6, d)
            : lerp(6.2, 4.8, d)
          : lerp(6.8, 5.8, d)) * fit.turn;
  // A pillar stands on every line in a garage, so its bays are a little wider to leave the same room between them.
  const width = (garage ? (open ? lerp(2.9, 2.6, d) : lerp(2.8, 2.55, d)) : lerp(2.7, 2.35, d)) + fit.wider;
  const north_front = EDGE + fit.depth;
  const south_front = north_front + aisle;
  const south_back = south_front + fit.depth;
  const wall = indoor ? SolidKind.WALL : SolidKind.KERB;

  b.ground(garage ? SurfaceKind.GARAGE : indoor ? SurfaceKind.FLOOR : SurfaceKind.ASPHALT, rect(EDGE, EDGE, SIZE - EDGE, south_back));
  b.ground(SurfaceKind.ASPHALT, rect(GATE_LO, south_back, GATE_HI, SIZE));
  b.perimeter(wall);
  b.block(wall, EDGE, south_back, GATE_LO, SIZE - EDGE);
  b.block(wall, GATE_HI, south_back, SIZE - EDGE, SIZE - EDGE);
  if (garage && !open) {
    // The spot is the tight one: a walled lane in from the gate instead of the whole gap, cut back where it meets the aisle.
    const half = (lerp(4, 3.6, d) + fit.wider) / 2;
    const mid = (GATE_LO + GATE_HI) / 2;
    lane(b, mid - half, mid + half, south_front, SIZE, { top: ["w", "e"] });
    b.block(SolidKind.WALL, GATE_LO, south_front + FLARE, mid - half - LANE_WALL - FLARE, SIZE);
    b.block(SolidKind.WALL, mid - half - LANE_WALL - FLARE, south_front + FLARE, mid - half - LANE_WALL, SIZE);
    b.block(SolidKind.WALL, mid + half + LANE_WALL, south_front + FLARE, mid + half + LANE_WALL + FLARE, SIZE);
    b.block(SolidKind.WALL, mid + half + LANE_WALL + FLARE, south_front + FLARE, GATE_HI, SIZE);
    b.headroom = [rect(mid - half - LANE_WALL, SIZE - 0.95, mid + half + LANE_WALL, SIZE - 0.65)];
    ramp(b, south_back, SIZE, Math.min(1.6, half - 0.4));
  } else if (garage) ramp(b, south_back, SIZE);

  const north = row(EDGE, SIZE - EDGE, width, north_front, EDGE, "centre");
  const west = row(EDGE, GATE_LO, width, south_front, south_back, "end");
  const east = row(GATE_HI, SIZE - EDGE, width, south_front, south_back, "start");
  const all = [north, west, east];
  all.forEach((r) => draw_row(b, r));

  const pillar = garage ? lerp(0.4, 0.55, d) : lerp(0.45, 0.75, d);
  const pillar_every = garage ? 1 : 3;
  const has_pillar = (r: Row, boundary: number) =>
    indoor && boundary > 0 && boundary < r.xs.length && boundary % pillar_every === 0;
  let target_index: number;
  if (garage) {
    // Off to one side of the ramp, with a bay either side: down the ramp, turn along the aisle, then in between pillars.
    const aside = north.xs.flatMap((x, i) =>
      i > 0 && i < north.xs.length - 1 && (x + width < GATE_LO - 1 || x > GATE_HI + 1) ? [i] : []
    );
    target_index = aside[Math.floor(rng() * aside.length)];
  } else {
    const target = 1 + Math.floor(rng() * (north.xs.length - 2));
    // Indoors the target always has a pillar at one front corner, the spot that makes this scenario.
    target_index = indoor
      ? Math.max(pillar_every, Math.round(target / pillar_every) * pillar_every) - (chance(rng, 0.5) ? 1 : 0)
      : target;
  }
  const fill = open ? 0.45 : garage ? lerp(0.8, 1, d) : lerp(0.65, 1, d);
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
      const beside = garage && !open && r === north && Math.abs(i - target_index) === 1;
      const free = is_target || (!chance(rng, fill) && !beside);
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

export function angled(d: number, rng: Rng, open: boolean, fit: Fit): Layout {
  const b = new Builder(rng);
  const angle = Math.PI / 3;
  const width = lerp(2.7, 2.4, d) + fit.wider;
  const pitch = width / Math.sin(angle);
  // Slanted ends cut the corners of a rectangle, so an angled bay is drawn longer than a square one to hold a car.
  const length = 6 + fit.longer;
  const run = length * Math.cos(angle);
  const rise = length * Math.sin(angle);
  const aisle = lerp(5.2, 4.2, d) * fit.turn;
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
      place_car(
        b,
        centre.x + Math.cos(heading) * along,
        centre.y + Math.sin(heading) * along,
        heading,
        length,
        car_width,
        rng
      );
    });
  };
  make_row(EDGE, SIZE - EDGE, north_front, EDGE, -angle, true);
  make_row(EDGE, GATE_LO, south_front, south_back, angle, false);
  make_row(GATE_HI, SIZE - EDGE, south_front, south_back, angle, false);
  return b;
}

/** What a layout sizes to the round's vehicle; the hatchback gives back the layouts it always had. */
export interface Fit {
  length: number;
  longer: number;
  wider: number;
  turn: number;
  depth: number;
  /** From the pose back to the rig's tail. */
  rear: number;
  links: number;
}

// Never smaller than the hatchback's layout: a smaller vehicle gets the same room, not a shrunk copy of it.
export function fit_for(spec: VehicleSpec): Fit {
  const length = Math.max(HATCHBACK.length, rig_length(spec));
  return {
    length,
    longer: length - HATCHBACK.length,
    wider: Math.max(0, spec.width - HATCHBACK.width, ...spec.hitches.map((link) => link.width - HATCHBACK.width)),
    turn: Math.max(1, spec.turning_radius / HATCHBACK.turning_radius),
    depth: length + 0.7,
    rear: rig_length(spec) < HATCHBACK.length ? -rig_ends(HATCHBACK).rear : -rig_ends(spec).rear,
    links: spec.hitches.length,
  };
}
