import { z } from "zod";
import { define } from "../../engine/definition";
import { InputError, InputKind, random_int, type InputSpec } from "../../engine/inputs";
import { cells, grid, range_tones, Tone, type Point, type Step, type Tones, type TreeNode, type View } from "../../engine/step";

export type RangeOp = { op: "sum"; l: number; r: number } | { op: "set"; i: number; v: number };

export interface RangeInput {
  values: number[];
  ops: RangeOp[];
}

const RANGE_SCHEMA = z.object({
  values: z.array(z.number().int().min(-99).max(99)).min(1).max(16),
  ops: z.array(z.union([z.object({ op: z.literal("sum"), l: z.number().int(), r: z.number().int() }), z.object({ op: z.literal("set"), i: z.number().int(), v: z.number().int() })])).max(20),
});

function check_range(input: RangeInput): RangeInput {
  const n = input.values.length;
  for (const item of input.ops) {
    if (item.op === "sum" && (item.l < 0 || item.r >= n || item.l > item.r)) throw new InputError(`sum ${item.l} ${item.r}: indexes from 0 to ${n - 1}, left ≤ right.`);
    if (item.op === "set" && (item.i < 0 || item.i >= n)) throw new InputError(`set ${item.i}: an index from 0 to ${n - 1}.`);
    if (item.op === "set" && Math.abs(item.v) > 99) throw new InputError("Values from −99 to 99.");
  }
  return input;
}

const format_range_op = (item: RangeOp) => (item.op === "sum" ? `sum ${item.l} ${item.r}` : `set ${item.i} ${item.v}`);

function range_spec(sample: RangeInput): InputSpec<RangeInput> {
  return {
    kind: InputKind.TEXT,
    hint: "Values, then queries: 5 2 8 1 9 3; sum 1 4; set 2 7 (indexes start at 0)",
    schema: RANGE_SCHEMA.transform((value, context) => {
      try {
        return check_range(value);
      } catch (error) {
        context.addIssue({ code: "custom", message: (error as Error).message });
        return z.NEVER;
      }
    }) as unknown as z.ZodType<RangeInput>,
    parse: (text) => {
      const [head, ...rest] = text.split(";").map((part) => part.trim());
      const values = (head ?? "").split(/[\s,]+/).filter(Boolean).map(Number);
      if (values.length === 0 || values.some((value) => !Number.isInteger(value) || Math.abs(value) > 99)) throw new InputError("Start with whole numbers from −99 to 99.");
      if (values.length > 16) throw new InputError("At most 16 values here.");
      const ops = rest.filter(Boolean).map((part): RangeOp => {
        const match = /^(sum|set)\s+(-?\d+)\s+(-?\d+)$/.exec(part.toLowerCase());
        if (!match) throw new InputError(`Can't read “${part}”: write sum 1 4 or set 2 7.`);
        const [a, b] = [Number(match[2]), Number(match[3])];
        return match[1] === "sum" ? { op: "sum", l: a, r: b } : { op: "set", i: a, v: b };
      });
      return check_range({ values, ops });
    },
    format: (value) => [value.values.join(" "), ...value.ops.map(format_range_op)].join("; "),
    random: () => {
      const values = Array.from({ length: 8 }, () => random_int(1, 20));
      const l = random_int(0, 4);
      return { values, ops: [{ op: "sum", l, r: random_int(l, 7) }, { op: "set", i: random_int(0, 7), v: random_int(1, 20) }, { op: "sum", l: 0, r: 7 }] };
    },
    sample,
  };
}

const range_operations = {
  list: [
    { id: "sum", label: "Sum", placeholder: "l r" },
    { id: "set", label: "Set", placeholder: "i value" },
  ],
  apply: (input: RangeInput, operation: string, value: string): RangeInput => {
    const [a, b] = value.split(/[\s,]+/).map(Number);
    if (!Number.isInteger(a) || !Number.isInteger(b)) throw new InputError(operation === "sum" ? "Two indexes: l r." : "An index and a value: i v.");
    const item: RangeOp = operation === "sum" ? { op: "sum", l: a, r: b } : { op: "set", i: a, v: b };
    return check_range({ values: input.values, ops: [...input.ops, item] });
  },
};

const RANGE_SAMPLE: RangeInput = { values: [5, 2, 8, 1, 9, 3, 7, 4], ops: [{ op: "sum", l: 2, r: 5 }, { op: "set", i: 3, v: 6 }, { op: "sum", l: 0, r: 4 }] };

interface Seg {
  id: string;
  l: number;
  r: number;
  sum: number;
  left: Seg | null;
  right: Seg | null;
}

const segment = define({
  intro:
    "A tree over an array where each node stores the sum of a range: the root covers everything, its children each half, down to single elements. A range sum takes the few nodes that fit inside the range exactly, about 2 log n of them; changing one value updates just the nodes on its path to the root.",
  use: "Many range queries mixed with updates: sums, minimums, maximums over intervals (competitive programming, analytics on changing data).",
  traits: ["Range queries", "Point updates", "O(log n) each"],
  pseudocode: [
    "build(node, l, r): a leaf holds a[l]; otherwise build both halves, sum = left + right",
    "sum(node, ql, qr):",
    "  node's range outside [ql, qr]: contribute 0",
    "  node's range inside [ql, qr]: contribute its sum",
    "  otherwise: sum of both children",
    "set(i, v): walk down to the leaf for i, set it,",
    "  then recompute every sum on the way back up",
  ],
  input: range_spec(RANGE_SAMPLE),
  operations: range_operations,
  *run(input: RangeInput) {
    const a = [...input.values];
    let count = 0;
    let visits = 0;
    const build = (l: number, r: number): Seg => {
      if (l === r) return { id: `s${count++}`, l, r, sum: a[l], left: null, right: null };
      const mid = (l + r) >> 1;
      const left = build(l, mid);
      const right = build(mid + 1, r);
      return { id: `s${count++}`, l, r, sum: left.sum + right.sum, left, right };
    };
    const root = build(0, a.length - 1);
    const snapshot = (node: Seg, marks: Map<Seg, Tone>): TreeNode => ({
      id: node.id,
      label: String(node.sum),
      badge: node.l === node.r ? `${node.l}` : `${node.l}–${node.r}`,
      tone: marks.get(node),
      children: node.left && node.right ? [snapshot(node.left, marks), snapshot(node.right, marks)] : [],
    });
    const frame = (note: string, line: number, marks: Map<Seg, Tone>, tones: Tones = {}, extra: Record<string, number> = {}): Step => ({
      views: [{ kind: "tree", roots: [snapshot(root, marks)] }, grid({ title: "array", col_labels: a.map((_, i) => String(i)), rows: [cells(a, tones)] })],
      line,
      note,
      counters: { visits, ...extra },
    });
    yield frame(`Built: the root holds the sum of all ${a.length} values, ${root.sum}.`, 0, new Map([[root, Tone.DONE]]));
    const answers: number[] = [];
    for (const item of input.ops) {
      if (item.op === "sum") {
        const marks = new Map<Seg, Tone>();
        const span = range_tones(item.l, item.r + 1, Tone.MARK);
        yield frame(`Sum of indexes ${item.l} to ${item.r}.`, 1, marks, span);
        let total = 0;
        const steps: Step[] = [];
        const query = (node: Seg) => {
          visits++;
          if (node.r < item.l || node.l > item.r) {
            marks.set(node, Tone.MUTED);
            steps.push(frame(`${node.l}–${node.r} is outside: skip it.`, 2, new Map(marks), span, { sum: total }));
            return;
          }
          if (item.l <= node.l && node.r <= item.r) {
            total += node.sum;
            marks.set(node, Tone.DONE);
            steps.push(frame(`${node.l === node.r ? `Index ${node.l}` : `${node.l}–${node.r}`} fits inside: take its ${node.sum}. Running sum ${total}.`, 3, new Map(marks), span, { sum: total }));
            return;
          }
          marks.set(node, Tone.COMPARE);
          steps.push(frame(`${node.l}–${node.r} sticks out of the range: look at both halves.`, 4, new Map(marks), span, { sum: total }));
          query(node.left!);
          query(node.right!);
        };
        query(root);
        yield* steps;
        answers.push(total);
        yield frame(`sum(${item.l}, ${item.r}) = ${total}.`, 1, marks, span, { sum: total });
      } else {
        const marks = new Map<Seg, Tone>();
        const path: Seg[] = [];
        let node = root;
        while (node.left && node.right) {
          visits++;
          path.push(node);
          marks.set(node, Tone.COMPARE);
          yield frame(`Index ${item.i} is in ${node.l}–${node.r}: go ${item.i <= node.left.r ? "left" : "right"}.`, 5, new Map(marks), { [item.i]: Tone.ACTIVE });
          node = item.i <= node.left.r ? node.left : node.right;
        }
        a[item.i] = item.v;
        node.sum = item.v;
        marks.set(node, Tone.WARN);
        yield frame(`Set index ${item.i} to ${item.v}.`, 5, new Map(marks), { [item.i]: Tone.WARN });
        for (const parent of path.reverse()) {
          parent.sum = parent.left!.sum + parent.right!.sum;
          marks.set(parent, Tone.WARN);
          yield frame(`Recompute ${parent.l}–${parent.r}: ${parent.left!.sum} + ${parent.right!.sum} = ${parent.sum}.`, 6, new Map(marks), { [item.i]: Tone.WARN });
        }
      }
    }
    yield frame("Done.", -1, new Map());
    return { answers, values: a };
  },
});

const lowbit = (i: number) => i & -i;

const fenwick = define({
  intro:
    "A Fenwick (binary indexed) tree stores partial sums in one array. Cell i covers the lowbit(i) values ending at i, where lowbit is the lowest set bit. A prefix sum hops down by removing that bit; an update hops up by adding it. Both take about log n hops, with no pointers at all.",
  use: "Prefix sums with updates when memory and code size matter: frequency tables, inversion counting, order statistics.",
  traits: ["Prefix sums", "Point updates", "One array"],
  pseudocode: [
    "add(i, delta): i ← i + 1",
    "  while i ≤ n: tree[i] += delta; i ← i + lowbit(i)",
    "prefix(i): s ← 0; i ← i + 1",
    "  while i > 0: s += tree[i]; i ← i − lowbit(i)",
    "sum(l, r) = prefix(r) − prefix(l − 1)",
    "set(i, v) = add(i, v − a[i])",
  ],
  input: range_spec(RANGE_SAMPLE),
  operations: range_operations,
  *run(input: RangeInput) {
    const a = input.values.map(() => 0);
    const n = a.length;
    const tree = new Array(n + 1).fill(0);
    let hops = 0;
    const snapshot = (marks: Tones): TreeNode => {
      const node = (i: number): TreeNode => {
        const children: TreeNode[] = [];
        for (let j = i + 1; j <= n; j++) if (j - lowbit(j) === i) children.push(node(j));
        return i === 0 ? { id: "f0", label: "0", tone: Tone.MUTED, children } : { id: `f${i}`, label: String(tree[i]), badge: `${i - lowbit(i) + 1}–${i}`, tone: marks[i], children };
      };
      return node(0);
    };
    const frame = (note: string, line: number, marks: Tones = {}, array_tones: Tones = {}, extra: Record<string, number> = {}): Step => ({
      views: [
        { kind: "tree", title: "prefix tree (parent = i − lowbit(i))", roots: [snapshot(marks)] },
        grid({ title: "tree[]", col_labels: tree.slice(1).map((_, i) => String(i + 1)), rows: [cells(tree.slice(1), Object.fromEntries(Object.entries(marks).map(([k, v]) => [Number(k) - 1, v])))] }),
        grid({ title: "values", col_labels: a.map((_, i) => String(i)), rows: [cells(a, array_tones)] }),
      ],
      line,
      note,
      counters: { hops, ...extra },
    });
    function* add(index: number, delta: number, quiet: boolean): Generator<Step> {
      const marks: Tones = {};
      for (let i = index + 1; i <= n; i += lowbit(i)) {
        hops++;
        tree[i] += delta;
        marks[i] = Tone.WARN;
        if (!quiet) yield frame(`tree[${i}] covers ${i - lowbit(i) + 1}–${i}: add ${delta}. Next: ${i} + ${lowbit(i)} = ${i + lowbit(i)}.`, 1, { ...marks }, { [index]: Tone.ACTIVE });
      }
    }
    function* prefix(index: number, collect: { s: number }): Generator<Step> {
      const marks: Tones = {};
      for (let i = index + 1; i > 0; i -= lowbit(i)) {
        hops++;
        collect.s += tree[i];
        marks[i] = Tone.DONE;
        yield frame(`Take tree[${i}] = ${tree[i]} (covers ${i - lowbit(i) + 1}–${i}). Running sum ${collect.s}. Next: ${i} − ${lowbit(i)} = ${i - lowbit(i)}.`, 3, { ...marks }, range_tones(0, index + 1, Tone.MARK), { sum: collect.s });
      }
    }
    for (let i = 0; i < n; i++) {
      a[i] = input.values[i];
      yield* add(i, input.values[i], i > 2);
      if (i > 2 && i === n - 1) yield frame("The rest are added the same way.", 1);
    }
    yield frame("Built by adding each value in turn.", 0);
    const answers: number[] = [];
    for (const item of input.ops) {
      if (item.op === "sum") {
        const right = { s: 0 };
        yield frame(`sum(${item.l}, ${item.r}) = prefix(${item.r}) − prefix(${item.l - 1}).`, 4, {}, range_tones(item.l, item.r + 1, Tone.MARK));
        yield* prefix(item.r, right);
        const left = { s: 0 };
        if (item.l > 0) yield* prefix(item.l - 1, left);
        answers.push(right.s - left.s);
        yield frame(`sum(${item.l}, ${item.r}) = ${right.s} − ${left.s} = ${right.s - left.s}.`, 4, {}, range_tones(item.l, item.r + 1, Tone.DONE), { sum: right.s - left.s });
      } else {
        const delta = item.v - a[item.i];
        yield frame(`set(${item.i}, ${item.v}) is add(${item.i}, ${delta}).`, 5, {}, { [item.i]: Tone.ACTIVE });
        a[item.i] = item.v;
        yield* add(item.i, delta, false);
      }
    }
    yield frame("Done.", -1);
    return { answers, tree: tree.slice(1) };
  },
});

type IntervalOp = { op: "insert"; lo: number; hi: number } | { op: "overlap"; lo: number; hi: number };

function interval_spec(sample: IntervalOp[]): InputSpec<IntervalOp[]> {
  return {
    kind: InputKind.TEXT,
    hint: "Intervals to insert like 15-20, comma separated; also overlap 10-14",
    schema: z.array(z.object({ op: z.enum(["insert", "overlap"]), lo: z.number().int().min(0).max(999), hi: z.number().int().min(0).max(999) })).max(30) as z.ZodType<IntervalOp[]>,
    parse: (text) => {
      const ops = text
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean)
        .map((part): IntervalOp => {
          const match = /^(?:(overlap)\s+)?(\d+)\s*-\s*(\d+)$/.exec(part);
          if (!match) throw new InputError(`Can't read “${part}”: write 15-20 or overlap 10-14.`);
          const [lo, hi] = [Number(match[2]), Number(match[3])];
          if (lo > hi) throw new InputError(`${lo}-${hi}: the start can't be after the end.`);
          if (hi > 999) throw new InputError("Numbers up to 999.");
          return { op: match[1] ? "overlap" : "insert", lo, hi };
        });
      if (ops.length === 0) throw new InputError("Give at least one interval.");
      if (ops.length > 30) throw new InputError("At most 30 operations here.");
      return ops;
    },
    format: (ops) => ops.map((item) => `${item.op === "overlap" ? "overlap " : ""}${item.lo}-${item.hi}`).join(", "),
    random: () =>
      Array.from({ length: 7 }, () => {
        const lo = random_int(0, 80);
        return { op: "insert" as const, lo, hi: lo + random_int(2, 20) };
      }),
    sample,
  };
}

interface INode {
  id: string;
  lo: number;
  hi: number;
  max: number;
  left: INode | null;
  right: INode | null;
}

const interval = define({
  intro:
    "A binary search tree of intervals, ordered by start, where each node also remembers the largest end anywhere in its subtree. That one extra number lets a search skip whole subtrees: if the left side's largest end is before the query starts, nothing on the left can overlap it.",
  use: "Calendars and booking systems (which meetings clash?), genome ranges, and window managers finding what lies under a rectangle.",
  traits: ["Augmented BST", "Overlap queries"],
  pseudocode: [
    "insert([lo, hi]) like a binary search tree keyed by lo",
    "  on the way down, max ← the larger of max and hi",
    "overlaps(q, node):",
    "  if node.left and node.left.max ≥ q.lo: search the left side",
    "  if node overlaps q: report it",
    "  if node.lo ≤ q.hi: search the right side",
  ],
  input: interval_spec([
    { op: "insert", lo: 15, hi: 20 },
    { op: "insert", lo: 10, hi: 30 },
    { op: "insert", lo: 17, hi: 19 },
    { op: "insert", lo: 5, hi: 20 },
    { op: "insert", lo: 12, hi: 15 },
    { op: "insert", lo: 30, hi: 40 },
    { op: "overlap", lo: 6, hi: 7 },
    { op: "overlap", lo: 18, hi: 22 },
  ]),
  operations: {
    list: [
      { id: "insert", label: "Insert", placeholder: "lo-hi" },
      { id: "overlap", label: "Overlap", placeholder: "lo-hi" },
    ],
    apply: (input, operation, value) => {
      const match = /^(\d+)\s*-\s*(\d+)$/.exec(value);
      if (!match || Number(match[1]) > Number(match[2])) throw new InputError("Write an interval like 10-14.");
      return [...input, { op: operation as "insert" | "overlap", lo: Number(match[1]), hi: Number(match[2]) }];
    },
  },
  *run(ops: IntervalOp[]) {
    let root: INode | null = null;
    let count = 0;
    let visits = 0;
    const snapshot = (node: INode | null, marks: Map<INode, Tone>): TreeNode | null =>
      node ? { id: node.id, label: `${node.lo}–${node.hi}`, badge: `max ${node.max}`, tone: marks.get(node), children: [snapshot(node.left, marks), snapshot(node.right, marks)] } : null;
    const frame = (note: string, line: number, marks: Map<INode, Tone> = new Map(), extra: View[] = []): Step => {
      const tree = snapshot(root, marks);
      return { views: [{ kind: "tree", roots: tree ? [tree] : [] }, ...extra], line, note, counters: { visits } };
    };
    const results: string[][] = [];
    for (const item of ops) {
      if (item.op === "insert") {
        const fresh: INode = { id: `i${count++}`, lo: item.lo, hi: item.hi, max: item.hi, left: null, right: null };
        if (!root) {
          root = fresh;
          yield frame(`${item.lo}–${item.hi} becomes the root.`, 0, new Map([[fresh, Tone.WARN]]));
          continue;
        }
        let node = root;
        for (;;) {
          visits++;
          node.max = Math.max(node.max, item.hi);
          const left = item.lo < node.lo;
          yield frame(`${item.lo} ${left ? "<" : "≥"} ${node.lo}: go ${left ? "left" : "right"}; this subtree's max is now ${node.max}.`, 1, new Map([[node, Tone.COMPARE]]));
          const next: INode | null = left ? node.left : node.right;
          if (!next) {
            if (left) node.left = fresh;
            else node.right = fresh;
            break;
          }
          node = next;
        }
        yield frame(`Hang ${item.lo}–${item.hi} here.`, 0, new Map([[fresh, Tone.WARN]]));
        continue;
      }
      const marks = new Map<INode, Tone>();
      const hits: string[] = [];
      const hit_view = (): View => ({ kind: "text", title: `overlapping ${item.lo}–${item.hi}`, lines: hits.length ? hits.map((text) => ({ text, tone: Tone.DONE })) : [{ text: "none yet", tone: Tone.MUTED }] });
      yield frame(`Which intervals overlap ${item.lo}–${item.hi}?`, 2, marks, [hit_view()]);
      const steps: Step[] = [];
      const search = (node: INode | null) => {
        if (!node) return;
        visits++;
        marks.set(node, Tone.COMPARE);
        if (node.left && node.left.max >= item.lo) {
          steps.push(frame(`The left side reaches ${node.left.max} ≥ ${item.lo}: it may hold an overlap, search it.`, 3, new Map(marks), [hit_view()]));
          search(node.left);
        } else if (node.left) {
          marks.set(node.left, Tone.MUTED);
          steps.push(frame(`The left side ends by ${node.left.max} < ${item.lo}: skip all of it.`, 3, new Map(marks), [hit_view()]));
        }
        const overlaps = node.lo <= item.hi && item.lo <= node.hi;
        if (overlaps) hits.push(`${node.lo}–${node.hi}`);
        marks.set(node, overlaps ? Tone.DONE : Tone.MUTED);
        steps.push(frame(overlaps ? `${node.lo}–${node.hi} overlaps: report it.` : `${node.lo}–${node.hi} doesn't overlap.`, 4, new Map(marks), [hit_view()]));
        if (node.lo <= item.hi) search(node.right);
        else if (node.right) {
          marks.set(node.right, Tone.MUTED);
          steps.push(frame(`Everything right starts after ${node.lo} > ${item.hi}: skip it.`, 5, new Map(marks), [hit_view()]));
        }
      };
      search(root);
      yield* steps;
      results.push([...hits]);
      yield frame(hits.length ? `${hits.length} overlapping: ${hits.join(", ")}.` : "Nothing overlaps.", 2, marks, [hit_view()]);
    }
    yield frame("Done.", -1);
    return { results };
  },
});

type KdOp = { op: "insert"; x: number; y: number } | { op: "nearest"; x: number; y: number };

function kd_spec(sample: KdOp[]): InputSpec<KdOp[]> {
  return {
    kind: InputKind.TEXT,
    hint: "Points as x y from 0 to 100, comma separated; also nearest 50 50",
    schema: z.array(z.object({ op: z.enum(["insert", "nearest"]), x: z.number().min(0).max(100), y: z.number().min(0).max(100) })).max(30) as z.ZodType<KdOp[]>,
    parse: (text) => {
      const ops = text
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean)
        .map((part): KdOp => {
          const match = /^(?:(nearest)\s+)?(\d+)\s+(\d+)$/.exec(part);
          if (!match) throw new InputError(`Can't read “${part}”: write x y, or nearest x y.`);
          const [x, y] = [Number(match[2]), Number(match[3])];
          if (x > 100 || y > 100) throw new InputError("Coordinates from 0 to 100.");
          return { op: match[1] ? "nearest" : "insert", x, y };
        });
      if (ops.length === 0) throw new InputError("Give at least one point.");
      return ops;
    },
    format: (ops) => ops.map((item) => `${item.op === "nearest" ? "nearest " : ""}${item.x} ${item.y}`).join(", "),
    random: () => [...Array.from({ length: 9 }, () => ({ op: "insert" as const, x: random_int(5, 95), y: random_int(5, 95) })), { op: "nearest" as const, x: random_int(10, 90), y: random_int(10, 90) }],
    sample,
  };
}

interface KdNode {
  id: string;
  p: Point;
  axis: 0 | 1;
  left: KdNode | null;
  right: KdNode | null;
}

const kd = define({
  intro:
    "A binary tree that splits space: the root splits the plane at its x, its children split their halves at their y, and so on, alternating. A nearest-neighbour search walks down to the region of the query first, then only checks the other side of a split when the split line is closer than the best point found so far.",
  use: "Nearest-neighbour and range searches in 2 or 3 dimensions: maps, collision detection, colour quantisation.",
  traits: ["Spatial", "Alternating axes"],
  pseudocode: [
    "insert(p): compare x at even depths, y at odd depths",
    "  go left if smaller, right otherwise; hang p where it falls off",
    "nearest(q, node):",
    "  if node is closer than the best so far: it's the new best",
    "  search the side of the split that holds q first",
    "  if the split line is closer than the best: search the other side too",
  ],
  input: kd_spec([
    ...[
      [50, 50],
      [25, 30],
      [75, 70],
      [10, 80],
      [35, 15],
      [65, 20],
      [90, 85],
      [40, 60],
    ].map(([x, y]) => ({ op: "insert" as const, x, y })),
    { op: "nearest", x: 70, y: 35 },
  ]),
  operations: {
    list: [
      { id: "insert", label: "Insert", placeholder: "x y" },
      { id: "nearest", label: "Nearest", placeholder: "x y" },
    ],
    apply: (input, operation, value) => {
      const [x, y] = value.split(/[\s,]+/).map(Number);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) throw new InputError("x y, each from 0 to 100.");
      return [...input, { op: operation as "insert" | "nearest", x, y }];
    },
  },
  *run(ops: KdOp[]) {
    let root: KdNode | null = null;
    let count = 0;
    let visits = 0;
    const label = (p: Point) => `${p.x},${p.y}`;
    const snapshot = (node: KdNode | null, marks: Map<KdNode, Tone>): TreeNode | null =>
      node ? { id: node.id, label: label(node.p), badge: node.axis === 0 ? "x" : "y", tone: marks.get(node), children: [snapshot(node.left, marks), snapshot(node.right, marks)] } : null;
    const plane = (marks: Map<KdNode, Tone>, query?: Point, best?: KdNode | null): View => {
      const segments: { a: Point; b: Point; tone?: Tone }[] = [];
      const points: (Point & { tone?: Tone; label?: string })[] = [];
      const walk = (node: KdNode | null, box: { x0: number; x1: number; y0: number; y1: number }) => {
        if (!node) return;
        const tone = marks.get(node);
        points.push({ ...node.p, tone: node === best ? Tone.DONE : tone });
        if (node.axis === 0) {
          segments.push({ a: { x: node.p.x, y: box.y0 }, b: { x: node.p.x, y: box.y1 }, tone: tone === Tone.COMPARE ? Tone.COMPARE : undefined });
          walk(node.left, { ...box, x1: node.p.x });
          walk(node.right, { ...box, x0: node.p.x });
        } else {
          segments.push({ a: { x: box.x0, y: node.p.y }, b: { x: box.x1, y: node.p.y }, tone: tone === Tone.COMPARE ? Tone.COMPARE : undefined });
          walk(node.left, { ...box, y1: node.p.y });
          walk(node.right, { ...box, y0: node.p.y });
        }
      };
      walk(root, { x0: 0, x1: 100, y0: 0, y1: 100 });
      if (query) points.push({ ...query, tone: Tone.ACTIVE, label: "q" });
      if (query && best) segments.push({ a: query, b: best.p, tone: Tone.DONE });
      return { kind: "points", title: "plane", points, segments };
    };
    const frame = (note: string, line: number, marks: Map<KdNode, Tone> = new Map(), query?: Point, best?: KdNode | null, extra: Record<string, number | string> = {}): Step => {
      const tree = snapshot(root, marks);
      return { views: [{ kind: "tree", roots: tree ? [tree] : [] }, plane(marks, query, best)], line, note, counters: { visits, ...extra } };
    };
    const found: string[] = [];
    for (const item of ops) {
      const p = { x: item.x, y: item.y };
      if (item.op === "insert") {
        if (!root) {
          root = { id: `k${count++}`, p, axis: 0, left: null, right: null };
          yield frame(`(${label(p)}) is the root: it splits the plane at x = ${p.x}.`, 0, new Map([[root, Tone.WARN]]));
          continue;
        }
        let node = root;
        for (;;) {
          visits++;
          const key = node.axis === 0 ? "x" : "y";
          const left = p[key] < node.p[key];
          yield frame(`Compare ${key}: ${p[key]} ${left ? "<" : "≥"} ${node.p[key]}, go ${left ? "left" : "right"}.`, 1, new Map([[node, Tone.COMPARE]]));
          const next: KdNode | null = left ? node.left : node.right;
          if (!next) {
            const fresh: KdNode = { id: `k${count++}`, p, axis: node.axis === 0 ? 1 : 0, left: null, right: null };
            if (left) node.left = fresh;
            else node.right = fresh;
            yield frame(`Hang (${label(p)}) here; it splits its region at ${fresh.axis === 0 ? "x" : "y"} = ${fresh.axis === 0 ? p.x : p.y}.`, 1, new Map([[fresh, Tone.WARN]]));
            break;
          }
          node = next;
        }
        continue;
      }
      if (!root) {
        yield frame("The tree is empty.", 2);
        continue;
      }
      const marks = new Map<KdNode, Tone>();
      let best: KdNode | null = null;
      let best_d = Infinity;
      const steps: Step[] = [];
      const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
      const search = (node: KdNode | null) => {
        if (!node) return;
        visits++;
        const d = dist(node.p, p);
        marks.set(node, Tone.MARK);
        if (d < best_d) {
          best_d = d;
          best = node;
          steps.push(frame(`(${label(node.p)}) is ${d.toFixed(1)} away: the best so far.`, 3, new Map(marks), p, best, { best: d.toFixed(1) }));
        } else steps.push(frame(`(${label(node.p)}) is ${d.toFixed(1)} away: not better than ${best_d.toFixed(1)}.`, 3, new Map(marks), p, best, { best: best_d.toFixed(1) }));
        const key = node.axis === 0 ? "x" : "y";
        const diff = p[key] - node.p[key];
        const [near, far] = diff < 0 ? [node.left, node.right] : [node.right, node.left];
        marks.set(node, Tone.COMPARE);
        if (near) steps.push(frame(`q is on the ${diff < 0 ? "smaller" : "larger"} ${key} side: search it first.`, 4, new Map(marks), p, best, { best: best_d.toFixed(1) }));
        search(near);
        if (far && Math.abs(diff) < best_d) {
          steps.push(frame(`The split at ${key} = ${node.p[key]} is only ${Math.abs(diff).toFixed(1)} away, closer than ${best_d.toFixed(1)}: check the other side too.`, 5, new Map(marks), p, best, { best: best_d.toFixed(1) }));
          search(far);
        } else if (far) {
          marks.set(far, Tone.MUTED);
          steps.push(frame(`The split is ${Math.abs(diff).toFixed(1)} away, farther than ${best_d.toFixed(1)}: skip the other side.`, 5, new Map(marks), p, best, { best: best_d.toFixed(1) }));
        }
      };
      yield frame(`Nearest point to (${label(p)})?`, 2, marks, p);
      search(root);
      yield* steps;
      const winner = best as KdNode | null;
      found.push(winner ? label(winner.p) : "");
      yield frame(winner ? `Nearest: (${label(winner.p)}), ${best_d.toFixed(1)} away.` : "No points.", 2, new Map(), p, winner, { best: best_d.toFixed(1) });
    }
    yield frame("Done.", -1);
    return { found };
  },
});

export default { segment, fenwick, interval, kd };
