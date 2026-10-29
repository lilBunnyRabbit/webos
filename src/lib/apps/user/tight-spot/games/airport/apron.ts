import { create_rng, pick, random_int, type Rng } from "$lib/core/utils/random";
import { lerp, rect, type Bounds, type Polygon, type Pose, type Vec } from "../../core/geometry";
import type { Scene } from "../../core/obstacles";
import { SolidKind, type Solid } from "../../core/scene";
import { hash } from "../../core/seed";
import { aircraft_parts, is_high, NOSE, NOSE_GEAR, pose_from_nose_gear, TAIL } from "./aircraft";

export const Face = { WEST: "west", EAST: "east" } as const;
export type Face = (typeof Face)[keyof typeof Face];

export const Part = {
  AIRCRAFT: "aircraft",
  BRIDGE: "bridge",
  TERMINAL: "terminal",
  FENCE: "fence",
  OURS: "ours",
  GPU: "gpu",
  CONE: "cone",
  LOADER: "loader",
} as const;
export type Part = (typeof Part)[keyof typeof Part];

export const KitKind = { GPU: "gpu", CONE: "cone", LOADER: "loader" } as const;
export type KitKind = (typeof KitKind)[keyof typeof KitKind];

export interface Kit {
  kind: KitKind;
  pose: Pose;
  shape: Polygon;
}

export interface Bridge {
  from: Vec;
  /** The cab's end: at a parked aircraft's front door, or pulled back clear of ours. */
  to: Vec;
}

export interface Stand {
  number: number;
  at: Vec;
  mine: boolean;
  remote?: boolean;
}

export interface Hall {
  door: Vec;
  width: number;
}

export interface Train {
  start: Pose;
  route: Vec[];
  arrive_from: number;
  mark: Vec;
  /** The way the train faces on the mark. */
  heading: number;
  door: Vec;
}

export interface Apron {
  seed: number;
  difficulty: number;
  face: Face;
  heading: number;
  stands: Stand[];
  parked: Pose[];
  bridges: Bridge[];
  terminal: Polygon;
  fences: Polygon[];
  grass: Polygon;
  centreline: number;
  lead_radius: number;
  stop: Vec;
  start: Pose;
  aircraft: Pose;
  /** What stands on the ground: the tug, the train and an aircraft's fuselage, engines and gear meet these. */
  solids: Solid[];
  /** What reaches wing height: an aircraft's wings and tailplanes meet these. Tall things are in both. */
  high: Scene;
  parts: Map<Solid, Part>;
  bounds: Bounds;
  callsign: string;
  hall: Hall | null;
  kit: Kit[];
  train: Train | null;
  /** Our aircraft's low parts and its ground kit while it's parked, for the baggage run: they leave before the push. */
  ours: Solid[];
  ours_kit: Kit[];
}

export const TOWBAR = 7.6;
const TERMINAL_DEPTH = 14;
const ROTUNDA = 1.4;
const TUNNEL = 2.6;
const FENCE = 0.4;
const AIRLINES = ["Hopper", "Warren", "Cottontail", "Burrow", "Thumper", "Clover"];

export interface Layout {
  spacing: number;
  nose_gap: number;
  clearance: number;
  far: number;
  stop: number;
  east: boolean;
  west: boolean;
}

export function layout(seed: number, difficulty: number): Layout {
  const rng = create_rng(hash(seed, 0xa9e0));
  const t = difficulty;
  return {
    spacing: lerp(47, 41.5, t) + rng() * 1.5,
    nose_gap: 5.5 + rng() * 0.6,
    clearance: lerp(24, 19.8, t) + rng() * 0.6,
    far: lerp(28, 21, t) + rng(),
    stop: lerp(34, 24, t) + rng() * 3,
    east: t > 0.2 || rng() < 0.7,
    west: rng() < 0.8,
  };
}

export interface FrameOptions {
  hall?: number;
  docked?: boolean;
  far?: number;
  reach?: [number, number];
}

export interface Added {
  kind: SolidKind;
  shape: Polygon;
  part: Part;
}

/** An apron as built, before it's mirrored for face east: the jobs add to it in this frame. */
export interface Frame {
  seed: number;
  difficulty: number;
  face: Face;
  shape: Layout;
  rng: Rng;
  nose_gear_y: number;
  tail_y: number;
  centreline: number;
  fence_y: number;
  x0: number;
  x1: number;
  stands: { at: Vec; mine: boolean; remote?: boolean }[];
  parked: Pose[];
  bridges: Bridge[];
  added: Added[];
  ours: Added[];
  ours_kit: Kit[];
  hall: Hall | null;
  kit: Kit[];
  train: Train | null;
  start: Pose;
  aircraft: Pose;
  stop: Vec;
  heading: number;
}

const NORTH = -Math.PI / 2;

const flip = (p: Vec): Vec => ({ x: -p.x, y: p.y });

export function mirrorer(mirror: boolean) {
  return {
    point: (p: Vec): Vec => (mirror ? flip(p) : p),
    polygon: (shape: Polygon): Polygon => (mirror ? shape.map(flip).reverse() : shape),
    pose: (p: Pose): Pose => (mirror ? { x: -p.x, y: p.y, heading: Math.PI - p.heading } : p),
    heading: (heading: number): number => (mirror ? Math.PI - heading : heading),
  };
}

export function frame_apron(seed: number, difficulty: number, options: FrameOptions = {}): Frame {
  const rng = create_rng(hash(seed, 0x5a7d));
  const face = rng() < 0.5 ? Face.WEST : Face.EAST;
  const shape = layout(seed, difficulty);
  const nose_gear_y = shape.nose_gap + (NOSE - NOSE_GEAR);
  const centreline = shape.nose_gap + (NOSE - TAIL) + shape.clearance;
  const fence_y = centreline + (options.far ?? shape.far);
  const x0 = Math.min(-shape.spacing * 1.5 - 6, options.reach?.[0] ?? Infinity);
  const x1 = Math.max(shape.stop + 50, options.reach?.[1] ?? -Infinity);

  const indices: number[] = [];
  for (let k = Math.min(-1, Math.ceil((x0 + 6) / shape.spacing)); k * shape.spacing < x1 - 16; k++) indices.push(k);
  const occupied = (k: number) => (k === -1 ? shape.west : k === 1 ? shape.east : k !== 0 && rng() < 0.55);

  const parked: Pose[] = [];
  const bridges: Bridge[] = [];
  const stands: { at: Vec; mine: boolean }[] = [];
  for (const k of indices) {
    if (k === options.hall) continue;
    const x = k * shape.spacing;
    const at = { x, y: nose_gear_y };
    stands.push({ at, mine: k === 0 });
    const from = { x: x - 9, y: ROTUNDA + 2 };
    if (k === 0 && !options.docked) {
      bridges.push({ from, to: { x: x - 6.6, y: shape.nose_gap + 2.6 } });
      continue;
    }
    if (k === 0) {
      bridges.push({ from, to: { x: x - 2.2, y: shape.nose_gap + 4.6 } });
      continue;
    }
    if (!occupied(k)) {
      bridges.push({ from, to: { x: x - 8, y: shape.nose_gap + 1.5 } });
      continue;
    }
    parked.push(pose_from_nose_gear(at, NORTH));
    bridges.push({ from, to: { x: x - 2.2, y: shape.nose_gap + 4.6 } });
  }

  const hall = options.hall === undefined ? null : { door: { x: options.hall * shape.spacing, y: 0 }, width: 5 };
  return {
    seed,
    difficulty,
    face,
    shape,
    rng,
    nose_gear_y,
    tail_y: shape.nose_gap + (NOSE - TAIL),
    centreline,
    fence_y,
    x0,
    x1,
    stands,
    parked,
    bridges,
    added: [],
    ours: [],
    ours_kit: [],
    hall,
    kit: [],
    train: null,
    start: { x: 0, y: nose_gear_y - TOWBAR, heading: Math.PI / 2 },
    aircraft: pose_from_nose_gear({ x: 0, y: nose_gear_y }, NORTH),
    stop: { x: shape.stop, y: centreline },
    heading: Math.PI,
  };
}

export function finish_apron(frame: Frame, mirror = frame.face === Face.EAST): Apron {
  const { shape, rng, x0, x1, fence_y } = frame;
  const terminal = rect(x0, -TERMINAL_DEPTH, x1, 0);
  const fences = [
    rect(x0, fence_y, x1, fence_y + FENCE),
    rect(x0 - FENCE, 0, x0, fence_y + FENCE),
    rect(x1, 0, x1 + FENCE, fence_y + FENCE),
  ];
  const grass = rect(x0, fence_y + FENCE, x1, fence_y + 12);

  const { point, polygon, pose, heading } = mirrorer(mirror);

  const solids: Solid[] = [];
  const high: Solid[] = [];
  const parts = new Map<Solid, Part>();
  const add = (kind: SolidKind, shape: Polygon, part: Part, low = true, tall = false) => {
    const solid = { kind, shape: polygon(shape) };
    if (low) solids.push(solid);
    if (tall) high.push(solid);
    parts.set(solid, part);
  };
  add(SolidKind.WALL, terminal, Part.TERMINAL, true, true);
  for (const fence of fences) add(SolidKind.WALL, fence, Part.FENCE, true, true);
  for (const bridge of frame.bridges) {
    add(
      SolidKind.POST,
      rect(bridge.from.x - ROTUNDA, bridge.from.y - ROTUNDA, bridge.from.x + ROTUNDA, bridge.from.y + ROTUNDA),
      Part.BRIDGE,
      true,
      true
    );
    add(SolidKind.SHELF, tunnel(bridge), Part.BRIDGE, true, true);
  }
  for (const each of frame.parked)
    aircraft_parts(each).forEach((shape, i) => add(SolidKind.CAR, shape, Part.AIRCRAFT, !is_high(i), is_high(i)));
  for (const each of frame.added) add(each.kind, each.shape, each.part);
  const ours = frame.ours.map((each) => {
    const solid = { kind: each.kind, shape: polygon(each.shape) };
    parts.set(solid, each.part);
    return solid;
  });

  const placed = frame.stands.map((stand) => ({ ...stand, at: point(stand.at) })).sort((a, b) => a.at.x - b.at.x);
  const first = random_int(2, 6, rng) * 10 + 1;
  const ends = [point({ x: x0, y: 0 }).x, point({ x: x1, y: 0 }).x];
  let number = first;
  let remote = 0;
  const train = frame.train;
  return {
    seed: frame.seed,
    difficulty: frame.difficulty,
    face: frame.face,
    heading: heading(frame.heading),
    stands: placed.map((stand) => ({ number: stand.remote ? ++remote : number++, ...stand })),
    parked: frame.parked.map(pose),
    bridges: frame.bridges.map((bridge) => ({ from: point(bridge.from), to: point(bridge.to) })),
    terminal: polygon(terminal),
    fences: fences.map(polygon),
    grass: polygon(grass),
    centreline: frame.centreline,
    lead_radius: 20,
    stop: point(frame.stop),
    start: pose(frame.start),
    aircraft: pose(frame.aircraft),
    solids,
    high: { solids: high },
    parts,
    bounds: { x0: Math.min(...ends), y0: -TERMINAL_DEPTH, x1: Math.max(...ends), y1: fence_y + 12 },
    callsign: `${pick(AIRLINES, rng)} ${random_int(102, 989, rng)}`,
    hall: frame.hall && { door: point(frame.hall.door), width: frame.hall.width },
    kit: frame.kit.map((each) => ({ kind: each.kind, pose: pose(each.pose), shape: polygon(each.shape) })),
    train: train && {
      start: pose(train.start),
      route: train.route.map(point),
      arrive_from: train.arrive_from,
      mark: point(train.mark),
      heading: heading(train.heading),
      door: point(train.door),
    },
    ours,
    ours_kit: frame.ours_kit.map((each) => ({ kind: each.kind, pose: pose(each.pose), shape: polygon(each.shape) })),
  };
}

// Built as if the tail swings east (face west), then mirrored for face east.
export function build_apron(seed: number, difficulty: number): Apron {
  return finish_apron(frame_apron(seed, difficulty));
}

export function tunnel(bridge: Bridge): Vec[] {
  const dx = bridge.to.x - bridge.from.x;
  const dy = bridge.to.y - bridge.from.y;
  const length = Math.hypot(dx, dy);
  const ux = dx / length;
  const uy = dy / length;
  const half = TUNNEL / 2;
  return [
    { x: bridge.from.x - uy * half, y: bridge.from.y + ux * half },
    { x: bridge.to.x - uy * half, y: bridge.to.y + ux * half },
    { x: bridge.to.x + uy * half, y: bridge.to.y - ux * half },
    { x: bridge.from.x + uy * half, y: bridge.from.y - ux * half },
  ];
}

export function my_stand(apron: Apron): Stand {
  return apron.stands.find((stand) => stand.mine)!;
}

export function instruction(apron: Apron): string {
  return `${apron.callsign}, stand ${my_stand(apron).number}, push back approved, face ${apron.face}.`;
}
