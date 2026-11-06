import { overlaps } from "$kit/games/play2d/collision";
import { angle_between, bounds_of, bounds_overlap, oriented_box, wrap_angle, type Bounds, type Pose } from "$kit/games/play2d/geometry";
import type { Solid } from "./world";

export interface PlanOptions {
  /** The tightest turn the path may take, metres. */
  radius: number;
  length: number;
  beam: number;
  /** Clearance round the hull. */
  margin: number;
  /** Arrival: within `reach` metres and `tolerance` radians of the goal. */
  reach?: number;
  tolerance?: number;
  max_expansions?: number;
}

interface Node {
  pose: Pose;
  cost: number;
  score: number;
  parent: Node | null;
}

const HEADINGS = 72;
const STEERS = [-1, -0.5, 0, 0.5, 1];

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

  pop(): Node {
    const items = this.items;
    const top = items[0];
    const last = items.pop()!;
    if (items.length > 0) {
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
    }
    return top;
  }
}

/** Whether a hull-sized box, grown by the margin, fits at `pose` clear of every solid and inside the water. */
export function clear_at(pose: Pose, solids: readonly Solid[], water: Bounds, options: Pick<PlanOptions, "length" | "beam" | "margin">): boolean {
  const body = oriented_box(pose.x, pose.y, pose.heading, options.length + options.margin * 2, options.beam + options.margin * 2);
  const box = bounds_of(body);
  if (box.x0 < water.x0 || box.y0 < water.y0 || box.x1 > water.x1 || box.y1 > water.y1) return false;
  for (const solid of solids) if (bounds_overlap(box, solid.box) && overlaps(body, solid.shape)) return false;
  return true;
}

/**
 * Hybrid A* over forward arcs no tighter than the boat's turning circle: the geometric half of a level's proof, and the
 * line the autopilot follows. Returns poses about a step apart, or null when no path fits.
 */
export function plan(from: Pose, to: Pose, solids: readonly Solid[], water: Bounds, options: PlanOptions): Pose[] | null {
  const step = Math.max(0.6, options.radius * 0.35);
  const cell = step * 0.7;
  const reach = options.reach ?? step;
  const tolerance = options.tolerance ?? (10 * Math.PI) / 180;
  const max = options.max_expansions ?? 40000;
  const key = (p: Pose) =>
    `${Math.round(p.x / cell)},${Math.round(p.y / cell)},${Math.round((wrap_angle(p.heading) / (2 * Math.PI)) * HEADINGS) % HEADINGS}`;
  const guess = (p: Pose) => Math.hypot(to.x - p.x, to.y - p.y) + angle_between(p.heading, to.heading) * options.radius * 0.5;
  const open = new Heap();
  const closed = new Set<string>();
  open.push({ pose: from, cost: 0, score: guess(from), parent: null });
  let expansions = 0;
  while (open.size > 0 && expansions < max) {
    const node = open.pop();
    const k = key(node.pose);
    if (closed.has(k)) continue;
    closed.add(k);
    expansions++;
    if (Math.hypot(to.x - node.pose.x, to.y - node.pose.y) <= reach && angle_between(node.pose.heading, to.heading) <= tolerance) {
      const path: Pose[] = [];
      for (let at: Node | null = node; at; at = at.parent) path.push(at.pose);
      return path.reverse();
    }
    for (const steer of STEERS) {
      const turn = (steer * step) / options.radius;
      const samples = 3;
      let pose = node.pose;
      let ok = true;
      for (let i = 1; i <= samples; i++) {
        const t = i / samples;
        const heading = node.pose.heading + turn * t;
        const mid = node.pose.heading + (turn * t) / 2;
        pose = { x: node.pose.x + Math.cos(mid) * step * t, y: node.pose.y + Math.sin(mid) * step * t, heading };
        if (!clear_at(pose, solids, water, options)) {
          ok = false;
          break;
        }
      }
      if (!ok || closed.has(key(pose))) continue;
      const cost = node.cost + step * (1 + Math.abs(steer) * 0.15);
      open.push({ pose, cost, score: cost + guess(pose), parent: node });
    }
  }
  return null;
}
