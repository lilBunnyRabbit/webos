import { collide, parked_in, type Obstacles } from "./game";
import { angle_between, centroid, type Pose } from "./geometry";
import { arc, HATCHBACK, max_steer, pose_from_centre, type VehicleSpec } from "./vehicle";
import type { Bay } from "./world";

function inflate(spec: VehicleSpec, margin: number): VehicleSpec {
  return { ...spec, length: spec.length + margin * 2, width: spec.width + margin * 2, rear_overhang: spec.rear_overhang + margin };
}

export interface PlanOptions {
  spec?: VehicleSpec;
  /** Extra clearance around the body, so a path the planner finds isn't one only a computer could drive. */
  margin?: number;
  max_expansions?: number;
  reach?: number;
  heading_tolerance?: number;
}

export interface PlanResult {
  path: Pose[];
  reversals: number;
  expansions: number;
}

interface Node {
  pose: Pose;
  cost: number;
  score: number;
  direction: number;
  reversals: number;
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
const GREED = 2.5;

function cell_key(pose: Pose, direction: number): number {
  const ix = Math.round(pose.x / CELL) + 4096;
  const iy = Math.round(pose.y / CELL) + 4096;
  const turn = ((Math.round((pose.heading / (2 * Math.PI)) * HEADINGS) % HEADINGS) + HEADINGS) % HEADINGS;
  return ((ix * 8192 + iy) * HEADINGS + turn) * 2 + (direction > 0 ? 1 : 0);
}

// Hybrid A*: poses stay exact, only the closed set is a coarse grid of position, heading and direction.
export function plan(from: Pose, to: Pose, near: Obstacles, options: PlanOptions = {}): PlanResult | null {
  const spec = options.spec ?? HATCHBACK;
  const margin = options.margin ?? 0.05;
  const body = inflate(spec, margin);
  const reach = options.reach ?? 1.5;
  const tolerance = options.heading_tolerance ?? Math.PI / 6;
  const limit = options.max_expansions ?? 200_000;
  const lock = max_steer(spec);
  const curvatures = [-1, -0.5, 0, 0.5, 1].map((share) => Math.tan(lock * share) / spec.wheelbase);
  const distance = (pose: Pose) => Math.hypot(pose.x - to.x, pose.y - to.y);
  const turn_weight = tolerance < Math.PI ? TURN_WEIGHT : 0;
  const heuristic = (pose: Pose) => distance(pose) + turn_weight * angle_between(pose.heading, to.heading);

  if (collide(from, near, body)) return null;
  const open = new Heap();
  const closed = new Set<number>();
  open.push({ pose: from, cost: 0, score: heuristic(from), direction: 0, reversals: 0, parent: null });
  let expansions = 0;
  while (open.size > 0 && expansions < limit) {
    const node = open.pop()!;
    const key = cell_key(node.pose, node.direction);
    if (closed.has(key)) continue;
    closed.add(key);
    expansions++;
    if (distance(node.pose) <= reach && angle_between(node.pose.heading, to.heading) <= tolerance) {
      const path: Pose[] = [];
      for (let at: Node | null = node; at; at = at.parent) path.push(at.pose);
      return { path: path.reverse(), reversals: node.reversals, expansions };
    }
    for (const direction of [1, -1]) {
      for (const curvature of curvatures) {
        // A move that runs into something stops short, the way a driver creeps up to a bumper in a tight spot.
        let pose = node.pose;
        let travelled = 0;
        for (let i = 0; i < SUBSTEPS; i++) {
          const next = arc(pose, curvature, (direction * STEP) / SUBSTEPS);
          if (collide(next, near, body)) break;
          pose = next;
          travelled += STEP / SUBSTEPS;
        }
        if (travelled === 0 || closed.has(cell_key(pose, direction))) continue;
        const switched = node.direction !== 0 && node.direction !== direction;
        const cost = node.cost + travelled * (direction < 0 ? REVERSE_COST : 1) + (switched ? SWITCH_COST : 0);
        open.push({
          pose,
          cost,
          score: cost + heuristic(pose) * GREED,
          direction,
          reversals: node.reversals + (switched ? 1 : 0),
          parent: node,
        });
      }
    }
  }
  return null;
}

export function parked_poses(bay: Bay, near: Obstacles, margin = 0.05, spec: VehicleSpec = HATCHBACK): Pose[] {
  const centre = centroid(bay.shape);
  const body = inflate(spec, margin);
  const headings = bay.either ? [bay.heading, bay.heading + Math.PI] : [bay.heading];
  const found: { pose: Pose; off: number }[] = [];
  for (const heading of headings) {
    const along = { x: Math.cos(heading), y: Math.sin(heading) };
    for (let a = -1.2; a <= 1.2 + 1e-9; a += 0.2) {
      for (let s = -0.4; s <= 0.4 + 1e-9; s += 0.1) {
        const at = { x: centre.x + along.x * a - along.y * s, y: centre.y + along.y * a + along.x * s, heading };
        const pose = pose_from_centre(at, spec);
        if (!parked_in(pose, bay, spec) || collide(pose, near, body)) continue;
        found.push({ pose, off: Math.abs(a) + Math.abs(s) * 2 });
      }
    }
  }
  return found.sort((p, q) => p.off - q.off).map((each) => each.pose);
}
