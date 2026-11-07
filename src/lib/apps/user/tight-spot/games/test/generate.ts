import { create_rng, pick, type Rng } from "$lib/core/utils/random";
import { hash } from "$kit/games/play2d/seed";
import type { VehicleSpec } from "../../core/vehicle";
import { build_route, type RouteDef } from "./route";
import { LOT_ROAD, NodeKind, type Town } from "./town";

export const Feature = { ROUNDABOUT: "roundabout", LIGHTS: "lights", ONE_WAY: "one-way", STOP: "stop", ZONE: "zone" } as const;
export type Feature = (typeof Feature)[keyof typeof Feature];

export interface RouteShape {
  junctions: number;
  need?: readonly Feature[];
  avoid?: readonly Feature[];
}

interface Leg {
  road: string;
  to: string;
}

// Starts and pull-ups picked off the map: room to the first junction for its prompt, and a straight run on the last
// road with a free kerb on the right (no lay-by, no zebra, no junction mouth).
const STARTS: readonly RouteDef["start"][] = [
  { road: "DE", to: "E", at: 14 },
  { road: "GK", to: "G", at: 30 },
  { road: "JK", to: "J", at: 30 },
  { road: "DH", to: "D", at: 20 },
  { road: "BC", to: "B", at: 30 },
  { road: "HI", to: "I", at: 20 },
];

const FINALS: readonly (Leg & { pull_up: RouteDef["pull_up"] })[] = [
  { road: "IJ", to: "J", pull_up: { from: 50, to: 100 } },
  { road: "DH", to: "H", pull_up: { from: 30, to: 70 } },
  { road: "DH", to: "D", pull_up: { from: 30, to: 70 } },
  { road: "GK", to: "K", pull_up: { from: 30, to: 70 } },
  { road: "GK", to: "G", pull_up: { from: 30, to: 70 } },
  { road: "AD", to: "D", pull_up: { from: 30, to: 70 } },
  { road: "HI", to: "H", pull_up: { from: 50, to: 100 } },
  { road: "BC", to: "C", pull_up: { from: 50, to: 100 } },
  { road: "JK", to: "K", pull_up: { from: 40, to: 80 } },
];

const LOT_IN = "Q2";
const LOT_OUT = "Q1";
// The car park's frontage may be driven both ways, out to the car park and back; any other road only once.
const FRONTAGE = new Set(["AQ1", "Q1Q2", "Q2B"]);
const MAX_LEGS = 30;
const ATTEMPTS = 4000;
const MIN_LENGTH = 900;
const MAX_LENGTH = 2600;

const key = (leg: Leg) => `${leg.road}>${leg.to}`;

function legs_from(town: Town, node: string, came: string): Leg[] {
  const out: Leg[] = [];
  for (const road of Object.values(town.roads)) {
    if (road.id === came) continue;
    if (road.from === node) out.push({ road: road.id, to: road.to });
    else if (road.to === node && !road.one_way) out.push({ road: road.id, to: road.from });
  }
  return out;
}

function counts(town: Town, node: string): boolean {
  const kind = town.nodes[node].kind;
  return kind !== NodeKind.BEND && kind !== NodeKind.DRIVEWAY;
}

function walk(town: Town, rng: Rng, junctions: number): { start: RouteDef["start"]; legs: Leg[]; pull_up: RouteDef["pull_up"] } | null {
  const start = pick(STARTS, rng);
  const legs: Leg[] = [{ road: start.road, to: start.to }];
  const used = new Set([legs[0].road, key(legs[0])]);
  let lot = false;
  let passed = 0;
  for (let step = 0; step < MAX_LEGS; step++) {
    const here = legs.at(-1)!;
    const node = here.to;
    if (counts(town, node)) passed++;
    if (passed > junctions) return null;
    if (!lot && node === LOT_IN && passed >= Math.floor(junctions / 3)) {
      legs.push({ road: LOT_ROAD, to: LOT_OUT });
      lot = true;
      continue;
    }
    const options = legs_from(town, node, here.road).filter((leg) => !used.has(key(leg)) && (FRONTAGE.has(leg.road) || !used.has(leg.road)));
    if (lot && passed === junctions) {
      const finals = FINALS.filter((final) => options.some((leg) => key(leg) === key(final)));
      if (finals.length === 0) return null;
      const final = pick(finals, rng);
      legs.push({ road: final.road, to: final.to });
      return { start, legs, pull_up: final.pull_up };
    }
    if (options.length === 0) return null;
    const next = pick(options, rng);
    used.add(next.road).add(key(next));
    legs.push(next);
  }
  return null;
}

export function features_of(def: Pick<RouteDef, "start" | "roads">, town: Town): Set<Feature> {
  const found = new Set<Feature>();
  const roads = [def.start.road, ...def.roads];
  let toward = def.start.to;
  for (let i = 0; i < roads.length; i++) {
    const road = roads[i];
    if (i > 0) {
      const ends = road === LOT_ROAD ? [LOT_IN, LOT_OUT] : [town.roads[road].from, town.roads[road].to];
      toward = ends[0] === toward ? ends[1] : ends[0];
    }
    if (road === "BE") found.add(Feature.ONE_WAY);
    if (road === "HI" || road === "IJ") found.add(Feature.ZONE);
    if (road === "DE" && toward === "D") found.add(Feature.STOP);
    if (i === roads.length - 1) break;
    const kind = town.nodes[toward].kind;
    if (kind === NodeKind.ROUNDABOUT) found.add(Feature.ROUNDABOUT);
    if (toward === "E") found.add(Feature.LIGHTS);
  }
  return found;
}

export function junctions_of(def: Pick<RouteDef, "start" | "roads">, town: Town): number {
  const roads = [def.start.road, ...def.roads];
  let toward = def.start.to;
  let count = 0;
  for (let i = 1; i < roads.length; i++) {
    if (counts(town, toward)) count++;
    const road = roads[i];
    const ends = road === LOT_ROAD ? [LOT_IN, LOT_OUT] : [town.roads[road].from, town.roads[road].to];
    toward = ends[0] === toward ? ends[1] : ends[0];
  }
  return count;
}

export function generate_route(town: Town, seed: number, shape: RouteShape, spec: VehicleSpec, id: string, name: string): RouteDef {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const rng = create_rng(hash(seed, 0x7e57, attempt));
    const found = walk(town, rng, shape.junctions);
    if (!found) continue;
    const def: RouteDef = { id, name, start: found.start, roads: found.legs.slice(1).map((leg) => leg.road), pull_up: found.pull_up };
    const features = features_of(def, town);
    if (shape.need?.some((feature) => !features.has(feature))) continue;
    if (shape.avoid?.some((feature) => features.has(feature))) continue;
    try {
      const route = build_route(town, def, spec);
      if (route.length < MIN_LENGTH || route.length > MAX_LENGTH) continue;
    } catch {
      continue;
    }
    return def;
  }
  throw new Error(`No route of ${shape.junctions} junctions for seed ${seed}`);
}
