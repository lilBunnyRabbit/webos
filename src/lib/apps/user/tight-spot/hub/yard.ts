import { inside_convex } from "../core/collision";
import { bounds_of, oriented_box, rect, type Bounds, type Polygon, type Pose, type Vec } from "../core/geometry";
import { collide, obstacles } from "../core/obstacles";
import { MarkKind, SolidKind, SurfaceKind, type Mark, type Solid, type Surface } from "../core/scene";
import {
  body_centre,
  rig_ends,
  create_car,
  Gear,
  hitch_point,
  jackknifed,
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

export const YARD_WIDTH = 56;
export const YARD_HEIGHT = 44;
const WALL = 0.4;
const NORTH = -Math.PI / 2;
const SOUTH = Math.PI / 2;
const DOOR_WIDTH = 6;
const DOOR_DEPTH = 5;
const APRON = 4;
const CONE = 0.45;

export interface Plot {
  shape: Polygon;
  /** The doorway and the apron in front of it: the vehicle's nose in here offers the game. */
  door: Polygon;
  /** The doorway cut into the building, lit inside. */
  recess: Polygon;
  mouth: Vec;
  /** A game is registered for it; a closed one has its shutter down. */
  open: boolean;
}

export interface Yard {
  bounds: Bounds;
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

const PLOT_X = [6, 32];
const PLOT_WIDTH = 18;
const PLOT_DEPTH = 12;

function plot(x0: number, open: boolean): { plot: Plot; pieces: Polygon[] } {
  const x1 = x0 + PLOT_WIDTH;
  const mid = x0 + PLOT_WIDTH / 2;
  const d0 = mid - DOOR_WIDTH / 2;
  const d1 = mid + DOOR_WIDTH / 2;
  const back = PLOT_DEPTH - DOOR_DEPTH;
  return {
    plot: {
      shape: rect(x0, WALL, x1, PLOT_DEPTH),
      door: rect(d0, back, d1, PLOT_DEPTH + APRON),
      recess: rect(d0, back, d1, PLOT_DEPTH),
      mouth: { x: mid, y: PLOT_DEPTH },
      open,
    },
    pieces: [rect(x0, WALL, d0, PLOT_DEPTH), rect(d1, WALL, x1, PLOT_DEPTH), rect(d0, WALL, d1, open ? back : PLOT_DEPTH)],
  };
}

function parked(x: number, y: number, paint: number, vehicle?: Vehicle): Solid {
  const length = vehicle === Vehicle.VAN ? 5.6 : 4.3;
  const width = vehicle === Vehicle.VAN ? 1.95 : 1.8;
  const pose = { x, y, heading: Math.PI };
  return { kind: SolidKind.CAR, shape: oriented_box(x, y, Math.PI, length, width), car: { pose, length, width, paint, vehicle } };
}

/**
 * The hub's yard, fixed: buildings along the north wall with a doorway each (shut while no game has the building), a gate in the south wall where the car
 * starts, a row of bays on the west wall with two cars in them, a cone slalom across the middle, bollards, and the
 * garage pad on the east side that swaps the vehicle.
 */
export function build_yard(games: number): Yard {
  const W = YARD_WIDTH;
  const H = YARD_HEIGHT;
  const walls: Solid[] = [
    rect(0, 0, W, WALL),
    rect(0, 0, WALL, H),
    rect(W - WALL, 0, W, H),
    rect(0, H - WALL, 24, H),
    rect(32, H - WALL, W, H),
  ].map((shape) => ({ kind: SolidKind.WALL, shape }));
  const posts: Solid[] = [
    rect(23.6, H - 0.7, 24.4, H),
    rect(31.6, H - 0.7, 32.4, H),
    rect(24.4, H - 0.3, 31.6, H - 0.1),
  ].map((shape) => ({ kind: SolidKind.POST, shape }));
  const bollards = [40, 44, 48].map((x) => ({ x, y: 39.5 }));
  const bollard_solids: Solid[] = bollards.map((at) => ({ kind: SolidKind.POST, shape: rect(at.x - 0.2, at.y - 0.2, at.x + 0.2, at.y + 0.2) }));

  const bay = 2.7;
  const bays_y = [17, 17 + bay, 17 + bay * 2, 17 + bay * 3, 17 + bay * 4];
  const marks: Mark[] = bays_y.map((y) => ({ kind: MarkKind.LINE, a: { x: WALL, y }, b: { x: 6, y } }));
  const cars = [parked(2.9, 17 + bay / 2, 1), parked(3.6, 17 + bay * 2.5, 3, Vehicle.VAN)];

  const cones = [18, 23, 28, 33, 38].map((x, i) => ({ x, y: i % 2 ? 26.5 : 27.5 }));
  const cone_solids: Solid[] = cones.map((at) => ({ kind: SolidKind.POST, shape: rect(at.x - CONE / 2, at.y - CONE / 2, at.x + CONE / 2, at.y + CONE / 2) }));

  const built = PLOT_X.map((x, i) => plot(x, i < games));
  const pieces: Solid[] = built.flatMap((each) => each.pieces.map((shape) => ({ kind: SolidKind.WALL, shape })));
  const pad = rect(45, 17, 52.5, 34);

  const props = [...walls, ...posts, ...cars];
  return {
    bounds: bounds_of(rect(0, 0, W, H)),
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
    pad_pose: { x: 48.75, y: 25.5, heading: NORTH },
    gate: { x: 28, y: H - 1.6, heading: NORTH },
  };
}

export function place(centre: Pose, spec: VehicleSpec): Car {
  return create_car(pose_from_centre(centre, spec), Gear.PARK, spec);
}

export function gate_car(yard: Yard, spec: VehicleSpec): Car {
  const along = rig_length(spec) / 2;
  return place({ ...yard.gate, y: yard.gate.y - along }, spec);
}

/** Just out of a building's doorway, facing away from it, as if it had driven out. */
export function door_car(yard: Yard, index: number, spec: VehicleSpec): Car {
  const plot = yard.plots[index];
  const along = rig_length(spec) / 2;
  return place({ x: plot.mouth.x, y: plot.mouth.y + APRON + 0.5 + along, heading: SOUTH }, spec);
}

export function pad_car(yard: Yard, spec: VehicleSpec): Car {
  return place(yard.pad_pose, spec);
}

export function nose(car: Placement, spec: VehicleSpec): Vec {
  return to_world(car, { x: rig_ends(spec).front, y: 0 });
}

export function door_at(yard: Yard, car: Placement, spec: VehicleSpec): number | null {
  const at = nose(car, spec);
  const index = yard.plots.findIndex((plot) => plot.open && inside_convex(at, plot.door));
  return index < 0 ? null : index;
}

export function on_pad(yard: Yard, car: Placement, spec: VehicleSpec): boolean {
  return inside_convex(body_centre(car, spec), yard.pad);
}

export interface Bumped {
  car: Car;
  hit: Vec | null;
}

/** A step that would run into something, or jackknife, doesn't happen: the vehicle stops where it was. */
export function drive(yard: Yard, car: Car, input: Input, dt: number, spec: VehicleSpec): Bumped {
  const next = step(car, input, dt, spec);
  if (spec.trailer && jackknifed(next)) return { car: stopped(car, next), hit: hitch_point(car, spec.trailer) };
  const hit = collide(next, obstacles(yard), spec);
  return hit ? { car: stopped(car, next), hit: hit.at } : { car: next, hit: null };
}

function stopped(was: Car, next: Car): Car {
  return { ...was, steer: next.steer, throttle: next.throttle, brake: next.brake, speed: 0 };
}
