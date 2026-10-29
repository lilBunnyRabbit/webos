import { inside_convex } from "../core/collision";
import { bounds_of, oriented_box, rect, type Bounds, type Polygon, type Pose, type Vec } from "../core/geometry";
import { under_headroom } from "../core/garage";
import { CHUNK } from "../core/lot";
import { collide, obstacles, type Obstacles, type Scene } from "../core/obstacles";
import { pass_portals } from "../core/portals";
import { MarkKind, SolidKind, SurfaceKind, type Mark, type Solid, type Surface } from "../core/scene";
import {
  bodies,
  body_centre,
  rig_ends,
  create_car,
  DriveKind,
  Gear,
  hitch_point,
  jackknife,
  nose as vehicle_nose,
  pose_from_centre,
  rig_length,
  step,
  to_world,
  Vehicle,
  type Car,
  type Input,
  type Placement,
  type VehicleSpec,
} from "../core/vehicle";
import { Building } from "../games/define";
import { blueprint, box, disc, DOOR_HALF, RECESS, shape_at, to_town, type Frame } from "./blueprints";
import { build_car_park, type CarPark } from "./car-park";

const WALL = 0.4;
const NORTH = -Math.PI / 2;
const SOUTH = Math.PI / 2;
const EAST = 0;
const WEST = Math.PI;
const APRON = 4;
const CONE = 0.45;
const TREE = 1.1;

export interface Shelf {
  id: string;
  name: string;
  vehicles: readonly Vehicle[];
}

/** The garage's vehicles in shelves, so a phone's card shows a handful at a time; every vehicle is on one. */
export const GARAGE: readonly Shelf[] = [
  { id: "cars", name: "Cars", vehicles: [Vehicle.HATCH, Vehicle.CITY, Vehicle.SUV, Vehicle.GT, Vehicle.LIMO, Vehicle.VAN, Vehicle.PICKUP, Vehicle.CAMPER] },
  { id: "service", name: "Service", vehicles: [Vehicle.TAXI, Vehicle.POLICE, Vehicle.AMBULANCE, Vehicle.FIRE, Vehicle.LADDER, Vehicle.GARBAGE, Vehicle.BAGGAGE] },
  { id: "buses", name: "Buses", vehicles: [Vehicle.BUS, Vehicle.DECKER, Vehicle.COACH, Vehicle.ARTIC] },
  { id: "trucks", name: "Trucks", vehicles: [Vehicle.BOX_TRUCK, Vehicle.SEMI, Vehicle.DRAWBAR, Vehicle.ROAD_TRAIN] },
  { id: "towing", name: "Towing", vehicles: [Vehicle.TOWING, Vehicle.CARAVAN, Vehicle.BOAT, Vehicle.HORSE_BOX, Vehicle.TRACTOR, Vehicle.TRACTOR_TWO, Vehicle.QUAD] },
  {
    id: "machines",
    name: "Machines",
    vehicles: [Vehicle.FORKLIFT, Vehicle.BOBCAT, Vehicle.TELEHANDLER, Vehicle.LOADER, Vehicle.DUMPER, Vehicle.MOWER, Vehicle.TANK],
  },
  { id: "fun", name: "Fun", vehicles: [Vehicle.MOTORCYCLE, Vehicle.TUK_TUK, Vehicle.GOLF_CART, Vehicle.RESURFACER, Vehicle.TROLLEY, Vehicle.F1] },
];

export function shelf_of(vehicle: Vehicle): Shelf {
  return GARAGE.find((shelf) => shelf.vehicles.includes(vehicle)) ?? GARAGE[0];
}

export const District = {
  TOWN: "town",
  SPORT: "sport",
  WATERFRONT: "waterfront",
  INDUSTRIAL: "industrial",
  LOTS: "lots",
} as const;
export type District = (typeof District)[keyof typeof District];

// The hub's own map, so the game contract doesn't change; a game it doesn't name gets a lot past the gate.
const DISTRICTS: Record<string, District> = {
  parking: District.TOWN,
  valet: District.TOWN,
  mower: District.TOWN,
  test: District.TOWN,
  f1: District.SPORT,
  rodeo: District.SPORT,
  ferry: District.WATERFRONT,
  airport: District.WATERFRONT,
  forklift: District.INDUSTRIAL,
};

export function district_of(id: string): District {
  return DISTRICTS[id] ?? District.LOTS;
}

export interface Plot {
  shape: Polygon;
  /** The doorway and the apron in front of it: the vehicle's nose in here offers the game. */
  door: Polygon;
  /** The doorway cut into the building, lit inside. */
  recess: Polygon;
  mouth: Vec;
  /** The heading out of the doorway onto the ring road, toward the plaza. */
  facing: number;
  /** A game is registered for it; a closed one has its shutter down. */
  open: boolean;
  game: string | null;
  building: Building | null;
  district: District;
}

export interface House {
  shape: Polygon;
  ridge: [Vec, Vec];
  paint: number;
}

export interface Yard {
  /** The town; the car park's floors lie beside it. */
  bounds: Bounds;
  /** The town and the car park's floors. */
  world: Bounds;
  car_park: CarPark | null;
  /** What a car or a van runs into, and what anything taller does: the car park's bar too. */
  scenes: { low: Scene; tall: Scene };
  /** What the landing frames: the gate, the plaza and the buildings nearest it, not the whole town. */
  landing: Bounds;
  /** Inside the four rows of buildings: the ring road, and the plaza in its middle. */
  court: Bounds;
  plaza: Bounds;
  /** Where the quay meets the harbour, along the south edge. */
  quay: number;
  practice: Bounds;
  /** Each district's strip of row, for the ground it's drawn on. */
  districts: { district: District; area: Bounds }[];
  surfaces: Surface[];
  marks: Mark[];
  solids: Solid[];
  /** The solids the core draws (walls, gate posts, parked cars, the harbour); the yard draws the rest. */
  props: Solid[];
  cones: Vec[];
  houses: House[];
  trees: Vec[];
  plots: Plot[];
  pad: Polygon;
  pad_pose: Pose;
  /** The back of the rig at the gate, facing in. */
  gate: Pose;
}

// A slot per building, 16 m along its row and 12 m deep. The court between the rows is at least 40 m across, so a
// 24 m road train just out of a doorway (4.5 m plus its length) stops short of the apron across the court.
const SLOT = 16;
const ROW = 12;
const GATE_GAP = 8;
const PRACTICE = 24;
const HARBOUR = 9;
const MIN_WIDTH = 56;
const MIN_HEIGHT = 40;
const RING = 10;
const LANE = 6;
// Narrower than the gap between two doorways' lines across the plaza, so a long rig out of a doorway isn't on it.
const PAD_LENGTH = 12;
const PAD_WIDTH = 7;
const GATE_HALF = 4;
const SIDEWALK = 2;

type SideName = "north" | "east" | "south" | "west";

interface Side {
  start: Vec;
  along: Vec;
  facing: number;
}

function parked(x: number, y: number, heading: number, paint: number, vehicle?: Vehicle): Solid {
  const length = vehicle === Vehicle.VAN ? 5.6 : 4.3;
  const width = vehicle === Vehicle.VAN ? 1.95 : 1.8;
  const pose = { x, y, heading };
  return { kind: SolidKind.CAR, shape: oriented_box(x, y, heading, length, width), car: { pose, length, width, paint, vehicle } };
}

function rect_of(points: Polygon): Vec[] {
  const { x0, y0, x1, y1 } = bounds_of(points);
  return rect(x0, y0, x1, y1);
}

function gaps(taken: [number, number][], length: number): [number, number][] {
  const out: [number, number][] = [];
  let at = 0;
  for (const [a, b] of [...taken].sort((p, q) => p[0] - q[0])) {
    if (a - at > 3) out.push([at, a]);
    at = Math.max(at, b);
  }
  if (length - at > 3) out.push([at, length]);
  return out;
}

function street_houses(frame: Frame, length: number, houses: House[], trees: Vec[]) {
  const n = Math.max(1, Math.round(length / 7));
  const each = length / n;
  for (let i = 0; i < n; i++) {
    const u = -length / 2 + each * (i + 0.5);
    const half = each / 2 - 0.6;
    const shape = rect_of(shape_at(frame, box(u - half, -ROW + 0.6, u + half, -ROW + 6.8)));
    houses.push({ shape, ridge: [to_town(frame, u - half + 0.8, -ROW + 3.7), to_town(frame, u + half - 0.8, -ROW + 3.7)], paint: houses.length });
    if (half > 1.8) trees.push(to_town(frame, u, -2.6));
  }
}

/**
 * The hub's yard, a small town. Four rows of buildings face in on a court: a ring road round a paved plaza with the
 * garage pad in its middle. Each row is a district (Town north, Sport east, Waterfront south on the quay, Industrial
 * west by the gate); a district's row grows along its side as games join it, and the court with the longest row. The
 * gate opens through the west row; a game with no district, and each of `upcoming` (shut), gets a lot past the gate.
 * The practice lot (bays and a cone slalom) shares the quay with the Waterfront, and houses fill what's left.
 */
export function build_yard(games: readonly { id: string; building: Building }[], upcoming = 0): Yard {
  const count: Record<District, number> = { town: 0, sport: 0, waterfront: 0, industrial: 0, lots: upcoming };
  for (const game of games) count[district_of(game.id)]++;
  const court_w = Math.max(MIN_WIDTH, count.town * SLOT, count.waterfront * SLOT + PRACTICE);
  const court_h = Math.max(MIN_HEIGHT, count.sport * SLOT, 2 * Math.max(count.industrial, count.lots) * SLOT + GATE_GAP);
  const court = { x0: ROW, y0: ROW, x1: ROW + court_w, y1: ROW + court_h };
  const W = court.x1 + ROW;
  const quay = court.y1 + ROW;
  const H = quay + HARBOUR;
  const mid = (court.y0 + court.y1) / 2;

  const sides: Record<SideName, Side> = {
    north: { start: { x: court.x0, y: court.y0 }, along: { x: 1, y: 0 }, facing: SOUTH },
    east: { start: { x: court.x1, y: court.y0 }, along: { x: 0, y: 1 }, facing: WEST },
    south: { start: { x: court.x0, y: court.y1 }, along: { x: 1, y: 0 }, facing: NORTH },
    west: { start: { x: court.x0, y: court.y0 }, along: { x: 0, y: 1 }, facing: EAST },
  };
  const lengths: Record<SideName, number> = { north: court_w, south: court_w, east: court_h, west: court_h };
  const frame = (side: SideName, at: number): Frame => ({
    mouth: { x: sides[side].start.x + sides[side].along.x * at, y: sides[side].start.y + sides[side].along.y * at },
    facing: sides[side].facing,
  });
  const sport_start = (court_h - count.sport * SLOT) / 2;
  const slot = (district: District, k: number): [SideName, number] => {
    switch (district) {
      case District.TOWN:
        return ["north", k * SLOT];
      case District.WATERFRONT:
        return ["south", k * SLOT];
      case District.SPORT:
        return ["east", sport_start + k * SLOT];
      case District.INDUSTRIAL:
        return ["west", court_h / 2 - GATE_GAP / 2 - (k + 1) * SLOT];
      case District.LOTS:
        return ["west", court_h / 2 + GATE_GAP / 2 + k * SLOT];
    }
  };

  const taken: Record<SideName, [number, number][]> = { north: [], east: [], south: [[court_w - PRACTICE, court_w]], west: [[court_h / 2 - GATE_GAP / 2, court_h / 2 + GATE_GAP / 2]] };
  const placed: Record<District, number> = { town: 0, sport: 0, waterfront: 0, industrial: 0, lots: 0 };
  const entries = [
    ...games.map((game) => ({ game: game.id as string | null, building: game.building as Building | null, open: true })),
    ...Array.from({ length: upcoming }, () => ({ game: null, building: null, open: false })),
  ];
  const pieces: Solid[] = [];
  const plots: Plot[] = entries.map((entry) => {
    const district = entry.game ? district_of(entry.game) : District.LOTS;
    const [side, at] = slot(district, placed[district]++);
    taken[side].push([at, at + SLOT]);
    const place = frame(side, at + SLOT / 2);
    const plan = blueprint(entry.building);
    for (const piece of plan.pieces) pieces.push({ kind: piece.kind, shape: shape_at(place, piece.shape) });
    const recess = box(-DOOR_HALF, -RECESS, DOOR_HALF, 0);
    if (!entry.open) pieces.push({ kind: SolidKind.WALL, shape: shape_at(place, recess) });
    return {
      shape: rect_of(shape_at(place, box(plan.u0, plan.back, plan.u1, 0))),
      door: rect_of(shape_at(place, box(-DOOR_HALF, -RECESS, DOOR_HALF, APRON))),
      recess: rect_of(shape_at(place, recess)),
      mouth: place.mouth,
      facing: place.facing,
      open: entry.open,
      game: entry.game,
      building: entry.building,
      district,
    };
  });

  const houses: House[] = [];
  const trees: Vec[] = [];
  for (const side of ["north", "east", "south", "west"] as const) {
    for (const [a, b] of gaps(taken[side], lengths[side])) street_houses(frame(side, (a + b) / 2), b - a, houses, trees);
  }
  for (const [cx, cy, sx, sy] of [
    [court.x0, court.y0, -1, -1],
    [court.x1, court.y0, 1, -1],
    [court.x1, court.y1, 1, 1],
    [court.x0, court.y1, -1, 1],
  ] as const) {
    const far = { x: cx + sx * (ROW - 0.6), y: cy + sy * (ROW - 0.6) };
    const near = { x: cx + sx * 5.2, y: cy + sy * 5.2 };
    const centre_x = (far.x + near.x) / 2;
    const shape = rect(Math.min(far.x, near.x), Math.min(far.y, near.y), Math.max(far.x, near.x), Math.max(far.y, near.y));
    houses.push({ shape, ridge: [{ x: centre_x, y: far.y - sy * 0.8 }, { x: centre_x, y: near.y + sy * 0.8 }], paint: houses.length });
    trees.push({ x: cx + sx * 2.6, y: cy + sy * 2.6 });
  }

  const walls: Solid[] = [rect(0, 0, W, WALL), rect(W - WALL, 0, W, quay), rect(0, 0, WALL, mid - GATE_HALF), rect(0, mid + GATE_HALF, WALL, quay)].map(
    (shape) => ({ kind: SolidKind.WALL, shape })
  );
  const harbour: Solid = { kind: SolidKind.WATER, shape: rect(0, quay, W, H) };
  const posts: Solid[] = [
    rect(0, mid - GATE_HALF - 0.4, 0.7, mid - GATE_HALF + 0.4),
    rect(0, mid + GATE_HALF - 0.4, 0.7, mid + GATE_HALF + 0.4),
    rect(0.1, mid - GATE_HALF + 0.4, 0.3, mid + GATE_HALF - 0.4),
  ].map((shape) => ({ kind: SolidKind.POST, shape }));

  const practice = { x0: court.x1 - PRACTICE, y0: court.y1, x1: court.x1, y1: quay };
  const bay = 2.7;
  const bays_x = Array.from({ length: 6 }, (_, i) => practice.x0 + 4 + bay * i);
  const marks: Mark[] = bays_x.map((x) => ({ kind: MarkKind.LINE, a: { x, y: quay - 5.6 }, b: { x, y: quay } }));
  const cars = [parked(bays_x[0] + bay / 2, quay - 2.9, SOUTH, 1), parked(bays_x[2] + bay / 2, quay - 3.6, SOUTH, 3, Vehicle.VAN)];
  const lane = { x0: court.x0 + LANE, y0: court.y0 + LANE, x1: court.x1 - LANE, y1: court.y1 - LANE };
  marks.push(
    { kind: MarkKind.DASH, a: { x: lane.x0, y: lane.y0 }, b: { x: lane.x1, y: lane.y0 } },
    { kind: MarkKind.DASH, a: { x: lane.x1, y: lane.y0 }, b: { x: lane.x1, y: lane.y1 } },
    { kind: MarkKind.DASH, a: { x: lane.x1, y: lane.y1 }, b: { x: lane.x0, y: lane.y1 } },
    { kind: MarkKind.DASH, a: { x: lane.x0, y: lane.y1 }, b: { x: lane.x0, y: lane.y0 } }
  );

  const cones = [5, 9.5, 14, 18.5].map((x, i) => ({ x: practice.x0 + x, y: court.y1 + (i % 2 ? 2.3 : 3.1) }));
  const cone_solids: Solid[] = cones.map((at) => ({ kind: SolidKind.POST, shape: rect(at.x - CONE / 2, at.y - CONE / 2, at.x + CONE / 2, at.y + CONE / 2) }));
  const house_solids: Solid[] = houses.map((house) => ({ kind: SolidKind.WALL, shape: house.shape }));

  const plaza = { x0: court.x0 + RING, y0: court.y0 + RING, x1: court.x1 - RING, y1: court.y1 - RING };
  const centre = { x: (court.x0 + court.x1) / 2, y: mid };
  const pad = rect(centre.x - PAD_LENGTH / 2, mid - PAD_WIDTH / 2, centre.x + PAD_LENGTH / 2, mid + PAD_WIDTH / 2);
  // Trees on the plaza only where nothing is placed straight: off every doorway's line out, the line in from the gate
  // and the longest rig on the pad.
  const lanes = [
    ...plots.map((plot) => ({ from: plot.mouth, heading: plot.facing, length: 30 })),
    { from: { x: 0, y: mid }, heading: EAST, length: 27 },
    { from: { x: centre.x - 13, y: mid }, heading: EAST, length: 26 },
  ];
  const clear_of_lanes = (at: Vec) =>
    lanes.every(({ from, heading, length }) => {
      const dx = at.x - from.x;
      const dy = at.y - from.y;
      const along = dx * Math.cos(heading) + dy * Math.sin(heading);
      const across = Math.abs(-dx * Math.sin(heading) + dy * Math.cos(heading));
      return along < -TREE * 2 || along > length + TREE * 2 || across > 2.8;
    });
  for (const x of [plaza.x0 + 2.5, (plaza.x0 + centre.x) / 2, centre.x, (centre.x + plaza.x1) / 2, plaza.x1 - 2.5]) {
    for (const y of [plaza.y0 + 2.5, mid, plaza.y1 - 2.5]) {
      const at = { x, y };
      if (clear_of_lanes(at) && !inside_convex(at, pad, -3)) trees.push(at);
    }
  }
  const tree_solids: Solid[] = trees.map((at) => ({ kind: SolidKind.HEDGE, shape: disc(at.x, at.y, TREE * 0.8, 8) }));
  const props = [...walls, harbour, ...posts, ...cars];
  const solids = [...props, ...pieces, ...house_solids, ...tree_solids, ...cone_solids];
  // The first car park's ramp leads down to the floors; another one's lane is a dead end.
  const park_plot = plots.findIndex((plot) => plot.open && plot.building === Building.CAR_PARK);
  const car_park = park_plot >= 0 ? build_car_park(plots[park_plot], park_plot, W) : null;
  const low = { solids: [...solids, ...(car_park?.solids ?? [])] };
  const tall = { solids: [...low.solids, ...(car_park?.bars ?? []).map((shape) => ({ kind: SolidKind.WALL, shape }))] };
  const bounds = { x0: 0, y0: 0, x1: W, y1: H };
  return {
    bounds,
    world: car_park ? bounds_of([...rect(0, 0, W, H), ...rect(car_park.bounds.x0, car_park.bounds.y0, car_park.bounds.x1, car_park.bounds.y1)]) : bounds,
    car_park,
    scenes: { low, tall },
    landing: { x0: 0, y0: 0, x1: Math.min(W, centre.x + 14), y1: quay },
    court,
    plaza,
    quay,
    practice,
    districts: [
      { district: District.TOWN, area: { x0: court.x0, y0: 0, x1: court.x1, y1: court.y0 } },
      { district: District.SPORT, area: { x0: court.x1, y0: court.y0, x1: W, y1: court.y1 } },
      { district: District.WATERFRONT, area: { x0: court.x0, y0: court.y1, x1: practice.x0, y1: quay } },
      { district: District.INDUSTRIAL, area: { x0: 0, y0: court.y0, x1: court.x0, y1: mid - GATE_GAP / 2 } },
      { district: District.LOTS, area: { x0: 0, y0: mid + GATE_GAP / 2, x1: court.x0, y1: court.y1 } },
    ],
    surfaces: [
      { kind: SurfaceKind.ASPHALT, shape: rect(0, 0, W, quay) },
      ...[
        rect(court.x0, court.y0 - SIDEWALK, court.x1, court.y0),
        rect(court.x0, court.y1, practice.x0, court.y1 + SIDEWALK),
        rect(court.x1, court.y0, court.x1 + SIDEWALK, court.y1),
        rect(court.x0 - SIDEWALK, court.y0, court.x0, mid - GATE_HALF),
        rect(court.x0 - SIDEWALK, mid + GATE_HALF, court.x0, court.y1),
        rect(plaza.x0, plaza.y0, plaza.x1, plaza.y1),
      ].map((shape) => ({ kind: SurfaceKind.FLOOR, shape })),
    ],
    marks,
    solids,
    props,
    cones,
    houses,
    trees,
    plots,
    pad,
    pad_pose: { ...centre, heading: EAST },
    gate: { x: 1.6, y: mid, heading: EAST },
  };
}

export function place(centre: Pose, spec: VehicleSpec): Car {
  return create_car(pose_from_centre(centre, spec), Gear.PARK, spec);
}

function ahead(pose: Pose, distance: number): Pose {
  return { x: pose.x + Math.cos(pose.heading) * distance, y: pose.y + Math.sin(pose.heading) * distance, heading: pose.heading };
}

export function gate_car(yard: Yard, spec: VehicleSpec): Car {
  return place(ahead(yard.gate, rig_length(spec) / 2), spec);
}

/** Just out of a building's doorway, facing away from it, as if it had driven out. */
export function door_car(yard: Yard, index: number, spec: VehicleSpec): Car {
  const plot = yard.plots[index];
  return place(ahead({ ...plot.mouth, heading: plot.facing }, APRON + 0.5 + rig_length(spec) / 2), spec);
}

export function pad_car(yard: Yard, spec: VehicleSpec): Car {
  return place(yard.pad_pose, spec);
}

/** Out of the doorway on −1, facing back along the aisle. */
export function below_car(yard: Yard, spec: VehicleSpec): Car | null {
  const park = yard.car_park;
  return park ? place(ahead(park.door_pose, APRON + 0.5 + rig_length(spec) / 2), spec) : null;
}

/** What this vehicle runs into: the car park's bar stops anything taller than a car or a van. */
export function near(yard: Yard, spec: VehicleSpec): Obstacles {
  return obstacles(under_headroom(spec) ? yard.scenes.low : yard.scenes.tall);
}

export function in_car_park(yard: Yard, at: Vec): boolean {
  const box = yard.car_park?.bounds;
  return !!box && at.x >= box.x0 && at.x <= box.x1 && at.y >= box.y0 && at.y <= box.y1;
}

export function floor_of(yard: Yard, at: Vec): number | null {
  if (!in_car_park(yard, at)) return null;
  const cx = Math.floor(at.x / CHUNK);
  const cy = Math.floor(at.y / CHUNK);
  return yard.car_park!.chunks.find((chunk) => chunk.cx === cx && chunk.cy === cy)?.floor ?? null;
}

/** Where the camera stays: the town, or the car park's floors. */
export function area_of(yard: Yard, at: Vec): Bounds {
  return in_car_park(yard, at) ? yard.car_park!.bounds : yard.bounds;
}

// A swap keeps a vehicle on the floor it's on, or in the town short of the harbour.
function room_of(yard: Yard, at: Vec): Bounds {
  if (!in_car_park(yard, at)) return { ...yard.bounds, y1: yard.quay };
  const x0 = Math.floor(at.x / CHUNK) * CHUNK;
  const y0 = Math.floor(at.y / CHUNK) * CHUNK;
  return { x0, y0, x1: x0 + CHUNK, y1: y0 + CHUNK };
}

export interface Swapped {
  car: Car;
  /** The new rig didn't fit where the old one stood: it went to the nearest clear spot, or the pad. */
  moved: boolean;
  /** Too tall for the car park it stood in: it went up to the pad. */
  raised: boolean;
}

const SEARCH_RADIUS = 30;
const TURN_COST = 8;

/**
 * Another vehicle where this one stands: the same middle and heading. One that doesn't fit there goes to the nearest
 * clear spot inside the town, in rings a metre apart; a turned placement counts 8 m further than one facing the same way.
 */
export function swap_car(yard: Yard, car: Placement, from: VehicleSpec, to: VehicleSpec): Swapped {
  const ends = rig_ends(from);
  const middle = to_world(car, { x: (ends.front + ends.rear) / 2, y: 0 });
  if (in_car_park(yard, middle) && !under_headroom(to)) return { car: pad_car(yard, to), moved: true, raised: true };
  const solid = near(yard, to);
  const room = room_of(yard, middle);
  const fits = (candidate: Car) =>
    collide(candidate, solid, to) === null &&
    bodies(candidate, to).every((body) => body.every((p) => p.x > room.x0 && p.x < room.x1 && p.y > room.y0 && p.y < room.y1));
  const ring = (r: number, turns: number[]): Car | null => {
    const steps = r === 0 ? 1 : Math.ceil((Math.PI * 2 * r) / 1.5);
    for (const turn of turns) {
      for (let i = 0; i < steps; i++) {
        const angle = car.heading + (i / steps) * Math.PI * 2;
        const candidate = place({ x: middle.x + Math.cos(angle) * r, y: middle.y + Math.sin(angle) * r, heading: car.heading + turn }, to);
        if (fits(candidate)) return candidate;
      }
    }
    return null;
  };
  for (let r = 0; r <= SEARCH_RADIUS + TURN_COST; r++) {
    const same = r <= SEARCH_RADIUS ? ring(r, [0]) : null;
    if (same) return { car: same, moved: r > 0, raised: false };
    const turned = r >= TURN_COST ? ring(r - TURN_COST, [Math.PI, Math.PI / 2, -Math.PI / 2]) : null;
    if (turned) return { car: turned, moved: true, raised: false };
  }
  return { car: pad_car(yard, to), moved: true, raised: false };
}

export function nose(car: Placement, spec: VehicleSpec): Vec {
  return vehicle_nose(car, spec);
}

export function door_at(yard: Yard, car: Placement, spec: VehicleSpec): number | null {
  const at = nose(car, spec);
  const index = yard.plots.findIndex((plot) => plot.open && inside_convex(at, plot.door));
  return index < 0 ? null : index;
}

/** At the doorway on −1, which offers the Multi-storey spot. */
export function at_below_door(yard: Yard, car: Placement, spec: VehicleSpec): boolean {
  return !!yard.car_park && inside_convex(nose(car, spec), yard.car_park.door);
}

// A rig longer than the pad can't get its vehicle onto it while straight, so its middle counts instead; a shorter rig
// counts only with the vehicle itself on the pad (a caravan on the pad with the car off it doesn't swap).
export function on_pad(yard: Yard, car: Placement, spec: VehicleSpec): boolean {
  if (inside_convex(body_centre(car, spec), yard.pad)) return true;
  const { front, rear } = rig_ends(spec);
  const box = bounds_of(yard.pad);
  if (front - rear <= Math.max(box.x1 - box.x0, box.y1 - box.y0)) return false;
  return inside_convex(to_world(car, { x: (front + rear) / 2, y: 0 }), yard.pad);
}

export interface Bumped {
  car: Car;
  hit: Vec | null;
  /** Through a ramp, to another floor or back up to the town. */
  passed: boolean;
}

/** A step that would run into something, or jackknife, doesn't happen: the vehicle stops where it was. */
export function drive(yard: Yard, car: Car, input: Input, dt: number, spec: VehicleSpec): Bumped {
  const stepped = step(car, input, dt, spec);
  // The bar is the only way in, but a swap can leave a tall vehicle past it: only what fits under goes down.
  const next = yard.car_park && under_headroom(spec) ? pass_portals(stepped, yard.car_park.portals) : stepped;
  const folded = jackknife(next, spec);
  if (folded >= 0) return { car: stopped(car, next, spec), hit: hitch_point(car, spec, folded), passed: false };
  const hit = collide(next, near(yard, spec), spec);
  return hit ? { car: stopped(car, next, spec), hit: hit.at, passed: false } : { car: next, hit: null, passed: next !== stepped };
}

// A frame steer's bend is its shape, so a bend into something is stopped too.
function stopped(was: Car, next: Car, spec: VehicleSpec): Car {
  const steer = spec.drive.kind === DriveKind.FRAME ? was.steer : next.steer;
  return { ...was, steer, throttle: next.throttle, brake: next.brake, speed: 0 };
}
