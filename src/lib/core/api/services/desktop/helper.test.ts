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

describe("DesktopHelper.resolve_moves", () => {
  const dims = { columns: 3, rows: 2 };

  test("a group keeps its shape where the cells are free, including cells it leaves", () => {
    const grid = [[item("a"), item("b")]];
    const moves = [{ name: "a", to: { x: 1, y: 0 } }, { name: "b", to: { x: 2, y: 0 } }];
    expect([...DesktopHelper.resolve_moves(grid, dims, moves)]).toEqual([
      ["a", { x: 1, y: 0 }],
      ["b", { x: 2, y: 0 }],
    ]);
  });

  test("a taken or off-grid target falls back to the nearest free cell", () => {
    const grid = [[item("a"), item("stay")]];
    const moves = [{ name: "a", to: { x: 1, y: 0 } }, { name: "x", to: { x: 5, y: 0 } }];
    const resolved = DesktopHelper.resolve_moves(grid, dims, moves);
    // Equally near: its own vacated cell wins by scan order (top-left first).
    expect(resolved.get("a")).toEqual({ x: 0, y: 0 });
    expect(resolved.get("x")).toEqual({ x: 2, y: 0 });
  });

  test("with no free cell an item is left out", () => {
    const grid = [[item("s1")]];
    expect(DesktopHelper.resolve_moves(grid, { columns: 1, rows: 1 }, [{ name: "a", to: { x: 0, y: 0 } }]).size).toBe(0);
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
