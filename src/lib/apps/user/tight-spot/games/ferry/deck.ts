import { create_rng, shuffle, type Rng } from "$lib/core/utils/random";
import { bounds_of, lerp, rect, type Bounds, type Polygon, type Pose, type Vec } from "../../core/geometry";
import { SolidKind, type Solid } from "../../core/scene";
import { hash } from "../../core/seed";
import { body_ends, Vehicle, VEHICLES } from "../../core/vehicle";

export const CARGO = [Vehicle.CITY, Vehicle.HATCH, Vehicle.SUV, Vehicle.PICKUP, Vehicle.VAN, Vehicle.BOX_TRUCK, Vehicle.BUS, Vehicle.MOTORCYCLE] as const;
export type Cargo = (typeof CARGO)[number];

/** Tonnes, laden: what the balance weighs. */
export const WEIGHT: Record<Cargo, number> = {
  city: 1.0,
  hatch: 1.3,
  suv: 2.2,
  pickup: 2.3,
  van: 2.8,
  "box-truck": 7.5,
  bus: 12,
  motorcycle: 0.25,
};

// Now and then a motorcycle takes the place of a city car, one a sailing at most: a filler that squeezes in anywhere.
const MOTORCYCLE_SHARE = 0.08;

const HEAVY = new Set<Cargo>([Vehicle.BOX_TRUCK, Vehicle.BUS]);

/** The balance a sailing may end with and keep its star: the load's moment as a share of the most it could be. */
export const BALANCE_LIMIT = 0.12;
/** The gap a solution packing leaves to the one ahead; a driver may stop anywhere from 0.3 to 1 m. */
export const PACK_GAP = 0.7;

export const HULL = 0.4;
export const RAMP = 6;
const QUAY_SIDE = 3;
/** Behind the longest vehicle in the queue as it waits its turn. */
const QUAY_BACK = 3;
const FENCE = 0.3;
const RUN_UP = 1.5;
const MARSHAL_PITCH = 3;
const BOW = 5;

export interface Slot {
  lane: number;
  pose: Pose;
}

export interface Deck {
  lanes: number;
  lane_width: number;
  length: number;
  /** Across the lanes, port side (y = 0) to starboard. */
  width: number;
  ramp: [number, number];
  bounds: Bounds;
  floor: Polygon;
  ramp_shape: Polygon;
  quay: Polygon;
  marshal: Polygon;
  /** The hull as seen from above, pointed bow included: drawn under the deck. */
  hull: Polygon;
  /** Walls, the water by the ramp and the quay's fences: everything a round can touch but the vehicles on board. */
  solids: Solid[];
  queue: Cargo[];
  /** Where the packing the deck was built from puts each one, in queue order. */
  plan: Slot[];
  /** Waiting on the marshalling lanes behind the quay, by queue index: each one's body centre. */
  waiting: Pose[];
}

export interface Layout {
  lanes: number;
  lane_width: number;
  /** Room at the stern the packing leaves free, to swing into a lane. */
  apron: number;
  narrow: number;
}

export function layout(rng: Rng, difficulty: number, count: number): Layout {
  const t = Math.max(0, Math.min(1, difficulty));
  return {
    lanes: count >= 5 || t >= 0.6 ? 4 : 3,
    lane_width: lerp(3.5, 3.1, t) + rng() * 0.1,
    apron: lerp(8, 4, t),
    narrow: lerp(0.2, 0.9, t),
  };
}

export function lane_centre(deck: Pick<Deck, "lane_width">, lane: number): number {
  return (lane + 0.5) * deck.lane_width;
}

export function length_of(vehicle: Cargo): number {
  return VEHICLES[vehicle].length;
}

/** The share of the most it could be: −1 all on the port side's edge, 1 all on starboard's, 0 level. */
export function moment(items: readonly { vehicle: Cargo; y: number }[], width: number): number {
  let total = 0;
  let turn = 0;
  for (const item of items) {
    total += WEIGHT[item.vehicle];
    turn += WEIGHT[item.vehicle] * (item.y - width / 2);
  }
  return total === 0 ? 0 : turn / (total * (width / 2));
}

function pick_cargo(rng: Rng, count: number, difficulty: number): Cargo[] {
  const picked: Cargo[] = [];
  let heavy = 0;
  let buses = 0;
  while (picked.length < count) {
    const roll = rng();
    let vehicle: Cargo;
    if (roll < 0.1 + difficulty * 0.05 && buses === 0) vehicle = Vehicle.BUS;
    else if (roll < 0.27 + difficulty * 0.05) vehicle = Vehicle.BOX_TRUCK;
    else if (roll < 0.47) vehicle = Vehicle.VAN;
    else {
      const car = rng();
      vehicle = car < MOTORCYCLE_SHARE && !picked.includes(Vehicle.MOTORCYCLE) ? Vehicle.MOTORCYCLE : CARGO[Math.floor(car * 4)];
    }
    if (HEAVY.has(vehicle) && heavy >= 2) continue;
    if (HEAVY.has(vehicle)) heavy++;
    if (vehicle === Vehicle.BUS) buses++;
    picked.push(vehicle);
  }
  return picked;
}

interface Packing {
  lanes: number[][];
  longest: number;
  balance: number;
}

/**
 * Every way to put the vehicles in lanes (four lanes and six vehicles is 4096): the balanced ones that leave the shortest
 * longest lane win, one picked by the seed among those within half a metre of it.
 */
function best_packing(cargo: readonly Cargo[], lanes: number, lane_width: number, rng: Rng): Packing | null {
  const width = lanes * lane_width;
  const fits: Packing[] = [];
  const total = lanes ** cargo.length;
  for (let code = 0; code < total; code++) {
    const into: number[][] = Array.from({ length: lanes }, () => []);
    let rest = code;
    for (let i = 0; i < cargo.length; i++) {
      into[rest % lanes].push(i);
      rest = Math.floor(rest / lanes);
    }
    const balance = moment(
      into.flatMap((lane, k) => lane.map((i) => ({ vehicle: cargo[i], y: (k + 0.5) * lane_width }))),
      width
    );
    if (Math.abs(balance) > BALANCE_LIMIT * 0.6) continue;
    const longest = Math.max(...into.map((lane) => lane.reduce((sum, i) => sum + length_of(cargo[i]) + PACK_GAP, 0)));
    fits.push({ lanes: into, longest, balance });
  }
  if (fits.length === 0) return null;
  const shortest = Math.min(...fits.map((fit) => fit.longest));
  const close = fits.filter((fit) => fit.longest <= shortest + 0.5);
  return close[Math.floor(rng() * close.length)];
}

/**
 * A ferry from a seed: the packing comes first (the queue's vehicles in lanes, balanced, gaps of 0.7 m), the deck is
 * built round it with an apron at the stern to swing in, and the queue drives on frontmost slot first, so every vehicle
 * has the open stern behind the ones already aboard.
 */
export function build_deck(seed: number, difficulty: number, count: number): Deck {
  const rng = create_rng(hash(seed, 0xfe44));
  const t = Math.max(0, Math.min(1, difficulty));
  let cargo = pick_cargo(rng, count, t);
  let shape = layout(rng, t, count);
  let packing = best_packing(cargo, shape.lanes, shape.lane_width, rng);
  // Rare: a set with no balanced packing (a bus and a car alone in an even number of lanes) is dealt again.
  for (let tries = 0; !packing && tries < 30; tries++) {
    cargo = pick_cargo(rng, count, t);
    shape = layout(rng, t, count);
    packing = best_packing(cargo, shape.lanes, shape.lane_width, rng);
  }
  if (!packing) {
    cargo = Array.from({ length: count }, (_, i) => (i % 2 ? Vehicle.HATCH : Vehicle.VAN));
    shape = { ...shape, lanes: count >= 5 ? 4 : 3 };
    packing = best_packing(cargo, shape.lanes, shape.lane_width, rng)!;
  }
  const { lanes, lane_width, apron, narrow } = shape;
  const width = lanes * lane_width;
  const length = Math.ceil((packing.longest + apron) * 2) / 2;

  const slots: { index: number; slot: Slot; front: number; tie: number }[] = [];
  packing.lanes.forEach((members, lane) => {
    let front = length - PACK_GAP;
    // A motorcycle goes to the back of its lane: in front, it would leave the car behind it a bike's room to swing in.
    const order = shuffle([...members], rng).sort((a, b) => Number(cargo[a] === Vehicle.MOTORCYCLE) - Number(cargo[b] === Vehicle.MOTORCYCLE));
    for (const i of order) {
      const spec = VEHICLES[cargo[i]];
      const pose = { x: front - body_ends(spec).front, y: (lane + 0.5) * lane_width, heading: 0 };
      slots.push({ index: i, slot: { lane, pose }, front, tie: rng() });
      front -= spec.length + PACK_GAP;
    }
  });
  slots.sort((a, b) => b.front - a.front || a.tie - b.tie);
  const queue = slots.map((each) => cargo[each.index]);
  const plan = slots.map((each) => each.slot);

  const ramp: [number, number] = [narrow, width - narrow];
  const longest_wait = Math.max(...queue.map(length_of));
  const quay_x = -RAMP - RUN_UP - longest_wait - QUAY_BACK;
  const top = -QUAY_SIDE;
  const bottom = width + QUAY_SIDE;
  const marshal_x = quay_x - FENCE - longest_wait - 1.5;
  const waiting = queue.map((vehicle, i) => {
    const y = width / 2 + (i - (queue.length - 1) / 2) * MARSHAL_PITCH;
    return { x: quay_x - FENCE - 0.8 - length_of(vehicle) / 2, y, heading: 0 };
  });

  const solids: Solid[] = [
    { kind: SolidKind.WALL, shape: rect(-HULL, -HULL, length + HULL, 0) },
    { kind: SolidKind.WALL, shape: rect(-HULL, width, length + HULL, width + HULL) },
    { kind: SolidKind.WALL, shape: rect(length, 0, length + HULL, width) },
    { kind: SolidKind.WATER, shape: rect(-RAMP, top - FENCE, -HULL, ramp[0]) },
    { kind: SolidKind.WATER, shape: rect(-RAMP, ramp[1], -HULL, bottom + FENCE) },
    { kind: SolidKind.WALL, shape: rect(quay_x - FENCE, top - FENCE, quay_x, bottom + FENCE) },
    { kind: SolidKind.WALL, shape: rect(quay_x, top - FENCE, -RAMP, top) },
    { kind: SolidKind.WALL, shape: rect(quay_x, bottom, -RAMP, bottom + FENCE) },
  ];
  if (ramp[0] > 0) {
    solids.push({ kind: SolidKind.WALL, shape: rect(-HULL, 0, 0, ramp[0]) });
    solids.push({ kind: SolidKind.WALL, shape: rect(-HULL, ramp[1], 0, width) });
  }

  const hull: Vec[] = [
    { x: -HULL, y: -HULL },
    { x: length + HULL, y: -HULL },
    { x: length + HULL + BOW, y: width / 2 },
    { x: length + HULL, y: width + HULL },
    { x: -HULL, y: width + HULL },
  ];
  return {
    lanes,
    lane_width,
    length,
    width,
    ramp,
    bounds: bounds_of([...rect(marshal_x, top - FENCE, length + HULL + BOW, bottom + FENCE)]),
    floor: rect(0, 0, length, width),
    ramp_shape: rect(-RAMP, ramp[0], 0, ramp[1]),
    quay: rect(quay_x, top, -RAMP, bottom),
    marshal: rect(marshal_x, top - FENCE, quay_x - FENCE, bottom + FENCE),
    hull,
    solids,
    queue,
    plan,
    waiting,
  };
}

/** Where a vehicle comes onto the quay: lined up with the ramp's middle, its nose a short run up from the foot. */
export function spawn_pose(deck: Deck, vehicle: Cargo): Pose {
  const spec = VEHICLES[vehicle];
  const nose = -RAMP - RUN_UP;
  return { x: nose - body_ends(spec).front, y: (deck.ramp[0] + deck.ramp[1]) / 2, heading: 0 };
}
