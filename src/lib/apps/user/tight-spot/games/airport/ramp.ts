import { create_rng, pick } from "$lib/core/utils/random";
import { overlaps } from "../../core/collision";
import {
  bounds_of,
  bounds_overlap,
  lerp,
  oriented_box,
  type Bounds,
  type Polygon,
  type Pose,
  type Vec,
} from "../../core/geometry";
import { obstacles } from "../../core/obstacles";
import { SolidKind, type Solid } from "../../core/scene";
import { hash } from "../../core/seed";
import { bodies, create_car, Gear, rig_ends, to_world } from "../../core/vehicle";
import { aircraft_parts, grow, is_high, NOSE, NOSE_GEAR, pose_from_nose_gear, SPAN, TAIL } from "./aircraft";
import {
  finish_apron,
  frame_apron,
  KitKind,
  layout,
  Part,
  type Added,
  type Apron,
  type Frame,
  type Kit,
} from "./apron";
import { BAGGAGE, run_route } from "./train";

const NORTH = -Math.PI / 2;
const SAMPLE = 0.25;
const HALF = 1.975;
const TIP = SPAN / 2;
const HALL_SLOTS = [-2, -2, -1, 1, 2, 2];
const ROUTE_MARGIN = 0.25;
const WAVE = 30;

export const AFT_DOOR = -12.8;
const MARK = -14.3;

const KIT_SIZE: Record<KitKind, { length: number; width: number }> = {
  gpu: { length: 2.4, width: 1.4 },
  cone: { length: 0.5, width: 0.5 },
  loader: { length: 7, width: 1.7 },
};

const KIT_PART: Record<KitKind, Part> = { gpu: Part.GPU, cone: Part.CONE, loader: Part.LOADER };

function kit_at(kind: KitKind, pose: Pose): Kit {
  const size = KIT_SIZE[kind];
  return { kind, pose, shape: oriented_box(pose.x, pose.y, pose.heading, size.length, size.width) };
}

function kit_between(from: Vec, to: Vec): Kit {
  const heading = Math.atan2(to.y - from.y, to.x - from.x);
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const pose = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, heading };
  return { kind: KitKind.LOADER, pose, shape: oriented_box(pose.x, pose.y, heading, length, KIT_SIZE.loader.width) };
}

const added = (kit: Kit): Added => ({
  kind: kit.kind === KitKind.CONE ? SolidKind.POST : SolidKind.SHELF,
  shape: kit.shape,
  part: KIT_PART[kit.kind],
});

function service(aircraft: Pose, side: 1 | -1): Kit[] {
  const at = (x: number, y: number, heading = aircraft.heading): Pose => ({
    ...to_world(aircraft, { x, y: y * side }),
    heading,
  });
  return [
    kit_at(KitKind.GPU, at(NOSE - 2.6, HALF + 2.4)),
    kit_between(
      to_world(aircraft, { x: 8.8, y: -side * (HALF + 0.2) }),
      to_world(aircraft, { x: 8.2, y: -side * (HALF + 6) })
    ),
    kit_at(KitKind.CONE, at(-3.6, TIP + 1.3)),
    kit_at(KitKind.CONE, at(-3.6, -(TIP + 1.3))),
    kit_at(KitKind.CONE, at(TAIL - 1.4, 0)),
  ];
}

interface Sweep {
  bodies: Polygon[];
  bounds: Bounds[];
}

function clear_of(sweep: Sweep, shape: Polygon, margin: number): boolean {
  const grown = grow(shape, margin);
  const box = bounds_of(grown);
  for (let i = 0; i < sweep.bodies.length; i++) {
    if (bounds_overlap(box, sweep.bounds[i]) && overlaps(grown, sweep.bodies[i])) return false;
  }
  return true;
}

function touches(shape: Polygon, solids: readonly { shape: Polygon }[]): boolean {
  const box = bounds_of(shape);
  return solids.some((solid) => bounds_overlap(box, bounds_of(solid.shape)) && overlaps(shape, solid.shape));
}

interface Leg {
  road: number;
  radius: number;
  wave: number;
}

function route(
  frame: Frame,
  hall_x: number,
  lane: number,
  start: Pose,
  leg: Leg
): { points: Vec[]; arrive_from: number } {
  const { road, radius: r } = leg;
  const d = hall_x > lane ? -1 : 1;
  const points: Vec[] = [];
  for (let y = start.y; y < road - r; y += SAMPLE) points.push({ x: hall_x, y });
  const turn = (at: (a: number) => Vec) => {
    const steps = Math.ceil((Math.PI / 2) * (r / SAMPLE));
    for (let i = 0; i < steps; i++) points.push(at((i / steps) * (Math.PI / 2)));
  };
  const c1 = { x: hall_x + d * r, y: road - r };
  turn((a) => ({ x: c1.x - d * r * Math.cos(a), y: c1.y + r * Math.sin(a) }));
  const from = hall_x + d * r;
  const to = lane - d * r;
  const length = Math.abs(to - from);
  const waves = Math.floor(length / WAVE);
  for (let s = 0; s < length; s += SAMPLE) {
    const sway =
      waves > 0 ? leg.wave * Math.sin((2 * Math.PI * waves * s) / length) * Math.sin((Math.PI * s) / length) : 0;
    points.push({ x: from + d * s, y: road + sway });
  }
  const c2 = { x: lane - d * r, y: road - r };
  turn((a) => ({ x: c2.x + d * r * Math.sin(a), y: c2.y + r * Math.cos(a) }));
  const arrive_from = points.length;
  for (let y = road - r; y > frame.nose_gear_y - 30; y -= SAMPLE) points.push({ x: lane, y });
  return { points, arrive_from };
}

function crests(hall_x: number, lane: number, leg: Leg): Vec[] {
  const d = hall_x > lane ? -1 : 1;
  const from = hall_x + d * leg.radius;
  const length = Math.abs(lane - d * leg.radius - from);
  const waves = Math.floor(length / WAVE);
  const found: Vec[] = [];
  for (let i = 0; i < waves * 2; i++) found.push({ x: from + (d * ((i + 0.5) * length)) / (waves * 2), y: leg.road });
  return found;
}

export interface BaggageOptions {
  /** Turnaround: our aircraft sits ready for the push, so nothing may stand where it goes. */
  push?: boolean;
}

/**
 * The baggage run's apron: Pushback's, with a baggage hall in one stand's place, our aircraft parked, and its aft hold
 * door. The route is driven by the baggage driver before any kit is placed, against what stands on the ground (the
 * train fits under wings and tailplanes); kit only goes where the train never comes within the difficulty's clearance
 * and touches no part of any aircraft, so every run can be driven forward only.
 */
export function build_baggage(seed: number, difficulty: number, options: BaggageOptions = {}, attempt = 0): Apron {
  const rng = create_rng(hash(seed, 0xba66));
  const t = difficulty;
  const slot = pick(HALL_SLOTS, rng);
  const base = layout(seed, difficulty).spacing;
  const reach: [number, number] = [Math.min(0, slot) * base - base / 2 - 6, Math.max(0, slot) * base + base / 2 + 6];
  const frame = frame_apron(seed, difficulty, { hall: slot, docked: !options.push, reach });
  const { shape } = frame;
  const hall_x = slot * shape.spacing;
  const ours = pose_from_nose_gear({ x: 0, y: frame.nose_gear_y }, NORTH);
  const main_y = ours.y;
  const lane = lerp(8.6, 7.7, t) + rng() * 0.3;
  const mark = { x: lane, y: main_y - MARK };
  const door = { x: HALF, y: main_y - AFT_DOOR };
  const clearance = lerp(1.6, 0.5, t);

  const ours_kit = [
    ...service(ours, 1)
      .filter((kit) => kit.kind !== KitKind.LOADER)
      .slice(0, 3),
    kit_between({ x: HALF + 0.15, y: door.y }, { x: lane - 1.5, y: door.y + 0.9 }),
  ];
  const our_parts = aircraft_parts(ours);
  frame.ours = [
    ...our_parts.filter((_, i) => !is_high(i)).map((shape) => ({ kind: SolidKind.CAR, shape, part: Part.OURS })),
    ...ours_kit.map(added),
  ];
  frame.ours_kit = ours_kit;

  const rear = -rig_ends(BAGGAGE).rear;
  const start: Pose = { x: hall_x, y: 1.4 + rear, heading: Math.PI / 2 };
  const car = create_car(start, Gear.PARK, BAGGAGE);
  const fixed = finish_apron(frame, false);
  const solids: Solid[] = [...fixed.solids, ...fixed.ours];
  const near = obstacles({ solids });
  const standing = [...solids, ...fixed.high.solids, ...our_parts.map((shape) => ({ shape }))];
  const blocked_by = (shape: Polygon) => {
    const grown = grow(shape, ROUTE_MARGIN);
    const box = bounds_of(grown);
    for (let i = 0; i < near.solids.length; i++)
      if (bounds_overlap(box, near.bounds[i]) && overlaps(grown, near.solids[i].shape)) return true;
    return false;
  };

  const road = frame.tail_y + lerp(9, 5.5, t) + rng();
  const radius = lerp(9, 6.5, t) + rng() * 0.5;
  const wave = lerp(1.2, 3.2, t);
  const legs: Leg[] = [
    { road, radius, wave },
    { road: road + 3, radius, wave },
    { road: road + 3, radius: radius + 1.5, wave: wave / 2 },
    { road: road + 7, radius: radius + 2, wave: 0 },
    { road: road + 12, radius: 9, wave: 0 },
  ];
  let chosen: { leg: Leg; points: Vec[]; arrive_from: number; sweep: Sweep } | null = null;
  for (const leg of legs) {
    const { points, arrive_from } = route(frame, hall_x, lane, start, leg);
    const sweep: Sweep = { bodies: [], bounds: [] };
    let count = 0;
    const run = run_route(car, points, arrive_from, mark, NORTH, (at) => {
      const each = bodies(at, BAGGAGE);
      if (each.some(blocked_by)) return true;
      if (count++ % 3 === 0) {
        for (const body of each) {
          sweep.bodies.push(body);
          sweep.bounds.push(bounds_of(body));
        }
      }
      return false;
    });
    if (run) {
      chosen = { leg, points, arrive_from, sweep };
      break;
    }
  }
  if (!chosen) {
    if (attempt >= 20) throw new Error(`No baggage route for seed ${seed}`);
    return build_baggage(hash(seed, 0xfa11), difficulty, options, attempt + 1);
  }

  const keep = (kit: Kit, margin: number) => {
    if (!clear_of(chosen.sweep, kit.shape, margin)) return false;
    if (touches(kit.shape, standing) || touches(kit.shape, frame.kit)) return false;
    if (options.push && in_push(frame, kit.shape)) return false;
    return true;
  };
  for (const parked of frame.parked)
    for (const kit of service(parked, rng() < 0.5 ? 1 : -1)) if (keep(kit, clearance)) frame.kit.push(kit);
  for (const at of crests(hall_x, lane, chosen.leg)) {
    const kit = kit_at(rng() < 0.5 ? KitKind.CONE : KitKind.GPU, { ...at, heading: 0 });
    if (keep(kit, clearance)) frame.kit.push(kit);
  }
  const extra = Math.round(lerp(2, 7, t));
  for (let i = 0, tries = 0; i < extra && tries < 40; tries++) {
    const p = chosen.points[Math.floor(rng() * chosen.points.length)];
    const side = rng() < 0.5 ? 1 : -1;
    const kind = rng() < 0.6 ? KitKind.CONE : KitKind.GPU;
    const off = 0.75 + clearance + KIT_SIZE[kind].width / 2 + rng() * 1.2;
    const kit = kit_at(kind, { x: p.x + side * off, y: p.y + side * off * (rng() - 0.5), heading: rng() * Math.PI });
    if (!keep(kit, clearance)) continue;
    frame.kit.push(kit);
    i++;
  }
  frame.added.push(...frame.kit.map(added));
  frame.train = { start, route: chosen.points, arrive_from: chosen.arrive_from, mark, heading: NORTH, door };
  return finish_apron(frame);
}

function in_push(frame: Frame, shape: Polygon): boolean {
  const box = bounds_of(shape);
  const area = { x0: -TIP - 6, y0: frame.nose_gear_y - 4, x1: frame.stop.x + TIP + 22, y1: frame.fence_y };
  return bounds_overlap(box, area);
}

/**
 * Tow to gate: our stand is the gate, empty with its bridge pulled back; the aircraft waits on a remote stand past the
 * taxiway facing it, the tug ahead on a towbar.
 */
export function build_tow(seed: number, difficulty: number, hitch: number): Apron {
  const rng = create_rng(hash(seed, 0x70e1));
  const t = difficulty;
  const side = rng() < 0.5 ? -1 : 1;
  const distance = lerp(78, 50, t) + rng() * 8;
  const remote_x = side * distance;
  const gap = 26 + rng() * 3;
  const far = gap + (NOSE_GEAR - TAIL) + 9 + rng() * 2;
  const spacing = lerp(54, 45, t);
  const reach: [number, number] = [Math.min(-60, remote_x - spacing - 24), Math.max(60, remote_x + spacing + 24)];
  const frame = frame_apron(seed, difficulty, { far, reach });
  const nose_gear = { x: remote_x, y: frame.centreline + gap };
  for (const k of [-1, 0, 1]) {
    const at = { x: remote_x + k * spacing, y: nose_gear.y };
    frame.stands.push({ at, mine: false, remote: true });
    if (k !== 0 && rng() < lerp(0.4, 0.85, t)) frame.parked.push(pose_from_nose_gear(at, NORTH));
  }
  frame.start = { x: remote_x, y: nose_gear.y - hitch, heading: NORTH };
  frame.aircraft = pose_from_nose_gear(nose_gear, NORTH);
  frame.stop = { x: 0, y: frame.nose_gear_y };
  frame.heading = NORTH;
  return finish_apron(frame);
}

export function remote_stand(apron: Apron): number {
  const at = apron.aircraft;
  const remote = apron.stands.filter((stand) => stand.remote);
  return remote.reduce((best, stand) => (Math.abs(stand.at.x - at.x) < Math.abs(best.at.x - at.x) ? stand : best))
    .number;
}
