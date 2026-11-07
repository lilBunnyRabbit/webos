import { create_rng } from "$lib/core/utils/random";
import type { Vec } from "$kit/games/play2d/geometry";
import { hash } from "$kit/games/play2d/seed";
import { BodyId } from "./bodies";
import { CargoKind, type Scene, type Stop } from "./mission";
import { ShipId } from "./ships";
import { CALM, canyon, crater, hill, mesa, terrain, type Feature, type Terrain, type Weather } from "./world";

export interface Mission {
  n: number;
  name: string;
  brief: string;
  ship: ShipId;
  body: BodyId;
  build: () => Scene;
}

function stop(pad: number, route: Vec[] = [], load = 0, cargo: CargoKind | null = null): Stop {
  return { pad, load, cargo, route };
}

function scene(ship: ShipId, body: BodyId, t: Terrain, start: Scene["start"], stops: Stop[], weather: Weather = CALM): Scene {
  return { ship, body, terrain: t, weather, start, stops };
}

function at(start_x: number, agl: number, vx = 0, cargo = 0): Scene["start"] {
  return { x: start_x, agl, vx, cargo };
}

function rolling(x0: number, x1: number, seed: number, height: number): Feature[] {
  const out: Feature[] = [];
  for (let x = x0, i = 0; x < x1; x += 70, i++) out.push(hill(x, 60 + (hash(seed, i) % 90), height * (0.3 + (hash(seed, i, 1) % 70) / 100)));
  return out;
}

export const MISSIONS: readonly Mission[] = [
  {
    n: 1,
    name: "First touchdown",
    brief: "The pad is right below. Ease the lever under Hover to sink, back to Hover near the ground, and set it down.",
    ship: ShipId.LANDER,
    body: BodyId.MOON,
    build: () => scene(ShipId.LANDER, BodyId.MOON, terrain({ x0: -300, x1: 400, features: rolling(-280, 380, 1, 6), pads: [{ x: 50, width: 18 }] }), at(0, 70), [stop(0)]),
  },
  {
    n: 2,
    name: "Over the hills",
    brief: "A pad 800 m away, three hills between. Lean into the trip, then lean back to stop over the pad.",
    ship: ShipId.LANDER,
    body: BodyId.MOON,
    build: () =>
      scene(
        ShipId.LANDER,
        BodyId.MOON,
        terrain({ x0: -200, x1: 1000, features: [hill(250, 200, 60), hill(480, 160, 90), hill(650, 120, 40), ...rolling(-180, 980, 2, 5)], pads: [{ x: 820, width: 18 }] }),
        at(0, 160, 6),
        [stop(0)]
      ),
  },
  {
    n: 3,
    name: "Crater floor",
    brief: "The pad sits on the floor of a crater. Clear the rim, then come straight down inside it.",
    ship: ShipId.LANDER,
    body: BodyId.MOON,
    build: () => {
      const c = crater(600, 240, 70, 35);
      const t = terrain({ x0: -200, x1: 900, features: [c.rim, ...rolling(-180, 420, 3, 6)], cuts: [c.bowl], pads: [{ x: 600, width: 18 }] });
      return scene(ShipId.LANDER, BodyId.MOON, t, at(0, 140), [stop(0, [{ x: 600, y: 80 }])]);
    },
  },
  {
    n: 4,
    name: "Ridge top",
    brief: "A pad on a ridge 130 m up, with steep sides. Climb first, then settle on the top.",
    ship: ShipId.LANDER,
    body: BodyId.MOON,
    build: () => scene(ShipId.LANDER, BodyId.MOON, terrain({ x0: -200, x1: 900, features: [mesa(640, 672, 130, 40), ...rolling(-180, 560, 4, 8)], pads: [{ x: 656, width: 18 }] }), at(0, 120), [stop(0, [{ x: 420, y: 190 }])]),
  },
  {
    n: 5,
    name: "Supply run",
    brief: "Pick up a 1.2 t crate from the first pad and fly it to the base on the mesa. The loaded ship is slower to turn and needs more throttle to hover.",
    ship: ShipId.LANDER,
    body: BodyId.MOON,
    build: () =>
      scene(
        ShipId.LANDER,
        BodyId.MOON,
        terrain({ x0: -200, x1: 1150, features: [mesa(910, 990, 60, 50), hill(650, 140, 45), ...rolling(-180, 860, 5, 6)], pads: [{ x: 400, width: 18 }, { x: 950, width: 18 }] }),
        at(0, 90),
        [stop(0, [], 1200, CargoKind.CRATE), stop(1, [], -1200)]
      ),
  },
  {
    n: 6,
    name: "Twin pods",
    brief: "Two engines and no thrusters: A and D push one engine harder than the other, so the pods only turn under power.",
    ship: ShipId.PODS,
    body: BodyId.MOON,
    build: () => scene(ShipId.PODS, BodyId.MOON, terrain({ x0: -200, x1: 650, features: [hill(220, 120, 30), ...rolling(-180, 620, 6, 6)], pads: [{ x: 400, width: 18 }] }), at(0, 100), [stop(0)]),
  },
  {
    n: 7,
    name: "Canyon",
    brief: "Down a canyon 120 m deep. Stop over it, then sink between the walls.",
    ship: ShipId.PODS,
    body: BodyId.MOON,
    build: () => {
      const t = terrain({ x0: -200, x1: 900, features: rolling(-180, 900, 7, 6), cuts: [canyon(560, 610, 120, 25)], pads: [{ x: 585, width: 18 }] });
      return scene(ShipId.PODS, BodyId.MOON, t, at(0, 110), [stop(0, [{ x: 585, y: 40 }])]);
    },
  },
  {
    n: 8,
    name: "Red dust",
    brief: "Mars: twice the Moon's pull, thin air and gusts. The Hover notch sits higher on the lever here.",
    ship: ShipId.LANDER,
    body: BodyId.MARS,
    build: () =>
      scene(ShipId.LANDER, BodyId.MARS, terrain({ x0: -200, x1: 950, features: [hill(300, 180, 50), hill(520, 120, 35), ...rolling(-180, 930, 8, 8)], pads: [{ x: 720, width: 18 }] }), at(0, 140, 4), [stop(0)], {
        wind: 3,
        gust: 8,
        seed: 8,
      }),
  },
  {
    n: 9,
    name: "Crew hop",
    brief: "Pick up the crew from the first pad and hop them over the ridge to the second.",
    ship: ShipId.PODS,
    body: BodyId.MARS,
    build: () =>
      scene(
        ShipId.PODS,
        BodyId.MARS,
        terrain({ x0: -200, x1: 1000, features: [hill(520, 140, 100), ...rolling(-180, 980, 9, 6)], pads: [{ x: 300, width: 18 }, { x: 760, width: 18 }] }),
        at(0, 90),
        [stop(0, [], 250, CargoKind.CREW), stop(1, [], -250)],
        { wind: 2, gust: 4, seed: 9 }
      ),
  },
  {
    n: 10,
    name: "Lava tube",
    brief: "The pad is inside a lava tube. Come in low under the roof; rock is a crash.",
    ship: ShipId.LANDER,
    body: BodyId.MARS,
    build: () => {
      const roof = [
        { x: 500, y: 36 },
        { x: 860, y: 36 },
        { x: 860, y: 170 },
        { x: 560, y: 170 },
      ];
      const t = terrain({ x0: -200, x1: 1000, features: [mesa(790, 1000, 170, 20), ...rolling(-180, 420, 10, 5)], pads: [{ x: 700, width: 18 }], rocks: [roof] });
      return scene(ShipId.LANDER, BodyId.MARS, t, at(0, 120), [stop(0, [{ x: 380, y: 22 }, { x: 560, y: 19 }])], { wind: 1, gust: 2, seed: 10 });
    },
  },
  {
    n: 11,
    name: "Heavy lift",
    brief: "The shuttle: heavy, slow to spool and slow to turn. Lift a 4 t container from the first pad onto the mesa.",
    ship: ShipId.SHUTTLE,
    body: BodyId.MOON,
    build: () =>
      scene(
        ShipId.SHUTTLE,
        BodyId.MOON,
        terrain({ x0: -250, x1: 1150, features: [mesa(860, 960, 40, 60), ...rolling(-230, 800, 11, 6)], pads: [{ x: 350, width: 22 }, { x: 910, width: 22 }] }),
        at(0, 90),
        [stop(0, [], 4000, CargoKind.CRATE), stop(1, [], -4000)]
      ),
  },
  {
    n: 12,
    name: "Valles",
    brief: "The shuttle down a Martian canyon 160 m deep, gusts over the edge.",
    ship: ShipId.SHUTTLE,
    body: BodyId.MARS,
    build: () => {
      const t = terrain({ x0: -250, x1: 1000, features: rolling(-230, 1000, 12, 6), cuts: [canyon(630, 720, 160, 35)], pads: [{ x: 675, width: 22 }] });
      return scene(ShipId.SHUTTLE, BodyId.MARS, t, at(0, 120), [stop(0, [{ x: 675, y: 45 }])], { wind: 3, gust: 6, seed: 12 });
    },
  },
  {
    n: 13,
    name: "Home",
    brief: "Earth: six times the Moon's pull, thick air and a breeze. The legs and the tank work hard here.",
    ship: ShipId.LANDER,
    body: BodyId.EARTH,
    build: () => scene(ShipId.LANDER, BodyId.EARTH, terrain({ x0: -200, x1: 750, features: [hill(250, 160, 25), ...rolling(-180, 720, 13, 5)], pads: [{ x: 480, width: 18 }] }), at(0, 80, 3), [stop(0)], { wind: 3, gust: 2, seed: 13 }),
  },
  {
    n: 14,
    name: "Sea cliff",
    brief: "A pad on a cliff top into a strong headwind. Hold the lean against it as you come down.",
    ship: ShipId.PODS,
    body: BodyId.EARTH,
    build: () =>
      scene(ShipId.PODS, BodyId.EARTH, terrain({ x0: -200, x1: 800, features: [mesa(500, 600, 80, 15), ...rolling(-180, 420, 14, 4)], pads: [{ x: 540, width: 18 }] }), at(0, 60), [stop(0, [{ x: 380, y: 120 }])], {
        wind: -6,
        gust: 3,
        seed: 14,
      }),
  },
  {
    n: 15,
    name: "Deep cave",
    brief: "Into a cave that drops away under its roof, the pad at the bottom. Slow and low.",
    ship: ShipId.PODS,
    body: BodyId.MARS,
    build: () => {
      const roofs = [
        [
          { x: 450, y: 28 },
          { x: 760, y: 28 },
          { x: 760, y: 160 },
          { x: 500, y: 160 },
        ],
        [
          { x: 760, y: -25 },
          { x: 1000, y: -25 },
          { x: 1000, y: 160 },
          { x: 760, y: 160 },
        ],
      ];
      const t = terrain({ x0: -200, x1: 1060, features: [mesa(990, 1060, 160, 10), ...rolling(-180, 380, 15, 5)], cuts: [canyon(640, 1000, 60, 40)], pads: [{ x: 900, width: 18 }], rocks: roofs });
      return scene(ShipId.PODS, BodyId.MARS, t, at(0, 90), [stop(0, [{ x: 400, y: 14 }, { x: 560, y: 13 }, { x: 700, y: -30 }, { x: 820, y: -45 }])], { wind: 1, gust: 2, seed: 15 });
    },
  },
];

export function mission_of(n: number): Mission {
  return MISSIONS.find((mission) => mission.n === n)!;
}

export const PadKind = { PLAIN: "plain", CRATER: "crater", MESA: "mesa" } as const;
export type PadKind = (typeof PadKind)[keyof typeof PadKind];

/** A pad landing laid out from the seed: rolling ground, a few hills between, the pad on the plain, in a crater or on a mesa. */
export function random_scene(ship: ShipId, body: BodyId, seed: number, attempt: number): { scene: Scene; brief: string } {
  const rng = create_rng(hash(seed, attempt, 17));
  const between = (lo: number, hi: number) => lo + (hi - lo) * rng();
  const distance = Math.round(between(350, 900));
  const agl = Math.round(between(100, 220));
  const kind = rng() < 0.5 ? PadKind.PLAIN : rng() < 0.5 ? PadKind.CRATER : PadKind.MESA;
  const features: Feature[] = rolling(-180, distance + 280, seed + attempt, 6);
  const cuts: Feature[] = [];
  const hills = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < hills; i++) features.push(hill(between(120, distance - 140), between(80, 180), between(20, agl * 0.55)));
  const route: Vec[] = [];
  let pad_y: number | undefined;
  if (kind === PadKind.CRATER) {
    const c = crater(distance, between(200, 260), between(40, 70), between(20, 35));
    features.push(c.rim);
    cuts.push(c.bowl);
  } else if (kind === PadKind.MESA) {
    const top = Math.round(between(40, Math.min(110, agl * 0.7)));
    features.push(mesa(distance - 25, distance + 25, top, 40));
    pad_y = top;
  }
  const wide = ship === ShipId.SHUTTLE ? 22 : 18;
  const t = terrain({ x0: -200, x1: distance + 300, features, cuts, pads: [{ x: distance, width: wide, y: pad_y }] });
  if (kind !== PadKind.PLAIN) route.push({ x: distance, y: Math.max(...t.ground.filter(([x]) => Math.abs(x - distance) < 200).map(([, y]) => y)) + 45 });
  const weather: Weather =
    body === BodyId.MOON ? CALM : { wind: Math.round(between(-1, 1) * (body === BodyId.MARS ? 4 : 5)), gust: Math.round(between(0, body === BodyId.MARS ? 6 : 3)), seed: hash(seed, attempt) % 1000 };
  const s = scene(ship, body, t, at(0, agl), [stop(0, route)], weather);
  const where = kind === PadKind.CRATER ? "on a crater floor" : kind === PadKind.MESA ? "on a mesa" : "on the plain";
  return { scene: s, brief: `A pad ${distance} m away ${where}.` };
}
