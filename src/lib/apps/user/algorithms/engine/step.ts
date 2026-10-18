export const Tone = {
  ACTIVE: "active",
  COMPARE: "compare",
  DONE: "done",
  MARK: "mark",
  WARN: "warn",
  BAD: "bad",
  MUTED: "muted",
} as const;
export type Tone = (typeof Tone)[keyof typeof Tone];

export type Tones = Record<number, Tone>;

export interface Pointer {
  index: number;
  label: string;
  tone?: Tone;
}

export interface BarsView {
  kind: "bars";
  title?: string;
  values: number[];
  tones?: Tones;
  pointers?: Pointer[];
}

export interface TreeNode {
  id: string;
  label: string;
  tone?: Tone;
  badge?: string;
  red?: boolean;
  /** `null` keeps a binary node's empty side, so a lone right child still leans right. */
  children: (TreeNode | null)[];
}

export interface TreeView {
  kind: "tree";
  title?: string;
  roots: TreeNode[];
}

export interface GraphNode {
  id: string;
  x: number;
  y: number;
  tone?: Tone;
  badge?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
  tone?: Tone;
}

export interface GraphView {
  kind: "graph";
  title?: string;
  directed: boolean;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Cell {
  text: string;
  tone?: Tone;
}

export interface GridView {
  kind: "grid";
  title?: string;
  rows: Cell[][];
  row_labels?: string[];
  col_labels?: string[];
  pointers?: Pointer[];
  board?: boolean;
}

export interface RingView {
  kind: "ring";
  title?: string;
  cells: Cell[];
  pointers?: Pointer[];
}

export interface ChainView {
  kind: "chain";
  title?: string;
  items: Cell[];
  double?: boolean;
  pointers?: Pointer[];
}

export interface Point {
  x: number;
  y: number;
}

export interface PointsView {
  kind: "points";
  title?: string;
  points: (Point & { tone?: Tone; label?: string })[];
  segments?: { a: Point; b: Point; tone?: Tone }[];
  polygon?: Point[];
  sweep?: number;
}

export interface TextView {
  kind: "text";
  title?: string;
  lines: Cell[];
}

export type View = BarsView | TreeView | GraphView | GridView | RingView | ChainView | PointsView | TextView;

export interface Step {
  views: View[];
  line?: number;
  note: string;
  counters?: Record<string, number | string>;
}

export const cells = (values: readonly (string | number)[], tones: Tones = {}): Cell[] =>
  values.map((value, index) => ({ text: String(value), tone: tones[index] }));

export const grid = (view: Omit<GridView, "kind">): GridView => ({ kind: "grid", ...view });

export function pointers_at(pointers: Pointer[] | undefined): Map<number, Pointer[]> {
  const map = new Map<number, Pointer[]>();
  for (const pointer of pointers ?? []) map.set(pointer.index, [...(map.get(pointer.index) ?? []), pointer]);
  return map;
}

export function range_tones(from: number, to: number, tone: Tone, base: Tones = {}): Tones {
  const tones = { ...base };
  for (let i = from; i < to; i++) tones[i] = tone;
  return tones;
}
