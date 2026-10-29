import { bounds_of, rect, type Polygon, type Pose, type Vec } from "../../../core/geometry";
import { ChunkKind, type World } from "../../../core/lot";
import { SolidKind, type Bay, type Solid } from "../../../core/scene";
import { pose_from_centre, Vehicle, VEHICLES, type VehicleSpec } from "../../../core/vehicle";

export const GroundKind = {
  PAD: "pad",
  PLANK: "plank",
  BRIDGE: "bridge",
  QUAY: "quay",
  RAMP: "ramp",
  DECK: "deck",
  ROAD: "road",
} as const;
export type GroundKind = (typeof GroundKind)[keyof typeof GroundKind];

export const HazardKind = { PIT: "pit", WATER: "water", DROP: "drop" } as const;
export type HazardKind = (typeof HazardKind)[keyof typeof HazardKind];

export interface Piece {
  kind: GroundKind;
  shape: Polygon;
}

export interface Hazard {
  kind: HazardKind;
  shape: Polygon;
}

export interface Lorry {
  frame: Polygon;
  cab: Polygon;
}

export interface Layout {
  start: Pose;
  pieces: Piece[];
  hazards: Hazard[];
  solids: Solid[];
  bay: Bay;
  lorry?: Lorry;
}

export interface Course {
  id: string;
  name: string;
  brief: string;
  vehicle: Vehicle;
  par: number;
  /** What a wall is on this course, for the crash card. */
  walls?: string;
  build: (spec: VehicleSpec) => Layout;
}

const NORTH = -Math.PI / 2;
const SOUTH = Math.PI / 2;
const WALL = 0.3;

function strip(a: Vec, b: Vec, width: number): Polygon {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / length;
  const uy = (b.y - a.y) / length;
  const nx = -uy * (width / 2);
  const ny = ux * (width / 2);
  return [
    { x: a.x + nx, y: a.y + ny },
    { x: b.x + nx, y: b.y + ny },
    { x: b.x - nx, y: b.y - ny },
    { x: a.x - nx, y: a.y - ny },
  ];
}

function disc(centre: Vec, radius: number, sides = 12): Polygon {
  return Array.from({ length: sides }, (_, i) => {
    const angle = (i / sides) * Math.PI * 2;
    return { x: centre.x + Math.cos(angle) * radius, y: centre.y + Math.sin(angle) * radius };
  });
}

function planks(a: Vec, b: Vec, spec: VehicleSpec, width: number, kind: GroundKind = GroundKind.PLANK): Piece[] {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const nx = (-(b.y - a.y) / length) * (spec.track / 2);
  const ny = ((b.x - a.x) / length) * (spec.track / 2);
  return [-1, 1].map((side) => ({
    kind,
    shape: strip({ x: a.x + nx * side, y: a.y + ny * side }, { x: b.x + nx * side, y: b.y + ny * side }, width),
  }));
}

function walls_round(x0: number, y0: number, x1: number, y1: number): Solid[] {
  return [
    rect(x0 - WALL, y0 - WALL, x1 + WALL, y0),
    rect(x0 - WALL, y1, x1 + WALL, y1 + WALL),
    rect(x0 - WALL, y0, x0, y1),
    rect(x1, y0, x1 + WALL, y1),
  ].map((shape) => ({ kind: SolidKind.WALL, shape }));
}

/** A bay facing `heading` centred on `centre`, sized to the vehicle with a little to spare. */
function bay_at(centre: Vec, heading: number, spec: VehicleSpec, spare = { along: 1.2, across: 0.7 }): Bay {
  const length = spec.length + spare.along;
  const width = spec.width + spare.across;
  const ux = Math.cos(heading);
  const uy = Math.sin(heading);
  const a = { x: centre.x - ux * (length / 2), y: centre.y - uy * (length / 2) };
  const b = { x: centre.x + ux * (length / 2), y: centre.y + uy * (length / 2) };
  return { shape: strip(a, b, width), heading, either: false };
}

function start_at(x: number, y: number, heading: number, spec: VehicleSpec): Pose {
  return pose_from_centre({ x, y, heading }, spec);
}

interface Crossing {
  /** The middle of the way across, from the start pad's edge (y 0) north to the far pad's edge. */
  points: Vec[];
  kind: GroundKind;
  width: number;
  hazard: HazardKind;
  /** Square platforms on these points, this wide. */
  platforms?: { at: number; size: number }[];
  /** Segments left open: a platform carries the car across them. */
  bare?: number[];
  start_x?: number;
}

const PAD = 10;

// Start pad south, far pad north, a pit or water between: what crosses it is the only ground.
function crossing(spec: VehicleSpec, plan: Crossing): Layout {
  const { points } = plan;
  const last = points[points.length - 1];
  const xs = points.map((p) => p.x);
  const x0 = Math.min(...xs) - 4.5;
  const x1 = Math.max(...xs) + 4.5;
  const near = points[0].y;
  const far = last.y;
  const pieces: Piece[] = [
    { kind: GroundKind.PAD, shape: rect(x0, near, x1, near + PAD) },
    { kind: GroundKind.PAD, shape: rect(x0, far - PAD, x1, far) },
  ];
  const ends = (i: number) => {
    const a = points[i];
    const b = points[i + 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const reach = i === 0 || i === points.length - 2 ? 1 : 0;
    const ux = (b.x - a.x) / length;
    const uy = (b.y - a.y) / length;
    return {
      a: i === 0 ? { x: a.x - ux * reach, y: a.y - uy * reach } : a,
      b: i === points.length - 2 ? { x: b.x + ux * reach, y: b.y + uy * reach } : b,
    };
  };
  for (let i = 0; i < points.length - 1; i++) {
    if (plan.bare?.includes(i)) continue;
    const { a, b } = ends(i);
    if (plan.kind === GroundKind.PLANK) pieces.push(...planks(a, b, spec, plan.width));
    else pieces.push({ kind: plan.kind, shape: strip(a, b, plan.width) });
  }
  if (plan.kind !== GroundKind.PLANK) {
    for (let i = 1; i < points.length - 1; i++) pieces.push({ kind: plan.kind, shape: disc(points[i], plan.width / 2) });
  }
  for (const platform of plan.platforms ?? []) {
    const p = points[platform.at];
    const half = platform.size / 2;
    pieces.push({ kind: GroundKind.PAD, shape: rect(p.x - half, p.y - half, p.x + half, p.y + half) });
  }
  const length = spec.length + 1.2;
  return {
    start: start_at(points[0].x + (plan.start_x ?? 0), near + PAD - spec.length / 2 - 2, NORTH, spec),
    pieces,
    hazards: [{ kind: plan.hazard, shape: rect(x0, far, x1, near) }],
    solids: walls_round(x0, far - PAD, x1, near + PAD),
    bay: bay_at({ x: last.x, y: far - PAD + length / 2 + 0.4 }, NORTH, spec),
  };
}

function transporter(spec: VehicleSpec): Layout {
  const t = spec.track / 2;
  const ramp = 4;
  const deck = 13;
  const half = Math.max(1.3, t + 0.55);
  const pieces: Piece[] = [
    { kind: GroundKind.PAD, shape: rect(-5, 0, 5, 12) },
    ...planks({ x: 0, y: 0.6 }, { x: 0, y: -ramp }, spec, 0.55, GroundKind.RAMP),
    ...planks({ x: 0, y: -ramp + 0.2 }, { x: 0, y: -ramp - deck }, spec, 0.6, GroundKind.DECK),
  ];
  const cab = rect(-half - 0.1, -ramp - deck - 2.6, half + 0.1, -ramp - deck);
  const barrier = (x0: number, x1: number): Solid => ({ kind: SolidKind.KERB, shape: rect(x0, -0.3, x1, 0) });
  return {
    start: start_at(0, 8, NORTH, spec),
    pieces,
    hazards: [{ kind: HazardKind.DROP, shape: rect(-5, -ramp - deck - 3, 5, 0) }],
    solids: [
      ...walls_round(-5, -ramp - deck - 3, 5, 12),
      barrier(-5, -t - 0.55),
      barrier(t + 0.55, 5),
      { kind: SolidKind.WALL, shape: cab },
    ],
    bay: bay_at({ x: 0, y: -ramp - deck + (spec.length + 1.2) / 2 + 0.1 }, NORTH, spec, { along: 1.2, across: 0.5 }),
    lorry: { frame: rect(-half, -ramp - deck, half, -ramp + 0.2), cab },
  };
}

function quay(spec: VehicleSpec): Layout {
  const width = spec.width + 1.6;
  const head = spec.length + 2.4;
  const reach = 20;
  const across = width + 4.6;
  const pieces: Piece[] = [
    { kind: GroundKind.PAD, shape: rect(-2, 0, across, 9) },
    { kind: GroundKind.QUAY, shape: rect(0, -reach, width, 0.5) },
    { kind: GroundKind.QUAY, shape: rect(0, -reach - head, across, -reach + 0.5) },
  ];
  return {
    start: start_at(width / 2, 5.5, NORTH, spec),
    pieces,
    hazards: [{ kind: HazardKind.WATER, shape: rect(-9, -reach - head - 7, across + 0.3, 9) }],
    solids: [
      { kind: SolidKind.WALL, shape: rect(width, -reach + 0.5, across + 0.3, 0) },
      { kind: SolidKind.WALL, shape: rect(across, -reach - head - WALL, across + WALL, -reach + 0.5) },
      { kind: SolidKind.WALL, shape: rect(-2 - WALL, 9, across + WALL, 9 + WALL) },
      { kind: SolidKind.WALL, shape: rect(-2 - WALL, 0, -2, 9) },
      { kind: SolidKind.WALL, shape: rect(across, 0, across + WALL, 9) },
      { kind: SolidKind.WALL, shape: rect(-2, 0, 0, 0.3) },
    ],
    bay: bay_at({ x: across - (spec.length + 1.2) / 2 - 0.2, y: -reach - head + (spec.width + 0.7) / 2 + 0.3 }, 0, spec),
  };
}

interface Switchbacks {
  road: number;
  /** How far a landing reaches past the rock between two legs. */
  landing: number;
  rock: number;
  legs: number;
  length: number;
}

// Legs up and down the hill joined by landings at the ends, rock between the legs, a drop everywhere else.
function switchbacks(spec: VehicleSpec, plan: Switchbacks): Layout {
  const { road, landing, rock, legs, length } = plan;
  const pitch = road + rock;
  const pieces: Piece[] = [];
  const solids: Solid[] = [];
  const top = -length;
  const bottom = 0;
  for (let i = 0; i < legs; i++) {
    const x = i * pitch;
    pieces.push({ kind: GroundKind.ROAD, shape: rect(x, top, x + road, i === 0 ? bottom + 9 : bottom) });
    if (i < legs - 1) {
      const up = i % 2 === 0;
      pieces.push({ kind: GroundKind.ROAD, shape: up ? rect(x, top - landing, x + pitch + road, top + 0.5) : rect(x, bottom - 0.5, x + pitch + road, bottom + landing) });
      solids.push({ kind: SolidKind.WALL, shape: up ? rect(x + road, top, x + pitch, bottom + 9) : rect(x + road, top, x + pitch, bottom) });
    }
  }
  const x_end = (legs - 1) * pitch;
  const going_up = (legs - 1) % 2 === 0;
  const heading = going_up ? NORTH : SOUTH;
  const bay_y = going_up ? top + (spec.length + 1.2) / 2 + 0.3 : bottom - (spec.length + 1.2) / 2 - 0.3;
  const all = bounds_of(pieces.flatMap((piece) => piece.shape));
  return {
    start: start_at(road / 2, bottom + 4, NORTH, spec),
    pieces,
    hazards: [{ kind: HazardKind.DROP, shape: rect(all.x0 - 6, all.y0 - 6, all.x1 + 6, all.y1 + 6) }],
    solids,
    bay: bay_at({ x: x_end + road / 2, y: bay_y }, heading, spec),
  };
}

const ROCK = "the rock face";

/** Easiest first; ids are what progress is saved under, so a course keeps its stars when the ladder changes. */
export const COURSES: readonly Course[] = [
  {
    id: "planks",
    name: "Planks",
    brief: "Two planks over a pit. Every wheel stays on them.",
    vehicle: Vehicle.HATCH,
    par: 0,
    build: (spec) => crossing(spec, { points: [{ x: 0, y: 0 }, { x: 0, y: -10 }], kind: GroundKind.PLANK, width: 0.6, hazard: HazardKind.PIT }),
  },
  {
    id: "bridge",
    name: "Narrow bridge",
    brief: "A bridge with no railing and a bend in it.",
    vehicle: Vehicle.HATCH,
    par: 0,
    build: (spec) =>
      crossing(spec, {
        points: [{ x: 0, y: 0 }, { x: 0, y: -6 }, { x: 3.5, y: -12 }, { x: 3.5, y: -18 }],
        kind: GroundKind.BRIDGE,
        width: spec.width + 0.6,
        hazard: HazardKind.WATER,
      }),
  },
  {
    id: "long-planks",
    name: "Long planks",
    brief: "Narrower planks, further across. Line up before you go.",
    vehicle: Vehicle.HATCH,
    par: 0,
    build: (spec) =>
      crossing(spec, { points: [{ x: 0, y: 0 }, { x: 0, y: -14 }], kind: GroundKind.PLANK, width: 0.4, hazard: HazardKind.PIT, start_x: 1.4 }),
  },
  {
    id: "transporter",
    name: "Car transporter",
    brief: "Up the ramps onto the lorry's deck, wheels on the tracks, and stop short of the cab.",
    vehicle: Vehicle.HATCH,
    par: 0,
    walls: "the lorry",
    build: transporter,
  },
  {
    id: "dogleg",
    name: "Dogleg",
    brief: "The planks turn on a platform halfway. Turn on it, then out onto the next pair.",
    vehicle: Vehicle.HATCH,
    par: 2,
    build: (spec) =>
      crossing(spec, {
        points: [{ x: 0, y: 0 }, { x: 0, y: -8 }, { x: 5.5, y: -13.5 }],
        kind: GroundKind.PLANK,
        width: 0.5,
        hazard: HazardKind.PIT,
        platforms: [{ at: 1, size: 4.6 }],
      }),
  },
  {
    id: "quay",
    name: "Quay edge",
    brief: "Along the quay to the end, then turn and park along the water.",
    vehicle: Vehicle.VAN,
    par: 3,
    walls: "the warehouse",
    build: quay,
  },
  {
    id: "switchbacks",
    name: "Switchbacks",
    brief: "Up the mountain road: hairpins too tight to take in one, a drop on the outside.",
    vehicle: Vehicle.HATCH,
    par: 2,
    walls: ROCK,
    build: (spec) => switchbacks(spec, { road: 4.4, landing: 5.8, rock: 4.4, legs: 3, length: 16 }),
  },
  {
    id: "offset",
    name: "Offset planks",
    brief: "Two pairs of planks that don't line up, a small platform between them.",
    vehicle: Vehicle.HATCH,
    par: 4,
    build: (spec) =>
      crossing(spec, {
        points: [{ x: 0, y: 0 }, { x: 0, y: -6 }, { x: 1.3, y: -6 }, { x: 1.3, y: -12 }],
        kind: GroundKind.PLANK,
        width: 0.5,
        hazard: HazardKind.PIT,
        platforms: [{ at: 1, size: 4.2 }],
        bare: [1],
      }),
  },
  {
    id: "hairpins",
    name: "Hairpins",
    brief: "The same mountain in a pickup, on a narrower road.",
    vehicle: Vehicle.PICKUP,
    par: 4,
    walls: ROCK,
    build: (spec) => switchbacks(spec, { road: 4.4, landing: 7.2, rock: 4, legs: 3, length: 16 }),
  },
];

export function course_by_id(id: string): Course {
  return COURSES.find((course) => course.id === id) ?? COURSES[0];
}

export function course_index(id: string): number {
  return Math.max(0, COURSES.findIndex((course) => course.id === id));
}

export function courses_open(stars: Readonly<Record<string, number>>): number {
  let open = 1;
  COURSES.forEach((course, i) => {
    if (stars[course.id]) open = Math.max(open, i + 2);
  });
  return Math.min(COURSES.length, open);
}

const layouts = new Map<string, Layout>();

export function layout_of(course: Course): Layout {
  let found = layouts.get(course.id);
  if (!found) {
    found = course.build(VEHICLES[course.vehicle]);
    layouts.set(course.id, found);
  }
  return found;
}

const MARGIN = 3;

/** One chunk at the origin holds it all, so nothing routes through portals and the bay pointer aims straight at the bay. */
export function course_world(course: Course): World {
  const layout = layout_of(course);
  const shapes = [...layout.pieces.map((piece) => piece.shape), ...layout.hazards.map((hazard) => hazard.shape), ...layout.solids.map((solid) => solid.shape)];
  const box = bounds_of(shapes.flat());
  return {
    chunks: [
      {
        cx: 0,
        cy: 0,
        kind: ChunkKind.LOT,
        exits: { n: false, e: false, s: false, w: false },
        surfaces: [],
        solids: layout.solids,
        marks: [],
        bays: [layout.bay],
        portals: [],
        headroom: [],
      },
    ],
    bounds: { x0: box.x0 - MARGIN, y0: box.y0 - MARGIN, x1: box.x1 + MARGIN, y1: box.y1 + MARGIN },
    start: layout.start,
    solids: layout.solids,
    bays: [layout.bay],
    portals: [],
    headroom: [],
    ground: layout.pieces.map((piece) => piece.shape),
  };
}

const EDGE_NAMES: Record<GroundKind, string> = {
  pad: "Over the edge",
  plank: "Off the plank",
  bridge: "Off the bridge",
  quay: "Off the quay",
  ramp: "Off the ramp",
  deck: "Off the deck",
  road: "Over the edge",
};

export function edge_title(course: Course, piece: number): string {
  const kind = layout_of(course).pieces[piece]?.kind ?? GroundKind.PAD;
  return EDGE_NAMES[kind];
}
