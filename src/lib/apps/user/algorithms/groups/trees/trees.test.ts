import { describe, expect, test } from "vitest";
import { record, type Definition } from "../../engine/definition";
import type { TreeNode } from "../../engine/step";
import { KeyOpKind, priority_of, type KeyOp } from "./common";
import { huffman_codes } from "./forests";
import trees from "./index";

const run = <R>(id: string, input: unknown, params: Record<string, number | string> = {}) => {
  const recording = record(trees[id] as Definition<unknown, R>, input, params);
  expect(recording.truncated).toBe(false);
  for (const step of recording.steps) expect(step.note.length).toBeGreaterThan(0);
  return recording.result as R;
};

interface TreeResult {
  keys: number[];
  found: boolean[];
  root: TreeNode | null;
}

function random_ops(count: number, deletes: boolean): KeyOp[] {
  const ops: KeyOp[] = [];
  for (let i = 0; i < count; i++) {
    const key = Math.floor(Math.random() * 60);
    const roll = Math.random();
    ops.push({ op: deletes && roll < 0.25 ? KeyOpKind.DELETE : roll < 0.35 ? KeyOpKind.FIND : KeyOpKind.INSERT, key });
  }
  return ops;
}

function expected(ops: KeyOp[]): { keys: number[]; found: boolean[] } {
  const set = new Set<number>();
  const found: boolean[] = [];
  for (const item of ops) {
    if (item.op === KeyOpKind.INSERT) set.add(item.key);
    else if (item.op === KeyOpKind.DELETE) set.delete(item.key);
    else found.push(set.has(item.key));
  }
  return { keys: [...set].sort((a, b) => a - b), found };
}

const kids = (node: TreeNode) => node.children.filter((child): child is TreeNode => child !== null);
const key = (node: TreeNode) => Number(node.label);

function heights(node: TreeNode | null): number {
  return node ? 1 + Math.max(...node.children.map(heights)) : 0;
}

function black_height(node: TreeNode | null): number {
  if (!node) return 1;
  const [left, right] = node.children.map(black_height);
  expect(left).toBe(right);
  if (node.red) for (const child of kids(node)) expect(child.red).toBe(false);
  return left + (node.red ? 0 : 1);
}

describe("binary search trees keep their keys and answer finds", () => {
  for (const id of ["bst", "avl-tree", "splay-tree", "treap"]) {
    test(id, () => {
      for (let round = 0; round < 25; round++) {
        const ops = random_ops(30, true);
        const result = run<TreeResult>(id, ops);
        expect(result.keys).toEqual(expected(ops).keys);
        expect(result.found).toEqual(expected(ops).found);
      }
    });
  }

  test("red-black tree", () => {
    for (let round = 0; round < 25; round++) {
      const ops = random_ops(30, true);
      const result = run<TreeResult>("red-black-tree", ops);
      expect(result.keys).toEqual(expected(ops).keys);
      expect(result.found).toEqual(expected(ops).found);
    }
  });
});

describe("balance invariants", () => {
  test("AVL: every node's subtrees differ in height by at most one", () => {
    for (let round = 0; round < 25; round++) {
      const result = run<TreeResult>("avl-tree", random_ops(40, true));
      const check = (node: TreeNode | null) => {
        if (!node) return;
        const [l, r] = node.children.map(heights);
        expect(Math.abs(l - r)).toBeLessThanOrEqual(1);
        node.children.forEach(check);
      };
      check(result.root);
    }
  });

  test("AVL: sorted inserts stay logarithmic", () => {
    const ops = Array.from({ length: 63 }, (_, i) => ({ op: KeyOpKind.INSERT, key: i }));
    expect(heights(run<TreeResult>("avl-tree", ops).root)).toBeLessThanOrEqual(8);
    expect(heights(run<TreeResult>("bst", ops).root)).toBe(63);
  });

  test("red-black: black root, no red-red, equal black heights", () => {
    for (let round = 0; round < 200; round++) {
      const ops = random_ops(40, round % 2 === 0);
      const cut = 1 + Math.floor(Math.random() * ops.length);
      const result = run<TreeResult>("red-black-tree", ops.slice(0, cut));
      if (!result.root) continue;
      expect(result.root.red).toBe(false);
      black_height(result.root);
    }
  });

  test("red-black: deleting every key empties the tree, valid at each step", () => {
    const keys = Array.from({ length: 30 }, (_, i) => (i * 37) % 61);
    const ops: KeyOp[] = keys.map((k) => ({ op: KeyOpKind.INSERT, key: k }));
    for (const k of [...keys].reverse()) {
      ops.push({ op: KeyOpKind.DELETE, key: k });
      const result = run<TreeResult>("red-black-tree", ops);
      expect(result.keys).toEqual(expected(ops).keys);
      if (result.root) black_height(result.root);
    }
    expect(run<TreeResult>("red-black-tree", ops).root).toBeNull();
  });

  test("treap: heap order on priorities", () => {
    for (let round = 0; round < 25; round++) {
      const result = run<TreeResult>("treap", random_ops(40, true));
      const check = (node: TreeNode) => {
        for (const child of kids(node)) {
          expect(priority_of(key(node))).toBeGreaterThanOrEqual(priority_of(key(child)));
          check(child);
        }
      };
      if (result.root) check(result.root);
    }
  });

  test("splay: a found key ends at the root", () => {
    const result = run<TreeResult>("splay-tree", [
      ...[50, 30, 70, 20, 40].map((k) => ({ op: KeyOpKind.INSERT, key: k })),
      { op: KeyOpKind.FIND, key: 20 },
    ]);
    expect(result.root?.label).toBe("20");
  });
});

describe("B-trees", () => {
  const keys_of = (node: TreeNode): number[] => node.label.split(" · ").filter((part) => part !== "∅").map(Number);
  const leaf_depths = (node: TreeNode, depth = 0, into: number[] = []) => {
    if (node.children.length === 0) into.push(depth);
    for (const child of kids(node)) leaf_depths(child, depth + 1, into);
    return into;
  };

  for (const t of [2, 3, 4]) {
    test(`B-tree t=${t}: sorted keys, node sizes, equal leaf depths`, () => {
      for (let round = 0; round < 60; round++) {
        const all = random_ops(50, round % 3 !== 0);
        const ops = all.slice(0, 1 + Math.floor(Math.random() * all.length));
        const result = run<TreeResult & { max_keys: number; min_keys: number }>("b-tree", ops, { t });
        expect(result.keys).toEqual(expected(ops).keys);
        expect(result.found).toEqual(expected(ops).found);
        expect(new Set(leaf_depths(result.root!)).size).toBe(1);
        const sizes = (node: TreeNode, root: boolean) => {
          const count = keys_of(node).length;
          expect(count).toBeLessThanOrEqual(result.max_keys);
          if (!root) expect(count).toBeGreaterThanOrEqual(result.min_keys);
          if (node.children.length) expect(node.children.length).toBe(count + 1);
          kids(node).forEach((child) => sizes(child, false));
        };
        sizes(result.root!, true);
      }
    });
  }

  test("B-tree: deleting every key leaves an empty root", () => {
    for (const t of [2, 3]) {
      const keys = Array.from({ length: 40 }, (_, i) => (i * 23) % 97);
      const ops: KeyOp[] = [...keys.map((k) => ({ op: KeyOpKind.INSERT, key: k })), ...keys.map((k) => ({ op: KeyOpKind.DELETE, key: k }))];
      const result = run<TreeResult>("b-tree", ops, { t });
      expect(result.keys).toEqual([]);
      expect(result.root?.children).toEqual([]);
    }
  });

  for (const order of [3, 4, 5]) {
    test(`B+ tree order ${order}: every key in a leaf, in order`, () => {
      for (let round = 0; round < 15; round++) {
        const ops = random_ops(50, false);
        const result = run<TreeResult & { max_keys: number }>("b-plus-tree", ops, { order });
        expect(result.keys).toEqual(expected(ops).keys);
        expect(result.found).toEqual(expected(ops).found);
        expect(new Set(leaf_depths(result.root!)).size).toBe(1);
      }
    });
  }
});

describe("trie", () => {
  test("stores words and answers finds and prefixes", () => {
    const result = run<{ words: string[]; results: (boolean | string[])[] }>("trie", [
      ...["car", "cart", "care", "cat", "dog"].map((word) => ({ op: "insert", word })),
      { op: "find", word: "car" },
      { op: "find", word: "ca" },
      { op: "prefix", word: "car" },
      { op: "prefix", word: "z" },
    ]);
    expect(result.words).toEqual(["car", "care", "cart", "cat", "dog"]);
    expect(result.results).toEqual([true, false, ["car", "care", "cart"], []]);
  });
});

describe("heap", () => {
  test("pops in sorted order", () => {
    for (const kind of ["min", "max"]) {
      const keys = Array.from({ length: 20 }, () => Math.floor(Math.random() * 100));
      const ops = [...keys.map((k) => ({ op: "push", key: k })), ...keys.map(() => ({ op: "pop" }))];
      const result = run<{ popped: number[] }>("binary-heap", ops, { kind });
      expect(result.popped).toEqual([...keys].sort((a, b) => (kind === "min" ? a - b : b - a)));
    }
  });
});

describe("range trees", () => {
  const brute = (values: number[], ops: ({ op: "sum"; l: number; r: number } | { op: "set"; i: number; v: number })[]) => {
    const a = [...values];
    const out: number[] = [];
    for (const item of ops) {
      if (item.op === "set") a[item.i] = item.v;
      else out.push(a.slice(item.l, item.r + 1).reduce((s, x) => s + x, 0));
    }
    return out;
  };

  for (const id of ["segment-tree", "fenwick-tree"]) {
    test(`${id} matches brute force`, () => {
      for (let round = 0; round < 30; round++) {
        const n = 1 + Math.floor(Math.random() * 16);
        const values = Array.from({ length: n }, () => Math.floor(Math.random() * 40) - 10);
        const ops = Array.from({ length: 10 }, () => {
          if (Math.random() < 0.5) return { op: "set" as const, i: Math.floor(Math.random() * n), v: Math.floor(Math.random() * 40) };
          const l = Math.floor(Math.random() * n);
          return { op: "sum" as const, l, r: l + Math.floor(Math.random() * (n - l)) };
        });
        expect(run<{ answers: number[] }>(id, { values, ops }).answers).toEqual(brute(values, ops));
      }
    });
  }

  test("interval tree reports every overlap", () => {
    for (let round = 0; round < 30; round++) {
      const intervals = Array.from({ length: 12 }, () => {
        const lo = Math.floor(Math.random() * 80);
        return { op: "insert", lo, hi: lo + Math.floor(Math.random() * 20) };
      });
      const qlo = Math.floor(Math.random() * 90);
      const query = { op: "overlap", lo: qlo, hi: qlo + Math.floor(Math.random() * 15) };
      const result = run<{ results: string[][] }>("interval-tree", [...intervals, query]);
      const expected_hits = intervals.filter((item) => item.lo <= query.hi && query.lo <= item.hi).map((item) => `${item.lo}–${item.hi}`);
      expect([...result.results[0]].sort()).toEqual(expected_hits.sort());
    }
  });

  test("k-d tree nearest matches brute force distance", () => {
    for (let round = 0; round < 30; round++) {
      const points = Array.from({ length: 15 }, () => ({ op: "insert", x: Math.floor(Math.random() * 101), y: Math.floor(Math.random() * 101) }));
      const q = { x: Math.floor(Math.random() * 101), y: Math.floor(Math.random() * 101) };
      const result = run<{ found: string[] }>("kd-tree", [...points, { op: "nearest", ...q }]);
      const [x, y] = result.found[0].split(",").map(Number);
      const best = Math.min(...points.map((p) => Math.hypot(p.x - q.x, p.y - q.y)));
      expect(Math.hypot(x - q.x, y - q.y)).toBeCloseTo(best);
    }
  });
});

describe("union-find", () => {
  test("sets match a brute-force grouping, with every setting", () => {
    for (const compression of ["on", "off"]) {
      for (const union of ["rank", "naive"]) {
        for (let round = 0; round < 15; round++) {
          const n = 10;
          const ops = Array.from({ length: 12 }, () => ({ op: "union" as const, a: Math.floor(Math.random() * n), b: Math.floor(Math.random() * n) }));
          const result = run<{ roots: number[] }>("union-find", { n, ops }, { compression, union });
          const group = Array.from({ length: n }, (_, i) => i);
          const find = (x: number): number => (group[x] === x ? x : find(group[x]));
          for (const item of ops) group[find(item.a)] = find(item.b);
          for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) expect(result.roots[a] === result.roots[b]).toBe(find(a) === find(b));
        }
      }
    }
  });

  test("union by rank keeps trees shallow", () => {
    const ops = Array.from({ length: 15 }, (_, i) => ({ op: "union" as const, a: i, b: i + 1 }));
    expect(run<{ depth: number }>("union-find", { n: 16, ops }, { compression: "off", union: "rank" }).depth).toBeLessThanOrEqual(4);
    expect(run<{ depth: number }>("union-find", { n: 16, ops }, { compression: "off", union: "naive" }).depth).toBe(15);
  });
});

describe("huffman", () => {
  test("codes are prefix-free and match the classic total", () => {
    for (const source of ["abracadabra", "aaaaaaaaaaaaaaabbbbbbbccd", "hello world", "x"]) {
      const result = run<{ codes: Record<string, string>; bits: number }>("huffman-tree", source);
      const codes = Object.values(result.codes);
      for (const a of codes) for (const b of codes) if (a !== b) expect(b.startsWith(a)).toBe(false);
      const reference = huffman_codes(source);
      const total = [...source].reduce((sum, char) => sum + reference.get(char)!.length, 0);
      expect(result.bits).toBe(total);
    }
  });

  test("abracadabra takes 23 bits", () => {
    expect(run<{ bits: number }>("huffman-tree", "abracadabra").bits).toBe(23);
  });
});

describe("samples and random inputs run", () => {
  for (const [id, definition] of Object.entries(trees)) {
    test(id, () => {
      const inputs = [definition.input.sample, ...(definition.presets ?? []).map((preset) => preset.value), ...Array.from({ length: 5 }, () => definition.input.random())];
      for (const input of inputs) {
        expect(() => definition.input.parse(definition.input.format(input))).not.toThrow();
        run(id, input);
      }
    });
  }
});
