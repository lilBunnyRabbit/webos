import { CHUNK, chunk_at, ChunkKind, open_world, type Chunk, type World } from "../../core/lot";
import { bounds_of, rect, type Bounds, type Polygon, type Pose, type Vec } from "../../core/geometry";
import type { Bay } from "../../core/scene";
import { pose_from_centre, VAN, VEHICLES, type Vehicle } from "../../core/vehicle";

const NORTH = -Math.PI / 2;
const ROAD_LO = 12;
const ROAD_MID = 16;
const ROAD_HI = 20;

export const ARRIVAL_FRONT = CHUNK + 2.5;
const QUEUE_GAP = 1.2;
const LANE_X = (ROAD_MID + ROAD_HI) / 2;
// The next car only pulls up into the east lane once the valet's car is out of it.
export const ARRIVAL_LANE: Polygon = rect(ROAD_MID, CHUNK, ROAD_HI, 2 * CHUNK);
export const STREET_END = 2 * CHUNK;
const QUEUE_END = STREET_END - 0.8;
export const LANE_LO = ROAD_MID;
export const LANE_HI = ROAD_HI;

export const STAND: Vec = { x: ROAD_HI + 1.3, y: CHUNK + 3 };
export const BOOTH: Polygon = rect(ROAD_HI + 0.4, CHUNK + 1.6, ROAD_HI + 2.2, CHUNK + 4.4);

export interface Street {
  world: World;
  bays: Bay[];
  coach: Bay[];
  returns: Bay;
}

function bay(shape: Polygon): Bay {
  return { shape, heading: NORTH, either: true };
}

/**
 * The open lot sized for the van, the biggest customer car, so every one of them fits any bay. The bus can't turn at
 * the crossroads, so it drives straight on into a coach bay up the north road and backs out to the stand. That road
 * may end at a lot's gate 20 m up and may have gates down its sides: a coach bay goes only in a lane with no gate
 * beside it, or in the east one when both have, so a parked bus seldom shuts a lot. Coach bays are the bus's only.
 */
export function build_street(seed: number): Street {
  const world = open_world(seed, VAN);
  const far = -ROAD_LO + 0.2;
  const near = far + VEHICLES.bus.length + 1.2;
  const exits = world.chunks.find((chunk) => chunk.cx === 0 && chunk.cy === -1)!.exits;
  const west = bay(rect(ROAD_LO + 0.3, far, ROAD_MID - 0.1, near));
  const east = bay(rect(ROAD_MID + 0.1, far, ROAD_HI - 0.3, near));
  const coach = [...(exits.w ? [] : [west]), ...(exits.e && !exits.w ? [] : [east])];
  const returns = bay(rect(ROAD_LO + 0.4, CHUNK + 2.5, ROAD_MID - 0.2, CHUNK + 2.5 + VEHICLES.bus.length + 2));
  return { world, bays: world.bays, coach, returns };
}

export function queue_poses(vehicles: readonly Vehicle[], held: Vehicle | null): (Pose | null)[] {
  let front = ARRIVAL_FRONT + (held ? VEHICLES[held].length + QUEUE_GAP : 0);
  return vehicles.map((vehicle) => {
    const spec = VEHICLES[vehicle];
    const centre = front + spec.length / 2;
    front += spec.length + QUEUE_GAP;
    if (front - QUEUE_GAP > QUEUE_END) return null;
    return pose_from_centre({ x: LANE_X, y: centre, heading: NORTH }, spec);
  });
}

export function arrival_pose(vehicle: Vehicle): Pose {
  return queue_poses([vehicle], null)[0]!;
}

export function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export interface Overview {
  /** The 3 × 3 street, always whole in view. */
  street: Bounds;
  /** The street and every garage floor a customer car is parked on: shown as far as the street's fit leaves room. */
  wanted: Bounds;
}

function chunk_corners(cx: number, cy: number): Vec[] {
  return [
    { x: cx * CHUNK, y: cy * CHUNK },
    { x: (cx + 1) * CHUNK, y: (cy + 1) * CHUNK },
  ];
}

// Fitting every floor laid beside the lot shrank a phone's view to about 60 %: only the floors with cars on them count.
export function overview(world: World, cars: readonly Vec[]): Overview {
  const street = world.chunks.filter((each) => each.kind !== ChunkKind.FLOOR).flatMap((each) => chunk_corners(each.cx, each.cy));
  const floors = new Set(cars.map((car) => chunk_at(world, car)).filter((each): each is Chunk => each?.kind === ChunkKind.FLOOR));
  const wanted = [...street, ...[...floors].flatMap((each) => chunk_corners(each.cx, each.cy))];
  return { street: bounds_of(street), wanted: bounds_of(wanted) };
}

function settle(street_lo: number, street_hi: number, wanted_lo: number, wanted_hi: number, half: number): number {
  if (half * 2 < street_hi - street_lo) return (street_lo + street_hi) / 2;
  return Math.min(street_lo + half, Math.max(street_hi - half, (wanted_lo + wanted_hi) / 2));
}

/** The middle of the clear part of the board: the wanted area's, moved only as far as keeps the street whole. */
export function overview_focus({ street, wanted }: Overview, half_width: number, half_height: number): Vec {
  return {
    x: settle(street.x0, street.x1, wanted.x0, wanted.x1, half_width),
    y: settle(street.y0, street.y1, wanted.y0, wanted.y1, half_height),
  };
}
