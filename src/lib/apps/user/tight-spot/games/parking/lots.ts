import type { Rng } from "$lib/core/utils/random";
import { lerp, rect, type Polygon, type Vec } from "../../core/geometry";
import {
  angled,
  between,
  Builder,
  BUS_LENGTH,
  BUS_WIDTH,
  CARAVAN_LENGTH,
  CARAVAN_WIDTH,
  chance,
  draw_row,
  DROPPED_TRAILER,
  EDGE,
  fit_for,
  GATE_HI,
  GATE_LO,
  NORTH,
  place_car,
  row,
  rows,
  RowsKind,
  SIZE,
  SOUTH,
  type Fit,
  type Layout,
} from "../../core/lot-layout";
import { BOX_TRUCK, HATCHBACK, Vehicle, type VehicleSpec } from "../../core/vehicle";
import { MarkKind, Scenario, SolidKind, SurfaceKind } from "./kinds";

const SWING = Math.PI / 6;

function parallel(d: number, rng: Rng, fit: Fit): Layout {
  const b = new Builder(rng);
  const lane = lerp(2.5, 2.3, d) + fit.wider;
  const kerb = GATE_HI + lane;
  b.ground(SurfaceKind.ASPHALT, rect(GATE_LO, EDGE, kerb, SIZE));
  b.block(SolidKind.KERB, 0, 0, GATE_LO, SIZE);
  b.block(SolidKind.KERB, kerb, 0, SIZE, SIZE);
  b.block(SolidKind.KERB, GATE_LO, 0, kerb, EDGE);
  b.line({ x: 16, y: EDGE + 0.5 }, { x: 16, y: SIZE }, MarkKind.DASH);
  b.line({ x: GATE_HI, y: EDGE }, { x: GATE_HI, y: SIZE });

  const gap = fit.length + lerp(2.4, 1.3, d) * fit.turn;
  const centre = between(rng, 10.5, 22);
  const top = centre - gap / 2;
  const bottom = centre + gap / 2;
  const side_x = (width: number) => kerb - 0.18 - rng() * 0.12 - width / 2;
  for (let cursor = top; ;) {
    const length = 3.9 + rng() * 0.9;
    if (cursor - length < EDGE + 0.3) break;
    const width = 1.72 + rng() * 0.13;
    place_car(b, side_x(width), cursor - length / 2, NORTH, length, width, rng);
    b.line({ x: GATE_HI, y: cursor - length - 0.1 }, { x: kerb, y: cursor - length - 0.1 });
    cursor -= length + between(rng, 0.6, 1.6);
  }
  for (let cursor = bottom; ;) {
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

function garage(d: number, rng: Rng, fit: Fit): Layout {
  const b = new Builder(rng);
  const width = lerp(3.3, 2.55, d) + fit.wider;
  const depth = 6.2 + fit.longer;
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
  const stop = back + fit.length + slack;
  b.line({ x: x0, y: stop }, { x: x1, y: stop }, MarkKind.STOP);
  b.bay(rect(x0, back, x1, stop), NORTH, true);
  return b;
}

function door(d: number, rng: Rng, fit: Fit): Layout {
  const b = new Builder(rng);
  const aisle = lerp(6, 4.6, d) * fit.turn;
  const lo = 16 - aisle / 2;
  const hi = 16 + aisle / 2;
  const opening = lerp(2.9, 2.3, d) + fit.wider;
  const wall = 0.25;
  const depth = 6.2 + fit.longer;
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

function narrow(d: number, rng: Rng, fit: Fit): Layout {
  const b = new Builder(rng);
  const aisle = lerp(6, 4.9, d) * fit.turn;
  const width = lerp(2.6, 2.35, d) + fit.wider;
  const depth = fit.depth;
  const lo = 16 - aisle / 2;
  const hi = 16 + aisle / 2;
  const end = SIZE - EDGE - 2;
  b.ground(SurfaceKind.ASPHALT, rect(lo - depth, EDGE, hi + depth, end));
  b.ground(SurfaceKind.ASPHALT, rect(lo, end, hi, SIZE));
  b.ground(SurfaceKind.ASPHALT, rect(GATE_LO, SIZE - EDGE, GATE_HI, SIZE));
  b.perimeter(SolidKind.KERB);
  b.block(SolidKind.WALL, EDGE, EDGE, lo - depth, SIZE - EDGE);
  b.block(SolidKind.WALL, hi + depth, EDGE, SIZE - EDGE, SIZE - EDGE);
  b.block(SolidKind.KERB, lo - depth, end, lo, SIZE - EDGE);
  b.block(SolidKind.KERB, hi, end, hi + depth, SIZE - EDGE);
  b.block(SolidKind.KERB, GATE_LO, SIZE - EDGE - 0.01, lo, SIZE);
  b.block(SolidKind.KERB, hi, SIZE - EDGE - 0.01, GATE_HI, SIZE);

  const count = Math.floor((end - EDGE) / width);
  const ys = Array.from({ length: count }, (_, i) => EDGE + i * width);
  const target_side = chance(rng, 0.5) ? -1 : 1;
  const target = 2 + Math.floor(rng() * (count - 4));
  const fill = lerp(0.85, 1, d);
  for (const side of [-1, 1]) {
    const front = side < 0 ? lo : hi;
    const back = front + side * depth;
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

function dead_end(d: number, rng: Rng, fit: Fit): Layout {
  const b = new Builder(rng);
  const street = lerp(7, 5.4, d) * fit.turn;
  const lo = 16 - street / 2;
  const hi = 16 + street / 2;
  b.ground(SurfaceKind.ASPHALT, rect(lo, EDGE, hi, SIZE));
  b.ground(SurfaceKind.ASPHALT, rect(GATE_LO, SIZE - EDGE, GATE_HI, SIZE));
  b.perimeter(SolidKind.KERB);
  if (d < 0.5) {
    // A notch to swing the nose into, near the far end but not always at it.
    const top = EDGE + between(rng, 0, 3);
    const bottom = top + between(rng, 3, 3.6);
    const depth = between(rng, 4.8, 6);
    b.ground(SurfaceKind.ASPHALT, rect(hi, top, hi + depth, bottom));
    b.block(SolidKind.KERB, hi, EDGE, SIZE - EDGE, top);
    b.block(SolidKind.KERB, hi + depth, top, SIZE - EDGE, bottom);
    b.block(SolidKind.KERB, hi, bottom, SIZE - EDGE, SIZE - EDGE);
  } else b.block(SolidKind.KERB, hi, EDGE, SIZE - EDGE, SIZE - EDGE);
  b.block(SolidKind.KERB, EDGE, EDGE, lo, SIZE - EDGE);
  b.block(SolidKind.KERB, GATE_LO, SIZE - EDGE - 0.01, lo, SIZE);
  b.block(SolidKind.KERB, hi, SIZE - EDGE - 0.01, GATE_HI, SIZE);
  const deeper = between(rng, 0, 2.5);
  if (d > 0.4) {
    const kerbside = chance(rng, 0.5) ? lo + 1.05 : hi - 1.05;
    b.car(kerbside, between(rng, 9, 13.5) - deeper, chance(rng, 0.7) ? NORTH : SOUTH, 4.4);
  }
  // Bollards across the mouth, behind the car: the turn has to happen in the street, not out on the road.
  const mouth = SIZE - EDGE - 0.6;
  for (let x = lo + 0.15; x < hi; x += 1.3)
    b.block(SolidKind.PILLAR, x, mouth - 0.15, Math.min(hi, x + 0.3), mouth + 0.15);
  b.start = { x: hi - 1.6, y: mouth - 1.6 - between(rng, 0, 2.5), heading: NORTH };
  const box_x = lo + 0.25;
  const box = rect(box_x, 21 - fit.longer - deeper, box_x + 2.7 + fit.wider, 27.4 - deeper);
  for (let i = 0; i < 4; i++) b.line(box[i], box[(i + 1) % 4], MarkKind.DASH);
  b.bay(box, SOUTH, false);
  return chance(rng, 0.5) ? mirror(b) : b;
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


function bus_stop(d: number, rng: Rng, fit: Fit): Layout {
  const b = new Builder(rng);
  // The bus comes up from the road, so the stop runs to the lot's edge; the parked cars are ahead of it and across.
  const stop = fit.length + lerp(8, 6.2, d);
  const length = 4 + rng() * 0.6;
  // An articulated bus's stop takes the whole street: no car ahead of it, and a wide kerbside bay that starts in the
  // road's right lane, since its rear section can't swing out of the road and straighten again in one street.
  const long = SIZE - EDGE - 0.1 - (EDGE + 0.7 + length) - stop < 0;
  const inner = long ? 17.6 : GATE_HI;
  const lane = long ? lerp(3.9, 3.7, d) : lerp(3.3, 3.1, d);
  const kerb = inner + lane;
  b.ground(SurfaceKind.ASPHALT, rect(GATE_LO, EDGE, kerb, SIZE));
  b.block(SolidKind.KERB, 0, 0, GATE_LO, SIZE);
  b.block(SolidKind.KERB, kerb, 0, SIZE, SIZE);
  b.block(SolidKind.KERB, GATE_LO, 0, kerb, EDGE);
  b.line({ x: 16, y: EDGE + 0.5 }, { x: 16, y: SIZE }, MarkKind.DASH);
  b.line({ x: inner, y: EDGE }, { x: inner, y: SIZE });

  const ahead = long ? -0.4 : length;
  if (!long) place_car(b, kerb - 0.2 - rng() * 0.1 - 0.9, EDGE + 0.3 + ahead / 2, NORTH, ahead, 1.8, rng);
  const top = EDGE + 0.3 + ahead + 0.4 + rng() * Math.max(0, SIZE - EDGE - 0.1 - (EDGE + 0.7 + ahead) - stop);
  const bottom = top + stop;
  if (d > 0.4) {
    const across = 4 + rng() * 0.6;
    place_car(b, GATE_LO + 0.25 + 0.9, Math.max(EDGE + 0.3 + across / 2, between(rng, top - 2, top + 3)), SOUTH, across, 1.8, rng);
  }
  for (const y of [top, bottom]) b.line({ x: inner, y }, { x: kerb, y });
  b.line({ x: kerb - 0.25, y: top }, { x: kerb - 0.25, y: bottom }, MarkKind.DASH);
  // The stop's sign and shelter sit right on the kerb, where the tail swings as the bus straightens.
  b.solid(SolidKind.POST, rect(kerb, top + 1.2, kerb + 0.22, top + 1.42));
  b.block(SolidKind.WALL, kerb + 0.5, top + 3, kerb + 1.7, top + 8);
  b.bay(rect(inner, top + 0.1, kerb, bottom - 0.1), NORTH, false);
  return b;
}

// An articulated bus can't swing round in a 32 m yard, so its depot is drive-through: the gate is open and it goes
// nose first into a lane near the gate's line, the way artic depots park them.
function depot_through(d: number, rng: Rng, fit: Fit): Layout {
  const b = new Builder(rng);
  const width = lerp(3.8, 3.4, d);
  const front = EDGE + fit.depth + 0.3;
  b.ground(SurfaceKind.ASPHALT, rect(EDGE, EDGE, SIZE - EDGE, SIZE - EDGE));
  b.ground(SurfaceKind.ASPHALT, rect(GATE_LO, SIZE - EDGE, GATE_HI, SIZE));
  b.perimeter(SolidKind.WALL);
  const lanes = row(EDGE, SIZE - EDGE, width, front, EDGE, "centre");
  draw_row(b, lanes);
  const aim = 18 + (chance(rng, 0.5) ? -1 : 1) * between(rng, 2, 3.5);
  const target = lanes.xs.reduce(
    (best, x, i) => (Math.abs(x + width / 2 - aim) < Math.abs(lanes.xs[best] + width / 2 - aim) ? i : best),
    0
  );
  const swing = [Math.min(18, aim), Math.max(18, aim)];
  const fill = lerp(0.65, 1, d);
  lanes.xs.forEach((x, i) => {
    if (i === target) {
      b.bay(rect(x, EDGE, x + width, front), NORTH, false);
      return;
    }
    if (!chance(rng, fill) || (x < swing[1] && x + width > swing[0])) return;
    const room = (width - BUS_WIDTH) / 2 - 0.08;
    const centre = x + width / 2 + Math.max(-room, Math.min(room, (rng() * 2 - 1) * lerp(0.1, 0.25, d)));
    b.bus(centre, EDGE + 0.3 + rng() * 0.4 + BUS_LENGTH / 2, chance(rng, 0.8) ? SOUTH : NORTH);
  });
  return b;
}

function depot(d: number, rng: Rng, fit: Fit): Layout {
  if (fit.length > 16) return depot_through(d, rng, fit);
  const b = new Builder(rng);
  const width = lerp(3.8, 3.25, d);
  const front = EDGE + Math.max(fit.depth, BUS_LENGTH + 0.7) + 0.5;
  b.ground(SurfaceKind.ASPHALT, rect(EDGE, EDGE, SIZE - EDGE, SIZE - EDGE));
  b.ground(SurfaceKind.ASPHALT, rect(GATE_LO, SIZE - EDGE, GATE_HI, SIZE));
  b.perimeter(SolidKind.WALL);
  // The yard gate is shut: the bus turns in the yard, not out on the road.
  b.block(SolidKind.WALL, GATE_LO, SIZE - EDGE, GATE_HI, SIZE - EDGE + 0.3);

  const lanes = row(EDGE, SIZE - EDGE, width, front, EDGE, "centre");
  draw_row(b, lanes);
  const target = 3 + Math.floor(rng() * (lanes.xs.length - 4));
  const fill = lerp(0.65, 1, d);
  lanes.xs.forEach((x, i) => {
    const shape = rect(x, EDGE, x + width, front);
    if (i === target) {
      b.bay(shape, SOUTH, false);
      return;
    }
    if (!chance(rng, fill)) return;
    const room = (width - BUS_WIDTH) / 2 - 0.08;
    const centre = x + width / 2 + Math.max(-room, Math.min(room, (rng() * 2 - 1) * lerp(0.1, 0.25, d)));
    b.bus(centre, EDGE + 0.3 + rng() * 0.4 + BUS_LENGTH / 2, chance(rng, 0.8) ? SOUTH : NORTH);
  });
  if (d > 0.55) b.bus(between(rng, 20, SIZE - EDGE - BUS_LENGTH / 2 - 0.4), SIZE - EDGE - 0.45 - BUS_WIDTH / 2, 0);
  // Room behind the bus as well as ahead of it, so backing up first doesn't meet the west wall.
  b.start = { x: between(rng, 10.5, 13.5), y: front + lerp(6.8, 6.2, d) + between(rng, 0, 0.6), heading: 0 };
  return b;
}

function driveway(d: number, rng: Rng, fit: Fit): Layout {
  const b = new Builder(rng);
  const street = lerp(8, 6.6, d) + between(rng, 0, 0.8);
  const north = 14 + between(rng, -1.5, 1.5);
  const south = north + street;
  const inner = lerp(3.9, 3.1, d);
  const post = lerp(0.12, 0.3, d);
  const long = fit.length + lerp(1.6, 0.9, d) + between(rng, 0, 0.5);
  const wall = 0.3;
  const c = between(rng, 8.5, 13.5);
  const x0 = c - inner / 2;
  const x1 = c + inner / 2;
  const end = north - long;
  b.ground(SurfaceKind.ASPHALT, rect(EDGE, north, SIZE - EDGE, south));
  b.ground(SurfaceKind.ASPHALT, rect(GATE_LO, south, GATE_HI, SIZE));
  b.ground(SurfaceKind.FLOOR, rect(x0, end, x1, north));
  b.perimeter(SolidKind.KERB);
  b.block(SolidKind.KERB, EDGE, EDGE, x0 - wall, north);
  b.block(SolidKind.KERB, x1 + wall, EDGE, SIZE - EDGE, north);
  b.block(SolidKind.KERB, x0 - wall, EDGE, x1 + wall, end - wall);
  b.block(SolidKind.WALL, x0 - wall, end - wall, x0, north);
  b.block(SolidKind.WALL, x1, end - wall, x1 + wall, north);
  b.block(SolidKind.WALL, x0, end - wall, x1, end);
  b.block(SolidKind.POST, x0 - wall, north - 0.45, x0 + post, north);
  b.block(SolidKind.POST, x1 - post, north - 0.45, x1 + wall, north);
  b.block(SolidKind.KERB, EDGE, south, GATE_LO, SIZE - EDGE);
  b.block(SolidKind.KERB, GATE_HI, south, SIZE - EDGE, SIZE - EDGE);
  b.line({ x: EDGE, y: (north + south) / 2 }, { x: SIZE - EDGE, y: (north + south) / 2 }, MarkKind.DASH);
  if (d > 0.45) b.car(c - between(rng, 3, 5.5), south - 1.05, 0, 4.6);
  const start = c + 7.4 + between(rng, -0.6, 1.2);
  // A car on the near kerb up the street, past where the rig waits.
  const ahead = start + between(rng, 6.5, 9);
  if (d > 0.25 && chance(rng, 0.6) && ahead + 2.6 < SIZE - EDGE) b.car(ahead, north + 1.05, 0, 4.6);
  b.start = { x: start, y: south - street / 4, heading: 0 };
  b.bay(rect(x0, end, x1, north), SOUTH, false);
  return chance(rng, 0.5) ? mirror(b) : b;
}

function slipway(d: number, rng: Rng, fit: Fit): Layout {
  const b = new Builder(rng);
  const quay = 15 + between(rng, -1, 1.5);
  const ramp = lerp(3.6, 2.7, d);
  const toe = quay - 6.5;
  const bay_end = toe + fit.length + lerp(1.4, 0.7, d);
  const c = between(rng, 8.5, 14);
  const x0 = c - ramp / 2;
  const x1 = c + ramp / 2;
  b.ground(SurfaceKind.ASPHALT, rect(EDGE, quay, SIZE - EDGE, SIZE - EDGE));
  b.ground(SurfaceKind.ASPHALT, rect(GATE_LO, SIZE - EDGE, GATE_HI, SIZE));
  b.ground(SurfaceKind.FLOOR, rect(x0, toe, x1, quay));
  b.perimeter(SolidKind.KERB);
  b.block(SolidKind.WATER, EDGE, EDGE, SIZE - EDGE, toe);
  b.block(SolidKind.WATER, EDGE, toe, x0, quay);
  b.block(SolidKind.WATER, x1, toe, SIZE - EDGE, quay);
  const post = 0.35;
  const out = lerp(0.5, 0, d);
  b.block(SolidKind.POST, x0 - out - post, quay, x0 - out, quay + post);
  b.block(SolidKind.POST, x1 + out, quay, x1 + out + post, quay + post);
  if (d > 0.5) b.car(between(rng, 18, 26), SIZE - EDGE - 1.25, 0, 4.6);
  // Someone parked nose to the water beside the ramp, on the side away from where the rig waits.
  const beside = x0 - out - post - between(rng, 1.6, 2.6);
  if (d > 0.3 && chance(rng, 0.5) && beside > EDGE + 1.4) b.car(beside, quay + 0.4 + 2.4, NORTH, 4.6);
  for (const x of [x0, x1]) b.line({ x, y: quay }, { x, y: bay_end }, MarkKind.DASH);
  b.line({ x: x0, y: bay_end }, { x: x1, y: bay_end }, MarkKind.DASH);
  b.bay(rect(x0, toe, x1, bay_end), SOUTH, false);
  const x = c + 7 + between(rng, -0.5, 1.2);
  b.start = { x, y: Math.max(quay + between(rng, 3.8, 4.8), bay_end + 0.8), heading: 0 };
  return chance(rng, 0.5) ? mirror(b) : b;
}

// The owner's sketch: a dead-end aisle about a bay deep, every bay taken but the last one in the corner by the end
// wall, and the one opposite taken too, so there's no room to swing wide.
function end_bay(d: number, rng: Rng, fit: Fit): Layout {
  const b = new Builder(rng);
  const aisle = lerp(5.7, 4.9, d) * fit.turn;
  const width = lerp(2.65, 2.4, d) + fit.wider;
  const depth = fit.depth;
  const lo = 16 - aisle / 2;
  const hi = 16 + aisle / 2;
  const count = 4 + Math.floor(rng() * 3);
  const end = EDGE + count * width;
  const left = lo - depth;
  const right = hi + depth;
  const wall = 0.3;
  // Thin walls on pavement, like the garage and the driveway: solid blocks behind the bays read heavy on a phone.
  b.ground(SurfaceKind.PAVEMENT, rect(0, 0, SIZE, SIZE));
  b.ground(SurfaceKind.FLOOR, rect(left, EDGE, right, end));
  b.ground(SurfaceKind.FLOOR, rect(lo, end, hi, SIZE));
  b.block(SolidKind.WALL, left - wall, EDGE - wall, right + wall, EDGE);
  b.block(SolidKind.WALL, left - wall, EDGE, left, end + wall);
  b.block(SolidKind.WALL, right, EDGE, right + wall, end + wall);
  b.block(SolidKind.WALL, left, end, lo, end + wall);
  b.block(SolidKind.WALL, hi, end, right, end + wall);
  b.block(SolidKind.WALL, lo - wall, end + wall, lo, SIZE);
  b.block(SolidKind.WALL, hi, end + wall, hi + wall, SIZE);
  b.block(SolidKind.WALL, GATE_LO, SIZE - wall, lo - wall, SIZE);
  b.block(SolidKind.WALL, hi + wall, SIZE - wall, GATE_HI, SIZE);
  // The car waits inside, a few metres short of the rows, so the start frames it and the corner bay together.
  b.start = { x: 16 + between(rng, -0.3, 0.5), y: end + fit.length + between(rng, 2, 4.5), heading: NORTH };

  const target_side = chance(rng, 0.5) ? -1 : 1;
  // Nose in on a roomy aisle; the tighter it gets, the likelier the bay wants the car backed in.
  const reverse = chance(rng, lerp(0.2, 0.8, d));
  for (const side of [-1, 1]) {
    const front = side < 0 ? lo : hi;
    const back = front + side * depth;
    const inward = side < 0 ? Math.PI : 0;
    for (let i = 0; i <= count; i++) b.line({ x: front, y: EDGE + i * width }, { x: back, y: EDGE + i * width });
    for (let i = 0; i < count; i++) {
      const y = EDGE + i * width;
      const shape = rect(Math.min(front, back), y, Math.max(front, back), y + width);
      if (side === target_side && i === 0) {
        b.bay(shape, reverse ? inward + Math.PI : inward, false);
        continue;
      }
      const length = 3.9 + rng() * 0.9;
      const car_width = 1.72 + rng() * 0.13;
      const room = (width - car_width) / 2 - 0.05;
      const offset = Math.max(-room, Math.min(room, (rng() * 2 - 1) * lerp(0.08, 0.2, d)));
      const x = back - side * (0.3 + rng() * 0.25 + length / 2);
      place_car(b, x, y + width / 2 + offset, chance(rng, 0.5) ? inward : inward + Math.PI, length, car_width, rng);
    }
  }
  return b;
}

// Pitches along the north hedge with caravans on them, a track in front, hedges along the south verge. The rig waits
// on the track past its empty pitch and reverses in, caravan first, so the car's nose ends up facing the track.
function camping(d: number, rng: Rng, fit: Fit): Layout {
  const b = new Builder(rng);
  const hedge = 0.7;
  const pitch = lerp(4.6, 3.6, d) + fit.wider;
  const depth = fit.depth;
  const front = EDGE + depth;
  const track = lerp(8.6, 7.8, d) * fit.turn;
  const verge = front + track;
  b.ground(SurfaceKind.GRASS, rect(0, 0, SIZE, SIZE));
  b.ground(SurfaceKind.ASPHALT, rect(EDGE, front, SIZE - EDGE, verge));
  b.ground(SurfaceKind.ASPHALT, rect(GATE_LO, verge, GATE_HI, SIZE));
  const rim = EDGE - 0.9;
  b.block(SolidKind.HEDGE, rim, rim, SIZE - rim, EDGE);
  b.block(SolidKind.HEDGE, rim, EDGE, EDGE, SIZE - rim);
  b.block(SolidKind.HEDGE, SIZE - EDGE, EDGE, SIZE - rim, SIZE - rim);
  for (const y of [verge + 1, SIZE - EDGE]) {
    b.block(SolidKind.HEDGE, EDGE, y, GATE_LO - 0.6, y + 0.9);
    b.block(SolidKind.HEDGE, GATE_HI + 0.6, y, SIZE - EDGE, y + 0.9);
  }

  const count = Math.floor((SIZE - EDGE * 2 - hedge) / (pitch + hedge));
  const from = (SIZE - count * (pitch + hedge) - hedge) / 2;
  const left = (i: number) => from + hedge + i * (pitch + hedge);
  // The rig waits set up on the track, swung out with its tail at the pitch's mouth, the way a driver lines up to back
  // a caravan in; from straight on the track the search takes minutes a pitch. The car's nose has to clear the hedge.
  const cos = Math.cos(SWING);
  const sin = Math.sin(SWING);
  const start_at = (i: number) => left(i) + pitch / 2 + 1.5 + fit.rear * cos;
  let last = 1;
  for (let i = 1; i < count - 1; i++) if (start_at(i) + 0.8 + (fit.length - fit.rear) * cos + 1.2 <= SIZE - EDGE - 0.3) last = i;
  const target = 1 + Math.floor(rng() * last);
  const fill = lerp(0.6, 0.95, d);
  const stub = front - lerp(1.2, 0.4, d);
  for (let i = 0; i < count; i++) {
    const x = left(i);
    b.block(SolidKind.HEDGE, x - hedge, EDGE, x, stub);
    if (i === count - 1) b.block(SolidKind.HEDGE, x + pitch, EDGE, x + pitch + hedge, stub);
    b.line({ x, y: front }, { x: x + pitch, y: front }, MarkKind.DASH);
    if (i === target) {
      b.bay(rect(x, EDGE, x + pitch, front), SOUTH, false);
      continue;
    }
    if (!chance(rng, fill)) continue;
    const room = (pitch - CARAVAN_WIDTH) / 2 - 0.1;
    const centre = x + pitch / 2 + Math.max(-room, Math.min(room, (rng() * 2 - 1) * 0.3));
    const behind = EDGE + 0.3 + rng() * 0.5;
    b.caravan(centre, behind + CARAVAN_LENGTH / 2, SOUTH);
    const space = Math.min(4.6, front - 0.3 - (behind + CARAVAN_LENGTH + 0.3));
    if (space > 3.6 && chance(rng, lerp(0.3, 0.7, d))) b.car(x + pitch / 2, front - 0.3 - space / 2, chance(rng, 0.5) ? SOUTH : NORTH, space);
  }
  const x = start_at(target) + between(rng, 0, 0.8);
  const nose = x + (fit.length - fit.rear) * cos + 1.2;
  const across = nose + between(rng, 2.6, 4.5);
  if (d > 0.45 && across + 2.3 < SIZE - EDGE - 0.2) b.car(across, verge - 1.05, 0, 4.6);
  b.start = { x, y: front + 1.2 + fit.rear * sin, heading: SWING };
  return chance(rng, 0.5) ? mirror(b) : b;
}

// Dock doors along the north wall, each with a bumper either side; the rest of the doors have a truck or a dropped
// semi-trailer backed onto them. A semi or a box truck reverses square onto the free door, nose out; it waits set up on
// the apron past the door, swung away from it, the way a driver lines up a blind-side reverse.
function loading_dock(d: number, rng: Rng, fit: Fit): Layout {
  if (fit.links >= 2) return dock_lanes(d, rng, fit);
  const b = new Builder(rng);
  const width = lerp(4.2, 3.6, d) + fit.wider;
  const front = EDGE + fit.depth;
  b.ground(SurfaceKind.ASPHALT, rect(EDGE, EDGE, SIZE - EDGE, SIZE - EDGE));
  b.ground(SurfaceKind.ASPHALT, rect(GATE_LO, SIZE - EDGE, GATE_HI, SIZE));
  b.perimeter(SolidKind.WALL);
  const doors = row(EDGE + 1, SIZE - EDGE - 1, width, front, EDGE, "centre");
  draw_row(b, doors);
  const count = doors.xs.length;
  const swing = lerp(0.55, 0.45, d);
  // Only doors with room on the apron for the whole rig, set up to one side of them.
  const span = (fit.length + 1) * Math.cos(swing) + 2.5;
  const fits = (i: number) => {
    const door = doors.xs[i] + width / 2;
    return door < SIZE / 2 ? door + span <= SIZE - EDGE : door - span >= EDGE;
  };
  const choices = Array.from({ length: count - 2 }, (_, k) => k + 1).filter(fits);
  const target = choices[Math.floor(rng() * choices.length)];
  const fill = lerp(0.55, 1, d);
  doors.xs.forEach((x, i) => {
    b.line({ x: x + 0.45, y: EDGE + 0.06 }, { x: x + width - 0.45, y: EDGE + 0.06 }, MarkKind.STOP);
    for (const at of [x + 0.2, x + width - 0.45]) b.block(SolidKind.POST, at, EDGE, at + 0.25, EDGE + 0.2);
    if (i === target) {
      b.bay(rect(x, EDGE, x + width, front), SOUTH, false);
      return;
    }
    const near = Math.abs(i - target) === 1;
    if (!near && !chance(rng, fill)) return;
    const vehicle = chance(rng, lerp(0.3, 0.75, d)) ? Vehicle.SEMI : Vehicle.BOX_TRUCK;
    const length = vehicle === Vehicle.SEMI ? DROPPED_TRAILER.length : BOX_TRUCK.length;
    const room = (width - 2.55) / 2 - 0.08;
    b.truck(x + width / 2 + Math.max(-room, Math.min(room, (rng() * 2 - 1) * 0.2)), EDGE + 0.3 + length / 2, SOUTH, vehicle);
  });
  const door = doors.xs[target] + width / 2;
  const toward = door < SIZE / 2 ? 1 : -1;
  // The tail already at the mouth, clear of the dropped trailers either side, the rig angled away down the apron.
  const tail = { x: door + toward * between(rng, 0.3, 1.5), y: Math.max(front - lerp(1, 2, d), EDGE + 0.3 + DROPPED_TRAILER.length + 1.4) };
  const heading = toward > 0 ? swing : Math.PI - swing;
  b.start = { x: tail.x + Math.cos(heading) * fit.rear, y: tail.y + Math.sin(heading) * fit.rear, heading };
  return b;
}

// A rig of two or more hinges can't be backed in, so its dock is drive-through: lanes run north from the gate along
// the dock, and it pulls nose first into the free one, a metre or two to the side of the road's lane.
function dock_lanes(d: number, rng: Rng, fit: Fit): Layout {
  const b = new Builder(rng);
  const width = lerp(4.2, 3.7, d);
  const front = EDGE + fit.depth;
  b.ground(SurfaceKind.ASPHALT, rect(EDGE, EDGE, SIZE - EDGE, SIZE - EDGE));
  b.ground(SurfaceKind.ASPHALT, rect(GATE_LO, SIZE - EDGE, GATE_HI, SIZE));
  b.perimeter(SolidKind.WALL);
  // The lanes are laid out from the free one, so it sits exactly the seed's offset from the road's lane.
  // A road train's tail takes longer to follow it across, so its lane is nearer.
  const reach = fit.length > 20 ? 0.7 : 1;
  const centre = 18 + (chance(rng, 0.5) ? -1 : 1) * reach * between(rng, lerp(1.1, 1.5, d), lerp(1.9, 2.4, d));
  const first = centre - width / 2 - Math.floor((centre - width / 2 - EDGE) / width) * width;
  const lanes = row(first, SIZE - EDGE, width, front, EDGE, "start");
  draw_row(b, lanes);
  const target = Math.round((centre - width / 2 - first) / width);
  const swing = [Math.min(18, centre) - 1.5, Math.max(18, centre) + 1.5];
  const fill = lerp(0.6, 1, d);
  lanes.xs.forEach((x, i) => {
    b.line({ x: x + 0.45, y: EDGE + 0.06 }, { x: x + width - 0.45, y: EDGE + 0.06 }, MarkKind.STOP);
    if (i === target) {
      b.bay(rect(x, EDGE, x + width, front), NORTH, false);
      return;
    }
    if ((x < swing[1] && x + width > swing[0]) || !chance(rng, fill)) return;
    const vehicle = chance(rng, 0.5) ? Vehicle.SEMI : Vehicle.BOX_TRUCK;
    const length = vehicle === Vehicle.SEMI ? DROPPED_TRAILER.length : BOX_TRUCK.length;
    b.truck(x + width / 2, EDGE + 0.3 + length / 2, SOUTH, vehicle);
  });
  return b;
}

/** A lot laid out in its own frame: 32 m square, the way in through the south edge between x 12 and 20. */
export function build_lot(
  scenario: Scenario,
  difficulty: number,
  open: boolean,
  rng: Rng,
  spec: VehicleSpec = HATCHBACK
): Layout {
  const fit = fit_for(spec);
  switch (scenario) {
    case Scenario.PARALLEL:
      return parallel(difficulty, rng, fit);
    case Scenario.FORWARD:
      return rows(difficulty, rng, open, RowsKind.FORWARD, fit);
    case Scenario.REVERSE:
      return rows(difficulty, rng, open, RowsKind.REVERSE, fit);
    case Scenario.PILLARS:
      return rows(difficulty, rng, open, RowsKind.PILLARS, fit);
    case Scenario.ANGLED:
      return angled(difficulty, rng, open, fit);
    case Scenario.GARAGE:
      return garage(difficulty, rng, fit);
    case Scenario.DOOR:
      return door(difficulty, rng, fit);
    case Scenario.NARROW:
      return narrow(difficulty, rng, fit);
    case Scenario.DEAD_END:
      return dead_end(difficulty, rng, fit);
    case Scenario.BUS_STOP:
      return bus_stop(difficulty, rng, fit);
    case Scenario.DEPOT:
      return depot(difficulty, rng, fit);
    case Scenario.DRIVEWAY:
      return driveway(difficulty, rng, fit);
    case Scenario.SLIPWAY:
      return slipway(difficulty, rng, fit);
    case Scenario.END_BAY:
      return end_bay(difficulty, rng, fit);
    case Scenario.CAMPING:
      return camping(difficulty, rng, fit);
    case Scenario.LOADING_DOCK:
      return loading_dock(difficulty, rng, fit);
  }
}
