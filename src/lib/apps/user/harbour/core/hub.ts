import { inside_convex } from "$kit/games/play2d/collision";
import { rect, type Polygon, type Pose, type Vec } from "$kit/games/play2d/geometry";
import { LEVELS } from "./levels";
import { RoundKind } from "./rounds";
import { SceneBuilder, type Scene } from "./world";

export interface Gate {
  /** A level's id, or random or daily. */
  id: number | typeof RoundKind.RANDOM | typeof RoundKind.DAILY;
  label: string;
  /** The port buoy (red) and the starboard one (green), for a boat sailing north through it. */
  port: Vec;
  starboard: Vec;
  /** Where the board with the number and stars stands. */
  sign: Vec;
}

export interface Hub {
  /** 1 for the small boats; everything grows with it so a coaster fits the gates and the shed. */
  scale: number;
  scene: Scene;
  gates: Gate[];
  /** Sailing in swaps the boat; `exit` is where the other one comes out. */
  shed: { zone: Polygon; roof: Polygon; exit: Pose; door: Vec };
}

const WIDTH = 150;
const HEIGHT = 100;
const GATE = 9;
const QUAY = 8;

/** The hub's scale for a boat: the yacht's harbour, grown for anything longer. */
export function hub_scale(length: number): number {
  return Math.max(1, length / 10);
}

export function build_hub(scale = 1): Hub {
  const k = scale;
  const build = new SceneBuilder();
  const x0 = (-WIDTH / 2) * k;
  const x1 = (WIDTH / 2) * k;
  const y0 = (-HEIGHT / 2) * k;
  const y1 = (HEIGHT / 2) * k;
  const quay = QUAY * k;
  build.quay(x0 - quay, y0 - quay, x1 + quay, y0);
  build.quay(x0 - quay, y1, x1 + quay, y1 + quay);
  build.quay(x0 - quay, y0, x0, y1);
  build.quay(x1, y0, x1 + quay, y1);

  const shed_x = x0 + 14 * k;
  build.quay(shed_x - 9 * k, y0, shed_x - 8 * k, y0 + 17 * k);
  build.quay(shed_x + 8 * k, y0, shed_x + 9 * k, y0 + 17 * k);
  const zone = rect(shed_x - 8 * k, y0, shed_x + 8 * k, y0 + 13 * k);
  const roof = rect(shed_x - 9.5 * k, y0 - 3 * k, shed_x + 9.5 * k, y0 + 17 * k);

  build.pontoon(x1 - 60 * k, y0 + 6 * k, x1 - 6 * k, y0 + 8.2 * k);
  const moored = [
    { x: 52, length: 9, beam: 3.1 },
    { x: 40, length: 11, beam: 3.6 },
    { x: 27, length: 7, beam: 2.6 },
    { x: 15, length: 10, beam: 3.3 },
  ];
  const cargo = k > 2;
  moored.forEach((boat, i) => {
    const pose = { x: x1 - boat.x * k, y: y0 + (8.3 + boat.beam / 2 + 0.05) * k, heading: i % 2 ? 0 : Math.PI };
    build.moored(pose, { length: boat.length * k, beam: boat.beam * k, drive: "shaft", cargo }, i + 1);
  });
  build.pontoon(x0 + 26 * k, y1 - 8.2 * k, x0 + 70 * k, y1 - 6 * k);
  build.moored({ x: x0 + 36 * k, y: y1 - (8.3 + 1.55) * k, heading: 0 }, { length: 8 * k, beam: 3 * k, drive: "shaft", cargo }, 0);
  build.moored({ x: x0 + 58 * k, y: y1 - (8.3 + 1) * k, heading: Math.PI }, { length: 4.6 * k, beam: 2 * k, drive: cargo ? "shaft" : "outboard", cargo }, 3);
  for (const [x, y] of [[x1 - 22 * k, y1 - 18 * k], [x1 - 30 * k, y1 - 12 * k], [x0 + 6 * k, 6 * k]]) build.pile(x, y, 0.6 * k);

  const gates: Gate[] = [];
  const columns = [-38, -16, 6, 28];
  LEVELS.forEach((level, i) => {
    const x = columns[i % 4];
    const y = i < 4 ? -16 : 18;
    gates.push(gate(build, level.id, String(level.id), x * k, y * k, k));
  });
  gates.push(gate(build, RoundKind.RANDOM, "Random", 52 * k, -16 * k, k));
  gates.push(gate(build, RoundKind.DAILY, "Daily", 52 * k, 18 * k, k));

  return {
    scale: k,
    scene: { bounds: { x0: x0 - quay, y0: y0 - quay, x1: x1 + quay, y1: y1 + quay }, solids: build.solids, berth: null, start: { x: -16 * k, y: 2 * k, heading: -Math.PI / 2 } },
    gates,
    shed: { zone, roof, exit: { x: shed_x, y: y0 + 9 * k, heading: Math.PI / 2 }, door: { x: shed_x, y: y0 + 17 * k } },
  };
}

function gate(build: SceneBuilder, id: Gate["id"], label: string, x: number, y: number, k: number): Gate {
  const port = { x: x - (GATE * k) / 2, y };
  const starboard = { x: x + (GATE * k) / 2, y };
  build.buoy(port.x, port.y, "port", 0.45 * Math.sqrt(k));
  build.buoy(starboard.x, starboard.y, "starboard", 0.45 * Math.sqrt(k));
  return { id, label, port, starboard, sign: { x, y: y + (y < 0 ? -3.2 : 3.2) * k } };
}

function side(gate: Gate, p: Vec): number {
  return Math.sign((gate.starboard.x - gate.port.x) * (p.y - gate.port.y) - (gate.starboard.y - gate.port.y) * (p.x - gate.port.x));
}

/** The gate the boat's centre crossed between two points, either way through. */
export function crossed(gates: readonly Gate[], from: Vec, to: Vec): Gate | null {
  for (const gate of gates) {
    const a = side(gate, from);
    const b = side(gate, to);
    if (a === 0 || a === b) continue;
    const ex = gate.starboard.x - gate.port.x;
    const ey = gate.starboard.y - gate.port.y;
    const t = ((to.x - gate.port.x) * ex + (to.y - gate.port.y) * ey) / (ex * ex + ey * ey);
    if (t >= 0 && t <= 1) return gate;
  }
  return null;
}

export function in_shed(hub: Hub, at: Vec): boolean {
  return inside_convex(at, hub.shed.zone);
}

/** Where a boat comes back to the hub after a round: just past the gate it went through, heading away from it. */
export function past_gate(hub: Hub, id: Gate["id"]): Pose {
  const found = hub.gates.find((gate) => gate.id === id);
  if (!found) return hub.scene.start;
  const middle = { x: (found.port.x + found.starboard.x) / 2, y: (found.port.y + found.starboard.y) / 2 };
  const north = middle.y < 0;
  return { x: middle.x, y: middle.y + (north ? 9 : -9) * hub.scale, heading: north ? Math.PI / 2 : -Math.PI / 2 };
}
