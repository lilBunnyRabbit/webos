import { angle_between } from "./geometry";
import { collide, type Obstacles } from "./obstacles";
import { through } from "./portals";
import type { Portal } from "./scene";
import {
  can_crab,
  DriveKind,
  folds,
  HATCHBACK,
  jackknifed,
  max_steer,
  rest_trailers,
  travel,
  type Placement,
  type VehicleSpec,
} from "./vehicle";

export function inflate(spec: VehicleSpec, margin: number): VehicleSpec {
  const grown = {
    ...spec,
    length: spec.length + margin * 2,
    width: spec.width + margin * 2,
    rear_overhang: spec.rear_overhang + margin,
    ...(spec.forks ? { forks: { length: spec.forks.length, width: spec.forks.width + margin * 2 } } : {}),
  };
  if (spec.hitches.length === 0) return grown;
  return {
    ...grown,
    hitches: spec.hitches.map((t) => ({
      ...t,
      width: t.width + margin * 2,
      box_length: t.box_length + margin * 2,
      drawbar: t.drawbar - margin,
    })),
  };
}

export interface PlanOptions {
  spec?: VehicleSpec;
  /** Extra clearance around the body, so a path the planner finds isn't one only a computer could drive. */
  margin?: number;
  max_expansions?: number;
  reach?: number;
  heading_tolerance?: number;
  /** Restricts the moves, 1 forward and -1 back: a path out of a bay in reverse only is a forward path in, which a trailer follows stably. */
  directions?: readonly number[];
  /** Replaces the goal of ending within `reach` and `heading_tolerance` of `to`; `to` then only steers the search. */
  arrive?: (pose: Placement) => boolean;
  /** Replaces the collision test (the margin-grown body against `near`, and a jackknife), for a game with its own rules. */
  blocked?: (pose: Placement) => boolean;
  /** Steering per move as shares of full lock; finer ones let a long path line up within centimetres. */
  steering?: readonly number[];
  /** Crab moves, as shares of full lock, for a vehicle with a crab mode; none turns it off. */
  crabbing?: readonly number[];
  /** Added per change of direction; higher finds paths a driver would take, with fewer shuffles. */
  switch_cost?: number;
  /** A pose that rolls into a mouth goes on from where the portal carries it, so a path can cross floors. */
  portals?: readonly Portal[];
}

/** The wheel held at `steer` (the car's own steer: a wheel angle, a skid's share, a frame's bend) for `distance`. */
export interface Move {
  steer: number;
  distance: number;
  crab?: boolean;
}

export interface PlanResult {
  path: Placement[];
  moves: Move[];
  reversals: number;
  expansions: number;
}

interface Node {
  pose: Placement;
  cost: number;
  score: number;
  direction: number;
  reversals: number;
  move: Move | null;
  parent: Node | null;
}

class Heap {
  private readonly items: Node[] = [];

  get size(): number {
    return this.items.length;
  }

  push(node: Node) {
    const items = this.items;
    items.push(node);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].score <= node.score) break;
      items[i] = items[parent];
      i = parent;
    }
    items[i] = node;
  }

  pop(): Node | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length === 0 || !last) return top;
    let i = 0;
    for (;;) {
      const left = i * 2 + 1;
      if (left >= items.length) break;
      const right = left + 1;
      const child = right < items.length && items[right].score < items[left].score ? right : left;
      if (items[child].score >= last.score) break;
      items[i] = items[child];
      i = child;
    }
    items[i] = last;
    return top;
  }
}

const CELL = 0.25;
const HEADINGS = 72;
const STEP = 0.6;
const SUBSTEPS = 4;
const REVERSE_COST = 1.3;
const SWITCH_COST = 2.5;
const TURN_WEIGHT = 3;
const GREED = 4;
const HITCHES = 16;

// Coarser than a hitch's: a bend that keeps changing as it rolls would otherwise split the closed set too finely.
const BEND_BIN = Math.PI / 8;

const hitch_bin = (angle: number) => Math.round((angle / Math.PI) * HITCHES) + HITCHES;

// One hinge keeps the closed set's number; a chain's further hinges would overflow a safe integer, so it goes by string.
// A frame steer has no hitch, so its joint's bend, part of its shape, takes that slot. A hinge bins around its rest angle.
function cell_key(pose: Placement, direction: number, bends: boolean, spec: VehicleSpec): number | string {
  const ix = Math.round(pose.x / CELL) + 4096;
  const iy = Math.round(pose.y / CELL) + 4096;
  const turn = ((Math.round((pose.heading / (2 * Math.PI)) * HEADINGS) % HEADINGS) + HEADINGS) % HEADINGS;
  const angles = folds(pose, spec);
  const hitch = bends ? Math.round((pose.steer ?? 0) / BEND_BIN) + HITCHES : hitch_bin(angles[0] ?? 0);
  const key = (((ix * 8192 + iy) * HEADINGS + turn) * (HITCHES * 2 + 1) + hitch) * 2 + (direction > 0 ? 1 : 0);
  return angles.length > 1 ? `${key}:${angles.slice(1).map(hitch_bin).join(",")}` : key;
}

export function drive(from: Placement, move: Move, spec: VehicleSpec, portals: readonly Portal[] = []): Placement {
  return through(travel(from, move.steer, move.distance, spec, move.crab), Math.sign(move.distance), portals);
}

// A skid steer's half lock already turns about the inner track, so its finer shares do the gentle curves.
const SKID_STEERING = [-1, -0.5, -0.25, -0.1, 0, 0.1, 0.25, 0.5, 1];
const CRABBING = [-1, -0.5, 0.5, 1];

/**
 * Hybrid A*: poses stay exact, only the closed set is a coarse grid of position, heading, hitch angle and direction.
 * Every node is a placement the moves really reach from `from`, the trailer's angle integrated along, so a path found
 * is one a driver can drive, unstable reversing included.
 */
export function plan(from: Placement, to: Placement, near: Obstacles, options: PlanOptions = {}): PlanResult | null {
  const spec = options.spec ?? HATCHBACK;
  const margin = options.margin ?? 0.05;
  const body = inflate(spec, margin);
  const reach = options.reach ?? 1.5;
  const tolerance = options.heading_tolerance ?? Math.PI / 6;
  const limit = options.max_expansions ?? 200_000;
  const lock = max_steer(spec);
  const bends = spec.drive.kind === DriveKind.FRAME;
  const steering = options.steering ?? (spec.drive.kind === DriveKind.SKID ? SKID_STEERING : [-1, -0.5, 0, 0.5, 1]);
  const primitives: Omit<Move, "distance">[] = steering.map((share) => ({ steer: lock * share }));
  if (can_crab(spec)) primitives.push(...(options.crabbing ?? CRABBING).map((share) => ({ steer: lock * share, crab: true })));
  const switch_cost = options.switch_cost ?? SWITCH_COST;
  const portals = options.portals ?? [];
  const distance = (pose: Placement) => Math.hypot(pose.x - to.x, pose.y - to.y);
  const turn_weight = tolerance < Math.PI ? TURN_WEIGHT : 0;
  const settled = rest_trailers(to.heading, spec);
  const folded = (pose: Placement) =>
    pose.trailers ? pose.trailers.reduce((sum, trailer, i) => sum + angle_between(trailer.heading, settled[i].heading), 0) : 0;
  const heuristic = (pose: Placement) =>
    distance(pose) + turn_weight * (angle_between(pose.heading, to.heading) + folded(pose));
  const arrived =
    options.arrive ??
    ((pose: Placement) => distance(pose) <= reach && angle_between(pose.heading, to.heading) <= tolerance);
  const blocked = options.blocked ?? ((pose: Placement) => jackknifed(pose, spec) || collide(pose, near, body) !== null);

  if (blocked(from)) return null;
  const open = new Heap();
  const closed = new Set<number | string>();
  open.push({ pose: from, cost: 0, score: heuristic(from), direction: 0, reversals: 0, move: null, parent: null });
  let expansions = 0;
  while (open.size > 0 && expansions < limit) {
    const node = open.pop()!;
    const key = cell_key(node.pose, node.direction, bends, spec);
    if (closed.has(key)) continue;
    closed.add(key);
    expansions++;
    if (arrived(node.pose)) {
      const path: Placement[] = [];
      const moves: Move[] = [];
      for (let at: Node | null = node; at; at = at.parent) {
        path.push(at.pose);
        if (at.move) moves.push(at.move);
      }
      return { path: path.reverse(), moves: moves.reverse(), reversals: node.reversals, expansions };
    }
    for (const direction of options.directions ?? [1, -1]) {
      for (const primitive of primitives) {
        // A move that runs into something stops short, the way a driver creeps up to a bumper in a tight spot.
        let pose = node.pose;
        let travelled = 0;
        for (let i = 0; i < SUBSTEPS; i++) {
          const next = drive(pose, { ...primitive, distance: (direction * STEP) / SUBSTEPS }, spec, portals);
          if (blocked(next)) break;
          pose = next;
          travelled += STEP / SUBSTEPS;
        }
        if (travelled === 0 || closed.has(cell_key(pose, direction, bends, spec))) continue;
        const switched = node.direction !== 0 && node.direction !== direction;
        const cost = node.cost + travelled * (direction < 0 ? REVERSE_COST : 1) + (switched ? switch_cost : 0);
        open.push({
          pose,
          cost,
          score: cost + heuristic(pose) * GREED,
          direction,
          reversals: node.reversals + (switched ? 1 : 0),
          move: { ...primitive, distance: direction * travelled },
          parent: node,
        });
      }
    }
  }
  return null;
}
