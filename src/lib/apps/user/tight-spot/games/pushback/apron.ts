import { create_rng, pick, random_int } from "$lib/core/utils/random";
import { lerp, rect, type Bounds, type Polygon, type Pose, type Vec } from "../../core/geometry";
import { SolidKind, type Solid } from "../../core/scene";
import { hash } from "../../core/seed";
import { aircraft_parts, NOSE, NOSE_GEAR, pose_from_nose_gear, TAIL } from "./aircraft";

export const Face = { WEST: "west", EAST: "east" } as const;
export type Face = (typeof Face)[keyof typeof Face];

export const Part = { AIRCRAFT: "aircraft", BRIDGE: "bridge", TERMINAL: "terminal", FENCE: "fence" } as const;
export type Part = (typeof Part)[keyof typeof Part];

export interface Bridge {
  from: Vec;
  /** The cab's end: at a parked aircraft's front door, or pulled back clear of ours. */
  to: Vec;
}

export interface Stand {
  number: number;
  at: Vec;
  mine: boolean;
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
  solids: Solid[];
  parts: Map<Solid, Part>;
  bounds: Bounds;
  callsign: string;
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

const flip = (p: Vec): Vec => ({ x: -p.x, y: p.y });

// Built as if the tail swings east (face west), then mirrored for face east.
export function build_apron(seed: number, difficulty: number): Apron {
  const rng = create_rng(hash(seed, 0x5a7d));
  const face = rng() < 0.5 ? Face.WEST : Face.EAST;
  const shape = layout(seed, difficulty);
  const nose_gear_y = shape.nose_gap + (NOSE - NOSE_GEAR);
  const centreline = shape.nose_gap + (NOSE - TAIL) + shape.clearance;
  const fence_y = centreline + shape.far;
  const x0 = -shape.spacing * 1.5 - 6;
  const x1 = shape.stop + 50;
  const north = -Math.PI / 2;

  const indices: number[] = [];
  for (let k = -1; k * shape.spacing < x1 - 16; k++) indices.push(k);
  const occupied = (k: number) => (k === -1 ? shape.west : k === 1 ? shape.east : k !== 0 && rng() < 0.55);

  const parked: Pose[] = [];
  const bridges: Bridge[] = [];
  const stands: { at: Vec; mine: boolean }[] = [];
  for (const k of indices) {
    const x = k * shape.spacing;
    const at = { x, y: nose_gear_y };
    stands.push({ at, mine: k === 0 });
    const from = { x: x - 9, y: ROTUNDA + 2 };
    if (k === 0) {
      bridges.push({ from, to: { x: x - 6.6, y: shape.nose_gap + 2.6 } });
      continue;
    }
    if (!occupied(k)) {
      bridges.push({ from, to: { x: x - 8, y: shape.nose_gap + 1.5 } });
      continue;
    }
    parked.push(pose_from_nose_gear(at, north));
    bridges.push({ from, to: { x: x - 2.2, y: shape.nose_gap + 4.6 } });
  }

  const mine = pose_from_nose_gear({ x: 0, y: nose_gear_y }, north);
  const start = { x: 0, y: nose_gear_y - TOWBAR, heading: Math.PI / 2 };
  const stop = { x: shape.stop, y: centreline };
  const terminal = rect(x0, -TERMINAL_DEPTH, x1, 0);
  const fences = [rect(x0, fence_y, x1, fence_y + FENCE), rect(x0 - FENCE, 0, x0, fence_y + FENCE), rect(x1, 0, x1 + FENCE, fence_y + FENCE)];
  const grass = rect(x0, fence_y + FENCE, x1, fence_y + 12);

  const mirror = face === Face.EAST;
  const point = (p: Vec) => (mirror ? flip(p) : p);
  const polygon = (shape: Polygon): Polygon => (mirror ? shape.map(flip).reverse() : shape);
  const pose = (p: Pose): Pose => (mirror ? { x: -p.x, y: p.y, heading: Math.PI - p.heading } : p);

  const solids: Solid[] = [];
  const parts = new Map<Solid, Part>();
  const add = (kind: SolidKind, shape: Polygon, part: Part) => {
    const solid = { kind, shape: polygon(shape) };
    solids.push(solid);
    parts.set(solid, part);
  };
  add(SolidKind.WALL, terminal, Part.TERMINAL);
  for (const fence of fences) add(SolidKind.WALL, fence, Part.FENCE);
  for (const bridge of bridges) {
    add(SolidKind.POST, rect(bridge.from.x - ROTUNDA, bridge.from.y - ROTUNDA, bridge.from.x + ROTUNDA, bridge.from.y + ROTUNDA), Part.BRIDGE);
    add(SolidKind.SHELF, tunnel(bridge), Part.BRIDGE);
  }
  for (const each of parked) for (const shape of aircraft_parts(each)) add(SolidKind.CAR, shape, Part.AIRCRAFT);

  const placed = stands.map((stand) => ({ ...stand, at: point(stand.at) })).sort((a, b) => a.at.x - b.at.x);
  const first = random_int(2, 6, rng) * 10 + 1;
  const ends = [point({ x: x0, y: 0 }).x, point({ x: x1, y: 0 }).x];
  return {
    seed,
    difficulty,
    face,
    heading: mirror ? 0 : Math.PI,
    stands: placed.map((stand, i) => ({ number: first + i, ...stand })),
    parked: parked.map(pose),
    bridges: bridges.map((bridge) => ({ from: point(bridge.from), to: point(bridge.to) })),
    terminal: polygon(terminal),
    fences: fences.map(polygon),
    grass: polygon(grass),
    centreline,
    lead_radius: 20,
    stop: point(stop),
    start: pose(start),
    aircraft: pose(mine),
    solids,
    parts,
    bounds: { x0: Math.min(...ends), y0: -TERMINAL_DEPTH, x1: Math.max(...ends), y1: fence_y + 12 },
    callsign: `${pick(AIRLINES, rng)} ${random_int(102, 989, rng)}`,
  };
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
