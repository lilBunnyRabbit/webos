import { create_rng, type Rng } from "$lib/core/utils/random";
import { bounds_of, rect, type Bounds, type Polygon, type Pose, type Vec } from "./geometry";
import { angled, fit_for, rows, RowsKind, type Layout } from "./lot-layout";
import { MarkKind, SolidKind, SurfaceKind, type Bay, type Mark, type Solid, type Surface } from "./scene";
import { hash } from "./seed";
import { HATCHBACK, type VehicleSpec } from "./vehicle";

export const ChunkKind = { ROAD: "road", LOT: "lot" } as const;
export type ChunkKind = (typeof ChunkKind)[keyof typeof ChunkKind];

export const CHUNK = 32;
export const ROAD_HALF = 4;
const MID = CHUNK / 2;
export const BARRIER = 0.4;

export const Side = { NORTH: "n", EAST: "e", SOUTH: "s", WEST: "w" } as const;
export type Side = (typeof Side)[keyof typeof Side];
export const SIDES: readonly Side[] = [Side.NORTH, Side.EAST, Side.SOUTH, Side.WEST];

export type Exits = Record<Side, boolean>;

export interface Chunk {
  cx: number;
  cy: number;
  kind: ChunkKind;
  exits: Exits;
  surfaces: Surface[];
  solids: Solid[];
  marks: Mark[];
  bays: Bay[];
  start?: Pose;
}

export interface LotCell {
  kind: typeof ChunkKind.LOT;
  entry: Side;
  /** Lays the lot out facing south in its own 32 m frame, from the chunk's own random stream. */
  build: (rng: Rng) => Layout;
}

export type Cell = { kind: typeof ChunkKind.ROAD } | LotCell;

export type Plan = (cx: number, cy: number) => Cell | null;

const STEP: Record<Side, Vec> = { n: { x: 0, y: -1 }, e: { x: 1, y: 0 }, s: { x: 0, y: 1 }, w: { x: -1, y: 0 } };
const OPPOSITE: Record<Side, Side> = { n: "s", e: "w", s: "n", w: "e" };


export function chunk_rng(seed: number, cx: number, cy: number): Rng {
  return create_rng(hash(seed, cx, cy));
}

export function exits(plan: Plan, cx: number, cy: number): Exits {
  const self = plan(cx, cy);
  const result: Exits = { n: false, e: false, s: false, w: false };
  if (!self) return result;
  for (const side of SIDES) {
    const other = plan(cx + STEP[side].x, cy + STEP[side].y);
    if (!other) continue;
    if (self.kind === ChunkKind.LOT) result[side] = self.entry === side && other.kind === ChunkKind.ROAD;
    else if (other.kind === ChunkKind.ROAD) result[side] = true;
    else result[side] = other.entry === OPPOSITE[side];
  }
  return result;
}

function quarters(side: Side): number {
  return { s: 0, w: 1, n: 2, e: 3 }[side];
}

function turn_point(point: Vec, q: number): Vec {
  let x = point.x - MID;
  let y = point.y - MID;
  for (let i = 0; i < q; i++) [x, y] = [-y, x];
  return { x: x + MID, y: y + MID };
}

function place(
  layout: Layout,
  q: number,
  ox: number,
  oy: number
): Pick<Chunk, "surfaces" | "solids" | "marks" | "bays" | "start"> {
  const at = (point: Vec) => {
    const turned = turn_point(point, q);
    return { x: turned.x + ox, y: turned.y + oy };
  };
  const shape = (polygon: Polygon) => polygon.map(at);
  const angle = q * (Math.PI / 2);
  return {
    surfaces: layout.surfaces.map((surface) => ({ ...surface, shape: shape(surface.shape) })),
    solids: layout.solids.map((solid) => ({
      ...solid,
      shape: shape(solid.shape),
      ...(solid.car
        ? { car: { ...solid.car, pose: { ...at(solid.car.pose), heading: solid.car.pose.heading + angle } } }
        : {}),
    })),
    marks: layout.marks.map((mark) => ({ ...mark, a: at(mark.a), b: at(mark.b) })),
    bays: layout.bays.map((bay) => ({ ...bay, shape: shape(bay.shape), heading: bay.heading + angle })),
    ...(layout.start ? { start: { ...at(layout.start), heading: layout.start.heading + angle } } : {}),
  };
}

function road_layout(open: Exits): Layout {
  // A road with one way out runs straight on to the far edge, so a dead-end piece is still a street.
  const arms = { ...open };
  const count = SIDES.filter((side) => open[side]).length;
  if (count === 1) for (const side of SIDES) if (open[side]) arms[OPPOSITE[side]] = true;
  const lo = MID - ROAD_HALF;
  const hi = MID + ROAD_HALF;
  const surfaces: Surface[] = [{ kind: SurfaceKind.ASPHALT, shape: rect(lo, lo, hi, hi) }];
  const solids: Solid[] = [];
  const marks: Mark[] = [];
  const kerb = (x0: number, y0: number, x1: number, y1: number) =>
    solids.push({ kind: SolidKind.KERB, shape: rect(x0, y0, x1, y1) });
  kerb(0, 0, lo, lo);
  kerb(hi, 0, CHUNK, lo);
  kerb(0, hi, lo, CHUNK);
  kerb(hi, hi, CHUNK, CHUNK);
  const arm: Record<Side, [number, number, number, number]> = {
    n: [lo, 0, hi, lo],
    s: [lo, hi, hi, CHUNK],
    w: [0, lo, lo, hi],
    e: [hi, lo, CHUNK, hi],
  };
  for (const side of SIDES) {
    const [x0, y0, x1, y1] = arm[side];
    if (arms[side]) {
      surfaces.push({ kind: SurfaceKind.ASPHALT, shape: rect(x0, y0, x1, y1) });
      const vertical = side === Side.NORTH || side === Side.SOUTH;
      const from = vertical
        ? { x: MID, y: side === Side.NORTH ? 0 : hi + 1 }
        : { x: side === Side.WEST ? 0 : hi + 1, y: MID };
      const to = vertical
        ? { x: MID, y: side === Side.NORTH ? lo - 1 : CHUNK }
        : { x: side === Side.WEST ? lo - 1 : CHUNK, y: MID };
      marks.push({ kind: MarkKind.DASH, a: from, b: to });
    } else kerb(x0, y0, x1, y1);
  }
  return { surfaces, solids, marks, bays: [] };
}

function barrier(side: Side): Polygon {
  return {
    n: rect(0, 0, CHUNK, BARRIER),
    s: rect(0, CHUNK - BARRIER, CHUNK, CHUNK),
    w: rect(0, 0, BARRIER, CHUNK),
    e: rect(CHUNK - BARRIER, 0, CHUNK, CHUNK),
  }[side];
}

/**
 * Pure: the same seed, cell and plan always give the same chunk. Lots are laid out facing south and turned to face
 * their entry; road pieces join whichever neighbours they open to. Edges toward the outside of the world get a wall.
 */
export function chunk(seed: number, cx: number, cy: number, plan: Plan): Chunk | null {
  const cell = plan(cx, cy);
  if (!cell) return null;
  const open = exits(plan, cx, cy);
  const ox = cx * CHUNK;
  const oy = cy * CHUNK;
  const layout =
    cell.kind === ChunkKind.ROAD
      ? road_layout(open)
      : cell.build(chunk_rng(seed, cx, cy));
  const placed = place(layout, cell.kind === ChunkKind.LOT ? quarters(cell.entry) : 0, ox, oy);
  for (const side of SIDES) {
    if (plan(cx + STEP[side].x, cy + STEP[side].y)) continue;
    placed.solids.push({ kind: SolidKind.WALL, shape: barrier(side).map((p) => ({ x: p.x + ox, y: p.y + oy })) });
  }
  return { cx, cy, kind: cell.kind, exits: open, ...placed };
}

export interface World {
  chunks: Chunk[];
  bounds: Bounds;
  start: Pose;
  solids: Solid[];
  bays: Bay[];
}

export function assemble(seed: number, cells: readonly Vec[], plan: Plan, start: Pose): World {
  const chunks = cells.map((cell) => chunk(seed, cell.x, cell.y, plan)).filter((each): each is Chunk => each !== null);
  const corners = chunks.flatMap((each) => [
    { x: each.cx * CHUNK, y: each.cy * CHUNK },
    { x: (each.cx + 1) * CHUNK, y: (each.cy + 1) * CHUNK },
  ]);
  return {
    chunks,
    bounds: bounds_of(corners),
    start,
    solids: chunks.flatMap((each) => each.solids),
    bays: chunks.flatMap((each) => each.bays),
  };
}

const OpenLot = { FORWARD: "forward", ANGLED: "angled", PILLARS: "pillars" } as const;
type OpenLot = (typeof OpenLot)[keyof typeof OpenLot];
const OPEN_LOTS: readonly OpenLot[] = [OpenLot.FORWARD, OpenLot.ANGLED, OpenLot.PILLARS];
const OPEN_DIFFICULTY = 0.3;

function open_lot(kind: OpenLot, rng: Rng, spec: VehicleSpec): Layout {
  const fit = fit_for(spec);
  if (kind === OpenLot.ANGLED) return angled(OPEN_DIFFICULTY, rng, true, fit);
  return rows(OPEN_DIFFICULTY, rng, true, kind === OpenLot.PILLARS ? RowsKind.PILLARS : RowsKind.FORWARD, fit);
}

/** The open lot: a crossroads with a lot of free bays in each corner, every bay a target. */
export function open_plan(seed: number, spec: VehicleSpec = HATCHBACK): Plan {
  return (cx, cy) => {
    if (Math.abs(cx) > 1 || Math.abs(cy) > 1) return null;
    if (cx === 0 || cy === 0) return { kind: ChunkKind.ROAD };
    const h = hash(seed, cx, cy, 7);
    const entry: Side = h % 2 === 0 ? (cy < 0 ? Side.SOUTH : Side.NORTH) : cx < 0 ? Side.EAST : Side.WEST;
    const kind = OPEN_LOTS[(h >>> 1) % OPEN_LOTS.length];
    return { kind: ChunkKind.LOT, entry, build: (rng) => open_lot(kind, rng, spec) };
  };
}

export function open_world(seed: number, spec: VehicleSpec = HATCHBACK): World {
  const cells: Vec[] = [];
  for (let cy = -1; cy <= 1; cy++) for (let cx = -1; cx <= 1; cx++) cells.push({ x: cx, y: cy });
  return assemble(seed, cells, open_plan(seed, spec), { x: MID + 2, y: MID + 6, heading: -Math.PI / 2 });
}
