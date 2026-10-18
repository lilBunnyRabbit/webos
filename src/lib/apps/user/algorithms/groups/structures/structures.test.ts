import { describe, expect, test } from "vitest";
import { default_params, record, type Definition } from "../../engine/definition";
import { op, type Op } from "../../engine/ops";
import structures from "./index";

const run = <R>(id: string, ops: Op[], params: Record<string, number | string> = {}) => {
  const definition = structures[id] as Definition<Op[], R>;
  const recording = record(definition, ops, { ...default_params(definition.params), ...params });
  expect(recording.truncated).toBe(false);
  for (const step of recording.steps) expect(step.note.length).toBeGreaterThan(0);
  return recording.result as R;
};

const rand = (n: number) => Math.floor(Math.random() * n);

describe("linear structures match plain arrays", () => {
  test("stack", () => {
    for (let round = 0; round < 30; round++) {
      const ops = Array.from({ length: 20 }, () => (Math.random() < 0.6 ? op("push", rand(99)) : op("pop")));
      const model: number[] = [];
      const popped: (number | null)[] = [];
      for (const item of ops) item.op === "push" ? model.push(Number(item.value)) : popped.push(model.length ? model.pop()! : null);
      expect(run("stack", ops)).toEqual({ items: model, popped });
    }
  });

  test("queue", () => {
    for (let round = 0; round < 30; round++) {
      const ops = Array.from({ length: 20 }, () => (Math.random() < 0.6 ? op("enqueue", rand(99)) : op("dequeue")));
      const model: number[] = [];
      const out: number[] = [];
      for (const item of ops) if (item.op === "enqueue") model.push(Number(item.value));
      else if (model.length) out.push(model.shift()!);
      expect(run("queue", ops)).toEqual({ items: model, dequeued: out });
    }
  });

  test("deque", () => {
    for (let round = 0; round < 30; round++) {
      const names = ["push_back", "push_front", "pop_back", "pop_front"];
      const ops = Array.from({ length: 20 }, () => {
        const name = names[rand(4)];
        return name.startsWith("push") ? op(name, rand(99)) : op(name);
      });
      const model: number[] = [];
      for (const item of ops) {
        if (item.op === "push_back") model.push(Number(item.value));
        if (item.op === "push_front") model.unshift(Number(item.value));
        if (item.op === "pop_back") model.pop();
        if (item.op === "pop_front") model.shift();
      }
      expect(run<{ items: number[] }>("deque", ops).items).toEqual(model);
    }
  });

  test("ring buffer keeps the newest items when it overwrites, the oldest when it refuses", () => {
    const ops = [1, 2, 3, 4, 5, 6, 7].map((value) => op("write", value));
    expect(run<{ left: number[] }>("ring-buffer", ops, { capacity: 4, full: "overwrite" }).left).toEqual([4, 5, 6, 7]);
    expect(run<{ left: number[] }>("ring-buffer", ops, { capacity: 4, full: "reject" }).left).toEqual([1, 2, 3, 4]);
    const mixed = [op("write", 1), op("write", 2), op("read"), op("write", 3), op("read"), op("read"), op("read")];
    expect(run<{ read: number[]; left: number[] }>("ring-buffer", mixed, { capacity: 3 })).toEqual({ read: [1, 2, 3], left: [] });
  });

  for (const id of ["singly-linked-list", "doubly-linked-list"]) {
    test(id, () => {
      for (let round = 0; round < 30; round++) {
        const names = ["add_back", "add_front", "remove", "find"];
        const ops = Array.from({ length: 20 }, () => op(names[rand(4)], rand(10)));
        const model: number[] = [];
        const found: boolean[] = [];
        for (const item of ops) {
          const value = Number(item.value);
          if (item.op === "add_back") model.push(value);
          if (item.op === "add_front") model.unshift(value);
          if (item.op === "find") found.push(model.includes(value));
          if (item.op === "remove" && model.includes(value)) model.splice(model.indexOf(value), 1);
        }
        expect(run(id, ops)).toEqual({ items: model, found });
      }
    });
  }

  test("LRU cache evicts the least recently used", () => {
    const result = run<{ order: string[]; hits: number; misses: number; evictions: number }>(
      "lru-cache",
      [op("put", "a"), op("put", "b"), op("put", "c"), op("get", "a"), op("put", "d"), op("get", "b"), op("get", "c")],
      { capacity: 3 }
    );
    expect(result).toEqual({ order: ["c", "d", "a"], hits: 2, misses: 1, evictions: 1 });
  });
});

describe("hash table", () => {
  for (const method of ["chaining", "linear", "quadratic", "double"]) {
    test(`${method}: behaves like a set`, () => {
      for (let round = 0; round < 30; round++) {
        const names = ["insert", "insert", "find", "delete"];
        const ops = Array.from({ length: 16 }, () => op(names[rand(4)], rand(40)));
        const model = new Set<number>();
        const found: boolean[] = [];
        for (const item of ops) {
          const k = Number(item.value);
          if (item.op === "insert") model.add(k);
          if (item.op === "delete") model.delete(k);
          if (item.op === "find") found.push(model.has(k));
        }
        const result = run<{ keys: number[]; found: boolean[] }>("hash-table", ops, { method, size: 17 });
        expect(result.keys).toEqual([...model].sort((a, b) => a - b));
        expect(result.found).toEqual(found);
      }
    });
  }

  test("a tombstone keeps later keys findable", () => {
    const ops = [op("insert", 1), op("insert", 8), op("delete", 1), op("find", 8)];
    expect(run<{ found: boolean[] }>("hash-table", ops, { method: "linear", size: 7 }).found).toEqual([true]);
  });
});

describe("bloom filter", () => {
  test("never a false negative", () => {
    for (let round = 0; round < 20; round++) {
      const words = Array.from({ length: 8 }, () => Math.random().toString(36).slice(2, 7));
      const ops = [...words.slice(0, 5).map((word) => op("add", word)), ...words.map((word) => op("test", word))];
      const { results } = run<{ results: { maybe: boolean; truth: boolean }[] }>("bloom-filter", ops, { bits: 24, hashes: 3 });
      for (const result of results) if (result.truth) expect(result.maybe).toBe(true);
    }
  });
});

describe("skip list", () => {
  test("behaves like a sorted set", () => {
    for (let round = 0; round < 30; round++) {
      const names = ["insert", "insert", "find", "delete"];
      const ops = Array.from({ length: 20 }, () => op(names[rand(4)], rand(50)));
      const model = new Set<number>();
      const found: boolean[] = [];
      for (const item of ops) {
        const k = Number(item.value);
        if (item.op === "insert") model.add(k);
        if (item.op === "delete") model.delete(k);
        if (item.op === "find") found.push(model.has(k));
      }
      const result = run<{ keys: number[]; found: boolean[] }>("skip-list", ops);
      expect(result.keys).toEqual([...model].sort((a, b) => a - b));
      expect(result.found).toEqual(found);
    }
  });
});

describe("consistent hashing", () => {
  test("adding a server only moves keys to that server", () => {
    const keys = ["cat", "dog", "fish", "bird", "owl", "fox", "bee", "ant", "elk", "yak"];
    const base = [op("add_server", "alpha"), op("add_server", "beta"), op("add_server", "gamma"), ...keys.map((key) => op("put", key))];
    const before = run<{ owners: Record<string, string> }>("consistent-hashing", base).owners;
    const after = run<{ owners: Record<string, string> }>("consistent-hashing", [...base, op("add_server", "delta")]).owners;
    for (const key of keys) if (before[key] !== after[key]) expect(after[key]).toBe("delta");
  });
});

describe("samples run", () => {
  for (const [id, definition] of Object.entries(structures)) {
    test(id, () => {
      for (const input of [definition.input.sample, ...Array.from({ length: 5 }, () => definition.input.random())]) {
        expect(() => definition.input.parse(definition.input.format(input))).not.toThrow();
        run(id, input as Op[]);
      }
    });
  }
});
