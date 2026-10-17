import { describe, expect, test } from "vitest";
import { ancestors, squarify, tile_kind, TileKind, type Rect } from "./treemap";

const BOUNDS: Rect = { x: 10, y: 20, width: 600, height: 400 };
const area = (rect: Rect) => rect.width * rect.height;
const identity = (value: number) => value;

function overlaps(a: Rect, b: Rect): boolean {
  const epsilon = 1e-6;
  return a.x + a.width > b.x + epsilon && b.x + b.width > a.x + epsilon && a.y + a.height > b.y + epsilon && b.y + b.height > a.y + epsilon;
}

describe("squarify", () => {
  test("one item fills the bounds", () => {
    expect(squarify([5], identity, BOUNDS)).toEqual([{ item: 5, ...BOUNDS }]);
  });

  test("areas are proportional to sizes and cover the bounds exactly", () => {
    const sizes = [6, 6, 4, 3, 2, 2, 1];
    const tiles = squarify(sizes, identity, BOUNDS);
    const total = sizes.reduce((sum, size) => sum + size, 0);
    expect(tiles).toHaveLength(sizes.length);
    for (const tile of tiles) expect(area(tile)).toBeCloseTo((tile.item / total) * area(BOUNDS), 6);
    expect(tiles.reduce((sum, tile) => sum + area(tile), 0)).toBeCloseTo(area(BOUNDS), 6);
  });

  test("tiles stay inside the bounds and never overlap", () => {
    const tiles = squarify([50, 30, 30, 12, 9, 7, 5, 3, 1, 1], identity, BOUNDS);
    for (const tile of tiles) {
      expect(tile.x).toBeGreaterThanOrEqual(BOUNDS.x - 1e-6);
      expect(tile.y).toBeGreaterThanOrEqual(BOUNDS.y - 1e-6);
      expect(tile.x + tile.width).toBeLessThanOrEqual(BOUNDS.x + BOUNDS.width + 1e-6);
      expect(tile.y + tile.height).toBeLessThanOrEqual(BOUNDS.y + BOUNDS.height + 1e-6);
    }
    for (const [index, a] of tiles.entries()) for (const b of tiles.slice(index + 1)) expect(overlaps(a, b)).toBe(false);
  });

  test("equal items come out square-ish, not as slivers", () => {
    const tiles = squarify(Array.from({ length: 16 }, () => 1), identity, { x: 0, y: 0, width: 400, height: 400 });
    for (const tile of tiles) expect(Math.max(tile.width / tile.height, tile.height / tile.width)).toBeLessThan(2);
  });

  test("biggest first, whatever the input order", () => {
    expect(squarify([1, 9, 4], identity, BOUNDS).map((tile) => tile.item)).toEqual([9, 4, 1]);
  });

  test("empty items and empty bounds give no tiles", () => {
    expect(squarify([0, 3], identity, BOUNDS).map((tile) => tile.item)).toEqual([3]);
    expect(squarify([0, 0], identity, BOUNDS)).toEqual([]);
    expect(squarify([], identity, BOUNDS)).toEqual([]);
    expect(squarify([1], identity, { x: 0, y: 0, width: 0, height: 100 })).toEqual([]);
  });

  test("works on objects through the size accessor", () => {
    const tiles = squarify([{ name: "a", size: 1 }, { name: "b", size: 3 }], (item) => item.size, BOUNDS);
    expect(tiles.map((tile) => tile.item.name)).toEqual(["b", "a"]);
  });
});

describe("tile_kind", () => {
  test("a node with children is a folder, even when empty", () => {
    expect(tile_kind({ name: "Pictures", path: "/home/Pictures", size: 0, children: [] })).toBe(TileKind.FOLDER);
  });

  test("files by extension, case ignored", () => {
    expect(tile_kind({ name: "a.PNG", path: "/a.PNG", size: 1 })).toBe(TileKind.IMAGE);
    expect(tile_kind({ name: "song.mp3", path: "/song.mp3", size: 1 })).toBe(TileKind.MEDIA);
    expect(tile_kind({ name: "notes.txt", path: "/notes.txt", size: 1 })).toBe(TileKind.OTHER);
  });
});

test("ancestors lists each breadcrumb stop from the root", () => {
  expect(ancestors("/")).toEqual(["/"]);
  expect(ancestors("/home/Pictures")).toEqual(["/", "/home", "/home/Pictures"]);
});
