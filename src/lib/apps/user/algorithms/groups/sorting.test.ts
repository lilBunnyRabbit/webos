import { describe, expect, test } from "vitest";
import { in_group, Group } from "../catalog";
import { default_params, record, type Definition } from "../engine/definition";
import sorting from "./sorting";

const sorted = (values: number[]) => [...values].sort((a, b) => a - b);

const SORTS = in_group(Group.SORTING).filter((entry) => entry.id !== "sort-race");

describe("every sort sorts", () => {
  for (const { id } of SORTS) {
    const definition = sorting[id] as Definition<number[], number[]>;

    test(`${id}: sample, presets and random inputs`, () => {
      const inputs = [definition.input.sample, ...(definition.presets ?? []).map((preset) => preset.value), ...Array.from({ length: 20 }, () => definition.input.random())];
      for (const params of [default_params(definition.params), ...(definition.params ?? []).flatMap((param) => (param.kind === "choice" ? param.choices.map((choice) => ({ ...default_params(definition.params), [param.id]: choice.value })) : []))]) {
        for (const input of inputs) {
          const { result, steps, truncated } = record(definition, input, params);
          expect(truncated).toBe(false);
          expect(result).toEqual(sorted(input));
          expect(steps.length).toBeGreaterThan(0);
          expect(steps.every((step) => step.note.length > 0)).toBe(true);
          expect(steps.every((step) => step.line === undefined || step.line < definition.pseudocode.length)).toBe(true);
        }
      }
    });

    test(`${id}: the input is left alone`, () => {
      const input = [5, 1, 4, 2, 3];
      record(definition, input, default_params(definition.params));
      expect(input).toEqual([5, 1, 4, 2, 3]);
    });
  }

  test("single value and duplicates", () => {
    for (const { id } of SORTS) {
      const definition = sorting[id] as Definition<number[], number[]>;
      expect(record(definition, [7], default_params(definition.params)).result).toEqual([7]);
      expect(record(definition, [3, 3, 1, 3, 1], default_params(definition.params)).result).toEqual([1, 1, 3, 3, 3]);
    }
  });

  test("bubble sort stops early on sorted input", () => {
    const steps = record(sorting["bubble-sort"] as Definition<number[], number[]>, [1, 2, 3, 4, 5, 6], {}).steps;
    expect(steps.length).toBeLessThan(10);
  });
});

describe("race", () => {
  test("quick sort beats bubble sort on random input", () => {
    const input = Array.from({ length: 40 }, (_, i) => (i * 37) % 41);
    const { result } = record(sorting["sort-race"] as Definition<number[], { winner: string | null }>, input, { left: "bubble-sort", right: "quick-sort" });
    expect(result?.winner).toBe("quick-sort");
  });

  test("insertion sort beats merge sort on sorted input", () => {
    const input = Array.from({ length: 30 }, (_, i) => i);
    const { result } = record(sorting["sort-race"] as Definition<number[], { winner: string | null }>, input, { left: "insertion-sort", right: "merge-sort" });
    expect(result?.winner).toBe("insertion-sort");
  });
});
