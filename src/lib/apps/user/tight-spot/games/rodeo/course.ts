import { create_rng } from "$lib/core/utils/random";
import { bounds_of, lerp, rect, type Bounds, type Polygon, type Pose, type Vec } from "../../core/geometry";
import { SolidKind, type Solid } from "../../core/scene";
import { hash } from "../../core/seed";
import { body_ends, DriveKind, FRAME_RAMP, max_steer, pose_from_centre, rig_length, type VehicleSpec } from "../../core/vehicle";

const WALL = 0.4;
const MARGIN = 2;
export const CONE = 0.45;
const EAST = 0;
const WEST = Math.PI;

export const StepKind = { GATE: "gate", SLALOM: "slalom", STOP: "stop", REVERSE: "reverse" } as const;
export type StepKind = (typeof StepKind)[keyof typeof StepKind];

/** A line to cross between `a` and `b`, moving along `normal`; a reverse gate only counts backing up. */
export interface Gate {
  a: Vec;
  b: Vec;
  normal: Vec;
}

export interface Step {
  kind: StepKind;
  gate?: Gate;
  box?: Polygon;
  /** A slalom cone's side to pass, seen driving through: −1 left, 1 right. */
  side?: number;
}

export interface Course {
  seed: number;
  bounds: Bounds;
  floor: Polygon;
  /** The fence: touching it ends the run. Cones are soft and live apart. */
  solids: Solid[];
  cones: Vec[];
  steps: Step[];
  /** Between the lanes: the gates' lane is north of it, the slalom's south. */
  middle: number;
  /** The middle of the U-turn between the lanes. */
  turn: Vec;
  start: Pose;
  start_line: [Vec, Vec];
  box: Polygon;
}

export function rig_width(spec: VehicleSpec): number {
  return Math.max(spec.width, ...spec.hitches.map((link) => link.width));
}

function gate(x: number, y: number, width: number, normal: Vec): Gate {
  return { a: { x, y: y - width / 2 }, b: { x, y: y + width / 2 }, normal };
}

/**
 * A seeded course for one vehicle, scaled to its size and turning circle: east down one lane through gates, a U-turn,
 * west down the other through a cone slalom, on through a reverse gate into a stop box, then back out through that gate.
 * Gaps, cone spacing and the turn grow with the rig's length, width and turning circle, and with any trailer's length.
 */
export function build_course(seed: number, spec: VehicleSpec): Course {
  const rng = create_rng(hash(seed, 0x40de0));
  const length = rig_length(spec);
  const width = rig_width(spec);
  const trail = Math.max(0, length - spec.length);
  const links = spec.hitches.length;
  // A skid steer turns on the spot, but the course still wants room for a person to line it up.
  const radius = Math.max(spec.turning_radius, width * 0.9, 1.2);
  // A frame steer's joint bends only as it rolls, so every change of curve takes it a stretch of ground.
  const ramp = spec.drive.kind === DriveKind.FRAME ? (2 * max_steer(spec)) / FRAME_RAMP : 0;

  const clear = Math.max(0.4, 0.3 * width) * lerp(1.3, 0.95, rng());
  const gate_width = width + clear * 2 + CONE;
  const swing = 0.35 * width + 0.25 * radius;
  const north_half = swing + gate_width / 2 + 0.6;
  const cone_room = width / 2 + clear + CONE / 2;
  const south_half = cone_room + width / 2 + 1.2;
  const lanes = Math.max(2 * radius * lerp(1.05, 1.3, rng()) + trail * 0.6, swing + gate_width / 2 + cone_room + width / 2 + 1.5 + trail * 0.2);

  const north = WALL + MARGIN + north_half;
  const south = north + lanes;
  const middle = (north + south) / 2;

  // The gap to the next gate grows with how far across the lane it jumps.
  const count = 3;
  const offsets = Array.from({ length: count }, () => (rng() * 2 - 1) * swing);
  const gates_x: number[] = [];
  let x = WALL + MARGIN + length;
  let was = 0;
  for (const offset of offsets) {
    const jump = Math.abs(offset - was);
    x += (2 * Math.sqrt(radius * Math.max(jump, 0.5)) * 1.15 + 0.5 * length + trail * 0.7 + 2 + ramp * 2) * lerp(1.05, 1.35, rng());
    gates_x.push(x);
    was = offset;
  }
  const north_need = x + Math.max(0.4 * length, 0.5 * radius) + trail * 0.5 + 1;

  const cones_count = 4 + Math.floor(rng() * 2);
  const spacing = (2 * Math.sqrt(2 * cone_room * radius) + 0.6 * length + trail * 0.8 + ramp * 2) * lerp(1.05, 1.3, rng());
  const lead = Math.max(0.8 * length, 4) + spacing / 2 + trail * 0.5;
  const run_in = Math.max(length + 2, spacing * 0.6 + 0.8 * length);
  const behind = Math.max(1, 0.25 * length) * lerp(0.8, 1.2, rng());
  const slack = Math.max(0.7, 0.12 * length) * lerp(1.3, 0.9, rng());
  const box_length = length + slack;
  const box_width = width + Math.max(0.7, 0.35 * width) * lerp(1.2, 0.85, rng());
  const south_need = WALL + MARGIN + box_length + behind + run_in + spacing * (cones_count - 1) + lead;

  const turn_x = Math.max(north_need, south_need);
  const reach = Math.hypot(lanes / 2 + width / 2, Math.max(body_ends(spec).front, length / 2)) + 1.5;
  const east = turn_x + reach + MARGIN;
  const bottom = south + south_half + MARGIN + WALL;

  const steps: Step[] = gates_x.map((gx, i) => ({ kind: StepKind.GATE, gate: gate(gx, north + offsets[i], gate_width, { x: 1, y: 0 }) }));
  const first_side = rng() < 0.5 ? -1 : 1;
  const cone_xs = Array.from({ length: cones_count }, (_, i) => turn_x - lead - spacing * i);
  cone_xs.forEach((cx, i) => {
    // Heading west, a driver's right is north. Crossing the cone's line anywhere on that side counts.
    const side = i % 2 === 0 ? first_side : -first_side;
    const end = side > 0 ? WALL : bottom - WALL;
    steps.push({ kind: StepKind.SLALOM, side, gate: { a: { x: cx, y: south }, b: { x: cx, y: end }, normal: { x: -1, y: 0 } } });
  });
  // Straight in for a rig of two links or more: reversing a chain round a bend is past a fair run.
  const shift = links >= 2 ? 0 : (rng() * 2 - 1) * (links === 1 ? 0.15 : 0.35) * width;
  const reverse_x = cone_xs[cones_count - 1] - run_in;
  const reverse_gate = gate(reverse_x, south + shift, width + clear * 1.6 + CONE, { x: 1, y: 0 });
  const box_east = reverse_x - behind;
  const box = rect(box_east - box_length, south - box_width / 2, box_east, south + box_width / 2);
  steps.push({ kind: StepKind.STOP, box });
  steps.push({ kind: StepKind.REVERSE, gate: reverse_gate });

  const cones: Vec[] = [];
  for (const step of steps) {
    if (step.kind === StepKind.GATE || step.kind === StepKind.REVERSE) cones.push(step.gate!.a, step.gate!.b);
    else if (step.kind === StepKind.SLALOM) cones.push(step.gate!.a);
  }

  const solids: Solid[] = [rect(0, 0, east, WALL), rect(0, 0, WALL, bottom), rect(east - WALL, 0, east, bottom), rect(0, bottom - WALL, east, bottom)].map(
    (shape) => ({ kind: SolidKind.WALL, shape })
  );
  const start = pose_from_centre({ x: WALL + MARGIN + length / 2, y: north, heading: EAST }, spec);
  const line_x = WALL + MARGIN + length + 0.3;
  return {
    seed,
    bounds: bounds_of(rect(0, 0, east, bottom)),
    floor: rect(0, 0, east, bottom),
    solids,
    cones,
    steps,
    middle,
    turn: { x: turn_x, y: middle },
    start,
    start_line: [
      { x: line_x, y: north - north_half },
      { x: line_x, y: north + north_half },
    ],
    box,
  };
}

export const BOX_HEADING = WEST;
