import { create_rng, pick, random_int, type Rng } from "$lib/core/utils/random";
import { lerp, rect, type Bounds, type Polygon, type Pose, type Vec } from "$kit/games/play2d/geometry";
import type { Scene } from "../../core/obstacles";
import { SolidKind, type Solid } from "../../core/scene";
import { hash } from "$kit/games/play2d/seed";
import { aircraft_parts, is_high, NARROWBODY, pose_from_nose_gear, type Airframe, type Fleet } from "./aircraft";

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

export interface Bend {
  centre: Vec;
  radius: number;
  /** +1 when the taxiway runs east into the bend, −1 west. */
  side: 1 | -1;
  end: number;
}

export interface Apron {
  seed: number;
  difficulty: number;
  airframe: Airframe;
  bend: Bend | null;
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

export const TOWBAR = -NARROWBODY.link.hitch;
const TERMINAL_DEPTH = 14;
const ROTUNDA = 1.4;
const TUNNEL = 2.6;
const FENCE = 0.4;
const ARC_PIECES = 12;
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

interface Sizes {
  spacing: [number, number];
  clearance: [number, number];
  far: [number, number];
  stop: [number, number];
  run: number;
  // Our nose stops further off the terminal than a neighbour's, so the longer tug behind it clears the bridges.
  pull: number;
  bend: { at: [number, number]; radius: [number, number]; past: [number, number] };
}

// A widebody's neighbours are narrowbodies: its stands are far enough apart for its wingtip to pass theirs, and the
// fence stands beyond its wingtip on the taxiway.
const SIZES: Record<Fleet, Sizes> = {
  narrow: {
    spacing: [47, 41.5],
    clearance: [24, 19.8],
    far: [28, 21],
    stop: [34, 24],
    run: 50,
    pull: 0,
    bend: { at: [36, 30], radius: [7, 4], past: [12, 7] },
  },
  wide: {
    spacing: [61, 55],
    clearance: [20, 14],
    far: [41, 36.5],
    stop: [44, 34],
    run: 82,
    pull: 3.1,
    bend: { at: [50, 44], radius: [8, 5], past: [16, 10] },
  },
};

export function layout(seed: number, difficulty: number, airframe: Airframe = NARROWBODY): Layout {
  const rng = create_rng(hash(seed, 0xa9e0));
  const t = difficulty;
  const size = SIZES[airframe.fleet];
  return {
    spacing: lerp(...size.spacing, t) + rng() * 1.5,
    nose_gap: 5.5 + rng() * 0.6,
    clearance: lerp(...size.clearance, t) + rng() * 0.6,
    far: lerp(...size.far, t) + rng(),
    stop: lerp(...size.stop, t) + rng() * 3,
    east: t > 0.2 || rng() < 0.7,
    west: rng() < 0.8,
  };
}

export interface FrameOptions {
  hall?: number;
  docked?: boolean;
  far?: number;
  reach?: [number, number];
  airframe?: Airframe;
  corner?: boolean;
}

export interface Added {
  kind: SolidKind;
  shape: Polygon;
  part: Part;
}

export interface FrameBend {
  x: number;
  radius: number;
  end: number;
}

/** An apron as built, before it's mirrored for face east: the jobs add to it in this frame. */
export interface Frame {
  seed: number;
  difficulty: number;
  airframe: Airframe;
  bend: FrameBend | null;
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
  const airframe = options.airframe ?? NARROWBODY;
  const face = rng() < 0.5 ? Face.WEST : Face.EAST;
  const shape = layout(seed, difficulty, airframe);
  const size = SIZES[airframe.fleet];
  const gap = shape.nose_gap + size.pull;
  const stand_y = (frame: Airframe) => shape.nose_gap + (frame.nose - frame.nose_gear);
  const nose_gear_y = gap + (airframe.nose - airframe.nose_gear);
  const length = airframe.nose - airframe.tail;
  const centreline = gap + length + shape.clearance;
  const far = options.far ?? shape.far;
  const fence_y = centreline + far;

  let bend: FrameBend | null = null;
  let stop = { x: shape.stop, y: centreline };
  let heading = Math.PI;
  if (options.corner) {
    const bent = create_rng(hash(seed, 0xbe9d));
    const t = difficulty;
    const x = lerp(...size.bend.at, t) + bent() * 3;
    const radius = far + lerp(...size.bend.radius, t) + bent() * 2;
    const past = lerp(...size.bend.past, t) + bent() * 3;
    bend = { x, radius, end: centreline + radius + past + (airframe.nose_gear - airframe.tail) + 24 };
    stop = { x: x + radius, y: centreline + radius + past };
    heading = NORTH;
  }

  const x0 = Math.min(-shape.spacing * 1.5 - 6, options.reach?.[0] ?? Infinity);
  const x1 = bend ? bend.x + bend.radius + far : Math.max(shape.stop + size.run, options.reach?.[1] ?? -Infinity);
  const last = bend ? bend.x + 16 : x1 - 16;

  const indices: number[] = [];
  for (let k = Math.min(-1, Math.ceil((x0 + 6) / shape.spacing)); k * shape.spacing < last; k++) indices.push(k);
  const occupied = (k: number) => (k === -1 ? shape.west : k === 1 ? shape.east : k !== 0 && rng() < 0.55);

  const parked: Pose[] = [];
  const bridges: Bridge[] = [];
  const stands: { at: Vec; mine: boolean }[] = [];
  for (const k of indices) {
    if (k === options.hall) continue;
    const x = k * shape.spacing;
    const at = { x, y: k === 0 ? nose_gear_y : stand_y(NARROWBODY) };
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
    airframe,
    bend,
    face,
    shape,
    rng,
    nose_gear_y,
    tail_y: gap + length,
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
    start: { x: 0, y: nose_gear_y + airframe.link.hitch, heading: Math.PI / 2 },
    aircraft: pose_from_nose_gear({ x: 0, y: nose_gear_y }, NORTH, airframe),
    stop,
    heading,
  };
}

interface Edges {
  fences: Polygon[];
  grass: Polygon;
  y1: number;
}

function straight_edges(frame: Frame): Edges {
  const { x0, x1, fence_y } = frame;
  return {
    fences: [
      rect(x0, fence_y, x1, fence_y + FENCE),
      rect(x0 - FENCE, 0, x0, fence_y + FENCE),
      rect(x1, 0, x1 + FENCE, fence_y + FENCE),
    ],
    grass: rect(x0, fence_y + FENCE, x1, fence_y + 12),
    y1: fence_y + 12,
  };
}

// The fence on the inside of the turn follows the taxiway round, in short straight pieces since solids are convex.
function bent_edges(frame: Frame, bend: FrameBend): Edges {
  const { x0, x1, fence_y } = frame;
  const cy = frame.centreline + bend.radius;
  const inner = bend.radius - (fence_y - frame.centreline);
  const at = (r: number, a: number): Vec => ({ x: bend.x + r * Math.cos(a), y: cy + r * Math.sin(a) });
  const angle = (i: number) => -Math.PI / 2 + (i / ARC_PIECES) * (Math.PI / 2);
  const fences = [
    rect(x0, fence_y, bend.x, fence_y + FENCE),
    rect(bend.x + inner - FENCE, cy, bend.x + inner, bend.end),
    rect(x0 - FENCE, 0, x0, fence_y + FENCE),
    rect(x1, 0, x1 + FENCE, bend.end + FENCE),
    rect(bend.x + inner - FENCE, bend.end, x1, bend.end + FENCE),
  ];
  const edge: Vec[] = [];
  for (let i = 0; i < ARC_PIECES; i++) {
    fences.push([at(inner, angle(i)), at(inner, angle(i + 1)), at(inner - FENCE, angle(i + 1)), at(inner - FENCE, angle(i))]);
  }
  for (let i = 0; i <= ARC_PIECES; i++) edge.push(at(inner - FENCE, angle(i)));
  const grass = [{ x: x0, y: fence_y + FENCE }, ...edge, { x: bend.x + inner - FENCE, y: bend.end }, { x: x0, y: bend.end }];
  return { fences, grass, y1: bend.end + FENCE };
}

export function finish_apron(frame: Frame, mirror = frame.face === Face.EAST): Apron {
  const { rng, x0, x1 } = frame;
  const terminal = rect(x0, -TERMINAL_DEPTH, x1, 0);
  const { fences, grass, y1 } = frame.bend ? bent_edges(frame, frame.bend) : straight_edges(frame);

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
  const bend = frame.bend;
  return {
    seed: frame.seed,
    difficulty: frame.difficulty,
    airframe: frame.airframe,
    bend: bend && {
      centre: point({ x: bend.x, y: frame.centreline + bend.radius }),
      radius: bend.radius,
      side: mirror ? -1 : 1,
      end: bend.end,
    },
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
    bounds: { x0: Math.min(...ends), y0: -TERMINAL_DEPTH, x1: Math.max(...ends), y1 },
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

export interface ApronOptions {
  airframe?: Airframe;
  corner?: boolean;
}

// Built as if the tail swings east (face west), then mirrored for face east.
export function build_apron(seed: number, difficulty: number, options: ApronOptions = {}): Apron {
  return finish_apron(frame_apron(seed, difficulty, options));
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

export function facing(apron: Apron): string {
  return apron.bend ? "north" : apron.face;
}
