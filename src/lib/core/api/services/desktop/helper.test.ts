import { describe, expect, test } from "vitest";
import type { DesktopItem } from "./type";
import { DesktopHelper, DesktopSort } from "./helper";

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

describe("DesktopHelper.sort_moves", () => {
  const folder = { kind: "directory", name: "Work" } as const;
  const app = { kind: "shortcut", name: "Paint.desktop", label: "Paint", app_id: "paint" } as const;
  const notes = { kind: "file", name: "notes 10.txt", type: "text/plain" } as const;
  const notes2 = { kind: "file", name: "Notes 2.txt", type: "text/plain" } as const;
  const photo = { kind: "file", name: "beach.jpg", type: "image/jpeg" } as const;
  const items: DesktopItem[] = [notes, photo, app, folder, notes2];
  const order = (by: DesktopSort, modified?: Map<string, number>) =>
    DesktopHelper.sort_moves(items, by, 3, modified).map((move) => move.name);

  test("name sorts by the shown name, numbers naturally, ignoring case", () => {
    expect(order(DesktopSort.NAME)).toEqual(["beach.jpg", "Notes 2.txt", "notes 10.txt", "Paint.desktop", "Work"]);
  });

  test("kind puts folders, then shortcuts, then files by extension", () => {
    expect(order(DesktopSort.KIND)).toEqual(["Work", "Paint.desktop", "beach.jpg", "Notes 2.txt", "notes 10.txt"]);
  });

  test("date puts folders first, then newest", () => {
    const modified = new Map([["notes 10.txt", 3], ["beach.jpg", 5], ["Paint.desktop", 1], ["Notes 2.txt", 4]]);
    expect(order(DesktopSort.DATE, modified)).toEqual(["Work", "beach.jpg", "Notes 2.txt", "notes 10.txt", "Paint.desktop"]);
  });

  test("fills column by column", () => {
    const cells = DesktopHelper.sort_moves(items, DesktopSort.NAME, 2).map((move) => move.to);
    expect(cells).toEqual([{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }]);
  });
});

describe("widgets span cells", () => {
  const widget = (name: string, w: number, h: number) => ({ kind: "widget", name, label: name, app_id: "x", size: { w, h } }) as DesktopItem;

  test("arrange fills every covered cell and refuses an overlap", () => {
    const sticky = widget("sticky", 2, 2);
    const { layout, unplaced } = DesktopHelper.arrange([sticky, item("a")], { sticky: { x: 0, y: 0 }, a: { x: 1, y: 1 } });
    expect(names(layout)).toEqual([["sticky", "sticky"], ["sticky", "sticky"]]);
    expect(unplaced.map((entry) => entry.name)).toEqual(["a"]);
  });

  test("fit flows icons around a widget and moves a widget that no longer fits", () => {
    const sticky = widget("sticky", 2, 2);
    const { layout } = DesktopHelper.arrange([sticky], { sticky: { x: 2, y: 0 } });
    expect(names(DesktopHelper.fit({ columns: 3, rows: 2 }, layout, [item("a")]))).toEqual([["sticky", "sticky", "a"], ["sticky", "sticky"]]);
  });

  test("a moved widget needs its whole span free", () => {
    const sticky = widget("sticky", 2, 1);
    const grid = [[sticky, sticky, item("stay")]];
    // (1,0) would cover "stay" at (2,0); the nearest spot where both cells are free is its own.
    expect(DesktopHelper.resolve_moves(grid, { columns: 3, rows: 2 }, [{ name: "sticky", to: { x: 1, y: 0 } }]).get("sticky")).toEqual({ x: 0, y: 0 });
    expect(DesktopHelper.resolve_moves(grid, { columns: 3, rows: 2 }, [{ name: "sticky", to: { x: 1, y: 1 } }]).get("sticky")).toEqual({ x: 1, y: 1 });
  });

  test("sorting leaves widgets where they are", () => {
    expect(DesktopHelper.sort_moves([widget("w", 2, 2), item("b")], DesktopSort.NAME, 4).map((move) => move.name)).toEqual(["b"]);
  });
});
