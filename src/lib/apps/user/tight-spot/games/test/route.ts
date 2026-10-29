import { z } from "zod";
import type { Pose, Vec } from "../../core/geometry";
import { Signal } from "../../core/signal";
import { body_ends, type VehicleSpec } from "../../core/vehicle";
import { ControlKind, LaneKind, LOT_ROAD, NodeKind, Turn, type Control, type Lane, type Town } from "./town";

export const RouteId = { MARKET: "market", STATION: "station", SCHOOL: "school" } as const;
export type RouteId = (typeof RouteId)[keyof typeof RouteId];
export const ROUTE_IDS: readonly RouteId[] = [RouteId.MARKET, RouteId.STATION, RouteId.SCHOOL];
export const route_id_schema = z.enum([RouteId.MARKET, RouteId.STATION, RouteId.SCHOOL]);

interface RouteDef {
  id: RouteId;
  name: string;
  start: { road: string; to: string; at: number };
  roads: string[];
  pull_up: { from: number; to: number };
}

const DEFS: Record<RouteId, RouteDef> = {
  market: {
    id: RouteId.MARKET,
    name: "Market",
    start: { road: "DE", to: "E", at: 14 },
    roads: ["EF", "CF", "BC", "Q2B", LOT_ROAD, "AQ1", "AD", "DH", "HI", "IJ"],
    pull_up: { from: 50, to: 100 },
  },
  station: {
    id: RouteId.STATION,
    name: "Station",
    start: { road: "GK", to: "G", at: 30 },
    roads: ["FG", "EF", "DE", "AD", "AQ1", "Q1Q2", LOT_ROAD, "Q1Q2", "Q2B", "BE", "EI", "HI", "DH"],
    pull_up: { from: 30, to: 70 },
  },
  school: {
    id: RouteId.SCHOOL,
    name: "School",
    start: { road: "JK", to: "J", at: 30 },
    roads: ["IJ", "HI", "DH", "AD", "AQ1", "Q1Q2", LOT_ROAD, "Q1Q2", "Q2B", "BE", "EF", "FJ", "JK", "GK"],
    pull_up: { from: 30, to: 70 },
  },
};

export function route_name(id: RouteId): string {
  return DEFS[id].name;
}

export const EventKind = { APPROACH: "approach", RING_EXIT: "ring-exit" } as const;
export type EventKind = (typeof EventKind)[keyof typeof EventKind];

export interface RouteEvent {
  kind: EventKind;
  s: number;
  node: string;
  lane: string;
  control?: Control;
  turn: Turn;
  signal: Signal;
  junction: boolean;
  next_road: string;
}

export interface Prompt {
  /** Where the junction it's about is: it's spoken a few seconds before the car gets there. */
  s: number;
  text: string;
  after_park?: boolean;
}

export interface Route {
  id: RouteId;
  name: string;
  points: Vec[];
  headings: number[];
  lanes: string[];
  ss: number[];
  length: number;
  start: Pose;
  events: RouteEvent[];
  prompts: Prompt[];
  lot: { from: number; to: number; stop: number };
  pull_up: { from: number; to: number };
}

const ORDINALS = ["first", "second", "third", "fourth"];

function connect(town: Town, from: Lane, to: Lane): Lane[] | null {
  const queue: { lane: Lane; path: Lane[] }[] = from.next.map((id) => ({ lane: town.lanes[id], path: [town.lanes[id]] }));
  const seen = new Set<string>();
  while (queue.length > 0) {
    const { lane, path } = queue.shift()!;
    if (lane.id === to.id) return path.slice(0, -1);
    if (seen.has(lane.id) || lane.kind === LaneKind.ROAD || lane.kind === LaneKind.LOT) continue;
    seen.add(lane.id);
    for (const id of lane.next) queue.push({ lane: town.lanes[id], path: [...path, town.lanes[id]] });
  }
  return null;
}

function road_lanes(town: Town, road: string, to: string): Lane[] {
  return Object.values(town.lanes)
    .filter((lane) => lane.road === road && lane.to === to)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

function ends_of(town: Town, road: string): [string, string] {
  if (road === LOT_ROAD) return ["Q2", "Q1"];
  return [town.roads[road].from, town.roads[road].to];
}

function side_signal(turn: Turn): Signal {
  return turn === Turn.LEFT ? Signal.LEFT : turn === Turn.RIGHT ? Signal.RIGHT : Signal.NONE;
}

function prompt_text(town: Town, event: RouteEvent, connectors: Lane[], from: Lane, into: string): string | null {
  const node = town.nodes[event.node];
  const side = event.turn === Turn.LEFT ? "left" : "right";
  if (node.kind === NodeKind.ROUNDABOUT) {
    const exits = connectors.filter((lane) => lane.kind === LaneKind.RING && lane.next.some((id) => town.lanes[id].kind === LaneKind.EXIT)).length;
    return `At the roundabout, take the ${ORDINALS[Math.max(0, exits - 1)] ?? "next"} exit.`;
  }
  if (node.kind === NodeKind.BEND) return null;
  if (into === LOT_ROAD) return `Turn ${side} into the test centre car park, and park in the marked bay.`;
  if (from.kind === LaneKind.LOT) return `Thank you. Now drive out of the car park, and turn ${side} at the road.`;
  if (event.control?.kind === ControlKind.LIGHTS) return event.turn === Turn.STRAIGHT ? "At the lights, go straight ahead." : `At the lights, turn ${side}.`;
  if (event.turn === Turn.STRAIGHT) return null;
  const through = from.next.some((id) => town.lanes[id].turn === Turn.STRAIGHT);
  return through ? `Take the next road on the ${side}.` : `At the end of the road, turn ${side}.`;
}

export function build_route(town: Town, id: RouteId, spec: VehicleSpec): Route {
  const def = DEFS[id];
  const roads = [def.start.road, ...def.roads];
  const toward: string[] = [def.start.to];
  for (let i = 1; i < roads.length; i++) {
    const [a, b] = ends_of(town, roads[i]);
    const shared = toward[i - 1];
    if (a !== shared && b !== shared) throw new Error(`${id}: ${roads[i]} doesn't meet ${roads[i - 1]} at ${shared}`);
    toward.push(a === shared ? b : a);
  }
  const chosen: Lane[] = new Array(roads.length);
  const joins: Lane[][] = new Array(roads.length - 1);
  chosen[roads.length - 1] = road_lanes(town, roads.at(-1)!, toward.at(-1)!)[0];
  for (let i = roads.length - 2; i >= 0; i--) {
    for (const lane of road_lanes(town, roads[i], toward[i])) {
      const path = connect(town, lane, chosen[i + 1]);
      if (!path) continue;
      chosen[i] = lane;
      joins[i] = path;
      break;
    }
    if (!chosen[i]) throw new Error(`${id}: no way from ${roads[i]} to ${roads[i + 1]}`);
  }

  const points: Vec[] = [];
  const headings: number[] = [];
  const lanes: string[] = [];
  const ss: number[] = [];
  let s = 0;
  const push = (lane: Lane, from_index = 0) => {
    for (let k = from_index; k < lane.points.length; k++) {
      const p = lane.points[k];
      if (points.length > 0) {
        const step = Math.hypot(p.x - points.at(-1)!.x, p.y - points.at(-1)!.y);
        if (step < 1e-6) continue;
        s += step;
      }
      points.push(p);
      headings.push(lane.headings[k]);
      lanes.push(lane.id);
      ss.push(s);
    }
  };

  const start_index = Math.round(def.start.at / 0.5);
  const first = chosen[0];
  const start: Pose = { ...first.points[start_index], heading: first.headings[start_index] };
  const events: RouteEvent[] = [];
  const prompts: Prompt[] = [{ s: 0, text: "When you're ready, drive on. Follow the road ahead unless I ask you to turn." }];
  let lot = { from: 0, to: 0, stop: 0 };
  let last_start = 0;

  for (let i = 0; i < roads.length; i++) {
    const lane = chosen[i];
    const lane_start = s;
    push(lane, i === 0 ? start_index : 0);
    if (i === roads.length - 1) last_start = lane_start;
    if (lane.kind === LaneKind.LOT) {
      const target = { x: (town.bay.shape[0].x + town.bay.shape[1].x) / 2, y: (town.bay.shape[0].y + town.bay.shape[2].y) / 2 };
      const { front, rear } = body_ends(spec);
      const stop = { x: target.x, y: target.y - (front + rear) / 2 };
      let best = 0;
      lane.points.forEach((p, k) => {
        if (Math.hypot(p.x - stop.x, p.y - stop.y) < Math.hypot(lane.points[best].x - stop.x, lane.points[best].y - stop.y)) best = k;
      });
      lot = { from: lane_start, to: s, stop: lane_start + best * (lane.length / (lane.points.length - 1)) };
    }
    if (i === roads.length - 1) break;
    const node = town.nodes[toward[i]];
    const path = joins[i];
    const turn_lane = path.find((each) => each.kind === LaneKind.TURN);
    const turn = node.kind === NodeKind.ROUNDABOUT ? Turn.STRAIGHT : (turn_lane?.turn ?? Turn.STRAIGHT);
    const junction = node.kind !== NodeKind.BEND && node.kind !== NodeKind.ROUNDABOUT;
    const event: RouteEvent = {
      kind: EventKind.APPROACH,
      s,
      node: node.id,
      lane: lane.id,
      control: lane.control,
      turn,
      signal: junction ? side_signal(turn) : Signal.NONE,
      junction,
      next_road: roads[i + 1],
    };
    events.push(event);
    const text = prompt_text(town, event, path, lane, roads[i + 1]);
    if (text) prompts.push({ s: event.s, text, after_park: lane.kind === LaneKind.LOT });
    for (const join of path) {
      if (join.kind === LaneKind.EXIT) {
        events.push({ kind: EventKind.RING_EXIT, s, node: node.id, lane: join.id, turn: Turn.RIGHT, signal: Signal.RIGHT, junction: false, next_road: roads[i + 1] });
      }
      push(join);
    }
  }

  const pull_up = { from: last_start + def.pull_up.from, to: last_start + def.pull_up.to };
  prompts.push({ s: pull_up.from, text: "Pull up on the right at a safe place, please." });
  return { id, name: def.name, points, headings, lanes, ss, length: s, start, events, prompts, lot, pull_up };
}

export interface Located {
  index: number;
  s: number;
  lateral: number;
}

const BACK = 40;
const AHEAD = 160;

/** The nearest sample near the last one, so a close part of the route further on can't capture the car. */
export function locate(route: Route, p: Vec, hint: number, wide = false): Located {
  const from = wide ? 0 : Math.max(0, hint - BACK);
  const to = wide ? route.points.length - 1 : Math.min(route.points.length - 1, hint + AHEAD);
  let best = hint;
  let nearest = Infinity;
  for (let i = from; i <= to; i++) {
    const q = route.points[i];
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d < nearest) {
      nearest = d;
      best = i;
    }
  }
  const q = route.points[best];
  const h = route.headings[best];
  const dx = p.x - q.x;
  const dy = p.y - q.y;
  const along = dx * Math.cos(h) + dy * Math.sin(h);
  return { index: best, s: route.ss[best] + along, lateral: -dx * Math.sin(h) + dy * Math.cos(h) };
}

// Interpolated at both ends so the line grows and shrinks smoothly instead of a sample at a time.
export function route_span(route: Route, from: number, to: number, hint = 0): Vec[] {
  const { points, ss } = route;
  const last = points.length - 1;
  const at = (s: number, i: number): Vec => {
    const k = Math.min(Math.max(i, 0), last - 1);
    const t = Math.min(1, Math.max(0, (s - ss[k]) / (ss[k + 1] - ss[k])));
    return { x: points[k].x + (points[k + 1].x - points[k].x) * t, y: points[k].y + (points[k + 1].y - points[k].y) * t };
  };
  let i = Math.min(Math.max(hint, 0), last);
  while (i > 0 && ss[i] > from) i--;
  while (i < last && ss[i + 1] <= from) i++;
  const span = [at(from, i)];
  for (i++; i <= last && ss[i] < to; i++) span.push(points[i]);
  span.push(at(to, i - 1));
  return span;
}

const cache = new Map<string, Route>();

export function route_of(town: Town, id: RouteId, spec: VehicleSpec): Route {
  let found = cache.get(id);
  if (!found) {
    found = build_route(town, id, spec);
    cache.set(id, found);
  }
  return found;
}
