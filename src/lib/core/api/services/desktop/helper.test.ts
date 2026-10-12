import { describe, expect, test } from "vitest";
import type { DesktopItem } from "./type";
import { DesktopHelper } from "./helper";

const item = (name: string) => ({ name }) as DesktopItem;
const names = (grid: (DesktopItem | undefined)[][]) => grid.map((row) => (row ?? []).map((cell) => cell?.name ?? null));

describe("DesktopHelper.arrange", () => {
  test("places entries at saved cells, the rest is unplaced", () => {
    const a = item("a"), b = item("b"), c = item("c");
    const { layout, unplaced } = DesktopHelper.arrange([a, b, c], { a: { x: 1, y: 0 }, b: { x: 1, y: 0 } });
    expect(layout[0][1]).toBe(a);
    expect(unplaced).toEqual([b, c]);
  });
});

describe("DesktopHelper.fit", () => {
  test("keeps cells inside the grid and fills free cells with overflow, then unplaced", () => {
    const a = item("a"), far = item("far"), loose = item("loose");
    const layout = [[undefined, a]];
    layout[5] = [far];
    const fitted = DesktopHelper.fit({ columns: 2, rows: 2 }, layout, [loose]);
    expect(names(fitted)).toEqual([["far", "a"], ["loose"]]);
  });

  test("leaves out what doesn't fit", () => {
    const fitted = DesktopHelper.fit({ columns: 1, rows: 1 }, [], [item("a"), item("b")]);
    expect(names(fitted)).toEqual([["a"]]);
  });
});
