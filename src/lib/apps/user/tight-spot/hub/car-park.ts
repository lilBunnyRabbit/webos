import type { Rng } from "$lib/core/utils/random";
import { bounds_of, rect, type Bounds, type Polygon, type Pose } from "../core/geometry";
import { garage } from "../core/garage";
import { chunks, CHUNK, ChunkKind, Side, type Chunk, type Plan } from "../core/lot";
import { EDGE, fit_for, SIZE, type Layout } from "../core/lot-layout";
import type { Portal, Solid } from "../core/scene";
import { VAN } from "../core/vehicle";
import { box, DOOR_HALF, RAMP_BAR, RAMP_HALF, RAMP_LINE, shape_at, to_town, type Frame } from "./blueprints";

const SEED = 4421;
// As tight as the Multi-storey spot gets, laid out for the van, the biggest vehicle under the bar.
const DIFFICULTY = 1;
const FLOORS = 3;
const GAP = 8;
const MOUTH = 0.5;
const NORTH = -Math.PI / 2;
const SOUTH = Math.PI / 2;
const WEST = Math.PI;
// Far enough up the way in that a van driving back out reaches the mouth with its nose short of the wall.
const ARRIVE = SIZE - 5.6;
const DOOR_DEPTH = 4;

export interface CarPark {
  plot: number;
  chunks: Chunk[];
  bounds: Bounds;
  portals: Portal[];
  solids: Solid[];
  /** The bar over the town's ramp, solid to anything a car or a van isn't. */
  bars: Polygon[];
  /** Every bar drawn over the vehicles: the town's and the one at −1's way in. */
  headroom: Polygon[];
  /** The end of −1's aisle in front of the doorway: the vehicle's nose in here offers the Multi-storey spot. */
  door: Polygon;
  door_pose: Pose;
}

// Read off −1's own bay lines at the east end, so the doorway fills the aisle however wide the garage lays it out.
function aisle_of(layout: Layout): [number, number] {
  const lines = layout.marks.filter((mark) => Math.abs(mark.a.x - mark.b.x) < 1e-6 && mark.a.x > SIZE - EDGE - 8);
  const north = Math.max(...lines.filter((mark) => Math.min(mark.a.y, mark.b.y) <= EDGE + 1e-6).map((mark) => Math.max(mark.a.y, mark.b.y)));
  const south = Math.min(...lines.map((mark) => Math.min(mark.a.y, mark.b.y)).filter((y) => y > north));
  return [north, south];
}

/** Floors −1 to −3 east of the town, laid out once from a fixed seed, so it's the same garage on every visit. */
export function build_car_park(frame: Frame, plot: number, east: number): CarPark {
  const cx = Math.ceil((east + GAP) / CHUNK);
  const fit = fit_for(VAN);
  let layout: Layout | null = null;
  const build = (rng: Rng) => (layout = garage(DIFFICULTY, rng, fit, { floors: FLOORS, target: FLOORS - 1 }));
  const plan: Plan = (x, y) => (x === cx && y === 0 ? { kind: ChunkKind.LOT, entry: Side.SOUTH, build, below: Side.EAST } : null);
  const floors = chunks(SEED, cx, 0, plan);
  const [north, south] = aisle_of(layout!);
  const ox = cx * CHUNK;
  const into = frame.facing + Math.PI;
  const line = to_town(frame, 0, RAMP_LINE);
  const landing = { x: ox + SIZE / 2, y: ARRIVE };
  const down: Portal = {
    mouth: shape_at(frame, box(-RAMP_HALF, RAMP_LINE - MOUTH, RAMP_HALF, RAMP_LINE)),
    heading: into,
    from: { ...line, heading: into },
    to: { ...landing, heading: NORTH },
  };
  const up: Portal = {
    mouth: rect(landing.x - 3, ARRIVE, landing.x + 3, ARRIVE + MOUTH),
    heading: SOUTH,
    from: { ...landing, heading: SOUTH },
    to: { ...line, heading: frame.facing },
  };
  floors[0].portals.push(up);
  const bars = [shape_at(frame, box(-DOOR_HALF, RAMP_BAR[0], DOOR_HALF, RAMP_BAR[1]))];
  const wall = ox + SIZE - EDGE;
  return {
    plot,
    chunks: floors,
    bounds: bounds_of(floors.flatMap((each) => [
      { x: each.cx * CHUNK, y: each.cy * CHUNK },
      { x: (each.cx + 1) * CHUNK, y: (each.cy + 1) * CHUNK },
    ])),
    portals: [down, ...floors.flatMap((each) => each.portals)],
    solids: floors.flatMap((each) => each.solids),
    bars,
    headroom: [...bars, ...floors.flatMap((each) => each.headroom)],
    door: rect(wall - DOOR_DEPTH, north, wall, south),
    door_pose: { x: wall, y: (north + south) / 2, heading: WEST },
  };
}
