import { hash } from "$kit/games/play2d/seed";
import type { VehicleSpec } from "../../core/vehicle";
import { Feature, generate_route, type RouteShape } from "./generate";
import { route_def, ROUTE_IDS, type RouteDef } from "./route";
import { LEVEL_COUNT, level_key } from "./stars";
import { town } from "./town";

interface Rung extends RouteShape {
  name: string;
}

const { ROUNDABOUT, LIGHTS, ONE_WAY, STOP, ZONE } = Feature;

const LADDER: readonly Rung[] = [
  { name: "Back streets", junctions: 5, need: [STOP, ZONE], avoid: [ROUNDABOUT] },
  { name: "Roundabout", junctions: 5, need: [ROUNDABOUT], avoid: [LIGHTS] },
  { name: "Crossroads", junctions: 6, need: [LIGHTS, STOP] },
  { name: "One way", junctions: 7, need: [ONE_WAY] },
  { name: "School run", junctions: 7, need: [ZONE, ROUNDABOUT, LIGHTS] },
  { name: "Ring road", junctions: 8, need: [ROUNDABOUT, LIGHTS, STOP] },
  { name: "Market day", junctions: 8, need: [ONE_WAY, ROUNDABOUT, ZONE] },
  { name: "High street", junctions: 9, need: [ONE_WAY, LIGHTS, ROUNDABOUT, STOP] },
  { name: "Final exam", junctions: 9, need: [ONE_WAY, LIGHTS, ROUNDABOUT, STOP, ZONE] },
];

const RANDOM_JUNCTIONS = [6, 8] as const;
const DAILY_JUNCTIONS = 8;
const cache = new Map<number, RouteDef>();

export function level_def(level: number, spec: VehicleSpec): RouteDef {
  if (level <= ROUTE_IDS.length) return route_def(ROUTE_IDS[level - 1]);
  let found = cache.get(level);
  if (!found) {
    const rung = LADDER[level - ROUTE_IDS.length - 1];
    found = generate_route(town(), hash(0x1e7e1, level), rung, spec, level_key(level), rung.name);
    cache.set(level, found);
  }
  return found;
}

export function level_name(level: number): string {
  return level <= ROUTE_IDS.length ? route_def(ROUTE_IDS[level - 1]).name : LADDER[level - ROUTE_IDS.length - 1].name;
}

const RETRIES = 8;

// A seed whose walks never fit tries the seeds after it, then falls back to a hand-made route: never a throw into the game.
function generate_or_fallback(seed: number, shape: RouteShape, spec: VehicleSpec, id: string, name: string): RouteDef {
  for (let k = 0; k < RETRIES; k++) {
    try {
      return generate_route(town(), k === 0 ? seed : hash(seed, 0xfa11, k), shape, spec, id, name);
    } catch {
      continue;
    }
  }
  return { ...route_def(ROUTE_IDS[(seed >>> 0) % ROUTE_IDS.length]), id, name };
}

export function random_def(seed: number, spec: VehicleSpec): RouteDef {
  const [low, high] = RANDOM_JUNCTIONS;
  const junctions = low + (hash(seed, 0x3a) % (high - low + 1));
  return generate_or_fallback(seed, { junctions }, spec, `seed-${seed}`, "Random route");
}

export function daily_def(day: string, seed: number, spec: VehicleSpec): RouteDef {
  return generate_or_fallback(seed, { junctions: DAILY_JUNCTIONS }, spec, `daily-${day}`, "Daily route");
}

export { LEVEL_COUNT };
