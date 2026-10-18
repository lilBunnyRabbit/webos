import { describe, expect, test } from "vitest";
import { record, type Definition } from "../../engine/definition";
import searching, { type Query } from "./index";

const run = <R>(id: string, input: Query) => {
  const recording = record(searching[id] as Definition<Query, R>, input, {});
  expect(recording.truncated).toBe(false);
  for (const step of recording.steps) expect(step.note.length).toBeGreaterThan(0);
  return recording.result as R;
};

const sorted_unique = (count: number) => [...new Set(Array.from({ length: count }, () => Math.floor(Math.random() * 200)))].sort((a, b) => a - b);

describe("searches find the target or report it missing", () => {
  for (const id of ["linear-search", "binary-search", "interpolation-search", "exponential-search"]) {
    test(id, () => {
      for (let round = 0; round < 80; round++) {
        const values = sorted_unique(1 + Math.floor(Math.random() * 30));
        const target = Math.random() < 0.6 ? values[Math.floor(Math.random() * values.length)] : Math.floor(Math.random() * 200);
        const { index } = run<{ index: number }>(id, { values, target });
        if (values.includes(target)) expect(values[index]).toBe(target);
        else expect(index).toBe(-1);
      }
    });
  }

  test("binary search takes at most ⌈log2(n + 1)⌉ comparisons", () => {
    const values = Array.from({ length: 1000 }, (_, i) => i * 2);
    for (const target of [0, 998, 1998, 7, 1500]) expect(run<{ comparisons: number }>("binary-search", { values: values.slice(0, 40), target }).comparisons).toBeLessThanOrEqual(6);
  });
});

describe("two pointers and sliding window", () => {
  test("two pointers finds a pair when one exists", () => {
    for (let round = 0; round < 80; round++) {
      const values = sorted_unique(2 + Math.floor(Math.random() * 20));
      const target = Math.floor(Math.random() * 400);
      const { pair } = run<{ pair: [number, number] | null }>("two-pointers", { values, target });
      const exists = values.some((a, i) => values.some((b, j) => i < j && a + b === target));
      expect(pair !== null).toBe(exists);
      if (pair) expect(values[pair[0]] + values[pair[1]]).toBe(target);
    }
  });

  test("sliding window finds the best sum", () => {
    for (let round = 0; round < 80; round++) {
      const values = Array.from({ length: 3 + Math.floor(Math.random() * 20) }, () => Math.floor(Math.random() * 50) - 10);
      const k = 1 + Math.floor(Math.random() * values.length);
      const sums = values.slice(0, values.length - k + 1).map((_, i) => values.slice(i, i + k).reduce((s, v) => s + v, 0));
      expect(run<{ best: number }>("sliding-window", { values, target: k }).best).toBe(Math.max(...sums));
    }
  });
});

describe("inputs", () => {
  test("sorted searches refuse unsorted input", () => {
    expect(() => searching["binary-search"].input.parse("5, 3, 9 | 3")).toThrow("ascending");
    expect(searching["linear-search"].input.parse("5, 3, 9 | 3")).toEqual({ values: [5, 3, 9], target: 3 });
  });

  for (const [id, definition] of Object.entries(searching)) {
    test(`${id}: samples and random inputs run`, () => {
      for (const input of [definition.input.sample, ...(definition.presets ?? []).map((preset) => preset.value), ...Array.from({ length: 5 }, () => definition.input.random())]) {
        expect(() => definition.input.parse(definition.input.format(input))).not.toThrow();
        run(id, input as Query);
      }
    });
  }
});
