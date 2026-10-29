import { create_rng, type Rng } from "$lib/core/utils/random";
import { bounds_of, centroid, rect, type Bounds, type Polygon, type Pose, type Vec } from "./geometry";
import { garage, under_headroom } from "./garage";
import { angled, Builder, fit_for, rows, RowsKind, type Layout } from "./lot-layout";
import { MarkKind, SolidKind, SurfaceKind, type Bay, type Mark, type Portal, type Solid, type Surface } from "./scene";
import { hash } from "./seed";
import { HATCHBACK, type VehicleSpec } from "./vehicle";

/** `KERBSIDE` is a road whose east–west arms have parallel bays let into the kerb on both sides; `FLOOR` a garage's floor below its lot. */
export const ChunkKind = { ROAD: "road", KERBSIDE: "kerbside", LOT: "lot", FLOOR: "floor" } as const;
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
  /** A garage's floor: −1 the lot itself, −2 and on the floors laid beside it. */
  floor?: number;
  portals: Portal[];
  headroom: Polygon[];
}

export interface LotCell {
  kind: typeof ChunkKind.LOT;
  entry: Side;
  /** Lays the lot out facing south in its own 32 m frame, from the chunk's own random stream. */
  build: (rng: Rng) => Layout;
  /** Which way a garage's floors are laid beside the lot, each a chunk further. */
  below?: Side;
}

export interface KerbsideCell {
  kind: typeof ChunkKind.KERBSIDE;
  spec: VehicleSpec;
}

export type Cell = { kind: typeof ChunkKind.ROAD } | KerbsideCell | LotCell;

function is_road(cell: Cell): cell is Exclude<Cell, LotCell> {
  return cell.kind !== ChunkKind.LOT;
}

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
    if (self.kind === ChunkKind.LOT) result[side] = self.entry === side && is_road(other);
    else if (is_road(other)) result[side] = true;
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
): Pick<Chunk, "surfaces" | "solids" | "marks" | "bays" | "start" | "headroom"> {
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
    headroom: (layout.headroom ?? []).map(shape),
    ...(layout.start ? { start: { ...at(layout.start), heading: layout.start.heading + angle } } : {}),
  };
}

const KERB_DEPTH = 2.5;
const KERB_GAP = 2.1;
const KERB_TAPER = 1.5;
const KERB_END = 0.5;
const KERB_TAKEN = 1 / 3;

// Null leaves the corner kerbs whole: a trailer or a bay longer than the arm gets no lay-by.
function lay_bys(b: Builder, x0: number, x1: number, spec: VehicleSpec, rng: Rng): Polygon[] | null {
  const fit = fit_for(spec);
  const length = fit.length + KERB_GAP * fit.turn;
  const span = x1 - x0 - 2 * KERB_END;
  if (spec.hitches.length > 0 || length > span) return null;
  const depth = KERB_DEPTH + fit.wider;
  const taper = Math.min(KERB_TAPER, (span - length) / 2);
  const a = (x0 + x1 - length) / 2;
  const z = a + length;
  const lo = MID - ROAD_HALF;
  const hi = MID + ROAD_HALF;
  const north = lo - depth;
  const south = hi + depth;
  for (const [back, edge] of [
    [north, lo],
    [south, hi],
  ] as const) {
    b.ground(SurfaceKind.ASPHALT, [
      { x: a - taper, y: edge },
      { x: a, y: back },
      { x: z, y: back },
      { x: z + taper, y: edge },
    ]);
    b.line({ x: a, y: back }, { x: a, y: edge });
    b.line({ x: z, y: back }, { x: z, y: edge });
    const shape = rect(a, Math.min(back, edge), z, Math.max(back, edge));
    const heading = rng() < 0.5 ? 0 : Math.PI;
    if (rng() < KERB_TAKEN) b.car((a + z) / 2, (back + edge) / 2 + (back < edge ? -0.15 : 0.15), heading, length - 1);
    else b.bay(shape, heading, true);
  }
  return [
    rect(x0, 0, x1, north),
    [
      { x: x0, y: north },
      { x: a, y: north },
      { x: a - taper, y: lo },
      { x: x0, y: lo },
    ],
    [
      { x: z, y: north },
      { x: x1, y: north },
      { x: x1, y: lo },
      { x: z + taper, y: lo },
    ],
    rect(x0, south, x1, CHUNK),
    [
      { x: x0, y: hi },
      { x: a - taper, y: hi },
      { x: a, y: south },
      { x: x0, y: south },
    ],
    [
      { x: z + taper, y: hi },
      { x: x1, y: hi },
      { x: x1, y: south },
      { x: z, y: south },
    ],
  ];
}

function road_layout(open: Exits, kerbside: { spec: VehicleSpec; rng: Rng } | null = null): Layout {
  // A road with one way out runs straight on to the far edge, so a dead-end piece is still a street.
  const arms = { ...open };
  const count = SIDES.filter((side) => open[side]).length;
  if (count === 1) for (const side of SIDES) if (open[side]) arms[OPPOSITE[side]] = true;
  const lo = MID - ROAD_HALF;
  const hi = MID + ROAD_HALF;
  const b = new Builder(kerbside?.rng ?? (() => 0));
  const surfaces = b.surfaces;
  const solids = b.solids;
  const marks = b.marks;
  surfaces.push({ kind: SurfaceKind.ASPHALT, shape: rect(lo, lo, hi, hi) });
  const kerb = (x0: number, y0: number, x1: number, y1: number) =>
    solids.push({ kind: SolidKind.KERB, shape: rect(x0, y0, x1, y1) });
  const cut = (x0: number, x1: number) => (kerbside ? lay_bys(b, x0, x1, kerbside.spec, kerbside.rng) : null);
  const west = arms.w ? cut(0, lo) : null;
  const east = arms.e ? cut(hi, CHUNK) : null;
  for (const piece of [...(west ?? []), ...(east ?? [])]) solids.push({ kind: SolidKind.KERB, shape: piece });
  if (!west) {
    kerb(0, 0, lo, lo);
    kerb(0, hi, lo, CHUNK);
  }
  if (!east) {
    kerb(hi, 0, CHUNK, lo);
    kerb(hi, hi, CHUNK, CHUNK);
  }
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
  return { surfaces, solids, marks, bays: b.bays };
}

function barrier(side: Side): Polygon {
  return {
    n: rect(0, 0, CHUNK, BARRIER),
    s: rect(0, CHUNK - BARRIER, CHUNK, CHUNK),
    w: rect(0, 0, BARRIER, CHUNK),
    e: rect(CHUNK - BARRIER, 0, CHUNK, CHUNK),
  }[side];
}

const CLOSED: Exits = { n: false, e: false, s: false, w: false };

/**
 * Pure: the same seed, cell and plan always give the same chunks. Lots are laid out facing south and turned to face
 * their entry; road pieces join whichever neighbours they open to. Edges toward the outside of the world get a wall.
 * A garage's floors below come after its lot, a chunk apart each toward the cell's `below` (east by default), turned
 * like the lot so each ramp lands on the same spot of the next floor.
 */
export function chunks(seed: number, cx: number, cy: number, plan: Plan): Chunk[] {
  const cell = plan(cx, cy);
  if (!cell) return [];
  const open = exits(plan, cx, cy);
  const ox = cx * CHUNK;
  const oy = cy * CHUNK;
  const layout =
    cell.kind === ChunkKind.ROAD
      ? road_layout(open)
      : cell.kind === ChunkKind.KERBSIDE
        ? road_layout(open, { spec: cell.spec, rng: chunk_rng(seed, cx, cy) })
        : cell.build(chunk_rng(seed, cx, cy));
  const q = cell.kind === ChunkKind.LOT ? quarters(cell.entry) : 0;
  const placed = place(layout, q, ox, oy);
  for (const side of SIDES) {
    if (plan(cx + STEP[side].x, cy + STEP[side].y)) continue;
    placed.solids.push({ kind: SolidKind.WALL, shape: barrier(side).map((p) => ({ x: p.x + ox, y: p.y + oy })) });
  }
  const floors = layout.floors ?? [];
  const main: Chunk = { cx, cy, kind: cell.kind, exits: open, ...placed, portals: [], ...(floors.length > 0 ? { floor: -1 } : {}) };
  if (floors.length === 0) return [main];
  const way = STEP[cell.kind === ChunkKind.LOT ? (cell.below ?? Side.EAST) : Side.EAST];
  const cells = [{ x: cx, y: cy }, ...floors.map((_, i) => ({ x: cx + way.x * (i + 1), y: cy + way.y * (i + 1) }))];
  const all: Chunk[] = [
    main,
    ...floors.map((floor, i): Chunk => ({
      cx: cells[i + 1].x,
      cy: cells[i + 1].y,
      kind: ChunkKind.FLOOR,
      exits: CLOSED,
      ...place(floor, q, cells[i + 1].x * CHUNK, cells[i + 1].y * CHUNK),
      floor: -2 - i,
      portals: [],
    })),
  ];
  const angle = q * (Math.PI / 2);
  const at = (point: Vec, level: number) => {
    const turned = turn_point(point, q);
    return { x: turned.x + cells[level].x * CHUNK, y: turned.y + cells[level].y * CHUNK };
  };
  for (const passage of layout.passages ?? []) {
    all[passage.from].portals.push({
      mouth: passage.mouth.map((point) => at(point, passage.from)),
      heading: passage.heading + angle,
      from: { ...at(passage.at, passage.from), heading: angle },
      to: { ...at(passage.at, passage.to), heading: angle },
      ...(passage.lead ? { lead: passage.lead.map((pose) => ({ ...at(pose, passage.from), heading: pose.heading + angle })) } : {}),
    });
  }
  return all;
}

export function chunk(seed: number, cx: number, cy: number, plan: Plan): Chunk | null {
  return chunks(seed, cx, cy, plan)[0] ?? null;
}

export interface World {
  chunks: Chunk[];
  bounds: Bounds;
  start: Pose;
  solids: Solid[];
  bays: Bay[];
  portals: Portal[];
  headroom: Polygon[];
  /** Where a tyre may stand (`support()`); absent, everywhere. */
  ground?: Polygon[];
}

export function assemble(seed: number, cells: readonly Vec[], plan: Plan, start: Pose): World {
  const all = cells.flatMap((cell) => chunks(seed, cell.x, cell.y, plan));
  const corners = all.flatMap((each) => [
    { x: each.cx * CHUNK, y: each.cy * CHUNK },
    { x: (each.cx + 1) * CHUNK, y: (each.cy + 1) * CHUNK },
  ]);
  return {
    chunks: all,
    bounds: bounds_of(corners),
    start,
    solids: all.flatMap((each) => each.solids),
    bays: all.flatMap((each) => each.bays),
    portals: all.flatMap((each) => each.portals),
    headroom: all.flatMap((each) => each.headroom),
  };
}

export function chunk_at(world: Pick<World, "chunks">, point: Vec): Chunk | undefined {
  const cx = Math.floor(point.x / CHUNK);
  const cy = Math.floor(point.y / CHUNK);
  return world.chunks.find((each) => each.cx === cx && each.cy === cy);
}

/** The portals to pass, in order, to drive from one point to another: chunks join through their exits and portals. */
export function route(world: Pick<World, "chunks">, from: Vec, to: Vec): Portal[] | null {
  const start = chunk_at(world, from);
  const goal = chunk_at(world, to);
  if (!start || !goal) return null;
  const via = new Map<Chunk, { previous: Chunk; portal: Portal | null } | null>([[start, null]]);
  const queue = [start];
  while (queue.length > 0) {
    const at = queue.shift()!;
    if (at === goal) break;
    const next: { chunk: Chunk | undefined; portal: Portal | null }[] = [
      ...SIDES.filter((side) => at.exits[side]).map((side) => ({
        chunk: world.chunks.find((each) => each.cx === at.cx + STEP[side].x && each.cy === at.cy + STEP[side].y),
        portal: null,
      })),
      ...at.portals.map((portal) => ({ chunk: chunk_at(world, portal.to), portal })),
    ];
    for (const { chunk: other, portal } of next) {
      if (!other || via.has(other)) continue;
      via.set(other, { previous: at, portal });
      queue.push(other);
    }
  }
  if (!via.has(goal)) return null;
  const portals: Portal[] = [];
  for (let step = via.get(goal); step; step = via.get(step.previous)) if (step.portal) portals.unshift(step.portal);
  return portals;
}

// On another floor the bay is the wrong way across the canvas: a pointer leads to the next ramp's mouth instead.
export function toward(world: Pick<World, "chunks">, from: Vec, bay: Bay): Bay {
  const next = route(world, from, centroid(bay.shape))?.[0];
  return next ? { shape: next.mouth, heading: next.heading, either: false } : bay;
}

/** On foot: straight lines from one ramp to the next. */
export function walk_length(world: Pick<World, "chunks">, from: Vec, to: Vec): number {
  const portals = route(world, from, to) ?? [];
  let at = from;
  let total = 0;
  for (const portal of portals) {
    total += Math.hypot(portal.from.x - at.x, portal.from.y - at.y);
    at = portal.to;
  }
  return total + Math.hypot(to.x - at.x, to.y - at.y);
}

const OpenLot = { FORWARD: "forward", ANGLED: "angled", PILLARS: "pillars", GARAGE: "garage" } as const;
type OpenLot = (typeof OpenLot)[keyof typeof OpenLot];
const OPEN_LOTS: readonly OpenLot[] = [OpenLot.FORWARD, OpenLot.ANGLED, OpenLot.PILLARS, OpenLot.GARAGE];
const KERBSIDE_ODDS = 3;
const OPEN_DIFFICULTY = 0.3;

const OPEN_FLOORS = 2;
const OPEN_GARAGE = OPEN_DIFFICULTY;

function open_lot(kind: OpenLot, rng: Rng, spec: VehicleSpec): Layout {
  const fit = fit_for(spec);
  if (kind === OpenLot.ANGLED) return angled(OPEN_DIFFICULTY, rng, true, fit);
  if (kind === OpenLot.GARAGE && under_headroom(spec)) return garage(OPEN_GARAGE, rng, fit, { floors: OPEN_FLOORS, target: null });
  const rows_kind = kind === OpenLot.PILLARS ? RowsKind.PILLARS : kind === OpenLot.GARAGE ? RowsKind.GARAGE : RowsKind.FORWARD;
  return rows(OPEN_DIFFICULTY, rng, true, rows_kind, fit);
}

/**
 * The open lot: a crossroads with a lot of free bays in each corner, every bay a target. Most east–west roads have
 * kerb bays; the north–south ones stay plain, so Valet's queue and coach bays keep their lanes.
 */
export function open_plan(seed: number, spec: VehicleSpec = HATCHBACK): Plan {
  return (cx, cy) => {
    if (Math.abs(cx) > 1 || Math.abs(cy) > 1) return null;
    if (cy === 0 && cx !== 0 && hash(seed, cx, cy, 11) % KERBSIDE_ODDS !== 0) return { kind: ChunkKind.KERBSIDE, spec };
    if (cx === 0 || cy === 0) return { kind: ChunkKind.ROAD };
    const h = hash(seed, cx, cy, 7);
    const entry: Side = h % 2 === 0 ? (cy < 0 ? Side.SOUTH : Side.NORTH) : cx < 0 ? Side.EAST : Side.WEST;
    const kind = OPEN_LOTS[(h >>> 1) % OPEN_LOTS.length];
    // Out of the world, away from the crossroads, so the floors never sit on a road.
    return { kind: ChunkKind.LOT, entry, build: (rng) => open_lot(kind, rng, spec), below: cx < 0 ? Side.WEST : Side.EAST };
  };
}

export function open_world(seed: number, spec: VehicleSpec = HATCHBACK): World {
  const cells: Vec[] = [];
  for (let cy = -1; cy <= 1; cy++) for (let cx = -1; cx <= 1; cx++) cells.push({ x: cx, y: cy });
  return assemble(seed, cells, open_plan(seed, spec), { x: MID + 2, y: MID + 6, heading: -Math.PI / 2 });
}
