import { inside_convex } from "../core/collision";
import { bounds_of, oriented_box, rect, type Bounds, type Polygon, type Pose, type Vec } from "../core/geometry";
import { collide, obstacles } from "../core/obstacles";
import { MarkKind, SolidKind, SurfaceKind, type Mark, type Solid, type Surface } from "../core/scene";
import {
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

const WALL = 0.4;
const NORTH = -Math.PI / 2;
const SOUTH = Math.PI / 2;
const EAST = 0;
const DOOR_WIDTH = 6;
const DOOR_DEPTH = 5;
const APRON = 4;
const CONE = 0.45;

export interface Shelf {
  id: string;
  name: string;
  vehicles: readonly Vehicle[];
}

/** The garage's vehicles in shelves, so a phone's card shows a handful at a time; every vehicle is on one. */
export const GARAGE: readonly Shelf[] = [
  { id: "cars", name: "Cars", vehicles: [Vehicle.HATCH, Vehicle.CITY, Vehicle.SUV, Vehicle.LIMO, Vehicle.VAN, Vehicle.PICKUP, Vehicle.CAMPER] },
  { id: "service", name: "Service", vehicles: [Vehicle.TAXI, Vehicle.POLICE, Vehicle.AMBULANCE, Vehicle.FIRE, Vehicle.LADDER, Vehicle.GARBAGE, Vehicle.BAGGAGE] },
  { id: "buses", name: "Buses", vehicles: [Vehicle.BUS, Vehicle.DECKER, Vehicle.COACH, Vehicle.ARTIC] },
  { id: "trucks", name: "Trucks", vehicles: [Vehicle.BOX_TRUCK, Vehicle.SEMI, Vehicle.DRAWBAR, Vehicle.ROAD_TRAIN] },
  { id: "towing", name: "Towing", vehicles: [Vehicle.TOWING, Vehicle.CARAVAN, Vehicle.BOAT, Vehicle.HORSE_BOX, Vehicle.TRACTOR, Vehicle.TRACTOR_TWO, Vehicle.QUAD] },
  {
    id: "machines",
    name: "Machines",
    vehicles: [Vehicle.FORKLIFT, Vehicle.BOBCAT, Vehicle.TELEHANDLER, Vehicle.LOADER, Vehicle.DUMPER, Vehicle.MOWER, Vehicle.TANK],
  },
  { id: "fun", name: "Fun", vehicles: [Vehicle.TUK_TUK, Vehicle.GOLF_CART, Vehicle.RESURFACER, Vehicle.TROLLEY, Vehicle.F1] },
];

export function shelf_of(vehicle: Vehicle): Shelf {
  return GARAGE.find((shelf) => shelf.vehicles.includes(vehicle)) ?? GARAGE[0];
}

export interface Plot {
  shape: Polygon;
  /** The doorway and the apron in front of it: the vehicle's nose in here offers the game. */
  door: Polygon;
  /** The doorway cut into the building, lit inside. */
  recess: Polygon;
  mouth: Vec;
  /** The heading out of the doorway onto the street: south on the north side, north on the south side. */
  facing: number;
  /** A game is registered for it; a closed one has its shutter down. */
  open: boolean;
}

export interface Yard {
  bounds: Bounds;
  /** What the landing frames: the gate, the forecourt and the first pair of buildings, not the whole street. */
  landing: Bounds;
  surfaces: Surface[];
  marks: Mark[];
  solids: Solid[];
  /** The solids the core draws (walls, gate posts, parked cars); buildings, cones and bollards are drawn by the yard. */
  props: Solid[];
  cones: Vec[];
  bollards: Vec[];
  /** The buildings' walls around their doorways, shutters included. */
  structures: Polygon[];
  plots: Plot[];
  pad: Polygon;
  pad_pose: Pose;
  /** The back of the rig at the gate, facing in. */
  gate: Pose;
}

// Buildings 11.6 m deep, as in the old yard, and 34 m between the two rows of fronts: a 24 m road train just out of a
// doorway stops short of the apron across the street, so it isn't offered that game.
const PLOT_WIDTH = 18;
const PLOT_DEPTH = 12;
const STREET = 34;
const GAP = 4;
const PITCH = PLOT_WIDTH + GAP;
const FORECOURT = 30;
const STREET_END = 10;
const GATE_HALF = 4;
const LANDING_MARGIN = 2;
export const YARD_HEIGHT = PLOT_DEPTH * 2 + STREET;

export function pairs(places: number): number {
  return Math.max(1, Math.ceil(places / 2));
}

function plot(index: number, open: boolean): { plot: Plot; pieces: Polygon[] } {
  const x0 = FORECOURT + Math.floor(index / 2) * PITCH;
  const x1 = x0 + PLOT_WIDTH;
  const mid = x0 + PLOT_WIDTH / 2;
  const d0 = mid - DOOR_WIDTH / 2;
  const d1 = mid + DOOR_WIDTH / 2;
  const north = index % 2 === 0;
  // Laid out on the north side; the south side is its mirror across the street.
  const y = (at: number) => (north ? at : YARD_HEIGHT - at);
  const box = (ax: number, ay: number, bx: number, by: number) => rect(ax, Math.min(y(ay), y(by)), bx, Math.max(y(ay), y(by)));
  const back = PLOT_DEPTH - DOOR_DEPTH;
  return {
    plot: {
      shape: box(x0, WALL, x1, PLOT_DEPTH),
      door: box(d0, back, d1, PLOT_DEPTH + APRON),
      recess: box(d0, back, d1, PLOT_DEPTH),
      mouth: { x: mid, y: y(PLOT_DEPTH) },
      facing: north ? SOUTH : NORTH,
      open,
    },
    pieces: [box(x0, WALL, d0, PLOT_DEPTH), box(d1, WALL, x1, PLOT_DEPTH), box(d0, WALL, d1, open ? back : PLOT_DEPTH)],
  };
}

function parked(x: number, y: number, paint: number, vehicle?: Vehicle): Solid {
  const length = vehicle === Vehicle.VAN ? 5.6 : 4.3;
  const width = vehicle === Vehicle.VAN ? 1.95 : 1.8;
  const pose = { x, y, heading: NORTH };
  return { kind: SolidKind.CAR, shape: oriented_box(x, y, NORTH, length, width), car: { pose, length, width, paint, vehicle } };
}

/**
 * The hub's yard, a street running east from a gate in the west wall. A forecourt first: a row of bays on the north wall
 * with two cars in them, a cone slalom and the garage pad that swaps the vehicle. Then the buildings in pairs, one each
 * side of the road, a doorway each onto it; `games` of them open, `upcoming` shut with the coming games' names, and an
 * odd count finishes its pair with one more shut building. Bollards stand at the east end.
 */
export function build_yard(games: number, upcoming = 0): Yard {
  const count = pairs(games + upcoming) * 2;
  const W = FORECOURT + (count / 2) * PITCH - GAP + STREET_END;
  const H = YARD_HEIGHT;
  const mid = H / 2;
  const walls: Solid[] = [
    rect(0, 0, W, WALL),
    rect(0, H - WALL, W, H),
    rect(W - WALL, 0, W, H),
    rect(0, 0, WALL, mid - GATE_HALF),
    rect(0, mid + GATE_HALF, WALL, H),
  ].map((shape) => ({ kind: SolidKind.WALL, shape }));
  const posts: Solid[] = [
    rect(0, mid - GATE_HALF - 0.4, 0.7, mid - GATE_HALF + 0.4),
    rect(0, mid + GATE_HALF - 0.4, 0.7, mid + GATE_HALF + 0.4),
    rect(0.1, mid - GATE_HALF + 0.4, 0.3, mid + GATE_HALF - 0.4),
  ].map((shape) => ({ kind: SolidKind.POST, shape }));
  // Past the last pair's doorways, where nothing drives out.
  const bollards = [mid - 6, mid, mid + 6].map((y) => ({ x: W - 4, y }));
  const bollard_solids: Solid[] = bollards.map((at) => ({ kind: SolidKind.POST, shape: rect(at.x - 0.2, at.y - 0.2, at.x + 0.2, at.y + 0.2) }));

  const bay = 2.7;
  const bays_x = Array.from({ length: 6 }, (_, i) => 6 + bay * i);
  const marks: Mark[] = bays_x.map((x) => ({ kind: MarkKind.LINE, a: { x, y: WALL }, b: { x, y: 6 } }));
  marks.push({ kind: MarkKind.DASH, a: { x: FORECOURT - 4, y: mid }, b: { x: W - STREET_END, y: mid } });
  const cars = [parked(6 + bay / 2, 2.9, 1), parked(6 + bay * 2.5, 3.6, 3, Vehicle.VAN)];

  // North of the line in from the gate, so a road train backed up to the gate clears them.
  const cones = [9, 13.5, 18, 22.5].map((x, i) => ({ x, y: i % 2 ? 15.5 : 16.5 }));
  const cone_solids: Solid[] = cones.map((at) => ({ kind: SolidKind.POST, shape: rect(at.x - CONE / 2, at.y - CONE / 2, at.x + CONE / 2, at.y + CONE / 2) }));

  const built = Array.from({ length: count }, (_, index) => plot(index, index < games));
  const pieces: Solid[] = built.flatMap((each) => each.pieces.map((shape) => ({ kind: SolidKind.WALL, shape })));
  const pad = rect(8, H - 14, 25, H - 6.5);

  const props = [...walls, ...posts, ...cars];
  return {
    bounds: bounds_of(rect(0, 0, W, H)),
    landing: { x0: 0, y0: 0, x1: Math.min(W, FORECOURT + PLOT_WIDTH + LANDING_MARGIN), y1: H },
    surfaces: [
      { kind: SurfaceKind.ASPHALT, shape: rect(0, 0, W, H) },
      { kind: SurfaceKind.FLOOR, shape: pad },
    ],
    marks,
    solids: [...props, ...pieces, ...cone_solids, ...bollard_solids],
    props,
    cones,
    bollards,
    structures: built.flatMap((each) => each.pieces),
    plots: built.map((each) => each.plot),
    pad,
    pad_pose: { x: 16.5, y: H - 10.25, heading: EAST },
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

export function nose(car: Placement, spec: VehicleSpec): Vec {
  return vehicle_nose(car, spec);
}

export function door_at(yard: Yard, car: Placement, spec: VehicleSpec): number | null {
  const at = nose(car, spec);
  const index = yard.plots.findIndex((plot) => plot.open && inside_convex(at, plot.door));
  return index < 0 ? null : index;
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
}

/** A step that would run into something, or jackknife, doesn't happen: the vehicle stops where it was. */
export function drive(yard: Yard, car: Car, input: Input, dt: number, spec: VehicleSpec): Bumped {
  const next = step(car, input, dt, spec);
  const folded = jackknife(next, spec);
  if (folded >= 0) return { car: stopped(car, next, spec), hit: hitch_point(car, spec, folded) };
  const hit = collide(next, obstacles(yard), spec);
  return hit ? { car: stopped(car, next, spec), hit: hit.at } : { car: next, hit: null };
}

// A frame steer's bend is its shape, so a bend into something is stopped too.
function stopped(was: Car, next: Car, spec: VehicleSpec): Car {
  const steer = spec.drive.kind === DriveKind.FRAME ? was.steer : next.steer;
  return { ...was, steer, throttle: next.throttle, brake: next.brake, speed: 0 };
}
