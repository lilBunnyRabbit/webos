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
  scene: Scene;
  gates: Gate[];
  /** Sailing in swaps the boat; `exit` is where the other one comes out. */
  shed: { zone: Polygon; roof: Polygon; exit: Pose; door: Vec };
}

const WIDTH = 150;
const HEIGHT = 100;
const GATE = 9;
const QUAY = 8;

export function build_hub(): Hub {
  const build = new SceneBuilder();
  const x0 = -WIDTH / 2;
  const x1 = WIDTH / 2;
  const y0 = -HEIGHT / 2;
  const y1 = HEIGHT / 2;
  build.quay(x0 - QUAY, y0 - QUAY, x1 + QUAY, y0);
  build.quay(x0 - QUAY, y1, x1 + QUAY, y1 + QUAY);
  build.quay(x0 - QUAY, y0, x0, y1);
  build.quay(x1, y0, x1 + QUAY, y1);

  const shed_x = x0 + 14;
  build.quay(shed_x - 9, y0, shed_x - 8, y0 + 17);
  build.quay(shed_x + 8, y0, shed_x + 9, y0 + 17);
  const zone = rect(shed_x - 8, y0, shed_x + 8, y0 + 13);
  const roof = rect(shed_x - 9.5, y0 - 3, shed_x + 9.5, y0 + 17);

  build.pontoon(x1 - 60, y0 + 6, x1 - 6, y0 + 8.2);
  const moored = [
    { x: x1 - 52, length: 9, beam: 3.1 },
    { x: x1 - 40, length: 11, beam: 3.6 },
    { x: x1 - 27, length: 7, beam: 2.6 },
    { x: x1 - 15, length: 10, beam: 3.3 },
  ];
  moored.forEach((boat, i) => {
    build.moored({ x: boat.x, y: y0 + 8.3 + boat.beam / 2 + 0.05, heading: i % 2 ? 0 : Math.PI }, { length: boat.length, beam: boat.beam, drive: "shaft" }, i + 1);
  });
  build.pontoon(x0 + 26, y1 - 8.2, x0 + 70, y1 - 6);
  build.moored({ x: x0 + 36, y: y1 - 8.3 - 1.55, heading: 0 }, { length: 8, beam: 3, drive: "shaft" }, 0);
  build.moored({ x: x0 + 58, y: y1 - 8.3 - 1, heading: Math.PI }, { length: 4.6, beam: 2, drive: "outboard" }, 3);
  for (const [x, y] of [[x1 - 22, y1 - 18], [x1 - 30, y1 - 12], [x0 + 6, 6]]) build.pile(x, y, 0.6);

  const gates: Gate[] = [];
  const columns = [-38, -16, 6, 28];
  LEVELS.forEach((level, i) => {
    const x = columns[i % 4];
    const y = i < 4 ? -16 : 18;
    gates.push(gate(build, level.id, String(level.id), x, y));
  });
  gates.push(gate(build, RoundKind.RANDOM, "Random", 52, -16));
  gates.push(gate(build, RoundKind.DAILY, "Daily", 52, 18));

  return {
    scene: { bounds: { x0: x0 - QUAY, y0: y0 - QUAY, x1: x1 + QUAY, y1: y1 + QUAY }, solids: build.solids, berth: null, start: { x: -16, y: 2, heading: -Math.PI / 2 } },
    gates,
    shed: { zone, roof, exit: { x: shed_x, y: y0 + 9, heading: Math.PI / 2 }, door: { x: shed_x, y: y0 + 17 } },
  };
}

function gate(build: SceneBuilder, id: Gate["id"], label: string, x: number, y: number): Gate {
  const port = { x: x - GATE / 2, y };
  const starboard = { x: x + GATE / 2, y };
  build.buoy(port.x, port.y, "port");
  build.buoy(starboard.x, starboard.y, "starboard");
  return { id, label, port, starboard, sign: { x, y: y + (y < 0 ? -3.2 : 3.2) } };
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
  return { x: middle.x, y: middle.y + (north ? 9 : -9), heading: north ? Math.PI / 2 : -Math.PI / 2 };
}
