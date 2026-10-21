import { contains, Edge, type Point, type Rect } from "../geometry";

/** A chip out of one edge, in that edge's frame: `offset` along it from its start (left or top), `depth` inward. */
export interface Bite {
  edge: Edge;
  offset: number;
  depth: number;
  seed: number;
}

export interface DamageTarget {
  /** A window can be hidden for a while (minimized, popped out) and come back; a widget that's gone is gone. */
  window: boolean;
  bites: Bite[];
}

export type Damage = Map<string, DamageTarget>;

export interface Chip {
  edge: Edge;
  at: Point;
}

export const MAX_BITES = 64;
export const FRESH_DEPTH = 4;
const DIG = 2.5;
const MERGE = 4;
const STEER = 0.2;
const MAX_STEER = 3;
/** Hidden windows whose damage is kept for their return. Window ids are never reused, so a closed one only ages out. */
export const MAX_HIDDEN = 16;
const OUTLINE_STEPS = 8;

export function depth_cap(rect: Rect): number {
  return Math.min(Math.min(rect.width, rect.height) * 0.18, 60);
}

export function half_width(bite: Bite): number {
  return 4 + bite.depth * 0.75;
}

export function along(rect: Rect, edge: Edge, point: Point): number {
  return edge === Edge.TOP || edge === Edge.BOTTOM ? point.x - rect.x : point.y - rect.y;
}

export function inward(rect: Rect, edge: Edge, point: Point): number {
  switch (edge) {
    case Edge.TOP:
      return point.y - rect.y;
    case Edge.BOTTOM:
      return rect.y + rect.height - point.y;
    case Edge.LEFT:
      return point.x - rect.x;
    case Edge.RIGHT:
      return rect.x + rect.width - point.x;
  }
}

export function from_edge(rect: Rect, edge: Edge, u: number, v: number): Point {
  switch (edge) {
    case Edge.TOP:
      return { x: rect.x + u, y: rect.y + v };
    case Edge.BOTTOM:
      return { x: rect.x + u, y: rect.y + rect.height - v };
    case Edge.LEFT:
      return { x: rect.x + v, y: rect.y + u };
    case Edge.RIGHT:
      return { x: rect.x + rect.width - v, y: rect.y + u };
  }
}

/**
 * One hit on `rect`. Near an existing bite on the same edge it digs that bite deeper and steers it toward the cursor,
 * no deeper than the cursor sits (when it's inside) and the cap; elsewhere it opens a fresh shallow bite, unless the target is full.
 */
export function chip(bites: Bite[], hit: Chip, rect: Rect, pointer: Point | null, seed: number): Bite[] {
  const offset = along(rect, hit.edge, hit.at);
  const cap = depth_cap(rect);
  const inside = pointer !== null && contains(rect, pointer);
  const reach = inside ? Math.min(cap, Math.max(FRESH_DEPTH, inward(rect, hit.edge, pointer))) : cap;

  let nearest = -1;
  let distance = Infinity;
  bites.forEach((bite, index) => {
    if (bite.edge !== hit.edge) return;
    const gap = Math.abs(bite.offset - offset);
    if (gap <= half_width(bite) + MERGE && gap < distance) {
      nearest = index;
      distance = gap;
    }
  });

  if (nearest >= 0) {
    const bite = bites[nearest];
    const depth = bite.depth >= reach ? bite.depth : Math.min(reach, bite.depth + DIG);
    const target = inside ? along(rect, hit.edge, pointer) : bite.offset;
    const steer = Math.max(-MAX_STEER, Math.min(MAX_STEER, (target - bite.offset) * STEER));
    const next = bites.slice();
    next[nearest] = { ...bite, depth, offset: bite.offset + steer };
    return next;
  }
  if (bites.length >= MAX_BITES) return bites;
  return [...bites, { edge: hit.edge, offset, depth: Math.min(FRESH_DEPTH, cap), seed }];
}

/**
 * Drops what can't come back: widgets no longer on the desktop, and the oldest hidden windows past `MAX_HIDDEN`.
 * Returns whether anything was dropped.
 */
export function prune(damage: Damage, present: ReadonlySet<string>): boolean {
  let changed = false;
  let hidden = 0;
  for (const id of [...damage.keys()].reverse()) {
    if (present.has(id)) continue;
    const target = damage.get(id);
    if (target?.window && ++hidden <= MAX_HIDDEN) continue;
    damage.delete(id);
    changed = true;
  }
  return changed;
}

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The bite's jagged outline in page coordinates, starting and ending just outside the edge so the clip trims it flush.
 * The seed fixes the jags, so a bite keeps its shape as it deepens.
 */
export function bite_outline(bite: Bite, rect: Rect): Point[] {
  const rand = random(bite.seed);
  const half = half_width(bite);
  const points = [from_edge(rect, bite.edge, bite.offset - half, -2)];
  for (let step = 0; step <= OUTLINE_STEPS; step++) {
    const t = step / OUTLINE_STEPS;
    const jag = 0.6 + rand() * 0.55;
    const nudge = (rand() - 0.5) * half * 0.25;
    const end = step === 0 || step === OUTLINE_STEPS;
    const u = bite.offset - half + 2 * half * t + (end ? 0 : nudge);
    const v = end ? 0 : bite.depth * Math.sin(Math.PI * t) ** 0.6 * jag;
    points.push(from_edge(rect, bite.edge, u, v));
  }
  points.push(from_edge(rect, bite.edge, bite.offset + half, -2));
  return points;
}

type Listener = () => void;

const damage: Damage = new Map();
const repaired = new Set<Listener>();

/** Only the overlay chips and prunes, inside its own frame; a repair comes from Settings, so that's the one change it hears about. */
export const damage_store = {
  damage: damage as ReadonlyMap<string, DamageTarget>,
  chip(id: string, window: boolean, hit: Chip, rect: Rect, pointer: Point | null): void {
    const target = damage.get(id);
    const bites = chip(target?.bites ?? [], hit, rect, pointer, Math.floor(Math.random() * 2 ** 32));
    if (target && bites === target.bites) return;
    damage.delete(id);
    damage.set(id, { window, bites });
  },
  prune(present: ReadonlySet<string>): void {
    prune(damage, present);
  },
  clear(): void {
    damage.clear();
    for (const listener of repaired) listener();
  },
  on_repair(listener: Listener): () => void {
    repaired.add(listener);
    return () => repaired.delete(listener);
  },
};
