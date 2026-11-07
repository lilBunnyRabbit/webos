import { create_rng, shuffle, type Rng } from "$lib/core/utils/random";
import { lerp, rect, type Bounds, type Polygon, type Pose, type Vec } from "$kit/games/play2d/geometry";
import { SolidKind, type Solid } from "../../core/scene";
import { YARD_LINKS, type TrailerSpec, type Unhooked } from "../../core/vehicle";

const WALL = 0.4;
/** A slot from its back line to its mouth: a 13.6 m box with a metre to spare. */
export const DEPTH = 14.6;
const SIDE = 20;
const SLOTS = 7;
const POST = 0.25;
/** A box backed fully in stops this far short of the wall or the fence. */
const BACK_GAP = 0.3;
const LANE = 4.2;
const LANE_GAP = 0.6;
const STAGING = 31;
const OUTBOUND = 27;
const OUT_WEST = 6;
const NORTH = -Math.PI / 2;
const SOUTH = Math.PI / 2;
const WEST = Math.PI;
const EAST = 0;

export const TargetKind = { DOOR: "door", BAY: "bay", LANE: "lane", OUTBOUND: "outbound" } as const;
export type TargetKind = (typeof TargetKind)[keyof typeof TargetKind];

export interface Target {
  /** "Door 3", "Bay 5", "Lane B", "Out 2". */
  name: string;
  kind: TargetKind;
  /** A chain counts as dropped here when every link's box is inside this and straight. */
  shape: Polygon;
  /** The way a link left here faces, from its axle toward its hinge: out of the mouth for a slot backed into. */
  heading: number;
  /** Backed into tail first (a door, a bay); a lane or an outbound box is pulled into nose first. */
  back_in: boolean;
}

export const UnitKind = { SEMI: "semi", DOLLY: "dolly", DOUBLE: "double" } as const;
export type UnitKind = (typeof UnitKind)[keyof typeof UnitKind];

export const UNIT_LINKS: Record<UnitKind, readonly TrailerSpec[]> = {
  semi: [YARD_LINKS.semi],
  dolly: [YARD_LINKS.dolly, YARD_LINKS.rear],
  double: [YARD_LINKS.lead, YARD_LINKS.converter, YARD_LINKS.rear],
};

/** A chain standing in the yard: one to move, or one in the way. */
export interface Unit {
  kind: UnitKind;
  /** Its fleet number on the job card. */
  number: number;
  paint: number;
  stand: Unhooked;
}

export interface Task {
  /** Index into `units`. */
  unit: number;
  from: Target;
  to: Target;
}

export interface Yard {
  width: number;
  height: number;
  bounds: Bounds;
  floor: Polygon;
  /** The dock building's wall, the fence, the dock bumpers. */
  solids: Solid[];
  doors: [Vec, Vec][];
  targets: Target[];
  /** The aisle's centre line and the slot lines, painted. */
  lines: [Vec, Vec][];
  units: Unit[];
  tasks: Task[];
  start: Pose;
}

export interface Order {
  /** How many of each move, in the order the seed shuffles them into. */
  semis: number;
  dollies: number;
  doubles: number;
}

function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}

function between(rng: Rng, a: number, b: number): number {
  return a + (b - a) * rng();
}

function along(from: Vec, heading: number, distance: number): Vec {
  return { x: from.x + Math.cos(heading) * distance, y: from.y + Math.sin(heading) * distance };
}

/** A chain backed into a slot or pulled into a lane: straight, its hinge where its front box sits `gap` inside the mouth. */
function stand_in(kind: UnitKind, mouth: Vec, heading: number, gap: number, rng: Rng, jitter: number): Unhooked {
  const links = UNIT_LINKS[kind];
  const first = links[0];
  const skew = jitter > 0 ? between(rng, -1, 1) * jitter * 0.03 : 0;
  const side = jitter > 0 ? between(rng, -1, 1) * jitter : 0;
  const across = { x: -Math.sin(heading) * side, y: Math.cos(heading) * side };
  const front = along({ x: mouth.x + across.x, y: mouth.y + across.y }, heading, -gap);
  const hinge = along(front, heading, first.drawbar);
  const turned = heading + skew;
  return { hinge, links, trailers: links.map(() => ({ heading: turned, roll: [0, 0] })) };
}

/**
 * A seeded freight yard: the dock building's doors along the north wall and a row of trailer bays along the south
 * fence, both backed into, facing each other across the aisle; with a job that pulls through, staging lanes run on
 * east of the aisle and outbound boxes are painted along it. Every task's trailer stands in a slot of its own, every
 * target is free, and the rest of the slots are filled as the difficulty rises. The shunter starts at the aisle's west end.
 */
export function build_yard(seed: number, difficulty: number, order: Order): Yard {
  const rng = create_rng(seed);
  const d = Math.max(0, Math.min(1, difficulty));
  const width = lerp(4.4, 3.4, d);
  const aisle = lerp(32, 26, d);
  const pulls = order.dollies + order.doubles;
  const west = SIDE * 2 + SLOTS * width;
  const total_width = pulls > 0 ? west + 2 + STAGING : west;
  const door_mouth = WALL + DEPTH;
  const bay_mouth = door_mouth + aisle;
  const height = bay_mouth + DEPTH + WALL;
  const middle = door_mouth + aisle / 2;
  const solids: Solid[] = [];
  const wall = (shape: Polygon) => solids.push({ kind: SolidKind.WALL, shape });
  wall(rect(0, 0, total_width, WALL));
  wall(rect(0, height - WALL, total_width, height));
  wall(rect(0, WALL, WALL, height - WALL));
  wall(rect(total_width - WALL, WALL, total_width, height - WALL));
  const lines: [Vec, Vec][] = [];
  const doors: [Vec, Vec][] = [];
  const targets: Target[] = [];
  const slots: Target[] = [];
  for (let i = 0; i < SLOTS; i++) {
    const x = SIDE + i * width;
    doors.push([
      { x: x + 0.45, y: WALL },
      { x: x + width - 0.45, y: WALL },
    ]);
    for (const at of [x + 0.15, x + width - 0.15 - POST]) solids.push({ kind: SolidKind.POST, shape: rect(at, WALL, at + POST, WALL + 0.22) });
    slots.push({ name: `Door ${i + 1}`, kind: TargetKind.DOOR, shape: rect(x, WALL, x + width, door_mouth), heading: SOUTH, back_in: true });
    slots.push({ name: `Bay ${i + 1}`, kind: TargetKind.BAY, shape: rect(x, bay_mouth, x + width, height - WALL), heading: NORTH, back_in: true });
  }
  for (let i = 0; i <= SLOTS; i++) {
    const x = SIDE + i * width;
    lines.push([{ x, y: WALL }, { x, y: door_mouth }], [{ x, y: bay_mouth }, { x, y: height - WALL }]);
  }
  targets.push(...slots);

  const lanes: Target[] = [];
  const outs: Target[] = [];
  if (pulls > 0) {
    const x0 = west + 2;
    const offsets = [-(LANE + LANE_GAP), 0, LANE + LANE_GAP];
    offsets.forEach((offset, i) => {
      const y = middle + offset;
      lanes.push({ name: `Lane ${"ABC"[i]}`, kind: TargetKind.LANE, shape: rect(x0, y - LANE / 2, total_width - WALL - 0.3, y + LANE / 2), heading: WEST, back_in: false });
    });
    for (const [i, offset] of [-(LANE + LANE_GAP) / 2, (LANE + LANE_GAP) / 2].entries()) {
      const y = middle + offset;
      outs.push({ name: `Out ${i + 1}`, kind: TargetKind.OUTBOUND, shape: rect(OUT_WEST, y - LANE / 2, OUT_WEST + OUTBOUND, y + LANE / 2), heading: WEST, back_in: false });
    }
    targets.push(...lanes, ...outs);
    lines.push([{ x: x0, y: middle - aisle / 2 + 1 }, { x: x0, y: middle + aisle / 2 - 1 }]);
  }

  // Pull-throughs go last: a chain dropped in an outbound box stands in the aisle every alley dock needs.
  const kinds = [
    ...Array.from({ length: order.semis }, () => UnitKind.SEMI),
    ...shuffle([...Array.from({ length: order.dollies }, () => UnitKind.DOLLY), ...Array.from({ length: order.doubles }, () => UnitKind.DOUBLE)], rng),
  ];
  const free_slots = shuffle([...slots], rng);
  const free_lanes = shuffle([...lanes], rng);
  const units: Unit[] = [];
  const tasks: Task[] = [];
  const numbers = new Set<number>();
  const number = () => {
    let n = 100 + Math.floor(rng() * 900);
    while (numbers.has(n)) n = 100 + ((n - 99) % 900);
    numbers.add(n);
    return n;
  };
  const place = (kind: UnitKind, at: Target, jitter: number): Unit => {
    const mouth = mouth_of(at);
    const gap = at.back_in ? DEPTH - BACK_GAP - box_reach(UNIT_LINKS[kind]) : 0.5;
    return { kind, number: number(), paint: Math.floor(rng() * 1000), stand: stand_in(kind, mouth, at.heading, gap, rng, jitter) };
  };
  const used = new Set<Target>();
  for (const kind of kinds) {
    if (kind === UnitKind.SEMI) {
      const from = free_slots.find((slot) => !used.has(slot))!;
      used.add(from);
      // The other side of the aisle mostly, so a move crosses it; sometimes along the same side.
      const across = free_slots.filter((slot) => !used.has(slot) && (slot.kind !== from.kind || chance(rng, 0.25)));
      const to = across[0] ?? free_slots.find((slot) => !used.has(slot))!;
      used.add(to);
      tasks.push({ unit: units.length, from, to });
      units.push(place(kind, from, 0));
    } else {
      const from = free_lanes.find((lane) => !used.has(lane))!;
      used.add(from);
      const to = outs.find((out) => !used.has(out) && Math.abs(out.shape[0].y - from.shape[0].y) > 0.1) ?? outs.find((out) => !used.has(out))!;
      used.add(to);
      tasks.push({ unit: units.length, from, to });
      units.push(place(kind, from, 0));
    }
  }
  // Fill: trailers backed into the other slots as the difficulty rises, always beside a task's slots.
  const fill = lerp(0.35, 0.95, d);
  const beside = (slot: Target) =>
    [...used].some((other) => other.kind === slot.kind && other.back_in && Math.abs(other.shape[0].x - slot.shape[0].x) < width * 1.5);
  for (const slot of slots) {
    if (used.has(slot)) continue;
    if (!beside(slot) && !chance(rng, fill)) continue;
    units.push(place(UnitKind.SEMI, slot, 0.15));
  }
  return {
    width: total_width,
    height,
    bounds: { x0: 0, y0: 0, x1: total_width, y1: height },
    floor: rect(WALL, WALL, total_width - WALL, height - WALL),
    solids,
    doors,
    targets,
    lines,
    units,
    tasks,
    start: { x: 4.5, y: middle + between(rng, -2, 2), heading: EAST },
  };
}

/** The middle of the side a chain comes in by: the slot's mouth, or a lane's west end. */
export function mouth_of(target: Target): Vec {
  const xs = target.shape.map((p) => p.x);
  const ys = target.shape.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  if (target.heading === SOUTH) return { x: cx, y: Math.max(...ys) };
  if (target.heading === NORTH) return { x: cx, y: Math.min(...ys) };
  return { x: Math.min(...xs), y: cy };
}

/** From the front of the first box to the back of the last, straight. */
export function box_reach(links: readonly TrailerSpec[]): number {
  let ball = 0;
  let front = Infinity;
  let back = -Infinity;
  links.forEach((link, i) => {
    if (i > 0) ball += link.hitch;
    front = Math.min(front, ball + link.drawbar);
    back = Math.max(back, ball + link.drawbar + link.box_length);
    ball += link.axle;
  });
  return back - front;
}

export function unit_name(unit: Pick<Unit, "kind" | "number">): string {
  if (unit.kind === UnitKind.DOUBLE) return `Double ${unit.number}`;
  if (unit.kind === UnitKind.DOLLY) return `Trailer ${unit.number} on a dolly`;
  return `Trailer ${unit.number}`;
}

export { WEST, EAST, NORTH, SOUTH };
