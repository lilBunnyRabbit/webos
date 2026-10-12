import { describe, expect, test } from "vitest";
import { check_preset, draw_preset, format_draw, move, same_lists, type DrawPreset, type DrawPresetDraft } from "./draws";

function draft(lists: DrawPresetDraft["lists"], name = "Loto"): DrawPresetDraft {
  return { id: "p", name, lists };
}

const eurojackpot: DrawPreset = {
  id: "e",
  name: "Eurojackpot",
  lists: [
    { id: "a", min: 1, max: 50, count: 5 },
    { id: "b", min: 1, max: 12, count: 2 },
  ],
};

describe("draw_preset", () => {
  test("draws each list as unique sorted values inside its range", () => {
    for (let run = 0; run < 200; run++) {
      const [main, extra] = draw_preset(eurojackpot);
      expect(main).toHaveLength(5);
      expect(extra).toHaveLength(2);
      expect(new Set(main).size).toBe(5);
      expect(new Set(extra).size).toBe(2);
      expect(main).toEqual([...main].sort((a, b) => a - b));
      expect(extra).toEqual([...extra].sort((a, b) => a - b));
      for (const value of main) expect(value >= 1 && value <= 50).toBe(true);
      for (const value of extra) expect(value >= 1 && value <= 12).toBe(true);
    }
  });

  test("a list as large as its range holds the whole range", () => {
    const [values] = draw_preset({ id: "x", name: "All", lists: [{ id: "a", min: -3, max: 3, count: 7 }] });
    expect(values).toEqual([-3, -2, -1, 0, 1, 2, 3]);
  });

  test("sorts numerically, not as text", () => {
    const [values] = draw_preset({ id: "x", name: "Wide", lists: [{ id: "a", min: 1, max: 200, count: 200 }] });
    expect(values.slice(0, 3)).toEqual([1, 2, 3]);
    expect(values.at(-1)).toBe(200);
  });

  test("uses the given source", () => {
    let calls = 0;
    const source = () => calls++;
    draw_preset({ id: "x", name: "One", lists: [{ id: "a", min: 1, max: 10, count: 3 }] }, source);
    expect(calls).toBeGreaterThan(0);
  });
});

describe("check_preset", () => {
  test("trims the name and keeps list order", () => {
    const lists = [
      { id: "a", min: 1, max: 44, count: 6 },
      { id: "b", min: 1, max: 5, count: 1 },
    ];
    expect(check_preset(draft(lists, "  Loto  "))).toEqual({ ok: true, value: { id: "p", name: "Loto", lists } });
  });

  test("needs a name and at least one list", () => {
    const list = { id: "a", min: 1, max: 10, count: 1 };
    expect(check_preset(draft([list], "   "))).toEqual({ ok: false, error: "Give the preset a name." });
    expect(check_preset(draft([]))).toEqual({ ok: false, error: "Add at least one list." });
    expect(check_preset(draft([list], "x".repeat(41))).ok).toBe(false);
    expect(check_preset(draft([list], "x".repeat(40))).ok).toBe(true);
  });

  test("names the list that is wrong", () => {
    const ok = { id: "a", min: 1, max: 10, count: 1 };
    expect(check_preset(draft([ok, { id: "b", min: 5, max: 1, count: 1 }]))).toEqual({
      ok: false,
      error: "List 2: Maximum must be at least the minimum.",
    });
    expect(check_preset(draft([{ id: "b", min: 1, max: 5, count: 6 }]))).toEqual({
      ok: false,
      error: "List 1: Only 5 different numbers fit in this range.",
    });
    expect(check_preset(draft([{ id: "b", min: null, max: 5, count: 1 }])).ok).toBe(false);
    expect(check_preset(draft([{ id: "b", min: 1, max: 5, count: null }])).ok).toBe(false);
    expect(check_preset(draft([{ id: "b", min: 1, max: 5, count: 0 }])).ok).toBe(false);
    expect(check_preset(draft([{ id: "b", min: 1.5, max: 5, count: 1 }])).ok).toBe(false);
  });

  test("caps the number of lists", () => {
    const lists = Array.from({ length: 11 }, (_, i) => ({ id: `${i}`, min: 1, max: 10, count: 1 }));
    expect(check_preset(draft(lists)).ok).toBe(false);
    expect(check_preset(draft(lists.slice(0, 10))).ok).toBe(true);
  });
});

describe("move", () => {
  test("moves an item by an offset and ignores moves past either end", () => {
    expect(move(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(move(["a", "b", "c"], 2, -2)).toEqual(["c", "a", "b"]);
    expect(move(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(move(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });
});

describe("same_lists", () => {
  test("compares ranges and counts, not ids", () => {
    const copy = eurojackpot.lists.map((list, i) => ({ ...list, id: `other-${i}` }));
    expect(same_lists(eurojackpot.lists, copy)).toBe(true);
    expect(same_lists(eurojackpot.lists, [{ ...copy[0], count: 6 }, copy[1]])).toBe(false);
    expect(same_lists(eurojackpot.lists, copy.slice(0, 1))).toBe(false);
  });
});

describe("format_draw", () => {
  test("one line per list", () => {
    expect(format_draw([[3, 12, 40], [2, 9]])).toBe("3, 12, 40\n2, 9");
  });
});
