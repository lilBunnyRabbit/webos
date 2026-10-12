import { describe, expect, it } from "vitest";
import { arrange_home, DOCK_SIZE, paginate, parse_home_layout, serialize_home_layout } from "./home-layout";
import type { DesktopItem } from "./type";

const dir = (name: string): DesktopItem => ({ kind: "directory", name });
const names = (items: DesktopItem[]) => items.map((item) => item.name);

describe("arrange_home", () => {
  const entries = ["a", "b", "c", "d"].map(dir);

  it("keeps the saved order and appends unknown entries in folder order", () => {
    const { home, dock } = arrange_home(entries, { order: ["c", "a"], dock: [] });
    expect(names(home)).toEqual(["c", "a", "b", "d"]);
    expect(dock).toEqual([]);
  });

  it("takes docked entries out of home", () => {
    const { home, dock } = arrange_home(entries, { order: ["a", "b", "c", "d"], dock: ["d", "b"] });
    expect(names(dock)).toEqual(["d", "b"]);
    expect(names(home)).toEqual(["a", "c"]);
  });

  it("drops stale and duplicate names", () => {
    const { home, dock } = arrange_home(entries, { order: ["gone", "a", "a"], dock: ["missing", "c"] });
    expect(names(dock)).toEqual(["c"]);
    expect(names(home)).toEqual(["a", "b", "d"]);
  });

  it("caps the dock", () => {
    const many = Array.from({ length: DOCK_SIZE + 2 }, (_, index) => dir(`e${index}`));
    const { home, dock } = arrange_home(many, { order: [], dock: names(many) });
    expect(dock).toHaveLength(DOCK_SIZE);
    expect(home).toHaveLength(2);
  });
});

describe("paginate", () => {
  it("chunks by capacity", () => {
    expect(paginate([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("always has one page", () => {
    expect(paginate([], 4)).toEqual([[]]);
  });

  it("keeps everything on one page without a capacity", () => {
    expect(paginate([1, 2], 0)).toEqual([[1, 2]]);
  });
});

describe("home layout file", () => {
  it("round-trips", () => {
    const layout = { order: ["a", "b"], dock: ["c"] };
    expect(parse_home_layout(serialize_home_layout(layout))).toEqual(layout);
  });

  it("treats corrupt or unknown files as empty", () => {
    expect(parse_home_layout("{")).toEqual({ order: [], dock: [] });
    expect(parse_home_layout(JSON.stringify({ version: 2, order: [], dock: [] }))).toEqual({ order: [], dock: [] });
  });
});
