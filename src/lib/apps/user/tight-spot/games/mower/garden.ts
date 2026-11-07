import { create_rng, type Rng } from "$lib/core/utils/random";
import { inside_convex, overlaps } from "$kit/games/play2d/collision";
import { bounds_of, lerp, rect, type Bounds, type Polygon, type Pose, type Vec } from "$kit/games/play2d/geometry";
import { SolidKind, type Solid } from "../../core/scene";
import { hash } from "$kit/games/play2d/seed";

const HEDGE = 0.7;
const NORTH = -Math.PI / 2;
const PATIO_WIDTH = 3.6;
const PATIO_DEPTH = 4.4;
const SHED = { width: 2.4, depth: 2 };
const YARD = { width: 6.5, depth: 10.5, run_out: 4, barn: { width: 5, depth: 3 }, start: 3.8 };

export interface Tree {
  at: Vec;
  trunk: number;
  crown: number;
}

export interface Pond {
  at: Vec;
  rx: number;
  ry: number;
  shape: Polygon;
}

export interface Bank {
  shape: Polygon;
  fall: number;
}

export const BankKind = { STRAIGHT: "straight", DIAGONAL: "diagonal" } as const;
export type BankKind = (typeof BankKind)[keyof typeof BankKind];

/** What a level adds to the plain garden. Absent, the garden is the one it always was. */
export interface Grounds {
  field?: boolean;
  bank?: BankKind;
}

export interface Garden {
  width: number;
  height: number;
  bounds: Bounds;
  /** The lawn as convex pieces: the garden less the patio corner. */
  lawn: Polygon[];
  patio: Polygon;
  shed: Polygon;
  door: Vec;
  beds: Polygon[];
  trees: Tree[];
  pond: Pond | null;
  hedges: Polygon[];
  banks: Bank[];
  solids: Solid[];
  start: Pose;
}

export interface Layout {
  width: number;
  height: number;
  gap: number;
  islands: number;
  borders: number;
  trees: number;
  pond: boolean;
}

export function layout(seed: number, difficulty: number): Layout {
  const rng = create_rng(hash(seed, 1));
  const d = Math.max(0, Math.min(1, difficulty));
  return {
    width: Math.round(lerp(11, 18, d) + rng() * 3),
    height: Math.round(lerp(9, 13, d) + rng() * 2),
    gap: lerp(3, 2, d),
    islands: Math.floor(lerp(0, 2.6, d * rng() + d * 0.5)),
    borders: 1 + Math.floor(rng() * 2),
    trees: 1 + Math.floor(lerp(0, 2.9, d) * (0.5 + rng() * 0.5)),
    pond: d > 0.25 && rng() < lerp(0.4, 0.9, d),
  };
}

export function field_layout(seed: number, difficulty: number): Layout {
  const rng = create_rng(hash(seed, 1));
  const d = Math.max(0, Math.min(1, difficulty));
  return {
    width: Math.round(lerp(24, 30, d) + rng() * 4),
    height: Math.round(lerp(20, 24, d) + rng() * 3),
    gap: lerp(5.5, 4.5, d),
    islands: Math.floor(lerp(0, 2.4, d * rng() + d * 0.5)),
    borders: 1 + Math.floor(rng() * 2),
    trees: 1 + Math.floor(lerp(0, 2.9, d) * (0.5 + rng() * 0.5)),
    pond: d > 0.25 && rng() < lerp(0.4, 0.9, d),
  };
}

function clip(shape: Polygon, normal: Vec, limit: number): Vec[] {
  const out: Vec[] = [];
  const side = (p: Vec) => normal.x * p.x + normal.y * p.y - limit;
  for (let i = 0; i < shape.length; i++) {
    const a = shape[i];
    const b = shape[(i + 1) % shape.length];
    const sa = side(a);
    const sb = side(b);
    if (sa <= 0) out.push(a);
    if (sa < 0 !== sb < 0 && sa !== 0 && sb !== 0) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

// `room` of flat lawn on both sides, so a rig can turn to line up before it crosses.
function place_bank(rng: Rng, kind: BankKind, W: number, H: number, room: number, field: boolean, keep: Bounds): Bank | null {
  const ground = rect(0, 0, W, H);
  const free = rect(keep.x0, keep.y0, keep.x1, keep.y1);
  for (let attempt = 0; attempt < 80; attempt++) {
    const depth = field ? between(rng, 5, 6) : between(rng, 2.6, 3.4);
    const square = rng() < 0.5 ? 0 : Math.PI / 2;
    const turn = kind === BankKind.STRAIGHT ? square : square + (rng() < 0.5 ? -1 : 1) * between(rng, 0.5, 0.8);
    const normal = { x: -Math.sin(turn), y: Math.cos(turn) };
    const middle = { x: between(rng, W * 0.3, W * 0.7), y: between(rng, H * 0.25, H * 0.65) };
    const offset = normal.x * middle.x + normal.y * middle.y;
    const reach = ground.map((p) => normal.x * p.x + normal.y * p.y);
    if (offset - depth / 2 - Math.min(...reach) < room || Math.max(...reach) - offset - depth / 2 < room) continue;
    const shape = clip(clip(ground, normal, offset + depth / 2), { x: -normal.x, y: -normal.y }, depth / 2 - offset);
    if (shape.length < 3 || overlaps(shape, free)) continue;
    return { shape, fall: turn + (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) };
  }
  return null;
}

function polygon_of(at: Vec, rx: number, ry: number, sides: number, turn = 0): Vec[] {
  return Array.from({ length: sides }, (_, i) => {
    const angle = turn + (i / sides) * Math.PI * 2;
    return { x: at.x + Math.cos(angle) * rx, y: at.y + Math.sin(angle) * ry };
  });
}

function grown(shape: Polygon, by: number): Bounds {
  const box = bounds_of(shape);
  return { x0: box.x0 - by, y0: box.y0 - by, x1: box.x1 + by, y1: box.y1 + by };
}

function apart(a: Bounds, b: Bounds): boolean {
  return a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0;
}

function between(rng: Rng, lo: number, hi: number): number {
  return lo + rng() * (hi - lo);
}

/**
 * A walled garden of hedges, pure from its seed: a lawn with the patio and shed in one south corner, where the mower
 * starts facing the lawn; flower beds along the hedges and as islands, trees and maybe a pond, each kept `gap` from
 * the others and from the hedges (border beds sit against them), so the mower can pass every one.
 */
export function build_garden(seed: number, difficulty: number, grounds: Grounds = {}): Garden {
  const field = grounds.field === true;
  const plan = field ? field_layout(seed, difficulty) : layout(seed, difficulty);
  const rng = create_rng(hash(seed, 2));
  const W = plan.width;
  const H = plan.height;
  const west = rng() < 0.5;
  const patio_width = field ? YARD.width : PATIO_WIDTH;
  const patio_depth = field ? YARD.depth : PATIO_DEPTH;
  const shed_size = field ? YARD.barn : SHED;
  const px0 = west ? 0 : W - patio_width;
  const px1 = px0 + patio_width;
  const patio = rect(px0, H - patio_depth, px1, H);
  const lawn = west ? [rect(px1, 0, W, H), rect(0, 0, px1, H - patio_depth)] : [rect(0, 0, px0, H), rect(px0, 0, W, H - patio_depth)];
  const sx0 = west ? 0 : W - shed_size.width;
  const shed = rect(sx0, H - shed_size.depth, sx0 + shed_size.width, H);
  const door = { x: sx0 + shed_size.width / 2, y: H - shed_size.depth };
  const start = { x: door.x, y: field ? door.y - YARD.start : door.y - 0.2 - 0.45, heading: NORTH };

  const hedges = [rect(-HEDGE, -HEDGE, W + HEDGE, 0), rect(-HEDGE, H, W + HEDGE, H + HEDGE), rect(-HEDGE, 0, 0, H), rect(W, 0, W + HEDGE, H)];
  // The patio and a run-out ahead of it stay clear, so the mower can leave the shed and turn onto the lawn.
  const taken: Bounds[] = [{ x0: px0 - 0.6, y0: H - patio_depth - (field ? YARD.run_out : 2.4), x1: px1 + 0.6, y1: H }];
  const gap = plan.gap;
  const inner = { x0: gap, y0: gap, x1: W - gap, y1: H - gap };
  const banks: Bank[] = [];
  if (grounds.bank) {
    const bank = place_bank(create_rng(hash(seed, 3)), grounds.bank, W, H, field ? 8 : 3, field, taken[0]);
    if (bank) banks.push(bank);
  }
  const off_banks = (box: Bounds) => banks.every((bank) => !overlaps(rect(box.x0, box.y0, box.x1, box.y1), bank.shape));

  const beds: Polygon[] = [];
  const sides = west ? (["north", "east", "south"] as const) : (["north", "west", "south"] as const);
  for (let i = 0; i < plan.borders; i++) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const side = sides[Math.floor(rng() * sides.length)];
      const depth = between(rng, 0.9, 1.3);
      const length = between(rng, 3, Math.min(6.5, (side === "north" || side === "south" ? W : H) * 0.45));
      let shape: Polygon;
      if (side === "north" || side === "south") {
        const x = between(rng, 0, W - length);
        shape = side === "north" ? rect(x, 0, x + length, depth) : rect(x, H - depth, x + length, H);
      } else {
        const y = between(rng, 0, H - patio_depth - length);
        shape = side === "east" ? rect(W - depth, y, W, y + length) : rect(0, y, depth, y + length);
      }
      const box = grown(shape, gap - 0.05);
      if (!taken.every((other) => apart(box, other)) || !off_banks(box)) continue;
      beds.push(shape);
      taken.push(bounds_of(shape));
      break;
    }
  }

  const place = (radius_x: number, radius_y: number): Vec | null => {
    for (let attempt = 0; attempt < 60; attempt++) {
      const at = { x: between(rng, inner.x0 + radius_x, inner.x1 - radius_x), y: between(rng, inner.y0 + radius_y, inner.y1 - radius_y) };
      if (inner.x1 - radius_x <= inner.x0 + radius_x || inner.y1 - radius_y <= inner.y0 + radius_y) return null;
      const box = { x0: at.x - radius_x - gap, y0: at.y - radius_y - gap, x1: at.x + radius_x + gap, y1: at.y + radius_y + gap };
      if (!taken.every((other) => apart(box, other)) || !off_banks(box)) continue;
      taken.push({ x0: at.x - radius_x, y0: at.y - radius_y, x1: at.x + radius_x, y1: at.y + radius_y });
      return at;
    }
    return null;
  };

  let pond: Pond | null = null;
  if (plan.pond) {
    const rx = between(rng, 1.4, 2.4);
    const ry = between(rng, 1, 1.7);
    const at = place(rx, ry);
    if (at) pond = { at, rx, ry, shape: polygon_of(at, rx, ry, 16) };
  }
  for (let i = 0; i < plan.islands; i++) {
    const round = rng() < 0.5;
    const rx = round ? between(rng, 0.8, 1.2) : between(rng, 1, 1.6);
    const ry = round ? rx : between(rng, 0.6, 0.9);
    const at = place(rx, ry);
    if (!at) continue;
    beds.push(round ? polygon_of(at, rx, ry, 10) : rect(at.x - rx, at.y - ry, at.x + rx, at.y + ry));
  }
  const trees: Tree[] = [];
  for (let i = 0; i < plan.trees; i++) {
    const trunk = between(rng, 0.25, 0.4);
    const at = place(trunk, trunk);
    if (at) trees.push({ at, trunk, crown: between(rng, 1.5, 2.3) });
  }

  const solids: Solid[] = [
    ...hedges.map((shape) => ({ kind: SolidKind.HEDGE, shape })),
    { kind: SolidKind.WALL, shape: shed },
    ...trees.map((tree) => ({ kind: SolidKind.POST, shape: polygon_of(tree.at, tree.trunk, tree.trunk, 12) })),
    ...(pond ? [{ kind: SolidKind.WATER, shape: pond.shape }] : []),
  ];
  return {
    width: W,
    height: H,
    bounds: { x0: -HEDGE, y0: -HEDGE, x1: W + HEDGE, y1: H + HEDGE },
    lawn,
    patio,
    shed,
    door,
    beds,
    trees,
    pond,
    hedges,
    banks,
    solids,
    start,
  };
}

export function bank_at(garden: Pick<Garden, "banks">, at: Vec): Bank | null {
  return garden.banks.find((bank) => inside_convex(at, bank.shape)) ?? null;
}

export function on_bed(shape: Polygon, garden: Pick<Garden, "beds">): boolean {
  return garden.beds.some((bed) => overlaps(shape, bed));
}
