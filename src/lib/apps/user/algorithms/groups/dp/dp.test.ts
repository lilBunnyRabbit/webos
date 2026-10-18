import { describe, expect, test } from "vitest";
import { record, type Definition } from "../../engine/definition";
import dp from "./index";

const run = <R>(id: string, input: unknown) => {
  const recording = record(dp[id] as Definition<unknown, R>, input, {});
  expect(recording.truncated).toBe(false);
  for (const step of recording.steps) expect(step.note.length).toBeGreaterThan(0);
  return recording.result as R;
};

const rand = (n: number) => Math.floor(Math.random() * n);

function is_subsequence(small: string, big: string) {
  let i = 0;
  for (const char of big) if (char === small[i]) i++;
  return i === small.length;
}

describe("dynamic programming", () => {
  test("LCS of the textbook pair has length 4 and is common to both", () => {
    const result = run<{ length: number; sequence: string }>("lcs", { a: "ABCBDAB", b: "BDCABA" });
    expect(result.length).toBe(4);
    expect(is_subsequence(result.sequence, "ABCBDAB") && is_subsequence(result.sequence, "BDCABA")).toBe(true);
  });

  test("LCS against brute force on short strings", () => {
    for (let round = 0; round < 40; round++) {
      const a = Array.from({ length: 1 + rand(6) }, () => "AB"[rand(2)]).join("");
      const b = Array.from({ length: 1 + rand(6) }, () => "AB"[rand(2)]).join("");
      let best = 0;
      for (let mask = 0; mask < 1 << a.length; mask++) {
        const pick = [...a].filter((_, i) => mask & (1 << i)).join("");
        if (pick.length > best && is_subsequence(pick, b)) best = pick.length;
      }
      expect(run<{ length: number }>("lcs", { a, b }).length).toBe(best);
    }
  });

  test("knapsack matches brute force", () => {
    for (let round = 0; round < 40; round++) {
      const count = 1 + rand(6);
      const weights = Array.from({ length: count }, () => 1 + rand(8));
      const values = Array.from({ length: count }, () => rand(20));
      const capacity = 1 + rand(15);
      let best = 0;
      for (let mask = 0; mask < 1 << count; mask++) {
        let w = 0;
        let v = 0;
        for (let i = 0; i < count; i++) if (mask & (1 << i)) (w += weights[i]), (v += values[i]);
        if (w <= capacity) best = Math.max(best, v);
      }
      const result = run<{ best: number; items: number[] }>("knapsack", { weights, values, capacity });
      expect(result.best).toBe(best);
      expect(result.items.reduce((sum, i) => sum + values[i - 1], 0)).toBe(best);
      expect(result.items.reduce((sum, i) => sum + weights[i - 1], 0)).toBeLessThanOrEqual(capacity);
    }
  });

  test("coin change beats greedy and handles impossible amounts", () => {
    expect(run<{ count: number; used: number[] }>("coin-change", { coins: [1, 3, 4], amount: 6 })).toEqual({ count: 2, used: [3, 3] });
    expect(run<{ count: number | null }>("coin-change", { coins: [4, 6], amount: 15 }).count).toBeNull();
    for (let round = 0; round < 30; round++) {
      const coins = [...new Set([1 + rand(5), 2 + rand(9), 5 + rand(10)])];
      const amount = 1 + rand(30);
      const best: number[] = [0];
      for (let a = 1; a <= amount; a++) best[a] = Math.min(Infinity, ...coins.filter((c) => c <= a).map((c) => best[a - c] + 1));
      const result = run<{ count: number | null; used: number[] }>("coin-change", { coins: coins.sort((x, y) => x - y), amount });
      expect(result.count ?? Infinity).toBe(best[amount]);
      if (result.count) expect(result.used.reduce((sum, c) => sum + c, 0)).toBe(amount);
    }
  });

  test("LIS is increasing, a subsequence, and as long as a brute force finds", () => {
    for (let round = 0; round < 30; round++) {
      const values = Array.from({ length: 1 + rand(10) }, () => rand(20));
      const result = run<{ length: number; sequence: number[] }>("lis", values);
      for (let i = 1; i < result.sequence.length; i++) expect(result.sequence[i]).toBeGreaterThan(result.sequence[i - 1]);
      let best = 0;
      for (let mask = 1; mask < 1 << values.length; mask++) {
        const pick = values.filter((_, i) => mask & (1 << i));
        if (pick.every((v, i) => i === 0 || v > pick[i - 1])) best = Math.max(best, pick.length);
      }
      expect(result.length).toBe(best);
    }
  });

  test("matrix chain: the textbook example", () => {
    expect(run<{ cost: number; order: string }>("matrix-chain", [10, 30, 5, 60])).toEqual({ cost: 4500, order: "((A·B)·C)" });
    expect(run<{ cost: number }>("matrix-chain", [30, 35, 15, 5, 10, 20, 25]).cost).toBe(15125);
  });

  for (const [id, definition] of Object.entries(dp)) {
    test(`${id}: samples and random inputs run`, () => {
      for (const input of [definition.input.sample, ...(definition.presets ?? []).map((preset) => preset.value), ...Array.from({ length: 5 }, () => definition.input.random())]) {
        expect(() => definition.input.parse(definition.input.format(input))).not.toThrow();
        run(id, input);
      }
    });
  }
});
