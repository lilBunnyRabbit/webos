import { define } from "../../engine/definition";
import { Tone, type Step, type TreeNode } from "../../engine/step";
import { inserts, key_operations, key_ops, key_presets, KeyOpKind, op_text, priority_of, type KeyOp } from "./common";

export interface Node {
  id: string;
  key: number;
  left: Node | null;
  right: Node | null;
  parent: Node | null;
  height: number;
  red: boolean;
}

export interface TreeResult {
  keys: number[];
  found: boolean[];
  root: TreeNode | null;
}

const height = (node: Node | null) => node?.height ?? 0;
const balance = (node: Node) => height(node.left) - height(node.right);

export class Bst {
  root: Node | null = null;
  comparisons = 0;
  rotations = 0;
  private next = 0;
  readonly tones = new Map<Node, Tone>();

  constructor(
    private readonly badge: (node: Node) => string | undefined = () => undefined,
    private readonly coloured = false
  ) {}

  make(key: number): Node {
    return { id: `n${this.next++}`, key, left: null, right: null, parent: null, height: 1, red: false };
  }

  snapshot(node: Node | null = this.root): TreeNode | null {
    if (!node) return null;
    return {
      id: node.id,
      label: String(node.key),
      tone: this.tones.get(node),
      badge: this.badge(node),
      red: node.red,
      black: this.coloured && !node.red,
      children: [this.snapshot(node.left), this.snapshot(node.right)],
    };
  }

  frame(note: string, line: number, marks: [Node | null, Tone][] = []): Step {
    const saved = new Map(this.tones);
    for (const [node, tone] of marks) if (node) this.tones.set(node, tone);
    const root = this.snapshot();
    this.tones.clear();
    for (const [node, tone] of saved) this.tones.set(node, tone);
    return {
      views: [{ kind: "tree", roots: root ? [root] : [] }],
      line,
      note,
      counters: { comparisons: this.comparisons, rotations: this.rotations, height: height_of(this.root) },
    };
  }

  replace(parent: Node | null, old: Node, next: Node | null) {
    if (!parent) this.root = next;
    else if (parent.left === old) parent.left = next;
    else parent.right = next;
    if (next) next.parent = parent;
  }

  rotate_left(x: Node): Node {
    const y = x.right!;
    this.replace(x.parent, x, y);
    x.right = y.left;
    if (y.left) y.left.parent = x;
    y.left = x;
    x.parent = y;
    this.rotations++;
    update(x);
    update(y);
    return y;
  }

  rotate_right(x: Node): Node {
    const y = x.left!;
    this.replace(x.parent, x, y);
    x.left = y.right;
    if (y.right) y.right.parent = x;
    y.right = x;
    x.parent = y;
    this.rotations++;
    update(x);
    update(y);
    return y;
  }

  *descend(key: number, line: number, verb: string): Generator<Step, { node: Node | null; last: Node | null }> {
    let x = this.root;
    let last: Node | null = null;
    while (x) {
      this.comparisons++;
      if (key === x.key) {
        yield this.frame(`${verb}: ${key} = ${x.key}, found it.`, line, [[x, Tone.ACTIVE]]);
        return { node: x, last: x };
      }
      const left = key < x.key;
      yield this.frame(`${verb}: ${key} ${left ? "<" : ">"} ${x.key}, go ${left ? "left" : "right"}.`, line, [[x, Tone.COMPARE]]);
      last = x;
      x = left ? x.left : x.right;
    }
    return { node: null, last };
  }

  *insert(key: number, lines: { walk: number; hang: number }): Generator<Step, Node | null> {
    if (!this.root) {
      this.root = this.make(key);
      yield this.frame(`The tree is empty: ${key} becomes the root.`, lines.hang, [[this.root, Tone.WARN]]);
      return this.root;
    }
    const { node, last } = yield* this.descend(key, lines.walk, `Insert ${key}`);
    if (node) {
      yield this.frame(`${key} is already in the tree: nothing to add.`, lines.walk, [[node, Tone.MARK]]);
      return null;
    }
    const fresh = this.make(key);
    fresh.parent = last;
    if (key < last!.key) last!.left = fresh;
    else last!.right = fresh;
    for (let x: Node | null = last; x; x = x.parent) update(x);
    yield this.frame(`Hang ${key} as the ${key < last!.key ? "left" : "right"} child of ${last!.key}.`, lines.hang, [[fresh, Tone.WARN]]);
    return fresh;
  }

  min(node: Node): Node {
    while (node.left) node = node.left;
    return node;
  }

  max(node: Node): Node {
    while (node.right) node = node.right;
    return node;
  }

  keys(node: Node | null = this.root, into: number[] = []): number[] {
    if (!node) return into;
    this.keys(node.left, into);
    into.push(node.key);
    this.keys(node.right, into);
    return into;
  }

  *remove(z: Node, lines: { leaf: number; one: number; two: number; copy: number }): Generator<Step, Node | null> {
    if (z.left && z.right) {
      const s = this.min(z.right);
      yield this.frame(`${z.key} has two children: its successor is ${s.key}, the smallest key on its right.`, lines.two, [
        [z, Tone.ACTIVE],
        [s, Tone.COMPARE],
      ]);
      const old = z.key;
      z.key = s.key;
      yield this.frame(`Copy ${s.key} over ${old}, then remove the old ${s.key} below.`, lines.copy, [
        [z, Tone.WARN],
        [s, Tone.BAD],
      ]);
      return yield* this.remove(s, lines);
    }
    const child = z.left ?? z.right;
    const parent = z.parent;
    this.replace(parent, z, child);
    for (let x = parent; x; x = x.parent) update(x);
    yield this.frame(
      child ? `${z.key} has one child: ${child.key} takes its place.` : `${z.key} is a leaf: just remove it.`,
      child ? lines.one : lines.leaf,
      child ? [[child, Tone.WARN]] : []
    );
    return parent;
  }
}

function update(node: Node) {
  node.height = 1 + Math.max(height(node.left), height(node.right));
}

function height_of(node: Node | null): number {
  return node ? 1 + Math.max(height_of(node.left), height_of(node.right)) : 0;
}

function result(tree: Bst, found: boolean[]): TreeResult {
  return { keys: tree.keys(), found, root: tree.snapshot() };
}

const BALANCED = inserts(50, 30, 70, 20, 40, 60, 80);

const bst = define({
  intro:
    "Every node keeps smaller keys on its left and larger keys on its right, so a search goes down one path, choosing a side at each node. Insert and delete follow the same path. Nothing keeps it balanced: insert keys in order and it becomes a linked list.",
  use: "The idea behind every ordered map and index. Use a balanced variant (AVL, red-black, B-tree) when keys may arrive sorted.",
  traits: ["Ordered", "Not balanced"],
  pseudocode: [
    "insert(k): x ← root",
    "  go left if k < x.key, else right, until x is nil",
    "  hang the new node where the walk fell off",
    "find(k): walk down the same way until k or nil",
    "delete(k): find the node z",
    "  no children: remove z",
    "  one child: the child takes z's place",
    "  two children: s ← the smallest key right of z",
    "    copy s.key into z, then delete s",
  ],
  input: key_ops({ sample: [...BALANCED, { op: KeyOpKind.FIND, key: 60 }, { op: KeyOpKind.DELETE, key: 30 }], allow: ["insert", "delete", "find"] }),
  presets: key_presets(),
  operations: key_operations(["insert", "delete", "find"]),
  *run(ops: KeyOp[]) {
    const tree = new Bst();
    const found: boolean[] = [];
    for (const item of ops) {
      yield tree.frame(`${op_text(item)}.`, item.op === "insert" ? 0 : item.op === "find" ? 3 : 4);
      if (item.op === "insert") yield* tree.insert(item.key, { walk: 1, hang: 2 });
      else {
        const { node } = yield* tree.descend(item.key, item.op === "find" ? 3 : 4, op_text(item));
        if (item.op === "find") {
          found.push(Boolean(node));
          yield tree.frame(node ? `Found ${item.key}.` : `${item.key} isn't in the tree.`, 3, node ? [[node, Tone.DONE]] : []);
        } else if (!node) yield tree.frame(`${item.key} isn't in the tree: nothing to delete.`, 4);
        else yield* tree.remove(node, { leaf: 5, one: 6, two: 7, copy: 8 });
      }
    }
    yield tree.frame("Done.", -1);
    return result(tree, found);
  },
});

const avl = define({
  intro:
    "A binary search tree that stays balanced: at every node the heights of the two subtrees differ by at most one. After an insert or delete it walks back up, and wherever that balance breaks it rotates, which fixes it in constant time. Height stays at about 1.44 log n.",
  use: "Lookup-heavy ordered maps where you want the tightest balance, like in-memory indexes.",
  traits: ["Ordered", "Balanced", "Rotations"],
  pseudocode: [
    "insert(k) like a binary search tree",
    "walk back up to the root:",
    "  update the height; bf ← height(left) − height(right)",
    "  bf = 2, left child leans left: rotate right",
    "  bf = 2, left child leans right: rotate its left child left, then right",
    "  bf = −2: the mirror cases",
    "delete(k) like a binary search tree, then the same walk up",
    "find(k) like a binary search tree",
  ],
  input: key_ops({ sample: inserts(10, 20, 30, 40, 50, 25), allow: ["insert", "delete", "find"] }),
  presets: key_presets(),
  operations: key_operations(["insert", "delete", "find"]),
  *run(ops: KeyOp[]) {
    const tree = new Bst((node) => `bf ${balance(node) > 0 ? "+" : ""}${balance(node)}`);
    const found: boolean[] = [];
    function* rebalance(start: Node | null): Generator<Step> {
      for (let x = start; x; x = x.parent) {
        update(x);
        const bf = balance(x);
        if (Math.abs(bf) < 2) continue;
        yield tree.frame(`${x.key} is out of balance (bf ${bf > 0 ? "+" : ""}${bf}).`, 2, [[x, Tone.BAD]]);
        if (bf > 1) {
          if (balance(x.left!) < 0) {
            yield tree.frame(`Its left child ${x.left!.key} leans right: rotate ${x.left!.key} left first.`, 4, [[x.left, Tone.ACTIVE]]);
            tree.rotate_left(x.left!);
          }
          yield tree.frame(`Rotate ${x.key} right.`, 3, [[x, Tone.ACTIVE]]);
          x = tree.rotate_right(x);
        } else {
          if (balance(x.right!) > 0) {
            yield tree.frame(`Its right child ${x.right!.key} leans left: rotate ${x.right!.key} right first.`, 5, [[x.right, Tone.ACTIVE]]);
            tree.rotate_right(x.right!);
          }
          yield tree.frame(`Rotate ${x.key} left.`, 5, [[x, Tone.ACTIVE]]);
          x = tree.rotate_left(x);
        }
        yield tree.frame(`Balanced again: ${x.key} is now the subtree's root.`, 1, [[x, Tone.DONE]]);
      }
    }
    for (const item of ops) {
      yield tree.frame(`${op_text(item)}.`, item.op === "insert" ? 0 : item.op === "find" ? 7 : 6);
      if (item.op === "insert") {
        const fresh = yield* tree.insert(item.key, { walk: 0, hang: 0 });
        if (fresh) {
          yield tree.frame("Walk back up, checking each balance factor.", 1, [[fresh.parent, Tone.MARK]]);
          yield* rebalance(fresh.parent);
        }
      } else {
        const { node } = yield* tree.descend(item.key, item.op === "find" ? 7 : 6, op_text(item));
        if (item.op === "find") {
          found.push(Boolean(node));
          yield tree.frame(node ? `Found ${item.key}.` : `${item.key} isn't in the tree.`, 7, node ? [[node, Tone.DONE]] : []);
        } else if (!node) yield tree.frame(`${item.key} isn't in the tree: nothing to delete.`, 6);
        else {
          const from = yield* tree.remove(node, { leaf: 6, one: 6, two: 6, copy: 6 });
          yield* rebalance(from);
        }
      }
    }
    yield tree.frame("Done. Every balance factor is −1, 0 or +1.", -1);
    return result(tree, found);
  },
});

const red_black = define({
  intro:
    "A binary search tree whose nodes are red or black, with two rules: a red node has no red child, and every path from a node down to a leaf passes the same number of black nodes. Inserting a red node may break the first rule; recolouring and at most two rotations fix it. The longest path is at most twice the shortest.",
  use: "The balanced tree in most standard libraries (Java TreeMap, C++ std::map, the Linux scheduler): fewer rotations than AVL on updates.",
  traits: ["Ordered", "Balanced", "At most 2 rotations per insert"],
  pseudocode: [
    "insert(k) like a binary search tree, colour it red",
    "while z's parent is red:",
    "  uncle red: parent and uncle black, grandparent red; z ← grandparent",
    "  uncle black, z an inner child: rotate z's parent; z ← old parent",
    "  uncle black, z an outer child: swap colours, rotate the grandparent",
    "colour the root black",
    "find(k) like a binary search tree",
  ],
  input: key_ops({ sample: inserts(10, 20, 30, 15, 25, 5, 1), allow: ["insert", "find"] }),
  presets: key_presets(),
  operations: key_operations(["insert", "find"]),
  *run(ops: KeyOp[]) {
    const tree = new Bst(undefined, true);
    const found: boolean[] = [];
    for (const item of ops) {
      yield tree.frame(`${op_text(item)}.`, item.op === "insert" ? 0 : 6);
      if (item.op === "find") {
        const { node } = yield* tree.descend(item.key, 6, op_text(item));
        found.push(Boolean(node));
        yield tree.frame(node ? `Found ${item.key}.` : `${item.key} isn't in the tree.`, 6, node ? [[node, Tone.DONE]] : []);
        continue;
      }
      let z = yield* tree.insert(item.key, { walk: 0, hang: 0 });
      if (!z) continue;
      z.red = true;
      yield tree.frame(`New nodes start red.`, 0, [[z, Tone.ACTIVE]]);
      while (z.parent?.red) {
        const parent: Node = z.parent;
        const grand = parent.parent!;
        const left_side = grand.left === parent;
        const uncle = left_side ? grand.right : grand.left;
        yield tree.frame(`${z.key} and its parent ${parent.key} are both red: fix it.`, 1, [
          [z, Tone.BAD],
          [parent, Tone.BAD],
        ]);
        if (uncle?.red) {
          parent.red = false;
          uncle.red = false;
          grand.red = true;
          yield tree.frame(`Uncle ${uncle.key} is red too: recolour ${parent.key} and ${uncle.key} black, ${grand.key} red.`, 2, [
            [parent, Tone.WARN],
            [uncle, Tone.WARN],
            [grand, Tone.WARN],
          ]);
          z = grand;
          continue;
        }
        let p = parent;
        if (left_side ? z === parent.right : z === parent.left) {
          yield tree.frame(`Uncle is black and ${z.key} is an inner child: rotate ${parent.key} ${left_side ? "left" : "right"} to line them up.`, 3, [[parent, Tone.ACTIVE]]);
          if (left_side) tree.rotate_left(parent);
          else tree.rotate_right(parent);
          z = parent;
          p = z.parent!;
        }
        p.red = false;
        grand.red = true;
        yield tree.frame(`Make ${p.key} black and ${grand.key} red, then rotate ${grand.key} ${left_side ? "right" : "left"}.`, 4, [[grand, Tone.ACTIVE]]);
        if (left_side) tree.rotate_right(grand);
        else tree.rotate_left(grand);
        yield tree.frame(`Fixed: ${p.key} now heads this subtree.`, 4, [[p, Tone.DONE]]);
        break;
      }
      if (tree.root?.red) {
        tree.root.red = false;
        yield tree.frame("The root is always black.", 5, [[tree.root, Tone.WARN]]);
      }
    }
    yield tree.frame("Done. No red node has a red child, and every path has the same number of black nodes.", -1);
    return result(tree, found);
  },
});

const splay = define({
  intro:
    "A self-adjusting binary search tree with no balance information at all. Every access splays the node it touched to the root with zig, zig-zig and zig-zag rotations. Often-used keys stay near the top, and any sequence of m operations costs O(m log n) in total.",
  use: "Caches and workloads where a few keys are used far more than the rest; also simple to merge and split.",
  traits: ["Ordered", "Self-adjusting", "Amortised"],
  pseudocode: [
    "insert(k) like a binary search tree, then splay the new node",
    "find(k): walk down, splay the last node reached",
    "delete(k): splay k to the root",
    "  join: splay the largest key on the left to the top, hang the right side on it",
    "splay(x): while x isn't the root",
    "  zig: the parent is the root, rotate once",
    "  zig-zig: x and its parent on the same side: rotate the grandparent, then the parent",
    "  zig-zag: opposite sides: rotate the parent, then the grandparent",
  ],
  input: key_ops({ sample: [...inserts(50, 30, 70, 20, 40, 60, 80), { op: KeyOpKind.FIND, key: 20 }, { op: KeyOpKind.DELETE, key: 50 }], allow: ["insert", "delete", "find"] }),
  presets: key_presets(),
  operations: key_operations(["insert", "delete", "find"]),
  *run(ops: KeyOp[]) {
    const tree = new Bst();
    const found: boolean[] = [];
    const up = (x: Node) => (x.parent!.left === x ? tree.rotate_right(x.parent!) : tree.rotate_left(x.parent!));
    function* splay_node(x: Node): Generator<Step> {
      while (x.parent) {
        const p = x.parent;
        const g = p.parent;
        if (!g) {
          yield tree.frame(`Zig: ${p.key} is the root, rotate ${x.key} above it.`, 5, [[x, Tone.ACTIVE]]);
          up(x);
        } else if ((g.left === p) === (p.left === x)) {
          yield tree.frame(`Zig-zig: ${x.key} and ${p.key} are both ${p.left === x ? "left" : "right"} children. Rotate ${g.key}, then ${p.key}.`, 6, [[x, Tone.ACTIVE]]);
          up(p);
          up(x);
        } else {
          yield tree.frame(`Zig-zag: ${x.key} goes the other way from ${p.key}. Rotate ${p.key}, then ${g.key}.`, 7, [[x, Tone.ACTIVE]]);
          up(x);
          up(x);
        }
      }
      yield tree.frame(`${x.key} is the root now.`, 4, [[x, Tone.DONE]]);
    }
    for (const item of ops) {
      yield tree.frame(`${op_text(item)}.`, item.op === "insert" ? 0 : item.op === "find" ? 1 : 2);
      if (item.op === "insert") {
        const fresh = yield* tree.insert(item.key, { walk: 0, hang: 0 });
        if (fresh) yield* splay_node(fresh);
        continue;
      }
      const { node, last } = yield* tree.descend(item.key, item.op === "find" ? 1 : 2, op_text(item));
      if (item.op === "find") found.push(Boolean(node));
      if (last) yield* splay_node(last);
      if (item.op === "find") {
        yield tree.frame(node ? `Found ${item.key}, and it's at the root for next time.` : `${item.key} isn't in the tree; ${last?.key ?? "nothing"} was splayed instead.`, 1);
        continue;
      }
      if (!node) {
        yield tree.frame(`${item.key} isn't in the tree: nothing to delete.`, 2);
        continue;
      }
      const left = node.left;
      const right = node.right;
      if (left) left.parent = null;
      if (right) right.parent = null;
      if (!left) {
        tree.root = right;
        yield tree.frame(`${item.key} has no left side: the right side is the whole tree.`, 3);
        continue;
      }
      tree.root = left;
      yield tree.frame(`Remove ${item.key}. Splay the largest key of the left side to its top.`, 3, [[left, Tone.MARK]]);
      yield* splay_node(tree.max(left));
      tree.root!.right = right;
      if (right) right.parent = tree.root;
      yield tree.frame(`Hang the right side under ${tree.root!.key}.`, 3, [[tree.root, Tone.DONE]]);
    }
    yield tree.frame("Done.", -1);
    return result(tree, found);
  },
});

const treap = define({
  intro:
    "A tree that is a binary search tree by key and a max-heap by a random priority at the same time. Insert as in a search tree, then rotate the new node up while its priority beats its parent's. Random priorities make the shape random too, so the expected height is O(log n) whatever order keys arrive in.",
  use: "A short, simple balanced tree; also easy to split and merge (implicit treaps power rope data structures).",
  traits: ["Ordered", "Randomised", "Heap by priority"],
  pseudocode: [
    "insert(k) like a binary search tree, with a priority p(k)",
    "  while p(node) > p(parent): rotate the node above its parent",
    "delete(k): while the node has children",
    "  rotate the child with the higher priority above it",
    "  remove the leaf it became",
    "find(k) like a binary search tree",
  ],
  input: key_ops({ sample: inserts(50, 30, 70, 20, 40, 60, 80, 10), allow: ["insert", "delete", "find"] }),
  presets: key_presets(),
  operations: key_operations(["insert", "delete", "find"]),
  *run(ops: KeyOp[]) {
    const tree = new Bst((node) => `p ${priority_of(node.key)}`);
    const found: boolean[] = [];
    for (const item of ops) {
      yield tree.frame(`${op_text(item)}.`, item.op === "insert" ? 0 : item.op === "find" ? 5 : 2);
      if (item.op === "insert") {
        const fresh = yield* tree.insert(item.key, { walk: 0, hang: 0 });
        if (!fresh) continue;
        yield tree.frame(`${item.key} gets priority ${priority_of(item.key)}.`, 0, [[fresh, Tone.ACTIVE]]);
        while (fresh.parent && priority_of(fresh.key) > priority_of(fresh.parent.key)) {
          const p: Node = fresh.parent;
          yield tree.frame(`${priority_of(fresh.key)} > ${priority_of(p.key)}: rotate ${fresh.key} above ${p.key}.`, 1, [
            [fresh, Tone.ACTIVE],
            [p, Tone.COMPARE],
          ]);
          if (p.left === fresh) tree.rotate_right(p);
          else tree.rotate_left(p);
        }
        yield tree.frame(`${item.key} sits under a parent with a higher priority${fresh.parent ? "" : " (it's the root)"}.`, 1, [[fresh, Tone.DONE]]);
        continue;
      }
      const { node } = yield* tree.descend(item.key, item.op === "find" ? 5 : 2, op_text(item));
      if (item.op === "find") {
        found.push(Boolean(node));
        yield tree.frame(node ? `Found ${item.key}.` : `${item.key} isn't in the tree.`, 5, node ? [[node, Tone.DONE]] : []);
        continue;
      }
      if (!node) {
        yield tree.frame(`${item.key} isn't in the tree: nothing to delete.`, 2);
        continue;
      }
      while (node.left || node.right) {
        const pick = !node.right || (node.left && priority_of(node.left.key) > priority_of(node.right.key)) ? node.left! : node.right;
        yield tree.frame(`Rotate ${pick.key} (priority ${priority_of(pick.key)}) above ${item.key}.`, 3, [
          [node, Tone.BAD],
          [pick, Tone.ACTIVE],
        ]);
        if (pick === node.left) tree.rotate_right(node);
        else tree.rotate_left(node);
      }
      tree.replace(node.parent, node, null);
      yield tree.frame(`${item.key} is a leaf now: remove it.`, 4);
    }
    yield tree.frame("Done. Keys are in search-tree order and every parent's priority beats its children's.", -1);
    return result(tree, found);
  },
});

export default { bst, avl, red_black, splay, treap };
