import { create_rng, type Rng } from "$lib/core/utils/random";

export const PIECE_COUNTS = [24, 48, 100, 200] as const;
export type PieceCount = (typeof PIECE_COUNTS)[number];

const PIECE_AREA_PX = 44 * 44;

export const TAB_REACH = 0.4;

export interface Layout {
  cols: number;
  rows: number;
  width: number;
  height: number;
  piece_width: number;
  piece_height: number;
}

export interface Edge {
  flip: 1 | -1;
  t: number;
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
}

export interface Cuts {
  layout: Layout;
  /** `horizontal[r][c]`: the cut above row `r + 1` in column `c`. */
  horizontal: Edge[][];
  /** `vertical[r][c]`: the cut left of column `c + 1` in row `r`. */
  vertical: Edge[][];
}

export interface Point {
  x: number;
  y: number;
}

export function piece_counts(width: number, height: number): PieceCount[] {
  const room = (width * height) / PIECE_AREA_PX;
  const fitting = PIECE_COUNTS.filter((count) => count <= room);
  return fitting.length ? fitting : [PIECE_COUNTS[0]];
}

export function grid_for(count: number, width: number, height: number): Layout {
  const cols = Math.max(2, Math.round(Math.sqrt((count * width) / height)));
  const rows = Math.max(2, Math.round(count / cols));
  return { cols, rows, width, height, piece_width: width / cols, piece_height: height / rows };
}

function edge(rng: Rng): Edge {
  const jitter = () => (rng() * 2 - 1) * 0.04;
  return {
    flip: rng() < 0.5 ? 1 : -1,
    t: 0.09 + rng() * 0.02,
    a: jitter(),
    b: jitter(),
    c: jitter(),
    d: jitter(),
    e: jitter(),
  };
}

export function cut(layout: Layout, seed: number): Cuts {
  const rng = create_rng(seed);
  const horizontal = Array.from({ length: layout.rows - 1 }, () => Array.from({ length: layout.cols }, () => edge(rng)));
  const vertical = Array.from({ length: layout.rows }, () => Array.from({ length: layout.cols - 1 }, () => edge(rng)));
  return { layout, horizontal, vertical };
}

/** Both neighbours trace these same points (one of them reversed), so their outlines meet exactly. */
export function tab_points(edge: Edge, from: Point, to: Point): Point[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const nx = -dy * edge.flip;
  const ny = dx * edge.flip;
  const { t, a, b, c, d, e } = edge;
  const at = (u: number, v: number) => ({ x: from.x + u * dx + v * nx, y: from.y + u * dy + v * ny });
  return [
    at(0, 0),
    at(0.2, a),
    at(0.5 + b + d, -t + c),
    at(0.5 - t + b, t + c),
    at(0.5 - 2 * t + b - d, 3 * t + c),
    at(0.5 + 2 * t + b - d, 3 * t + c),
    at(0.5 + t + b, t + c),
    at(0.5 + b + d, -t + c),
    at(0.8, e),
    at(1, 0),
  ];
}

const round = (value: number) => Math.round(value * 100) / 100;
const pair = (point: Point, ox: number, oy: number) => `${round(point.x - ox)} ${round(point.y - oy)}`;

function curves(points: Point[], ox: number, oy: number): string {
  let path = "";
  for (let i = 1; i < points.length; i += 3)
    path += ` C${pair(points[i], ox, oy)} ${pair(points[i + 1], ox, oy)} ${pair(points[i + 2], ox, oy)}`;
  return path;
}

export function home(layout: Layout, piece: number): Point {
  return { x: (piece % layout.cols) * layout.piece_width, y: Math.floor(piece / layout.cols) * layout.piece_height };
}

export function piece_path(cuts: Cuts, piece: number): string {
  const { layout } = cuts;
  const col = piece % layout.cols;
  const row = Math.floor(piece / layout.cols);
  const { piece_width: w, piece_height: h } = layout;
  const ox = col * w;
  const oy = row * h;
  const corner = (x: number, y: number): Point => ({ x: x * w, y: y * h });

  let path = "M0 0";
  path +=
    row === 0
      ? ` L${round(w)} 0`
      : curves(tab_points(cuts.horizontal[row - 1][col], corner(col, row), corner(col + 1, row)), ox, oy);
  path +=
    col === layout.cols - 1
      ? ` L${round(w)} ${round(h)}`
      : curves(tab_points(cuts.vertical[row][col], corner(col + 1, row), corner(col + 1, row + 1)), ox, oy);
  path +=
    row === layout.rows - 1
      ? ` L0 ${round(h)}`
      : curves(tab_points(cuts.horizontal[row][col], corner(col, row + 1), corner(col + 1, row + 1)).reverse(), ox, oy);
  path +=
    col === 0 ? " L0 0" : curves(tab_points(cuts.vertical[row][col - 1], corner(col, row), corner(col, row + 1)).reverse(), ox, oy);
  return `${path} Z`;
}

export function is_edge_piece(layout: Layout, piece: number): boolean {
  const col = piece % layout.cols;
  const row = Math.floor(piece / layout.cols);
  return row === 0 || col === 0 || row === layout.rows - 1 || col === layout.cols - 1;
}

export function tab_margin(layout: Layout): number {
  return Math.ceil(Math.max(layout.piece_width, layout.piece_height) * TAB_REACH);
}
