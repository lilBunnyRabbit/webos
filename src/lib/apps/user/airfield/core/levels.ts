import { create_rng } from "$lib/core/utils/random";
import { hash } from "$kit/games/play2d/seed";
import { ObstacleKind, SurfaceKind, type Course, type Obstacle, type Strip, type Surface } from "./course";
import { PlaneId } from "./planes";
import { Goal, type Scene, type Start } from "./round";
import { CALM_WEATHER, type Thermal, type Weather } from "./weather";

/** Ground features, the highest of them at each point, sampled every few metres over the wrap. */
type Feature = (x: number) => number;

const SAMPLE = 5;

function smooth(t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}

/** A rounded hill `height` tall, `width` across its foot. */
export function hill(x: number, width: number, height: number): Feature {
  return (at) => {
    const t = Math.abs(at - x) / (width / 2);
    return t >= 1 ? 0 : (height * (1 + Math.cos(Math.PI * t))) / 2;
  };
}

/** Flat at `height` from `x0` to `x1`, falling away over `shoulder` metres either side. */
export function mesa(x0: number, x1: number, height: number, shoulder: number): Feature {
  return (at) => height * (at < x0 ? smooth(1 - (x0 - at) / shoulder) : at > x1 ? smooth(1 - (at - x1) / shoulder) : 1);
}

/** A straight slope from `h0` at `x0` to `h1` at `x1`, flat beyond both ends out to `shoulder`, then down to the plain. */
export function ramp(x0: number, x1: number, h0: number, h1: number, shoulder: number): Feature {
  return (at) => {
    if (at >= x0 && at <= x1) return h0 + ((h1 - h0) * (at - x0)) / (x1 - x0);
    if (at < x0) return h0 * smooth(1 - (x0 - at) / shoulder);
    return h1 * smooth(1 - (at - x1) / shoulder);
  };
}

interface CourseParts {
  wrap: number;
  features?: Feature[];
  surfaces?: Surface[];
  obstacles?: Obstacle[];
  strips: Strip[];
  weather?: Partial<Weather>;
}

export function course(parts: CourseParts): Course {
  const features = parts.features ?? [];
  const ground: [number, number][] = [];
  for (let x = 0; x <= parts.wrap; x += SAMPLE) {
    const h = Math.max(0, ...features.map((f) => f(x)));
    ground.push([x, Math.round(h * 100) / 100]);
  }
  ground[ground.length - 1] = [parts.wrap, ground[0][1]];
  const strip_surfaces = parts.strips.map((s): Surface => ({ x0: s.x0, x1: s.x1, kind: s.kind }));
  return {
    wrap: parts.wrap,
    ground,
    surfaces: [...strip_surfaces, ...(parts.surfaces ?? [])],
    obstacles: parts.obstacles ?? [],
    strips: parts.strips,
    weather: { ...CALM_WEATHER, ...parts.weather },
  };
}

function strip(x0: number, length: number, kind: SurfaceKind = SurfaceKind.ASPHALT): Strip {
  return { x0, x1: x0 + length, kind };
}

function trees(x0: number, x1: number, top: number): Obstacle {
  return { x0, x1, top, kind: ObstacleKind.TREES };
}

function air(x: number, agl: number, speed: number, flap_notch: number, lever_notch: number): Start {
  return { x, agl, speed, flap_notch, lever_notch };
}

function rest(x: number, lever_notch = 0): Start {
  return { x, agl: 0, speed: 0, flap_notch: 0, lever_notch };
}

export interface Level {
  plane: PlaneId;
  /** 1 to 5 within the plane's track. */
  n: number;
  name: string;
  brief: string;
  build: () => Scene;
}

const land = (course: Course, start: Start, target: Strip, slope: number, power = 1): Scene => ({ course, start, goal: Goal.LAND, strip: target, clear: null, slope, power });

const T = PlaneId.TRAINER;
const B = PlaneId.STOL;
const A = PlaneId.AIRLINER;
const GL = PlaneId.GLIDER;

export const LEVELS: readonly Level[] = [
  {
    plane: T,
    n: 1,
    name: "First solo",
    brief: "A long runway straight ahead and no wind. Full flaps, throttle back, and ease the nose up just above the runway.",
    build: () => {
      const target = strip(3000, 700);
      return land(course({ wrap: 8000, strips: [target] }), air(1900, 85, 24, 1, 1), target, 4);
    },
  },
  {
    plane: T,
    n: 2,
    name: "Circuit",
    brief: "Take off, fly on round the world and land back on the runway you left. It's 5 km round.",
    build: () => {
      const target = strip(200, 700);
      return land(course({ wrap: 5000, strips: [target], features: [hill(2500, 1400, 90)] }), rest(240), target, 4);
    },
  },
  {
    plane: T,
    n: 3,
    name: "Gusty",
    brief: "A strong headwind, gusting on final. Carry a few knots extra and keep flying it down to the flare.",
    build: () => {
      const target = strip(3000, 700);
      const weather = { wind: -7, gust: 2.5, gust_from: 1600, gust_to: 3700, seed: 31 };
      return land(course({ wrap: 8000, strips: [target], weather }), air(1700, 90, 26, 1, 2), target, 4);
    },
  },
  {
    plane: T,
    n: 4,
    name: "Short field",
    brief: "A 250 m grass strip with trees before it. Come in steep and slow, touch down at the start and brake.",
    build: () => {
      const target = strip(3000, 250, SurfaceKind.GRASS);
      return land(course({ wrap: 8000, strips: [target], obstacles: [trees(2720, 2790, 13), trees(3310, 3400, 14)] }), air(2000, 95, 23, 1, 1), target, 5.5);
    },
  },
  {
    plane: T,
    n: 5,
    name: "Deadstick",
    brief: "The engine has stopped. The field is 2.6 km ahead: glide to it, use the flaps to lose height, and land.",
    build: () => {
      const target = strip(3600, 600, SurfaceKind.GRASS);
      return land(course({ wrap: 8000, strips: [target] }), air(1000, 450, 25, 0, 0), target, 6, 0);
    },
  },
  {
    plane: B,
    n: 1,
    name: "Over the trees",
    brief: "150 m of grass and a line of tall trees. Flaps 2, full power, and climb over them.",
    build: () => {
      const start = strip(100, 150, SurfaceKind.GRASS);
      const c = course({ wrap: 6000, strips: [start], obstacles: [trees(360, 400, 15)] });
      return { course: c, start: rest(110), goal: Goal.TAKEOFF, strip: start, clear: { x: 450, height: 25 }, slope: 6, power: 1 };
    },
  },
  {
    plane: B,
    n: 2,
    name: "Uphill strip",
    brief: "A short strip up a hillside. Land on the slope: uphill stops you fast, but the ground comes up to meet you.",
    build: () => {
      const target = strip(2400, 170, SurfaceKind.DIRT);
      const ground = ramp(2400, 2570, 40, 52, 650);
      return land(course({ wrap: 7000, strips: [target], features: [ground, hill(2900, 900, 110)] }), air(1300, 110, 20, 2, 1), target, 6);
    },
  },
  {
    plane: B,
    n: 3,
    name: "Sandbar",
    brief: "A bar of sand in the river, 120 m long. Water both ends: touch down on the sand and stop on it.",
    build: () => {
      const target = strip(2400, 120, SurfaceKind.SAND);
      const water: Surface = { x0: 1800, x1: 3000, kind: SurfaceKind.WATER };
      return land(course({ wrap: 7000, strips: [target], surfaces: [water], features: [mesa(2400, 2520, 0.6, 15)] }), air(1500, 85, 20, 2, 1), target, 6);
    },
  },
  {
    plane: B,
    n: 4,
    name: "Ridge",
    brief: "A strip on top of a ridge, with the wind coming over it: the air sinks on this side. Stay high until the end.",
    build: () => {
      const target = strip(2550, 160, SurfaceKind.GRASS);
      const ridge = mesa(2520, 2760, 110, 500);
      return land(course({ wrap: 7000, strips: [target], features: [ridge], weather: { wind: -5 } }), air(1200, 280, 22, 2, 2), target, 6);
    },
  },
  {
    plane: B,
    n: 5,
    name: "Tailwind",
    brief: "Only one way in, with the wind behind you. You come down faster over the ground, and roll further.",
    build: () => {
      const target = strip(2500, 220, SurfaceKind.GRASS);
      return land(course({ wrap: 7000, strips: [target], obstacles: [trees(2760, 2830, 15)], weather: { wind: 5 } }), air(1500, 90, 20, 2, 1), target, 5.5);
    },
  },
  {
    plane: A,
    n: 1,
    name: "Stabilised approach",
    brief: "8 km out on a 3° glidepath. Slow down, run the flaps out, keep the speed and the path steady, flare late.",
    build: () => {
      const target = strip(12000, 3000);
      return land(course({ wrap: 22000, strips: [target] }), air(4000, 430, 82, 3, 3), target, 3);
    },
  },
  {
    plane: A,
    n: 2,
    name: "Wet runway",
    brief: "Rain on a 2.4 km runway: the brakes grip half as well. Spoilers and reverse do the work.",
    build: () => {
      const target = strip(9000, 2400, SurfaceKind.WET);
      return land(course({ wrap: 20000, strips: [target], weather: { wind: -3 } }), air(3500, 300, 80, 3, 3), target, 3);
    },
  },
  {
    plane: A,
    n: 3,
    name: "Windshear",
    brief: "A strong headwind that dies away below 150 m. As it drops, so does your airspeed: be ready with the power.",
    build: () => {
      const target = strip(9000, 3000);
      const weather = { wind: -14, shear: { below: 150, wind: -2 }, gust: 1.5, gust_from: 5000, gust_to: 12000, seed: 13 };
      return land(course({ wrap: 20000, strips: [target], weather }), air(2500, 380, 84, 3, 3), target, 3);
    },
  },
  {
    plane: A,
    n: 4,
    name: "Engine out",
    brief: "One engine has failed. Take off on the other with flaps 2 and climb past the mast beyond the runway, 40 m up.",
    build: () => {
      const start = strip(300, 4000);
      const c = course({ wrap: 20000, strips: [start], obstacles: [{ x0: 7400, x1: 7420, top: 30, kind: ObstacleKind.MAST }] });
      return { course: c, start: rest(320, 2), goal: Goal.TAKEOFF, strip: start, clear: { x: 7500, height: 40 }, slope: 3, power: 0.5 };
    },
  },
  {
    plane: A,
    n: 5,
    name: "Short",
    brief: "1.8 km of runway. Touch down at the markers and stop: autobrake, spoilers, reverse, and your own brakes.",
    build: () => {
      const target = strip(9000, 1800);
      return land(course({ wrap: 20000, strips: [target], weather: { wind: -2 } }), air(3500, 310, 80, 3, 3), target, 3);
    },
  },
  {
    plane: GL,
    n: 1,
    name: "Straight in",
    brief: "Released at 250 m, the field 4 km ahead. You glide much further than that: airbrakes out to come down.",
    build: () => {
      const target = strip(5000, 500, SurfaceKind.GRASS);
      return land(course({ wrap: 9000, strips: [target] }), air(1000, 250, 27, 0, 2), target, 5);
    },
  },
  {
    plane: GL,
    n: 2,
    name: "Thermal",
    brief: "The field is 11 km away, too far to glide. A thermal stands halfway, under a cumulus: fly slowly through it to climb.",
    build: () => {
      const target = strip(12000, 500, SurfaceKind.GRASS);
      const thermal: Thermal = { x: 5500, radius: 450, strength: 5, top: 900 };
      return land(course({ wrap: 16000, strips: [target], weather: { thermals: [thermal] } }), air(1000, 280, 27, 0, 2), target, 5);
    },
  },
  {
    plane: GL,
    n: 3,
    name: "Field landing",
    brief: "Land in a 330 m field between two hedges. One go only: no engine to go round.",
    build: () => {
      const target = strip(3500, 330, SurfaceKind.GRASS);
      const hedges = [{ x0: 3455, x1: 3463, top: 3, kind: ObstacleKind.HEDGE }, { x0: 3860, x1: 3868, top: 3, kind: ObstacleKind.HEDGE }];
      return land(course({ wrap: 8000, strips: [target], obstacles: hedges }), air(1000, 200, 27, 0, 2), target, 5.5);
    },
  },
  {
    plane: GL,
    n: 4,
    name: "Ridge",
    brief: "The wind blows up the slope ahead and the air rises with it. Ride it over the ridge to the field beyond.",
    build: () => {
      const target = strip(6800, 500, SurfaceKind.GRASS);
      return land(course({ wrap: 11000, strips: [target], features: [hill(4500, 3000, 150)], weather: { wind: 5 } }), air(1200, 280, 27, 0, 2), target, 5);
    },
  },
  {
    plane: GL,
    n: 5,
    name: "Cross-country",
    brief: "14 km to a field beyond a range of hills, with three thermals on the way. Climb in each one.",
    build: () => {
      const target = strip(15000, 500, SurfaceKind.GRASS);
      const thermals: Thermal[] = [
        { x: 4000, radius: 400, strength: 4.5, top: 900 },
        { x: 8000, radius: 420, strength: 4.5, top: 950 },
        { x: 12000, radius: 380, strength: 4, top: 900 },
      ];
      return land(course({ wrap: 19000, strips: [target], features: [hill(9500, 3000, 160)], weather: { thermals } }), air(1000, 380, 27, 0, 2), target, 5);
    },
  },
];

export function track(plane: PlaneId): Level[] {
  return LEVELS.filter((level) => level.plane === plane);
}

export function level_of(plane: PlaneId, n: number): Level {
  return LEVELS.find((level) => level.plane === plane && level.n === n)!;
}

interface RandomShape {
  wrap: number;
  length: [number, number];
  kinds: SurfaceKind[];
  distance: [number, number];
  slope: number;
  speed: number;
  flap_notch: number;
  lever_notch: number;
}

const SHAPES: Record<PlaneId, RandomShape> = {
  [PlaneId.TRAINER]: { wrap: 8000, length: [380, 800], kinds: [SurfaceKind.ASPHALT, SurfaceKind.GRASS], distance: [1400, 2400], slope: 4, speed: 24, flap_notch: 1, lever_notch: 1 },
  [PlaneId.STOL]: { wrap: 7000, length: [160, 320], kinds: [SurfaceKind.GRASS, SurfaceKind.DIRT, SurfaceKind.SAND], distance: [1000, 1800], slope: 6, speed: 20, flap_notch: 2, lever_notch: 1 },
  [PlaneId.AIRLINER]: { wrap: 20000, length: [2300, 3200], kinds: [SurfaceKind.ASPHALT, SurfaceKind.ASPHALT, SurfaceKind.WET], distance: [5500, 8500], slope: 3, speed: 80, flap_notch: 3, lever_notch: 3 },
  [PlaneId.GLIDER]: { wrap: 12000, length: [420, 650], kinds: [SurfaceKind.GRASS], distance: [2500, 5000], slope: 5, speed: 27, flap_notch: 0, lever_notch: 2 },
};

/** A landing somewhere new for `plane`, from the seed: strip, distance, wind, hills off the approach and maybe trees short of it. */
export function random_scene(plane: PlaneId, seed: number, attempt: number): { scene: Scene; brief: string } {
  const rng = create_rng(hash(seed, attempt, 4111));
  const pick = (lo: number, hi: number) => lo + rng() * (hi - lo);
  const shape = SHAPES[plane];
  const length = Math.round(pick(...shape.length) / 10) * 10;
  const kind = shape.kinds[Math.floor(rng() * shape.kinds.length)];
  const distance = pick(...shape.distance);
  const start_x = 800;
  const x0 = Math.round(start_x + distance);
  const target = strip(x0, length, kind);
  const glider = plane === PlaneId.GLIDER;
  const agl = glider ? Math.round((distance / pick(12, 18)) / 10) * 10 : Math.round(distance * Math.tan((shape.slope * Math.PI) / 180) * pick(0.9, 1.15));
  const wind = Math.round(pick(-7, 2.5) * 2) / 2;
  const gust = rng() < 0.5 ? Math.round(pick(0.5, 2.5) * 2) / 2 : 0;
  const weather: Partial<Weather> = { wind, gust, gust_from: x0 - 1500, gust_to: x0 + length, seed: hash(seed, attempt) % 1000 };
  if (plane === PlaneId.AIRLINER && rng() < 0.3) weather.shear = { below: 150, wind: wind * 0.2 };
  if (glider && rng() < 0.6) weather.thermals = [{ x: start_x + distance * pick(0.3, 0.6), radius: pick(250, 400), strength: pick(2, 4), top: agl + pick(250, 450) }];
  const features: Feature[] = [];
  const hills = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < hills; i++) {
    const x = x0 + length + pick(700, 2500);
    if (x < shape.wrap - 400) features.push(hill(x, pick(600, 1600), pick(30, glider ? 120 : 160)));
  }
  const obstacles: Obstacle[] = [];
  if (!glider && plane !== PlaneId.AIRLINER && rng() < 0.6) {
    const back = pick(120, 260);
    const room = (back + length * 0.15) * Math.tan((shape.slope * Math.PI) / 180) - 7;
    if (room > 5) obstacles.push(trees(x0 - back - 40, x0 - back, Math.round(Math.min(16, room))));
  }
  const course_parts = { wrap: shape.wrap, strips: [target], features, obstacles, weather };
  const scene = land(course(course_parts), air(start_x, agl, shape.speed, shape.flap_notch, shape.lever_notch), target, shape.slope);
  const knots = Math.round(Math.abs(wind) * 1.943844);
  const air_text = knots === 0 ? "No wind" : `${knots} kn ${wind < 0 ? "headwind" : "tailwind"}${gust > 0 ? ", gusting" : ""}`;
  const where = distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${Math.round(distance / 10) * 10} m`;
  const brief = glider
    ? `Released at ${agl} m with a ${length} m field ${where} ahead. ${air_text}.`
    : `A ${length} m ${kind === SurfaceKind.WET ? "wet runway" : kind === SurfaceKind.ASPHALT ? "runway" : `${kind} strip`} ${where} ahead.${obstacles.length ? " Trees short of it." : ""} ${air_text}.`;
  return { scene, brief };
}
