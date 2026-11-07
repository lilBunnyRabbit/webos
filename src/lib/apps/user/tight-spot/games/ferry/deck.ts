import { create_rng, shuffle, type Rng } from "$lib/core/utils/random";
import { bounds_of, lerp, rect, type Bounds, type Polygon, type Pose, type Vec } from "$kit/games/play2d/geometry";
import { under_headroom } from "../../core/garage";
import { SolidKind, type Portal, type Solid } from "../../core/scene";
import { hash } from "$kit/games/play2d/seed";
import { rig_ends, rig_length, Vehicle, VEHICLES } from "../../core/vehicle";

export const CARGO = [
  Vehicle.CITY,
  Vehicle.HATCH,
  Vehicle.SUV,
  Vehicle.PICKUP,
  Vehicle.VAN,
  Vehicle.BOX_TRUCK,
  Vehicle.BUS,
  Vehicle.MOTORCYCLE,
  Vehicle.SEMI,
  Vehicle.CARAVAN,
] as const;
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
  semi: 18,
  caravan: 2.8,
};

// Now and then a motorcycle takes the place of a city car, one a sailing at most: a filler that squeezes in anywhere.
const MOTORCYCLE_SHARE = 0.08;

const HEAVY = new Set<Cargo>([Vehicle.BOX_TRUCK, Vehicle.BUS, Vehicle.SEMI]);

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
const STRIP = 3.4;
const DIVIDER = 0.2;
/** From the foot of the internal ramp to its top, where a vehicle passes to the upper deck. */
const RISE = 8;
// Past the stern apron before the internal ramp starts: room for the swing across to its lane from the middle of the linkspan.
const SWING = 4;
/** Kept clear past the top on the main deck and behind it on the upper: a van's reach past its reference point, and room. */
const RISE_AHEAD = 5.5;
const RISE_BEHIND = 2.5;
/** On the upper deck, from the top of the ramp to where its lanes start: room to swing across to the port lanes. */
const UPPER_APRON = 9;
const DECK_GAP = 7;
const MOUTH = 0.5;
const BAR = 0.3;
/** How far the linkspan's foot moves across at the top of the tide, and how much longer it runs. */
const TIDE_SHIFT = 2.4;
const TIDE_RUN = 3;

/** What a level brings in besides its vehicle count: nothing on the first twelve levels or on random sailings. */
export interface Kit {
  /** Vehicles every queue carries, the rest dealt as usual. */
  must?: readonly Cargo[];
  /** How many of the queue the packing puts on the upper car deck; the ship has one when this is set. */
  upper?: number;
  /** −1 low water to 1 high: the linkspan's foot sits that far across the quay's opening, and runs longer. */
  tide?: number;
}

export interface Slot {
  lane: number;
  pose: Pose;
}

export interface Upper {
  /** The upper deck's frame on the canvas: a point on it is `offset` across from the same point on the main deck. */
  offset: number;
  start: number;
  /** The top of the internal ramp, on both decks. */
  top: number;
  foot: number;
  floor: Polygon;
  hull: Polygon;
  ramp: Polygon;
  head: Polygon;
  /** Across the foot of the ramp: a solid for anything that doesn't fit under the upper deck. */
  bar: Polygon;
  lane: number;
}

export interface Deck {
  lanes: number;
  lane_width: number;
  length: number;
  /** Across the lanes, port side (y = 0) to starboard. */
  width: number;
  /** Across the hull inside its walls: the lanes, and the internal ramp's lane when there's an upper deck. */
  beam: number;
  ramp: [number, number];
  ramp_length: number;
  /** How far across the linkspan's foot sits from the stern's opening, to port: the tide. */
  ramp_shift: number;
  tide: number;
  upper: Upper | null;
  portals: Portal[];
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
  /** Waiting on the marshalling lanes behind the quay, by queue index: each one's middle. */
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

export function lane_centre(deck: Pick<Deck, "lane_width" | "lanes" | "upper">, lane: number): number {
  if (deck.upper && lane >= deck.lanes) return deck.upper.offset + (lane - deck.lanes + 0.5) * deck.lane_width;
  return (lane + 0.5) * deck.lane_width;
}

export function length_of(vehicle: Cargo): number {
  return rig_length(VEHICLES[vehicle]);
}

/** Cars and vans go up to the car deck; anything taller, longer or towing stops at the bar. */
export function fits_upper(vehicle: Cargo): boolean {
  return under_headroom(VEHICLES[vehicle]);
}

/** A point's position across the ship in its own deck's frame: the balance weighs both decks about one centre line. */
export function across(deck: Pick<Deck, "upper">, y: number): number {
  return deck.upper && y < -HULL - DECK_GAP / 2 ? y - deck.upper.offset : y;
}

export function on_upper(deck: Pick<Deck, "upper">, y: number): boolean {
  return deck.upper !== null && y < -HULL - DECK_GAP / 2;
}

export function solids_for(deck: Deck, vehicle: Cargo): Solid[] {
  if (!deck.upper || fits_upper(vehicle)) return deck.solids;
  return [...deck.solids, { kind: SolidKind.WALL, shape: deck.upper.bar }];
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

function pick_cargo(rng: Rng, count: number, difficulty: number, must: readonly Cargo[] = []): Cargo[] {
  const picked: Cargo[] = [...must];
  let heavy = must.filter((each) => HEAVY.has(each)).length;
  let buses = must.filter((each) => each === Vehicle.BUS).length;
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

interface Hold {
  lanes: number;
  lane_width: number;
  upper: number;
  lead: number;
}

/**
 * Every way to put the vehicles in lanes (four lanes and six vehicles is 4096; with an upper deck, cars and vans may go
 * in its lanes too): the balanced ones that leave the shortest longest lane win, one picked by the seed among those
 * within half a metre of it.
 */
function best_packing(cargo: readonly Cargo[], hold: Hold, rng: Rng): Packing | null {
  const { lanes, lane_width } = hold;
  const width = lanes * lane_width;
  const all = hold.upper > 0 ? lanes * 2 : lanes;
  const choices = cargo.map((vehicle) => (hold.upper > 0 && fits_upper(vehicle) ? all : lanes));
  const total = choices.reduce((product, each) => product * each, 1);
  const fits: Packing[] = [];
  for (let code = 0; code < total; code++) {
    const into: number[][] = Array.from({ length: all }, () => []);
    let rest = code;
    let up = 0;
    for (let i = 0; i < cargo.length; i++) {
      const lane = rest % choices[i];
      into[lane].push(i);
      if (lane >= lanes) up++;
      rest = Math.floor(rest / choices[i]);
    }
    if (up !== hold.upper) continue;
    const balance = moment(
      into.flatMap((lane, k) => lane.map((i) => ({ vehicle: cargo[i], y: ((k % lanes) + 0.5) * lane_width }))),
      width
    );
    if (Math.abs(balance) > BALANCE_LIMIT * 0.6) continue;
    const longest = Math.max(...into.map((lane, k) => lane.reduce((sum, i) => sum + length_of(cargo[i]) + PACK_GAP, 0) + (k >= lanes && lane.length ? hold.lead : 0)));
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
 * has the open stern behind the ones already aboard. A level's kit can add vehicles to the queue, an upper car deck up
 * an internal ramp along the starboard side, and a tide that sets the linkspan at an angle.
 */
export function build_deck(seed: number, difficulty: number, count: number, kit: Kit = {}): Deck {
  const rng = create_rng(hash(seed, 0xfe44));
  const t = Math.max(0, Math.min(1, difficulty));
  const up = kit.upper ?? 0;
  const must = kit.must ?? [];
  const hold_of = (shape: Layout): Hold => ({ lanes: shape.lanes, lane_width: shape.lane_width, upper: up, lead: SWING + RISE + UPPER_APRON });
  let cargo = pick_cargo(rng, count, t, must);
  let shape = layout(rng, t, count);
  let packing = best_packing(cargo, hold_of(shape), rng);
  // Rare: a set with no balanced packing (a bus and a car alone in an even number of lanes) is dealt again.
  for (let tries = 0; !packing && tries < 30; tries++) {
    cargo = pick_cargo(rng, count, t, must);
    shape = layout(rng, t, count);
    packing = best_packing(cargo, hold_of(shape), rng);
  }
  if (!packing) {
    cargo = Array.from({ length: count }, (_, i) => (i % 2 ? Vehicle.HATCH : Vehicle.VAN));
    shape = { ...shape, lanes: count >= 5 ? 4 : 3 };
    packing = best_packing(cargo, hold_of(shape), rng)!;
  }
  const { lanes, lane_width, apron, narrow } = shape;
  const width = lanes * lane_width;
  const beam = up > 0 ? width + STRIP : width;
  const length = Math.ceil((packing.longest + apron) * 2) / 2;
  const offset = -(HULL * 2 + DECK_GAP + beam);

  const slots: { index: number; slot: Slot; front: number; tie: number }[] = [];
  packing.lanes.forEach((members, lane) => {
    let front = length - PACK_GAP;
    const y = lane >= lanes ? offset + (lane - lanes + 0.5) * lane_width : (lane + 0.5) * lane_width;
    // A motorcycle goes to the back of its lane: in front, it would leave the car behind it a bike's room to swing in.
    const order = shuffle([...members], rng).sort((a, b) => Number(cargo[a] === Vehicle.MOTORCYCLE) - Number(cargo[b] === Vehicle.MOTORCYCLE));
    for (const i of order) {
      const ends = rig_ends(VEHICLES[cargo[i]]);
      const pose = { x: front - ends.front, y, heading: 0 };
      slots.push({ index: i, slot: { lane, pose }, front, tie: rng() });
      front -= ends.front - ends.rear + PACK_GAP;
    }
  });
  slots.sort((a, b) => b.front - a.front || a.tie - b.tie);
  const queue = slots.map((each) => cargo[each.index]);
  const plan = slots.map((each) => each.slot);

  const tide = Math.max(-1, Math.min(1, kit.tide ?? 0));
  const shift = tide * TIDE_SHIFT;
  const ramp_length = RAMP + Math.abs(tide) * TIDE_RUN;
  const ramp: [number, number] = [narrow, beam - narrow];
  const longest_wait = Math.max(...queue.map(length_of));
  const quay_x = -ramp_length - RUN_UP - longest_wait - QUAY_BACK;
  const top = -QUAY_SIDE - shift;
  const bottom = beam + QUAY_SIDE - shift;
  const water_top = Math.min(top, -QUAY_SIDE) - FENCE;
  const water_bottom = Math.max(bottom, beam + QUAY_SIDE) + FENCE;
  // The linkspan's edge at x: from its foot on the quay, `shift` to port, to the stern's opening.
  const edge = (y: number, x: number) => y - shift * (-x / ramp_length);
  const marshal_x = quay_x - FENCE - longest_wait - 1.5;
  const waiting = queue.map((vehicle, i) => {
    const y = beam / 2 - shift + (i - (queue.length - 1) / 2) * MARSHAL_PITCH;
    return { x: quay_x - FENCE - 0.8 - length_of(vehicle) / 2, y, heading: 0 };
  });

  const solids: Solid[] = [
    { kind: SolidKind.WALL, shape: rect(-HULL, -HULL, length + HULL, 0) },
    { kind: SolidKind.WALL, shape: rect(-HULL, beam, length + HULL, beam + HULL) },
    { kind: SolidKind.WALL, shape: rect(length, 0, length + HULL, beam) },
    {
      kind: SolidKind.WATER,
      shape: [
        { x: -ramp_length, y: water_top },
        { x: -HULL, y: water_top },
        { x: -HULL, y: edge(ramp[0], -HULL) },
        { x: -ramp_length, y: ramp[0] - shift },
      ],
    },
    {
      kind: SolidKind.WATER,
      shape: [
        { x: -ramp_length, y: ramp[1] - shift },
        { x: -HULL, y: edge(ramp[1], -HULL) },
        { x: -HULL, y: water_bottom },
        { x: -ramp_length, y: water_bottom },
      ],
    },
    { kind: SolidKind.WALL, shape: rect(quay_x - FENCE, top - FENCE, quay_x, bottom + FENCE) },
    { kind: SolidKind.WALL, shape: rect(quay_x, top - FENCE, -ramp_length, top) },
    { kind: SolidKind.WALL, shape: rect(quay_x, bottom, -ramp_length, bottom + FENCE) },
  ];
  if (ramp[0] > 0) {
    solids.push({ kind: SolidKind.WALL, shape: rect(-HULL, 0, 0, ramp[0]) });
    solids.push({ kind: SolidKind.WALL, shape: rect(-HULL, ramp[1], 0, beam) });
  }

  let upper: Upper | null = null;
  const portals: Portal[] = [];
  let upper_top = water_top;
  if (up > 0) {
    const foot = apron + SWING;
    const crest = foot + RISE;
    const start = crest - RISE_BEHIND;
    const lane = width + DIVIDER + (STRIP - DIVIDER) / 2;
    const inside = width + DIVIDER;
    solids.push({ kind: SolidKind.WALL, shape: rect(foot, width, crest + RISE_AHEAD, inside) });
    if (crest + RISE_AHEAD < length) solids.push({ kind: SolidKind.WALL, shape: rect(crest + RISE_AHEAD, width, length, beam) });
    solids.push({ kind: SolidKind.WALL, shape: rect(start - HULL, offset - HULL, length + HULL, offset) });
    solids.push({ kind: SolidKind.WALL, shape: rect(start - HULL, offset + beam, length + HULL, offset + beam + HULL) });
    solids.push({ kind: SolidKind.WALL, shape: rect(length, offset, length + HULL, offset + beam) });
    solids.push({ kind: SolidKind.WALL, shape: rect(start - HULL, offset, start, offset + beam) });
    portals.push({
      mouth: rect(crest, inside, crest + MOUTH, beam),
      heading: 0,
      from: { x: crest, y: lane, heading: 0 },
      to: { x: crest, y: lane + offset, heading: 0 },
    });
    portals.push({
      mouth: rect(crest - MOUTH, offset + inside, crest, offset + beam),
      heading: Math.PI,
      from: { x: crest, y: lane + offset, heading: Math.PI },
      to: { x: crest, y: lane, heading: Math.PI },
    });
    upper = {
      offset,
      start,
      top: crest,
      foot,
      floor: rect(start, offset, length, offset + beam),
      hull: [
        { x: start - HULL, y: offset - HULL },
        { x: length + HULL, y: offset - HULL },
        { x: length + HULL + BOW, y: offset + beam / 2 },
        { x: length + HULL, y: offset + beam + HULL },
        { x: start - HULL, y: offset + beam + HULL },
      ],
      ramp: rect(foot, inside, crest + RISE_AHEAD, beam),
      head: rect(start, offset + inside, crest + 1, offset + beam),
      bar: rect(foot - BAR, inside, foot, beam),
      lane,
    };
    upper_top = offset - HULL;
  }

  const hull: Vec[] = [
    { x: -HULL, y: -HULL },
    { x: length + HULL, y: -HULL },
    { x: length + HULL + BOW, y: beam / 2 },
    { x: length + HULL, y: beam + HULL },
    { x: -HULL, y: beam + HULL },
  ];
  return {
    lanes,
    lane_width,
    length,
    width,
    beam,
    ramp,
    ramp_length,
    ramp_shift: shift,
    tide,
    upper,
    portals,
    bounds: bounds_of([...rect(marshal_x, Math.min(water_top, upper_top), length + HULL + BOW, water_bottom)]),
    floor: rect(0, 0, length, beam),
    ramp_shape: [
      { x: -ramp_length, y: ramp[0] - shift },
      { x: 0, y: ramp[0] },
      { x: 0, y: ramp[1] },
      { x: -ramp_length, y: ramp[1] - shift },
    ],
    quay: rect(quay_x, top, -ramp_length, bottom),
    marshal: rect(marshal_x, top - FENCE, quay_x - FENCE, bottom + FENCE),
    hull,
    solids,
    queue,
    plan,
    waiting,
  };
}

/** Where a vehicle comes onto the quay: lined up with the linkspan's foot, its nose a short run up from it. */
export function spawn_pose(deck: Deck, vehicle: Cargo): Pose {
  const nose = -deck.ramp_length - RUN_UP;
  return { x: nose - rig_ends(VEHICLES[vehicle]).front, y: (deck.ramp[0] + deck.ramp[1]) / 2 - deck.ramp_shift, heading: 0 };
}
