import { create_rng } from "$lib/core/utils/random";
import { hash } from "$kit/games/play2d/seed";
import type { Bounds, Pose } from "$kit/games/play2d/geometry";
import { Drive, type BoatSpec } from "./boat";
import { alongside, box, SceneBuilder, type Berth, type Scene } from "./world";

/** Clearance each side of a box berth, past the beam: fenders and a hand's width. */
export const BOX_ROOM = 0.35;
const FINGER = 0.9;
const MAIN = 2.2;
const QUAY = 6;
const PAINTS = 5;

/** What a neighbour in the marina looks like: about the player's size, so a level reads the same for both boats. */
function neighbour(spec: BoatSpec, scale: number) {
  return { length: spec.length * scale, beam: spec.beam * scale, drive: spec.drive === Drive.OUTBOARD ? Drive.OUTBOARD : Drive.SHAFT };
}

interface Layout {
  water: Bounds;
  build: SceneBuilder;
  berth: Berth;
  start: Pose;
}

function finish({ water, build, berth, start }: Layout): Scene {
  const pad = QUAY;
  build.quay(water.x0 - pad, water.y0 - pad, water.x1 + pad, water.y0);
  build.quay(water.x0 - pad, water.y1, water.x1 + pad, water.y1 + pad);
  build.quay(water.x0 - pad, water.y0, water.x0, water.y1);
  build.quay(water.x1, water.y0, water.x1 + pad, water.y1);
  return { bounds: { x0: water.x0 - pad, y0: water.y0 - pad, x1: water.x1 + pad, y1: water.y1 + pad }, solids: build.solids, berth, start };
}

interface AlongsideOptions {
  /** Room along the pontoon between the neighbours, as lengths of the boat; 0 is no neighbours. */
  gap: number;
  /** Start: metres out from the pontoon and along from the berth, and the heading. */
  out: number;
  along: number;
  heading: number;
  /** Water south of the pontoon, in lengths. */
  depth: number;
  paint: number;
}

/** A long pontoon along the top of a basin, the berth on its south face. */
function alongside_level(spec: BoatSpec, o: AlongsideOptions): Scene {
  const L = spec.length;
  const width = Math.max(14 * L, 60);
  const depth = Math.max(o.depth * L, 30);
  const water = { x0: -width / 2, y0: -MAIN - 2, x1: width / 2, y1: depth };
  const build = new SceneBuilder();
  build.pontoon(-width * 0.42, -MAIN, width * 0.42, 0);
  const berth_length = L * 0.75;
  const berth = alongside({ x: -berth_length / 2, y: 0 }, { x: berth_length / 2, y: 0 }, { x: 0, y: 1 }, spec.beam);
  if (o.gap > 0) {
    const half = (o.gap * Math.max(L, 6)) / 2;
    const n = neighbour(spec, 1.05);
    const lie = n.beam / 2 + 0.1;
    build.moored({ x: -half - n.length / 2, y: lie, heading: 0 }, n, o.paint % PAINTS);
    build.moored({ x: half + n.length / 2, y: lie, heading: Math.PI }, n, (o.paint + 1) % PAINTS);
    build.moored({ x: -half - n.length * 1.6, y: lie, heading: Math.PI }, neighbour(spec, 0.85), (o.paint + 2) % PAINTS);
  }
  return finish({ water, build, berth, start: { x: o.along * L, y: o.out * L, heading: o.heading } });
}

interface BoxOptions {
  /** Fairway width in lengths, between the slots' mouths and whatever is across. */
  fairway: number;
  /** Slots each side of the berth with a boat in. */
  neighbours: number;
  /** Boats moored alongside across the fairway. */
  across: boolean;
  /** Start along the fairway (lengths, west of the berth) and heading; 0 along with `straight` starts below the slot. */
  along: number;
  heading: number;
  straight: boolean;
  paint: number;
}

/** A row of box berths off a main pontoon at the top, opening south onto a fairway. */
function box_level(spec: BoatSpec, o: BoxOptions): Scene {
  const L = spec.length;
  const slot = spec.beam + BOX_ROOM * 2;
  const depth = L + 0.5;
  const pitch = slot + FINGER;
  const build = new SceneBuilder();
  const count = 6;
  const fairway = o.fairway * Math.max(L, 6.5);
  const width = Math.max(14 * L, 60);
  const water = { x0: -width / 2, y0: -MAIN - 2, x1: width / 2, y1: depth + fairway + (o.straight ? Math.max(6 * L, 25) : 3) };
  build.pontoon(-width * 0.45, -MAIN, width * 0.45, 0);
  for (let i = -count; i <= count + 1; i++) {
    const x = -slot / 2 - FINGER + i * pitch;
    build.pontoon(x, 0, x + FINGER, depth * 0.85);
  }
  const berth = box({ x: 0, y: 0 }, -Math.PI / 2, depth, slot);
  const n = neighbour(spec, 0.95);
  for (let i = 1; i <= o.neighbours; i++) {
    for (const side of [-1, 1]) {
      const x = side * i * pitch;
      const y = n.length / 2 + 0.3 + ((i + side) % 2) * 0.25;
      build.moored({ x, y, heading: -Math.PI / 2 }, n, (o.paint + i + (side > 0 ? 2 : 0)) % PAINTS);
    }
  }
  if (o.across) {
    const y = depth + fairway;
    build.pontoon(-width * 0.45, y, width * 0.45, y + MAIN);
    const m = neighbour(spec, 1);
    for (let i = -3; i <= 3; i++) {
      if (i === 0 && o.straight) continue;
      build.moored({ x: i * m.length * 1.3, y: y - m.beam / 2 - 0.1, heading: i % 2 ? 0 : Math.PI }, m, (o.paint + i + 7) % PAINTS);
    }
    if (o.straight) water.y1 = y;
  }
  const start = o.straight
    ? { x: o.along * L, y: depth + Math.max(3.5 * L, 18), heading: o.heading }
    : { x: -o.along * L, y: depth + fairway / 2, heading: o.heading };
  if (o.straight && o.across) start.y = depth + fairway * 0.8;
  return finish({ water, build, berth, start });
}

export interface Level {
  id: number;
  name: string;
  /** One line for the start card. */
  brief: string;
  build: (spec: BoatSpec) => Scene;
}

export const LEVELS: readonly Level[] = [
  {
    id: 1,
    name: "Visitors' pontoon",
    brief: "A long, empty pontoon. Glide in alongside, stop, and let the crew step off.",
    build: (spec) => alongside_level(spec, { gap: 0, out: 3.5, along: -4, heading: -0.25, depth: 7, paint: 0 }),
  },
  {
    id: 2,
    name: "Box berth",
    brief: "Straight up the middle of an empty row. Carry is everything: stop before the pontoon.",
    build: (spec) => box_level(spec, { fairway: 2.5, neighbours: 0, across: false, along: 0, heading: -Math.PI / 2, straight: true, paint: 1 }),
  },
  {
    id: 3,
    name: "Come about",
    brief: "You start heading out. Turn round in the basin and come back alongside.",
    build: (spec) => alongside_level(spec, { gap: 0, out: 3, along: 1.5, heading: Math.PI / 2, depth: 7.5, paint: 2 }),
  },
  {
    id: 4,
    name: "Between neighbours",
    brief: "Two boats on the pontoon with room for you between. Don't touch their paint.",
    build: (spec) => alongside_level(spec, { gap: 1.9, out: 3.5, along: -4, heading: -0.2, depth: 7, paint: 3 }),
  },
  {
    id: 5,
    name: "Off the fairway",
    brief: "Come down the fairway and turn into your box between two moored boats.",
    build: (spec) => box_level(spec, { fairway: 3.6, neighbours: 2, across: false, along: 4, heading: 0, straight: false, paint: 4 }),
  },
  {
    id: 6,
    name: "Short gap",
    brief: "A tight gap on a busy pontoon. Come in at an angle and let the stern follow.",
    build: (spec) => alongside_level(spec, { gap: 1.5, out: 3.5, along: -3.5, heading: -0.15, depth: 7, paint: 1 }),
  },
  {
    id: 7,
    name: "Narrow fairway",
    brief: "Boats on both sides of the fairway. Slow, and turn in late.",
    build: (spec) => box_level(spec, { fairway: 2.9, neighbours: 3, across: true, along: 4, heading: 0, straight: false, paint: 2 }),
  },
  {
    id: 8,
    name: "Last space",
    brief: "The far end of a full marina, against the flow of the fairway. Turn in from the other side.",
    build: (spec) => box_level(spec, { fairway: 3.1, neighbours: 4, across: true, along: -4, heading: Math.PI, straight: false, paint: 0 }),
  },
];

/** A generated layout from a seed: an alongside gap or a box off a fairway, its tightness and start picked by the seed. */
export function random_scene(spec: BoatSpec, seed: number, attempt = 0): Scene {
  const random = create_rng(hash(seed, attempt));
  const pick = (lo: number, hi: number) => lo + random() * (hi - lo);
  const paint = Math.floor(random() * PAINTS);
  if (random() < 0.5) {
    const from_east = random() < 0.5;
    return alongside_level(spec, {
      gap: random() < 0.25 ? 0 : pick(1.5, 2.2),
      out: pick(3, 4.5),
      along: (from_east ? 1 : -1) * pick(3.5, 5),
      heading: from_east ? Math.PI + pick(-0.3, 0.3) : pick(-0.3, 0.3),
      depth: 7,
      paint,
    });
  }
  const straight = random() < 0.3;
  const from_east = random() < 0.5;
  return box_level(spec, {
    fairway: pick(2.9, 4),
    neighbours: Math.floor(pick(0, 4.99)),
    across: !straight && random() < 0.6,
    along: straight ? 0 : (from_east ? -1 : 1) * pick(3.5, 5),
    heading: straight ? -Math.PI / 2 : from_east ? Math.PI : 0,
    straight,
    paint,
  });
}
