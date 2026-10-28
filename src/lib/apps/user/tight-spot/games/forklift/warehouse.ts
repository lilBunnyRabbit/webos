import { create_rng, random_int, shuffle, type Rng } from "$lib/core/utils/random";
import { bounds_of, lerp, oriented_box, rect, type Bounds, type Polygon, type Pose, type Vec } from "../../core/geometry";
import { SolidKind, type Solid } from "../../core/scene";
import { hash } from "../../core/seed";

/** A 1200 × 1000 pallet: `length` runs the way the forks go in. */
export const PALLET = { length: 1.2, width: 1.0 } as const;

const WALL = 0.3;
const UPRIGHT = 0.1;
/** A rack bay from its front line to the back rail. */
const DEPTH = 1.25;
const RAIL = 0.06;
const FLUE = 0.2;
/** A rack slot reaches this far out of the rack: a pallet may stick out past the front beam, as real ones do. */
const OUT = 0.2;
/** How far a pallet stored in a rack sticks out past the front line, so the forklift's body stays clear of the uprights. */
const OVERHANG = 0.08;
const DOCK_SLACK = 0.3;
const DOCK_PITCH = 3;
const DOCK_BACK = 0.45;
const PILLAR = 0.5;
const NORTH = -Math.PI / 2;
const SOUTH = Math.PI / 2;

export const SlotKind = { RACK: "rack", DOCK: "dock" } as const;
export type SlotKind = (typeof SlotKind)[keyof typeof SlotKind];

export interface Slot {
  /** "B4" for a rack bay, "Dock C" for a dock spot. */
  name: string;
  kind: SlotKind;
  /** A pallet counts as put here when it is inside this and straight. */
  shape: Polygon;
  /** The way the forks point going in. */
  heading: number;
  /** Where a pallet stored here sits: its centre, heading the way the forks go in. */
  home: Pose;
}

/** One face of a rack row: its bays open onto the aisle on the `facing` side (1 south, −1 north). */
export interface Face {
  letter: string;
  front: number;
  back: number;
  facing: 1 | -1;
  x0: number;
  x1: number;
}

export interface Warehouse {
  width: number;
  height: number;
  bounds: Bounds;
  floor: Polygon;
  walls: Polygon[];
  /** Every solid but the job's pallets: walls, pillars, rack uprights and rails, stored stock. */
  solids: Solid[];
  faces: Face[];
  /** The ground under each rack row. */
  footprints: Polygon[];
  uprights: Polygon[];
  rails: Polygon[];
  pillars: Polygon[];
  slots: Slot[];
  /** The dock doors in the south wall, as their two ends. */
  doors: [Vec, Vec][];
  /** Safety lines along the aisles. */
  lines: [Vec, Vec][];
  charger: Polygon;
  start: Pose;
  /** The pallets already stored, as their centre poses. */
  stock: Pose[];
}

export interface Layout {
  aisle: number;
  /** Room each side of a pallet in a rack bay. */
  clear: number;
  bays: number;
  rows: number;
  main: number;
}

export function layout(seed: number, difficulty: number): Layout {
  const rng = create_rng(hash(seed, 0xa15e));
  const t = Math.max(0, Math.min(1, difficulty));
  return {
    aisle: lerp(4.6, 4.0, t) + rng() * 0.25,
    clear: lerp(0.2, 0.1, t),
    bays: random_int(6, 8, rng),
    rows: t < 0.3 && rng() < 0.75 ? 1 : 2,
    main: lerp(5.6, 4.8, t) + rng() * 0.3,
  };
}

export function pallet_shape(pose: Pose): Polygon {
  return oriented_box(pose.x, pose.y, pose.heading, PALLET.length, PALLET.width);
}

function rack_slots(face: Face, pitch: number, bays: number): Slot[] {
  const inward = -face.facing;
  const heading = inward < 0 ? NORTH : SOUTH;
  const at = (u: number) => face.front + inward * u;
  const slots: Slot[] = [];
  for (let k = 0; k < bays; k++) {
    const x0 = face.x0 + k * pitch + UPRIGHT;
    const x1 = face.x0 + (k + 1) * pitch;
    const a = at(-OUT);
    const b = at(DEPTH - 0.02);
    slots.push({
      name: `${face.letter}${k + 1}`,
      kind: SlotKind.RACK,
      shape: rect(x0, Math.min(a, b), x1, Math.max(a, b)),
      heading,
      home: { x: (x0 + x1) / 2, y: at(-OVERHANG + PALLET.length / 2), heading },
    });
  }
  return slots;
}

function rack_parts(face: Face, pitch: number, bays: number): { uprights: Polygon[]; rail: Polygon } {
  const inward = -face.facing;
  const at = (u: number) => face.front + inward * u;
  const span = (u0: number, u1: number): [number, number] => [Math.min(at(u0), at(u1)), Math.max(at(u0), at(u1))];
  const uprights: Polygon[] = [];
  for (let k = 0; k <= bays; k++) {
    const x = face.x0 + k * pitch;
    for (const [y0, y1] of [span(0, UPRIGHT), span(DEPTH - UPRIGHT, DEPTH)]) uprights.push(rect(x, y0, x + UPRIGHT, y1));
  }
  const [r0, r1] = span(DEPTH, DEPTH + RAIL);
  return { uprights, rail: rect(face.x0, r0, face.x1, r1) };
}

const LETTERS = "ABCDEFGH";

/**
 * A warehouse floor from a seed: a row of racks along the north wall, one or two back-to-back rows below it with
 * aisles between, cross aisles at both ends, a main aisle and the dock along the south wall with a door per spot, the
 * forklift's charging bay in the south-east corner. Tighter aisles and bays with difficulty.
 */
export function build_warehouse(seed: number, difficulty: number): Omit<Warehouse, "stock"> {
  const plan = layout(seed, difficulty);
  const pitch = PALLET.width + plan.clear * 2 + UPRIGHT;
  const cross = plan.aisle + 0.6;
  const x0 = cross;
  const x1 = x0 + plan.bays * pitch + UPRIGHT;
  const width = x1 + cross;

  const faces: Face[] = [];
  const footprints: Polygon[] = [];
  const add_face = (front: number, back: number, facing: 1 | -1) =>
    faces.push({ letter: LETTERS[faces.length], front, back, facing, x0, x1 });

  let y = RAIL + DEPTH;
  add_face(y, RAIL, 1);
  footprints.push(rect(x0, 0, x1, y));
  const centres: number[] = [];
  for (let row = 0; row < plan.rows; row++) {
    const north = y + plan.aisle;
    const north_back = north + DEPTH;
    const south_back = north_back + RAIL * 2 + FLUE;
    const south = south_back + DEPTH;
    add_face(north, north_back, -1);
    add_face(south, south_back, 1);
    footprints.push(rect(x0, north, x1, south));
    centres.push((north_back + south_back) / 2);
    y = south;
  }
  const dock_front = y + plan.main;
  const height = dock_front + PALLET.length + DOCK_SLACK * 2 + DOCK_BACK;

  const uprights: Polygon[] = [];
  const rails: Polygon[] = [];
  const slots: Slot[] = [];
  for (const face of faces) {
    const parts = rack_parts(face, pitch, plan.bays);
    uprights.push(...parts.uprights);
    rails.push(parts.rail);
    slots.push(...rack_slots(face, pitch, plan.bays));
  }

  const charger = rect(width - 3.1, height - 4.5, width - 0.5, height - 0.3);
  const dock_room = width - 4.6;
  const docks = Math.max(3, Math.min(6, Math.floor(dock_room / DOCK_PITCH)));
  const dock_x0 = 1 + (dock_room - 1 - docks * DOCK_PITCH) / 2;
  const doors: [Vec, Vec][] = [];
  for (let i = 0; i < docks; i++) {
    const cx = dock_x0 + (i + 0.5) * DOCK_PITCH;
    const back = height - DOCK_BACK;
    const front = back - PALLET.length - DOCK_SLACK * 2;
    const half = PALLET.width / 2 + DOCK_SLACK;
    slots.push({
      name: `Dock ${LETTERS[i]}`,
      kind: SlotKind.DOCK,
      shape: rect(cx - half, front, cx + half, back),
      heading: SOUTH,
      home: { x: cx, y: (front + back) / 2, heading: SOUTH },
    });
    doors.push([
      { x: cx - 1.3, y: height },
      { x: cx + 1.3, y: height },
    ]);
  }

  const pillars = centres.flatMap((cy) => [x0 - 0.75, x1 + 0.75].map((cx) => rect(cx - PILLAR / 2, cy - PILLAR / 2, cx + PILLAR / 2, cy + PILLAR / 2)));
  const walls = [
    rect(-WALL, -WALL, width + WALL, 0),
    rect(-WALL, height, width + WALL, height + WALL),
    rect(-WALL, 0, 0, height),
    rect(width, 0, width + WALL, height),
  ];
  const lines: [Vec, Vec][] = faces.map((face) => {
    const yl = face.front + face.facing * 0.25;
    return [
      { x: x0 - 0.2, y: yl },
      { x: x1 + 0.2, y: yl },
    ];
  });
  lines.push([
    { x: 0.6, y: dock_front - 1.7 },
    { x: width - 3.6, y: dock_front - 1.7 },
  ]);

  return {
    width,
    height,
    bounds: bounds_of(rect(-WALL, -WALL, width + WALL, height + WALL)),
    floor: rect(0, 0, width, height),
    walls,
    solids: [
      ...walls.map((shape) => ({ kind: SolidKind.WALL, shape })),
      ...pillars.map((shape) => ({ kind: SolidKind.PILLAR, shape })),
      ...uprights.map((shape) => ({ kind: SolidKind.RACK, shape })),
      ...rails.map((shape) => ({ kind: SolidKind.RACK, shape })),
    ],
    faces,
    footprints,
    uprights,
    rails,
    pillars,
    slots,
    doors,
    lines,
    charger,
    start: { x: width - 1.8, y: height - 2.55, heading: NORTH },
  };
}

export const TaskKind = { PICK: "pick", PUT_AWAY: "put-away", MOVE: "move" } as const;
export type TaskKind = (typeof TaskKind)[keyof typeof TaskKind];

/** One pallet to move, from where it sits to where it goes. */
export interface Task {
  kind: TaskKind;
  from: Slot;
  to: Slot;
}

export interface Floor extends Warehouse {
  tasks: Task[];
}

function pick_kind(rng: Rng, docks_left: number): TaskKind {
  const roll = rng();
  if (docks_left <= 0) return TaskKind.MOVE;
  return roll < 0.42 ? TaskKind.PICK : roll < 0.84 ? TaskKind.PUT_AWAY : TaskKind.MOVE;
}

/**
 * The warehouse with a job of `size` pallets: each from a slot to a free one, picked from the racks to the dock, put
 * away from the dock, or moved between racks. The racks' other bays hold stock, fuller with difficulty.
 */
export function build_floor(seed: number, difficulty: number, size: number): Floor {
  const house = build_warehouse(seed, difficulty);
  const rng = create_rng(hash(seed, 0x70b5, size));
  const racks = shuffle(house.slots.filter((slot) => slot.kind === SlotKind.RACK), rng);
  const docks = shuffle(house.slots.filter((slot) => slot.kind === SlotKind.DOCK), rng);
  const tasks: Task[] = [];
  for (let i = 0; i < size; i++) {
    const kind = pick_kind(rng, docks.length);
    if (kind === TaskKind.PICK) tasks.push({ kind, from: racks.pop()!, to: docks.pop()! });
    else if (kind === TaskKind.PUT_AWAY) tasks.push({ kind, from: docks.pop()!, to: racks.pop()! });
    else {
      const from = racks.pop()!;
      let at = racks.length - 1;
      while (at > 0 && racks[at].name[0] === from.name[0]) at--;
      const [to] = racks.splice(at, 1);
      tasks.push({ kind, from, to });
    }
  }
  const density = lerp(0.35, 0.7, Math.max(0, Math.min(1, difficulty)));
  const stock = racks.filter(() => rng() < density).map((slot) => slot.home);
  return {
    ...house,
    solids: [...house.solids, ...stock.map((pose) => ({ kind: SolidKind.PALLET, shape: pallet_shape(pose) }))],
    stock,
    tasks,
  };
}
