import { z } from "zod";
import { define } from "../../engine/definition";
import { InputError, InputKind, shuffled, type InputSpec } from "../../engine/inputs";
import { Tone, type Step, type TreeNode, type View } from "../../engine/step";
import { inserts, key_operations, key_ops, KeyOpKind, op_text, type KeyOp } from "./common";

interface MNode {
  id: string;
  keys: number[];
  children: MNode[];
  next?: MNode | null;
}

class Multi {
  root: MNode;
  comparisons = 0;
  splits = 0;
  borrows = 0;
  merges = 0;
  private count = 0;
  tones = new Map<MNode, Tone>();

  constructor(private readonly deletes = false) {
    this.root = this.make([]);
  }

  make(keys: number[], children: MNode[] = []): MNode {
    return { id: `m${this.count++}`, keys, children };
  }

  snapshot(node: MNode = this.root): TreeNode {
    return { id: node.id, label: node.keys.length ? node.keys.join(" · ") : "∅", tone: this.tones.get(node), children: node.children.map((child) => this.snapshot(child)) };
  }

  frame(note: string, line: number, marks: [MNode | null | undefined, Tone][] = [], extra: View[] = []): Step {
    const saved = this.tones;
    this.tones = new Map(saved);
    for (const [node, tone] of marks) if (node) this.tones.set(node, tone);
    const root = this.snapshot();
    this.tones = saved;
    const counters: Record<string, number> = { comparisons: this.comparisons, splits: this.splits };
    if (this.deletes) Object.assign(counters, { borrows: this.borrows, merges: this.merges });
    counters.height = depth(this.root);
    return { views: [{ kind: "tree", roots: [root] }, ...extra], line, note, counters };
  }

  all_keys(node: MNode = this.root, leaves_only = false): number[] {
    if (node.children.length === 0) return [...node.keys];
    if (leaves_only) return node.children.flatMap((child) => this.all_keys(child, true));
    return node.children.flatMap((child, i) => [...this.all_keys(child), ...(i < node.keys.length ? [node.keys[i]] : [])]);
  }
}

function depth(node: MNode): number {
  return node.children.length ? 1 + depth(node.children[0]) : 1;
}

const B_KEYS = inserts(10, 20, 5, 6, 12, 30, 7, 17, 3, 4, 8, 25, 27);

const b_tree = define({
  intro:
    "A search tree whose nodes hold many keys and have many children, so it stays very shallow. All leaves sit at the same depth. A full node splits in two and pushes its middle key up; the tree only ever grows at the root. A delete borrows a key from a sibling or merges two nodes, so it only ever shrinks at the root too. Each node fits a disk page, so a lookup touches very few pages.",
  use: "Databases and file systems (SQLite, NTFS, ext4 directories): anywhere data lives on disk in blocks.",
  traits: ["Ordered", "Balanced", "Shallow"],
  pseudocode: [
    "insert(k): if the root is full, split it; the middle key becomes a new root",
    "walk down from the root:",
    "  if the child to enter is full, split it first (its middle key moves up)",
    "  at a leaf: put k among its keys, in order",
    "find(k): in each node, scan the keys",
    "  found it, or go down between the two keys around k",
    "delete(k): walk down; before entering a child with only t − 1 keys, top it up:",
    "  a sibling has t keys or more: borrow one through the parent",
    "  else merge it with a sibling and the parent key between them",
    "  k in a leaf: remove it",
    "  k in an inner node: swap in its predecessor or successor from a child with t keys or more",
    "    both children have t − 1 keys: merge them around k, delete k from the merged node",
    "  the root has no keys left: its only child becomes the root",
  ],
  input: key_ops({ sample: [...B_KEYS, ...[6, 17, 4].map((key) => ({ op: KeyOpKind.DELETE, key }))], allow: ["insert", "delete", "find"], max_count: 60 }),
  presets: [
    { label: "Sample", value: B_KEYS },
    { label: "Ascending keys", value: inserts(...Array.from({ length: 20 }, (_, i) => (i + 1) * 5)) },
    { label: "Borrow and merge", value: [...inserts(...Array.from({ length: 12 }, (_, i) => (i + 1) * 10)), ...[10, 20, 70, 40, 60].map((key) => ({ op: KeyOpKind.DELETE, key }))] },
    { label: "Shrink to nothing", value: [...inserts(5, 15, 25, 35, 45, 55, 65, 75), ...[45, 5, 75, 25, 55, 15, 35, 65].map((key) => ({ op: KeyOpKind.DELETE, key }))] },
  ],
  params: [{ id: "t", label: "Minimum degree t", kind: "number", min: 2, max: 4, default: 2 }],
  operations: key_operations(["insert", "delete", "find"]),
  *run(ops: KeyOp[], params) {
    const t = Number(params.t ?? 2);
    const max = 2 * t - 1;
    const tree = new Multi(true);
    const found: boolean[] = [];

    function* top_up(parent: MNode, i: number): Generator<Step, number> {
      const child = parent.children[i];
      const left = parent.children[i - 1];
      const right = parent.children[i + 1];
      yield tree.frame(`The child to enter has only ${t - 1} ${t - 1 === 1 ? "key" : "keys"}: top it up first, so a delete below can't leave it short.`, 6, [
        [parent, Tone.COMPARE],
        [child, Tone.BAD],
      ]);
      if (left && left.keys.length >= t) {
        const down = parent.keys[i - 1];
        const up = left.keys.pop()!;
        child.keys.unshift(down);
        parent.keys[i - 1] = up;
        if (left.children.length) child.children.unshift(left.children.pop()!);
        tree.borrows++;
        yield tree.frame(`Its left sibling can spare one: ${up} moves up into the parent and ${down} comes down into the child.`, 7, [
          [left, Tone.MARK],
          [parent, Tone.WARN],
          [child, Tone.WARN],
        ]);
        return i;
      }
      if (right && right.keys.length >= t) {
        const down = parent.keys[i];
        const up = right.keys.shift()!;
        child.keys.push(down);
        parent.keys[i] = up;
        if (right.children.length) child.children.push(right.children.shift()!);
        tree.borrows++;
        yield tree.frame(`Its right sibling can spare one: ${up} moves up into the parent and ${down} comes down into the child.`, 7, [
          [right, Tone.MARK],
          [parent, Tone.WARN],
          [child, Tone.WARN],
        ]);
        return i;
      }
      const at = right ? i : i - 1;
      const merged = yield* merge(parent, at, 8, "Neither sibling can spare a key");
      return parent.children.indexOf(merged);
    }

    function* merge(parent: MNode, at: number, line: number, why: string): Generator<Step, MNode> {
      const a = parent.children[at];
      const b = parent.children[at + 1];
      const middle = parent.keys[at];
      a.keys = [...a.keys, middle, ...b.keys];
      a.children = [...a.children, ...b.children];
      parent.keys.splice(at, 1);
      parent.children.splice(at + 1, 1);
      tree.merges++;
      yield tree.frame(`${why}: merge the two siblings with ${middle} from the parent between them: ${a.keys.join(", ")}.`, line, [
        [parent, Tone.MARK],
        [a, Tone.WARN],
      ]);
      if (parent === tree.root && parent.keys.length === 0) {
        tree.root = a;
        yield tree.frame("The root gave its last key away: the merged node becomes the root, and the tree is one level shorter.", 12, [[a, Tone.DONE]]);
      }
      return a;
    }

    function* remove(key: number): Generator<Step, boolean> {
      let node = tree.root;
      for (;;) {
        let i = 0;
        while (i < node.keys.length && key > node.keys[i]) {
          tree.comparisons++;
          i++;
        }
        tree.comparisons++;
        const here = node.keys[i] === key;
        if (node.children.length === 0) {
          if (!here) {
            yield tree.frame(`${key} isn't in this leaf, so it isn't in the tree.`, 9, [[node, Tone.BAD]]);
            return false;
          }
          node.keys.splice(i, 1);
          yield tree.frame(`${key} is in this leaf: remove it${node.keys.length ? `, leaving ${node.keys.join(", ")}` : ""}.`, 9, [[node, Tone.WARN]]);
          return true;
        }
        if (here) {
          const before = node.children[i];
          const after = node.children[i + 1];
          yield tree.frame(`${key} is in this inner node: it can't simply go, a child hangs on each side.`, 10, [[node, Tone.ACTIVE]]);
          if (before.keys.length >= t || after.keys.length >= t) {
            const use_before = before.keys.length >= t;
            let leaf = use_before ? before : after;
            while (leaf.children.length) leaf = use_before ? leaf.children[leaf.children.length - 1] : leaf.children[0];
            const swap = use_before ? leaf.keys[leaf.keys.length - 1] : leaf.keys[0];
            node.keys[i] = swap;
            yield tree.frame(
              `The ${use_before ? "left" : "right"} child has keys to spare: put ${key}'s ${use_before ? "predecessor" : "successor"} ${swap} in its place, then delete ${swap} from that side.`,
              10,
              [
                [node, Tone.WARN],
                [leaf, Tone.COMPARE],
              ]
            );
            key = swap;
            node = use_before ? before : after;
            continue;
          }
          node = yield* merge(node, i, 11, `Both children around ${key} have only ${t - 1}`);
          continue;
        }
        yield tree.frame(`${key} falls between the keys here: go down to child ${i + 1}.`, 6, [[node, Tone.COMPARE]]);
        if (node.children[i].keys.length === t - 1) i = yield* top_up(node, i);
        node = node.children[i];
      }
    }

    function* split(parent: MNode, index: number): Generator<Step> {
      const full = parent.children[index];
      const middle = full.keys[t - 1];
      const right = tree.make(full.keys.slice(t), full.children.slice(t));
      full.keys = full.keys.slice(0, t - 1);
      full.children = full.children.slice(0, t);
      parent.keys.splice(index, 0, middle);
      parent.children.splice(index + 1, 0, right);
      tree.splits++;
      yield tree.frame(`Split the full node: ${middle} moves up, the keys around it become two nodes.`, 2, [
        [parent, Tone.WARN],
        [full, Tone.MARK],
        [right, Tone.MARK],
      ]);
    }

    for (const item of ops) {
      yield tree.frame(`${op_text(item)}.`, item.op === "insert" ? 0 : item.op === "find" ? 4 : 6);
      if (item.op === "delete") {
        if (yield* remove(item.key)) yield tree.frame(`${item.key} is gone. Every node but the root still has at least ${t - 1} ${t - 1 === 1 ? "key" : "keys"}, and every leaf sits at the same depth.`, 6);
        continue;
      }
      if (item.op === "find") {
        let node: MNode | undefined = tree.root;
        let hit = false;
        while (node) {
          let i = 0;
          while (i < node.keys.length && item.key > node.keys[i]) {
            tree.comparisons++;
            i++;
          }
          tree.comparisons++;
          if (node.keys[i] === item.key) {
            hit = true;
            yield tree.frame(`Found ${item.key} in this node.`, 5, [[node, Tone.DONE]]);
            break;
          }
          yield tree.frame(node.children.length ? `${item.key} falls between the keys here: go down to child ${i + 1}.` : `${item.key} isn't in this leaf.`, 5, [[node, Tone.COMPARE]]);
          node = node.children[i];
        }
        found.push(hit);
        if (!hit) yield tree.frame(`${item.key} isn't in the tree.`, 5);
        continue;
      }
      if (tree.all_keys().includes(item.key)) {
        yield tree.frame(`${item.key} is already in the tree.`, 0);
        continue;
      }
      if (tree.root.keys.length === max) {
        const old = tree.root;
        tree.root = tree.make([], [old]);
        yield tree.frame(`The root is full (${max} keys): grow a new root above it, then split.`, 0, [[old, Tone.BAD]]);
        yield* split(tree.root, 0);
      }
      let node = tree.root;
      while (node.children.length) {
        let i = 0;
        while (i < node.keys.length && item.key > node.keys[i]) {
          tree.comparisons++;
          i++;
        }
        yield tree.frame(`${item.key} goes down to child ${i + 1} of this node.`, 1, [[node, Tone.COMPARE]]);
        if (node.children[i].keys.length === max) {
          yield tree.frame(`That child is full: split it before going in.`, 2, [[node.children[i], Tone.BAD]]);
          yield* split(node, i);
          if (item.key > node.keys[i]) i++;
        }
        node = node.children[i];
      }
      const at = node.keys.findIndex((key) => key > item.key);
      node.keys.splice(at === -1 ? node.keys.length : at, 0, item.key);
      yield tree.frame(`Put ${item.key} in the leaf: ${node.keys.join(", ")}.`, 3, [[node, Tone.WARN]]);
    }
    yield tree.frame("Done. Every leaf is at the same depth.", -1);
    return { keys: tree.all_keys(), found, root: tree.snapshot(), max_keys: max, min_keys: t - 1 };
  },
});

const b_plus = define({
  intro:
    "A B-tree where every key lives in a leaf and the inner nodes only hold copies that guide the search. The leaves are linked in order, so a range scan finds its first key and then just walks along the leaves. When a leaf splits it copies its first key up; when an inner node splits it moves its middle key up.",
  use: "The index structure in nearly every relational database (InnoDB, PostgreSQL), because range queries and full scans are cheap.",
  traits: ["Ordered", "Balanced", "Linked leaves"],
  pseudocode: [
    "insert(k): walk down to the leaf where k belongs",
    "  put k in the leaf, in order",
    "  leaf too big: split it, copy the new right leaf's first key up",
    "  inner node too big: split it, move its middle key up",
    "  the root split: a new root above the two halves",
    "find(k): walk down to the leaf, look for k there",
  ],
  input: key_ops({ sample: inserts(10, 20, 30, 40, 5, 15, 25, 35, 45, 50, 1), allow: ["insert", "find"], max_count: 60 }),
  presets: [
    { label: "Sample", value: inserts(10, 20, 30, 40, 5, 15, 25, 35, 45, 50, 1) },
    { label: "Ascending keys", value: inserts(...Array.from({ length: 18 }, (_, i) => (i + 1) * 5)) },
  ],
  params: [{ id: "order", label: "Max keys per node", kind: "number", min: 3, max: 5, default: 3 }],
  operations: key_operations(["insert", "find"]),
  *run(ops: KeyOp[], params) {
    const max = Number(params.order ?? 3);
    const tree = new Multi();
    tree.root.next = null;
    const found: boolean[] = [];
    const leaves = () => {
      let node = tree.root;
      while (node.children.length) node = node.children[0];
      const list: MNode[] = [];
      for (let leaf: MNode | null | undefined = node; leaf; leaf = leaf.next) list.push(leaf);
      return list;
    };
    const chain = (active?: MNode): View => ({ kind: "chain", title: "leaves, linked", items: leaves().map((leaf) => ({ text: leaf.keys.join(" · ") || "∅", tone: leaf === active ? Tone.WARN : undefined })) });

    function* insert(node: MNode, key: number): Generator<Step, { key: number; right: MNode } | null> {
      if (node.children.length === 0) {
        const at = node.keys.findIndex((k) => k > key);
        node.keys.splice(at === -1 ? node.keys.length : at, 0, key);
        yield tree.frame(`Put ${key} in the leaf: ${node.keys.join(", ")}.`, 1, [[node, Tone.WARN]], [chain(node)]);
        if (node.keys.length <= max) return null;
        const half = Math.ceil(node.keys.length / 2);
        const right = tree.make(node.keys.slice(half));
        node.keys = node.keys.slice(0, half);
        right.next = node.next;
        node.next = right;
        tree.splits++;
        yield tree.frame(`The leaf has ${max + 1} keys: split it and copy ${right.keys[0]} up.`, 2, [
          [node, Tone.MARK],
          [right, Tone.MARK],
        ], [chain(right)]);
        return { key: right.keys[0], right };
      }
      let i = 0;
      while (i < node.keys.length && key >= node.keys[i]) {
        tree.comparisons++;
        i++;
      }
      yield tree.frame(`${key} goes down to child ${i + 1}.`, 0, [[node, Tone.COMPARE]], [chain()]);
      const split = yield* insert(node.children[i], key);
      if (!split) return null;
      node.keys.splice(i, 0, split.key);
      node.children.splice(i + 1, 0, split.right);
      yield tree.frame(`${split.key} lands in the inner node above.`, 2, [[node, Tone.WARN]], [chain()]);
      if (node.keys.length <= max) return null;
      const mid = Math.floor(node.keys.length / 2);
      const up = node.keys[mid];
      const right = tree.make(node.keys.slice(mid + 1), node.children.slice(mid + 1));
      node.keys = node.keys.slice(0, mid);
      node.children = node.children.slice(0, mid + 1);
      tree.splits++;
      yield tree.frame(`The inner node is too big: split it and move ${up} up (inner keys aren't copied).`, 3, [
        [node, Tone.MARK],
        [right, Tone.MARK],
      ], [chain()]);
      return { key: up, right };
    }

    for (const item of ops) {
      yield tree.frame(`${op_text(item)}.`, item.op === "insert" ? 0 : 5, [], [chain()]);
      if (item.op === "find") {
        let node = tree.root;
        while (node.children.length) {
          let i = 0;
          while (i < node.keys.length && item.key >= node.keys[i]) {
            tree.comparisons++;
            i++;
          }
          yield tree.frame(`${item.key} goes down to child ${i + 1}.`, 5, [[node, Tone.COMPARE]], [chain()]);
          node = node.children[i];
        }
        const hit = node.keys.includes(item.key);
        found.push(hit);
        yield tree.frame(hit ? `Found ${item.key} in its leaf.` : `${item.key} isn't in the leaf, so it isn't in the tree.`, 5, [[node, hit ? Tone.DONE : Tone.BAD]], [chain(node)]);
        continue;
      }
      if (tree.all_keys(tree.root, true).includes(item.key)) {
        yield tree.frame(`${item.key} is already in the tree.`, 0, [], [chain()]);
        continue;
      }
      const split = yield* insert(tree.root, item.key);
      if (split) {
        const old = tree.root;
        tree.root = tree.make([split.key], [old, split.right]);
        yield tree.frame(`The root split: ${split.key} heads a new root.`, 4, [[tree.root, Tone.WARN]], [chain()]);
      }
    }
    yield tree.frame("Done. Every key is in a leaf, and the leaves read in order.", -1, [], [chain()]);
    return { keys: tree.all_keys(tree.root, true), found, root: tree.snapshot(), max_keys: max };
  },
});

interface TrieOp {
  op: "insert" | "find" | "prefix";
  word: string;
}

const WORD = /^[a-z]{1,12}$/;

function trie_spec(sample: TrieOp[]): InputSpec<TrieOp[]> {
  const prefix = { insert: "", find: "find ", prefix: "prefix " };
  return {
    kind: InputKind.TEXT,
    hint: "Words to insert, comma separated; also find car, prefix ca",
    schema: z.array(z.object({ op: z.enum(["insert", "find", "prefix"]), word: z.string().regex(WORD) })).max(40),
    parse: (text) => {
      const ops = text
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean)
        .map((part): TrieOp => {
          const match = /^(?:(find|prefix)\s+)?([a-z]+)$/.exec(part);
          if (!match || !WORD.test(match[2])) throw new InputError(`Can't read “${part}”: words of letters a–z, up to 12 long.`);
          return { op: (match[1] as "find" | "prefix" | undefined) ?? "insert", word: match[2] };
        });
      if (ops.length === 0) throw new InputError("Give at least one word.");
      if (ops.length > 40) throw new InputError("At most 40 operations here.");
      return ops;
    },
    format: (ops) => ops.map((item) => `${prefix[item.op]}${item.word}`).join(", "),
    random: () => shuffled(["car", "cart", "care", "cat", "dog", "dot", "do", "door", "tea", "ten", "to", "toy"]).slice(0, 7).map((word) => ({ op: "insert" as const, word })),
    sample,
  };
}

interface TNode {
  id: string;
  char: string;
  end: boolean;
  children: Map<string, TNode>;
}

const trie = define({
  intro:
    "A tree of characters: each edge adds one letter, and a path from the root spells a word. Words that share a beginning share that path. Looking a word up costs its length, not the number of words stored, and every word with a given prefix sits under one node.",
  use: "Autocomplete, spell checkers, IP routing tables (as bit tries), and dictionary word games.",
  traits: ["Prefix sharing", "Lookup in O(length)"],
  pseudocode: [
    "insert(w): node ← root",
    "  for each letter c of w: follow the edge c, adding it if missing",
    "  mark the last node as the end of a word",
    "find(w): follow the letters; a word only if the last node is marked",
    "prefix(p): follow the letters, then collect every word below",
  ],
  input: trie_spec([
    ...["car", "cart", "care", "cat", "dog", "do"].map((word) => ({ op: "insert" as const, word })),
    { op: "find", word: "car" },
    { op: "prefix", word: "ca" },
  ]),
  operations: {
    list: [
      { id: "insert", label: "Insert", placeholder: "word" },
      { id: "find", label: "Find", placeholder: "word" },
      { id: "prefix", label: "Prefix", placeholder: "start" },
    ],
    apply: (input, operation, value) => {
      const word = value.toLowerCase();
      if (!WORD.test(word)) throw new InputError("Letters a–z, up to 12 long.");
      return [...input, { op: operation as TrieOp["op"], word }];
    },
  },
  *run(ops: TrieOp[]) {
    let count = 0;
    const root: TNode = { id: "t-root", char: "", end: false, children: new Map() };
    let visits = 0;
    const snapshot = (node: TNode, marks: Map<TNode, Tone>): TreeNode => ({
      id: node.id,
      label: node === root ? "·" : node.char,
      tone: marks.get(node),
      badge: node.end ? "word" : undefined,
      children: [...node.children.values()].sort((a, b) => a.char.localeCompare(b.char)).map((child) => snapshot(child, marks)),
    });
    const frame = (note: string, line: number, marks: [TNode, Tone][] = [], extra: View[] = []): Step => ({
      views: [{ kind: "tree", roots: [snapshot(root, new Map(marks))] }, ...extra],
      line,
      note,
      counters: { visits, nodes: count + 1 },
    });
    const results: (boolean | string[])[] = [];
    for (const item of ops) {
      yield frame(`${item.op === "insert" ? "Insert" : item.op === "find" ? "Find" : "Words starting with"} “${item.word}”.`, item.op === "insert" ? 0 : item.op === "find" ? 3 : 4, [[root, Tone.ACTIVE]]);
      let node: TNode | undefined = root;
      const path: [TNode, Tone][] = [[root, Tone.MARK]];
      for (const [i, char] of [...item.word].entries()) {
        visits++;
        let next: TNode | undefined = node.children.get(char);
        if (!next && item.op === "insert") {
          next = { id: `t${count++}`, char, end: false, children: new Map() };
          node.children.set(char, next);
          path.push([next, Tone.WARN]);
          yield frame(`No “${char}” edge yet: add it.`, 1, path);
        } else if (!next) {
          yield frame(`No “${char}” after “${item.word.slice(0, i)}”: “${item.word}” isn't here.`, item.op === "find" ? 3 : 4, [...path, [node, Tone.BAD]]);
          node = undefined;
          break;
        } else {
          path.push([next, Tone.MARK]);
          yield frame(`Follow “${char}”.`, item.op === "insert" ? 1 : item.op === "find" ? 3 : 4, [...path.slice(0, -1), [next, Tone.ACTIVE]]);
        }
        node = next;
      }
      if (item.op === "insert" && node) {
        node.end = true;
        yield frame(`Mark the end of “${item.word}”.`, 2, [...path.slice(0, -1), [node, Tone.DONE]]);
      } else if (item.op === "find") {
        const hit = Boolean(node?.end);
        results.push(hit);
        if (node) yield frame(hit ? `“${item.word}” is a word in the trie.` : `The path exists, but “${item.word}” was never inserted as a word.`, 3, [...path.slice(0, -1), [node, hit ? Tone.DONE : Tone.BAD]]);
      } else if (item.op === "prefix") {
        const words: string[] = [];
        const marks: [TNode, Tone][] = [...path];
        const collect = (at: TNode, sofar: string) => {
          if (at.end) words.push(sofar);
          for (const child of [...at.children.values()].sort((a, b) => a.char.localeCompare(b.char))) {
            marks.push([child, Tone.DONE]);
            collect(child, sofar + child.char);
          }
        };
        if (node) collect(node, item.word);
        results.push(words);
        yield frame(words.length ? `${words.length} ${words.length === 1 ? "word starts" : "words start"} with “${item.word}”.` : `No word starts with “${item.word}”.`, 4, marks, [
          { kind: "text", title: "matches", lines: words.map((word) => ({ text: word, tone: Tone.DONE })) },
        ]);
      }
    }
    const all: string[] = [];
    const walk = (at: TNode, sofar: string) => {
      if (at.end) all.push(sofar);
      for (const child of at.children.values()) walk(child, sofar + child.char);
    };
    walk(root, "");
    yield frame(`Done. ${all.length} words, ${count} letter nodes.`, -1);
    return { words: all.sort(), results };
  },
});

export default { b_tree, b_plus, trie };
