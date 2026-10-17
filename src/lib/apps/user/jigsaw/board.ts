import { create_rng, shuffle } from "$lib/core/utils/random";
import { z } from "zod";
import { home, is_edge_piece, PIECE_COUNTS, type Layout } from "./cuts";

/** Aligned within this many world units counts as joined; saved positions are rounded to tenths. */
const ALIGNED = 0.5;

export class UnionFind {
  private readonly parent: Int32Array;
  private readonly sizes: Int32Array;

  constructor(count: number) {
    this.parent = Int32Array.from({ length: count }, (_, i) => i);
    this.sizes = new Int32Array(count).fill(1);
  }

  find(item: number): number {
    let root = item;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[item] !== root) {
      const next = this.parent[item];
      this.parent[item] = root;
      item = next;
    }
    return root;
  }

  union(a: number, b: number): boolean {
    let ra = this.find(a);
    let rb = this.find(b);
    if (ra === rb) return false;
    if (this.sizes[ra] < this.sizes[rb]) [ra, rb] = [rb, ra];
    this.parent[rb] = ra;
    this.sizes[ra] += this.sizes[rb];
    return true;
  }

  size(item: number): number {
    return this.sizes[this.find(item)];
  }
}

export interface Board {
  layout: Layout;
  x: Float64Array;
  y: Float64Array;
  sets: UnionFind;
  order: number[];
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function create_board(layout: Layout, positions: ArrayLike<number>): Board {
  const count = layout.cols * layout.rows;
  const x = new Float64Array(count);
  const y = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    x[i] = positions[i * 2];
    y[i] = positions[i * 2 + 1];
  }
  const board = { layout, x, y, sets: new UnionFind(count), order: Array.from({ length: count }, (_, i) => i) };
  regroup(board);
  return board;
}

export function piece_total(layout: Layout): number {
  return layout.cols * layout.rows;
}

export function neighbours(layout: Layout, piece: number): number[] {
  const col = piece % layout.cols;
  const row = Math.floor(piece / layout.cols);
  const list: number[] = [];
  if (row > 0) list.push(piece - layout.cols);
  if (col < layout.cols - 1) list.push(piece + 1);
  if (row < layout.rows - 1) list.push(piece + layout.cols);
  if (col > 0) list.push(piece - 1);
  return list;
}

function misfit(board: Board, piece: number, other: number): { dx: number; dy: number } {
  const a = home(board.layout, piece);
  const b = home(board.layout, other);
  return {
    dx: board.x[other] - board.x[piece] - (b.x - a.x),
    dy: board.y[other] - board.y[piece] - (b.y - a.y),
  };
}

/** Joins every pair of neighbours that already sit exactly together, so a restored board needs no group list. */
export function regroup(board: Board): void {
  const { layout } = board;
  for (let piece = 0; piece < piece_total(layout); piece++) {
    for (const other of neighbours(layout, piece)) {
      if (other < piece) continue;
      const { dx, dy } = misfit(board, piece, other);
      if (Math.hypot(dx, dy) < ALIGNED) board.sets.union(piece, other);
    }
  }
}

export function members(board: Board, piece: number): number[] {
  const root = board.sets.find(piece);
  const list: number[] = [];
  for (let i = 0; i < board.x.length; i++) if (board.sets.find(i) === root) list.push(i);
  return list;
}

export function move_group(board: Board, group: number[], dx: number, dy: number): void {
  for (const piece of group) {
    board.x[piece] += dx;
    board.y[piece] += dy;
  }
}

export function raise(board: Board, group: number[]): void {
  const lifted = new Set(group);
  board.order = [...board.order.filter((piece) => !lifted.has(piece)), ...board.order.filter((piece) => lifted.has(piece))];
}

/** Placed groups are locked: a piece at its place never needs to move again. */
export function is_placed(board: Board, piece: number): boolean {
  const target = home(board.layout, piece);
  return Math.hypot(board.x[piece] - target.x, board.y[piece] - target.y) < ALIGNED;
}

export interface DropResult {
  joined: boolean;
  placed: boolean;
}

export function drop(board: Board, piece: number, tolerance: number): DropResult {
  const group = members(board, piece);
  const root = board.sets.find(piece);
  let best: { dx: number; dy: number; distance: number } | null = null;
  for (const member of group) {
    for (const other of neighbours(board.layout, member)) {
      if (board.sets.find(other) === root) continue;
      const { dx, dy } = misfit(board, member, other);
      const distance = Math.hypot(dx, dy);
      if (distance < tolerance && (!best || distance < best.distance)) best = { dx, dy, distance };
    }
  }

  if (best) move_group(board, group, best.dx, best.dy);
  else {
    const target = home(board.layout, piece);
    const dx = target.x - board.x[piece];
    const dy = target.y - board.y[piece];
    if (Math.hypot(dx, dy) < tolerance) move_group(board, group, dx, dy);
  }

  let joined = false;
  for (const member of group) {
    for (const other of neighbours(board.layout, member)) {
      if (board.sets.find(other) === board.sets.find(member)) continue;
      const { dx, dy } = misfit(board, member, other);
      const distance = Math.hypot(dx, dy);
      if (distance >= tolerance) continue;
      if (distance >= ALIGNED) {
        // Pull a loose group the last bit into line, but never drag a placed one off its place.
        if (is_placed(board, other)) continue;
        move_group(board, members(board, other), -dx, -dy);
      }
      board.sets.union(member, other);
      joined = true;
    }
  }
  return { joined, placed: is_placed(board, piece) };
}

export function is_complete(board: Board): boolean {
  return board.sets.size(0) === piece_total(board.layout);
}

export function settle(board: Board): void {
  for (let piece = 0; piece < board.x.length; piece++) {
    const target = home(board.layout, piece);
    board.x[piece] = target.x;
    board.y[piece] = target.y;
  }
}

export function placed_count(board: Board): number {
  let count = 0;
  for (let piece = 0; piece < board.x.length; piece++) if (is_placed(board, piece)) count++;
  return count;
}

export function group_count(board: Board): number {
  const roots = new Set<number>();
  for (let piece = 0; piece < board.x.length; piece++) roots.add(board.sets.find(piece));
  return roots.size;
}

export function inner_groups(board: Board): Set<number> {
  const with_edge = new Set<number>();
  for (let piece = 0; piece < board.x.length; piece++)
    if (is_edge_piece(board.layout, piece)) with_edge.add(board.sets.find(piece));
  const hidden = new Set<number>();
  for (let piece = 0; piece < board.x.length; piece++) {
    const root = board.sets.find(piece);
    if (!with_edge.has(root)) hidden.add(root);
  }
  return hidden;
}

export function table_for(layout: Layout, aspect: number): { table: Rect; slot: number } {
  const slot = Math.max(layout.piece_width, layout.piece_height) * 1.45;
  const count = piece_total(layout);
  for (let ring = 1; ; ring++) {
    let mx = ring * slot;
    let my = ring * slot;
    const width = layout.width + mx * 2;
    const height = layout.height + my * 2;
    if (width / height < aspect) mx += (height * aspect - width) / 2;
    else my += (width / aspect - height) / 2;
    const table = { x: -mx, y: -my, width: layout.width + mx * 2, height: layout.height + my * 2 };
    if (slots(table, layout, slot).length >= count) return { table, slot };
  }
}

function slots(table: Rect, layout: Layout, slot: number): { x: number; y: number }[] {
  const cols = Math.floor(table.width / slot);
  const rows = Math.floor(table.height / slot);
  const gap_x = (table.width - cols * slot) / 2;
  const gap_y = (table.height - rows * slot) / 2;
  const list: { x: number; y: number }[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = table.x + gap_x + (col + 0.5) * slot;
      const y = table.y + gap_y + (row + 0.5) * slot;
      const clear = slot * 0.6;
      const over_frame = x > -clear && x < layout.width + clear && y > -clear && y < layout.height + clear;
      if (!over_frame) list.push({ x, y });
    }
  }
  return list;
}

export function scatter(layout: Layout, seed: number, aspect: number): number[] {
  const rng = create_rng(seed ^ 0x5bd1e995);
  const { table, slot } = table_for(layout, aspect);
  const free = shuffle(slots(table, layout, slot), rng);
  const positions: number[] = [];
  for (let piece = 0; piece < piece_total(layout); piece++) {
    const spot = free[piece];
    const jitter = () => (rng() * 2 - 1) * slot * 0.12;
    positions.push(
      Math.round((spot.x - layout.piece_width / 2 + jitter()) * 10) / 10,
      Math.round((spot.y - layout.piece_height / 2 + jitter()) * 10) / 10
    );
  }
  return positions;
}

export function positions_of(board: Board): number[] {
  const list: number[] = [];
  for (let piece = 0; piece < board.x.length; piece++)
    list.push(Math.round(board.x[piece] * 10) / 10, Math.round(board.y[piece] * 10) / 10);
  return list;
}

export function bounds(board: Board, margin: number): Rect {
  let min_x = 0;
  let min_y = 0;
  let max_x = board.layout.width;
  let max_y = board.layout.height;
  for (let piece = 0; piece < board.x.length; piece++) {
    min_x = Math.min(min_x, board.x[piece] - margin);
    min_y = Math.min(min_y, board.y[piece] - margin);
    max_x = Math.max(max_x, board.x[piece] + board.layout.piece_width + margin);
    max_y = Math.max(max_y, board.y[piece] + board.layout.piece_height + margin);
  }
  return { x: min_x, y: min_y, width: max_x - min_x, height: max_y - min_y };
}

export const saved_schema = z.object({
  path: z.string(),
  pieces: z.literal(PIECE_COUNTS),
  seed: z.number().int(),
  width: z.number(),
  height: z.number(),
  positions: z.array(z.number()),
  elapsed: z.number(),
});
export type Saved = z.infer<typeof saved_schema>;

export const pieces_schema = z.literal(PIECE_COUNTS);

export function fits(saved: Saved, layout: Layout): boolean {
  return saved.width === layout.width && saved.height === layout.height && saved.positions.length === piece_total(layout) * 2;
}
