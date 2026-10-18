import { z } from "zod";
import { define } from "../../engine/definition";
import { InputError, InputKind, random_int, text, type InputSpec } from "../../engine/inputs";
import { cells, grid, Tone, type Step, type Tones, type TreeNode, type View } from "../../engine/step";
import { heap_tree } from "../sorting";

type HeapOp = { op: "push"; key: number } | { op: "pop" };

function heap_spec(sample: HeapOp[]): InputSpec<HeapOp[]> {
  return {
    kind: InputKind.TEXT,
    hint: "Keys to push, comma separated; pop takes the top out",
    schema: z.array(z.union([z.object({ op: z.literal("push"), key: z.number().int().min(0).max(999) }), z.object({ op: z.literal("pop") })])).max(40) as z.ZodType<HeapOp[]>,
    parse: (value) => {
      const ops = value
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean)
        .map((part): HeapOp => {
          if (part === "pop") return { op: "pop" };
          const match = /^(?:push\s+)?(\d+)$/.exec(part);
          if (!match || Number(match[1]) > 999) throw new InputError(`Can't read “${part}”: write a key from 0 to 999, or pop.`);
          return { op: "push", key: Number(match[1]) };
        });
      if (ops.length === 0) throw new InputError("Give at least one key.");
      if (ops.length > 40) throw new InputError("At most 40 operations here.");
      return ops;
    },
    format: (ops) => ops.map((item) => (item.op === "pop" ? "pop" : String(item.key))).join(", "),
    random: () => [...Array.from({ length: 9 }, () => ({ op: "push" as const, key: random_int(1, 99) })), { op: "pop" as const }, { op: "pop" as const }],
    sample,
  };
}

const heap = define({
  intro:
    "A complete binary tree stored in an array, where every parent is at most its children (a min-heap). The smallest key is always at the root. Push puts the key at the end and sifts it up; pop moves the last key to the root and sifts it down. Both touch one path, so they take O(log n).",
  use: "Priority queues: Dijkstra, schedulers, event simulation, k smallest items, merging sorted streams.",
  traits: ["Priority queue", "Array-backed", "Complete tree"],
  pseudocode: [
    "push(k): append k at the end",
    "  while k < its parent: swap them",
    "pop(): the answer is a[0]",
    "  move the last key to the root",
    "  while it's bigger than its smaller child: swap them",
  ],
  input: heap_spec([...[42, 17, 8, 25, 31, 4, 12].map((key) => ({ op: "push" as const, key })), { op: "pop" }, { op: "pop" }]),
  params: [
    {
      id: "kind",
      label: "Kind",
      kind: "choice",
      choices: [
        { value: "min", label: "Min-heap" },
        { value: "max", label: "Max-heap" },
      ],
      default: "min",
    },
  ],
  operations: {
    list: [
      { id: "push", label: "Push", placeholder: "key" },
      { id: "pop", label: "Pop", placeholder: null },
    ],
    apply: (input, operation, value) => {
      if (operation === "pop") return [...input, { op: "pop" as const }];
      const key = Number(value);
      if (!Number.isInteger(key) || key < 0 || key > 999) throw new InputError("A whole number from 0 to 999.");
      return [...input, { op: "push" as const, key }];
    },
  },
  *run(ops: HeapOp[], params) {
    const max = params.kind === "max";
    const word = max ? "bigger" : "smaller";
    const before = (a: number, b: number) => (max ? a > b : a < b);
    const a: number[] = [];
    let comparisons = 0;
    let swaps = 0;
    const popped: number[] = [];
    const frame = (note: string, line: number, tones: Tones = {}): Step => {
      const root = heap_tree(a, a.length, tones);
      return {
        views: [{ kind: "tree", roots: root ? [root] : [] }, grid({ title: "array", col_labels: a.map((_, i) => String(i)), rows: [a.length ? cells(a, tones) : [{ text: "empty", tone: Tone.MUTED }]] })],
        line,
        note,
        counters: { comparisons, swaps, size: a.length },
      };
    };
    for (const item of ops) {
      if (item.op === "push") {
        a.push(item.key);
        let i = a.length - 1;
        yield frame(`Push ${item.key}: append it at index ${i}.`, 0, { [i]: Tone.WARN });
        while (i > 0) {
          const parent = (i - 1) >> 1;
          comparisons++;
          if (!before(a[i], a[parent])) {
            yield frame(`${a[i]} isn't ${word} than its parent ${a[parent]}: it stays.`, 1, { [i]: Tone.DONE, [parent]: Tone.COMPARE });
            break;
          }
          yield frame(`${a[i]} is ${word} than its parent ${a[parent]}: swap.`, 1, { [i]: Tone.ACTIVE, [parent]: Tone.COMPARE });
          [a[i], a[parent]] = [a[parent], a[i]];
          swaps++;
          i = parent;
        }
        if (i === 0) yield frame(`${a[0]} reached the root.`, 1, { 0: Tone.DONE });
        continue;
      }
      if (a.length === 0) {
        yield frame("Pop: the heap is empty.", 2);
        continue;
      }
      const top = a[0];
      popped.push(top);
      yield frame(`Pop: the ${max ? "largest" : "smallest"} key is the root, ${top}.`, 2, { 0: Tone.DONE });
      const last = a.pop()!;
      if (a.length === 0) {
        yield frame(`${top} was the only key.`, 3);
        continue;
      }
      a[0] = last;
      yield frame(`Move the last key, ${last}, to the root.`, 3, { 0: Tone.WARN });
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let pick = i;
        if (l < a.length) {
          comparisons++;
          if (before(a[l], a[pick])) pick = l;
        }
        if (r < a.length) {
          comparisons++;
          if (before(a[r], a[pick])) pick = r;
        }
        if (pick === i) {
          yield frame(`${a[i]} is in place.`, 4, { [i]: Tone.DONE });
          break;
        }
        yield frame(`${a[pick]} is the ${word} of ${a[i]} and its children: swap.`, 4, { [i]: Tone.ACTIVE, [pick]: Tone.COMPARE });
        [a[i], a[pick]] = [a[pick], a[i]];
        swaps++;
        i = pick;
      }
    }
    yield frame("Done.", -1);
    return { heap: [...a], popped };
  },
});

interface UnionInput {
  n: number;
  ops: ({ op: "union"; a: number; b: number } | { op: "find"; a: number })[];
}

const UNION_SAMPLE: UnionInput = {
  n: 8,
  ops: [
    { op: "union", a: 0, b: 1 },
    { op: "union", a: 2, b: 3 },
    { op: "union", a: 4, b: 5 },
    { op: "union", a: 6, b: 7 },
    { op: "union", a: 1, b: 3 },
    { op: "union", a: 5, b: 7 },
    { op: "union", a: 3, b: 7 },
    { op: "find", a: 6 },
  ],
};

function union_spec(sample: UnionInput): InputSpec<UnionInput> {
  const check = (value: UnionInput) => {
    if (!Number.isInteger(value.n) || value.n < 2 || value.n > 16) throw new InputError("Between 2 and 16 elements.");
    for (const item of value.ops) for (const x of item.op === "union" ? [item.a, item.b] : [item.a]) if (!Number.isInteger(x) || x < 0 || x >= value.n) throw new InputError(`Elements are 0 to ${value.n - 1}.`);
    return value;
  };
  return {
    kind: InputKind.TEXT,
    hint: "The number of elements, then unions and finds: 8; 0-1, 2-3, 1-3, find 3",
    schema: z.object({ n: z.number().int(), ops: z.array(z.union([z.object({ op: z.literal("union"), a: z.number().int(), b: z.number().int() }), z.object({ op: z.literal("find"), a: z.number().int() })])).max(40) }) as unknown as z.ZodType<UnionInput>,
    parse: (value) => {
      const [head, rest = ""] = value.split(";");
      const ops = rest
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean)
        .map((part): UnionInput["ops"][number] => {
          const union = /^(\d+)\s*-\s*(\d+)$/.exec(part);
          if (union) return { op: "union", a: Number(union[1]), b: Number(union[2]) };
          const find = /^find\s+(\d+)$/.exec(part);
          if (find) return { op: "find", a: Number(find[1]) };
          throw new InputError(`Can't read “${part}”: write 0-1 to join two sets, or find 3.`);
        });
      return check({ n: Number(head.trim()), ops });
    },
    format: (value) => `${value.n}; ${value.ops.map((item) => (item.op === "union" ? `${item.a}-${item.b}` : `find ${item.a}`)).join(", ")}`,
    random: () => ({ n: 10, ops: Array.from({ length: 8 }, () => ({ op: "union" as const, a: random_int(0, 9), b: random_int(0, 9) })) }),
    sample,
  };
}

const union_find = define({
  intro:
    "Keeps elements in disjoint sets, each set a tree whose root names it. find walks up to the root; union hangs one root under the other. Two tricks make it almost constant time: union by rank hangs the shorter tree under the taller, and path compression points every node it walked straight at the root.",
  use: "Kruskal's spanning tree, grouping connected pixels or friends, detecting cycles, merging accounts.",
  traits: ["Disjoint sets", "Near-constant time"],
  pseudocode: [
    "find(x): while parent[x] ≠ x: x ← parent[x]",
    "  compression: point every node on the way at the root",
    "union(a, b): ra ← find(a), rb ← find(b)",
    "  same root: already in one set",
    "  by rank: hang the lower-rank root under the other",
    "  equal ranks: pick one, its rank goes up by one",
  ],
  input: union_spec(UNION_SAMPLE),
  params: [
    {
      id: "compression",
      label: "Path compression",
      kind: "choice",
      choices: [
        { value: "on", label: "On" },
        { value: "off", label: "Off" },
      ],
      default: "on",
    },
    {
      id: "union",
      label: "Union",
      kind: "choice",
      choices: [
        { value: "rank", label: "By rank" },
        { value: "naive", label: "Always under the second" },
      ],
      default: "rank",
    },
  ],
  operations: {
    list: [
      { id: "union", label: "Union", placeholder: "a b" },
      { id: "find", label: "Find", placeholder: "x" },
    ],
    apply: (input, operation, value) => {
      const numbers = value.split(/[\s,-]+/).map(Number);
      const check = (x: number) => Number.isInteger(x) && x >= 0 && x < input.n;
      if (operation === "find") {
        if (!check(numbers[0])) throw new InputError(`An element from 0 to ${input.n - 1}.`);
        return { ...input, ops: [...input.ops, { op: "find" as const, a: numbers[0] }] };
      }
      if (!check(numbers[0]) || !check(numbers[1])) throw new InputError(`Two elements from 0 to ${input.n - 1}.`);
      return { ...input, ops: [...input.ops, { op: "union" as const, a: numbers[0], b: numbers[1] }] };
    },
  },
  *run(input: UnionInput, params) {
    const parent = Array.from({ length: input.n }, (_, i) => i);
    const rank = new Array(input.n).fill(0);
    let hops = 0;
    const compress = params.compression !== "off";
    const by_rank = params.union !== "naive";
    const forest = (tones: Tones): TreeNode[] => {
      const node = (x: number): TreeNode => ({
        id: `u${x}`,
        label: String(x),
        tone: tones[x],
        badge: parent[x] === x && by_rank ? `rank ${rank[x]}` : undefined,
        children: parent.map((p, child) => (p === x && child !== x ? child : -1)).filter((child) => child >= 0).map(node),
      });
      return parent.map((p, x) => (p === x ? x : -1)).filter((x) => x >= 0).map(node);
    };
    const frame = (note: string, line: number, tones: Tones = {}): Step => ({
      views: [
        { kind: "tree", title: "forest", roots: forest(tones) },
        grid({ title: "parent[]", col_labels: parent.map((_, i) => String(i)), rows: [cells(parent, tones)] }),
      ],
      line,
      note,
      counters: { hops, sets: parent.filter((p, x) => p === x).length },
    });
    function* find(x: number, line: number): Generator<Step, number> {
      const path: number[] = [];
      let r = x;
      while (parent[r] !== r) {
        path.push(r);
        hops++;
        yield frame(`${r}'s parent is ${parent[r]}: keep climbing.`, line, Object.fromEntries([...path.map((p) => [p, Tone.MARK]), [parent[r], Tone.ACTIVE]]));
        r = parent[r];
      }
      if (compress && path.length > 1) {
        for (const p of path) parent[p] = r;
        yield frame(`Path compression: ${path.join(", ")} now point straight at ${r}.`, 1, Object.fromEntries([...path.map((p) => [p, Tone.WARN]), [r, Tone.DONE]]));
      }
      return r;
    }
    yield frame(`${input.n} elements, each in its own set.`, -1);
    const finds: number[] = [];
    for (const item of input.ops) {
      if (item.op === "find") {
        yield frame(`find(${item.a}).`, 0, { [item.a]: Tone.ACTIVE });
        const r = yield* find(item.a, 0);
        finds.push(r);
        yield frame(`${item.a} is in the set named ${r}.`, 0, { [r]: Tone.DONE, [item.a]: Tone.ACTIVE });
        continue;
      }
      yield frame(`union(${item.a}, ${item.b}): find both roots.`, 2, { [item.a]: Tone.ACTIVE, [item.b]: Tone.ACTIVE });
      const ra = yield* find(item.a, 2);
      const rb = yield* find(item.b, 2);
      if (ra === rb) {
        yield frame(`${item.a} and ${item.b} share the root ${ra}: already one set.`, 3, { [ra]: Tone.DONE });
        continue;
      }
      let [low, high] = [ra, rb];
      if (by_rank && rank[ra] > rank[rb]) [low, high] = [rb, ra];
      parent[low] = high;
      if (by_rank && rank[low] === rank[high]) {
        rank[high]++;
        yield frame(`Both roots have rank ${rank[high] - 1}: hang ${low} under ${high}, whose rank grows to ${rank[high]}.`, 5, { [low]: Tone.WARN, [high]: Tone.DONE });
      } else
        yield frame(by_rank ? `Hang the lower-rank root ${low} under ${high}.` : `Hang ${low} under ${high}.`, 4, { [low]: Tone.WARN, [high]: Tone.DONE });
    }
    yield frame("Done.", -1);
    const root_of = (x: number): number => (parent[x] === x ? x : root_of(parent[x]));
    return { finds, roots: parent.map((_, x) => root_of(x)), depth: Math.max(...parent.map((_, x) => {
      let d = 0;
      for (let y = x; parent[y] !== y; y = parent[y]) d++;
      return d;
    })) };
  },
});

export interface HNode {
  id: string;
  weight: number;
  char?: string;
  left?: HNode;
  right?: HNode;
}

export function huffman_leaves(source: string): HNode[] {
  const counts = new Map<string, number>();
  for (const char of source) counts.set(char, (counts.get(char) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([char, weight], i): HNode => ({ id: `h${i}`, char, weight }))
    .sort((a, b) => a.weight - b.weight);
}

export function huffman_tree(source: string): HNode {
  const queue = huffman_leaves(source);
  let id = queue.length;
  while (queue.length > 1) {
    queue.sort((a, b) => a.weight - b.weight);
    const [a, b] = queue.splice(0, 2);
    queue.push({ id: `h${id++}`, weight: a.weight + b.weight, left: a, right: b });
  }
  return queue[0];
}

export function huffman_code_map(root: HNode): Map<string, string> {
  const codes = new Map<string, string>();
  const walk = (node: HNode, code: string) => {
    if (node.char !== undefined) codes.set(node.char, code || "0");
    if (node.left) walk(node.left, code + "0");
    if (node.right) walk(node.right, code + "1");
  };
  walk(root, "");
  return codes;
}

export const huffman_codes = (source: string): Map<string, string> => huffman_code_map(huffman_tree(source));

const show = (char: string) => (char === " " ? "␣" : char === "\n" ? "⏎" : char);

const huffman_label = (node: HNode) => (node.char !== undefined ? `${show(node.char)} ${node.weight}` : String(node.weight));

export function huffman_snapshot(node: HNode, marks: Map<HNode, Tone>, code: string | null): TreeNode {
  return {
    id: node.id,
    label: huffman_label(node),
    tone: marks.get(node),
    badge: code !== null && node.char !== undefined ? code || "0" : undefined,
    children: node.left && node.right ? [huffman_snapshot(node.left, marks, code === null ? null : code + "0"), huffman_snapshot(node.right, marks, code === null ? null : code + "1")] : [],
  };
}

const huffman = define({
  intro:
    "Give frequent symbols short codes and rare ones long codes. Count every symbol, then keep merging the two lightest trees into one until a single tree is left. Reading the path to a leaf (left 0, right 1) gives its code, and no code is the start of another, so the bits decode without separators.",
  use: "Inside DEFLATE (zip, gzip, PNG), JPEG and MP3: the last step that squeezes symbols into bits.",
  traits: ["Greedy", "Prefix-free codes", "Optimal per symbol"],
  pseudocode: [
    "count how often each symbol appears",
    "make a one-node tree per symbol, weighted by its count",
    "while more than one tree is left:",
    "  take the two lightest, join them under a new node",
    "  the new node weighs their sum",
    "read the codes: left edge 0, right edge 1",
  ],
  input: text({ sample: "abracadabra", max_length: 60, alphabet: "aaaabbbccde ", random_length: 24, hint: "Text to encode, up to 60 characters" }),
  presets: [
    { label: "abracadabra", value: "abracadabra" },
    { label: "Even spread", value: "abcdefgh" },
    { label: "Skewed", value: "aaaaaaaaaaaaaaabbbbbbbccd" },
  ],
  *run(source: string) {
    const counts = new Map<string, number>();
    let merges = 0;
    const freq = (active?: string): View =>
      grid({ title: "counts", col_labels: [...counts.keys()].map(show), rows: [[...counts].map(([char, count]) => ({ text: String(count), tone: char === active ? Tone.WARN : undefined }))] });
    const frame = (note: string, line: number, roots: HNode[], marks: Map<HNode, Tone> = new Map(), extra: View[] = [], coded = false): Step => ({
      views: [{ kind: "tree", title: roots.length > 1 ? "queue, lightest first" : "tree", roots: roots.map((root) => huffman_snapshot(root, marks, coded ? "" : null)) }, ...extra],
      line,
      note,
      counters: { symbols: counts.size, merges },
    });
    for (const char of source) {
      counts.set(char, (counts.get(char) ?? 0) + 1);
    }
    yield { views: [freq()], line: 0, note: `Count the ${source.length} symbols: ${counts.size} different ones.`, counters: { symbols: counts.size, merges } };
    const queue = huffman_leaves(source);
    let id = queue.length;
    yield frame("One tree per symbol, weighted by its count.", 1, [...queue], new Map(), [freq()]);
    while (queue.length > 1) {
      queue.sort((a, b) => a.weight - b.weight);
      const [a, b] = queue.slice(0, 2);
      yield frame(`The two lightest: ${huffman_label(a)} and ${huffman_label(b)}.`, 3, [...queue], new Map([[a, Tone.ACTIVE], [b, Tone.ACTIVE]]), [freq()]);
      queue.splice(0, 2);
      const joined: HNode = { id: `h${id++}`, weight: a.weight + b.weight, left: a, right: b };
      merges++;
      queue.push(joined);
      queue.sort((x, y) => x.weight - y.weight);
      yield frame(`Join them under a node of weight ${joined.weight}.`, 4, [...queue], new Map([[joined, Tone.WARN]]), [freq()]);
    }
    const codes = huffman_code_map(queue[0]);
    const table = grid({ title: "codes", row_labels: [...codes.keys()].map(show), rows: [...codes].map(([char, code]) => [{ text: code, tone: Tone.DONE }, { text: `× ${counts.get(char)}` }]) });
    const bits = [...source].reduce((sum, char) => sum + codes.get(char)!.length, 0);
    const encoded: View = { kind: "text", title: `${bits} bits instead of ${source.length * 8}`, lines: [...source].map((char) => ({ text: `${show(char)} ${codes.get(char)}` })) };
    yield { ...frame(`Read the codes off the tree: left is 0, right is 1. ${bits} bits instead of ${source.length * 8} as plain 8-bit text.`, 5, queue, new Map(), [table, encoded], true), counters: { symbols: counts.size, merges, bits } };
    return { codes: Object.fromEntries(codes), bits };
  },
});

export default { heap, union_find, huffman };
