import { describe, expect, it } from "vitest";
import { arrange_home, DOCK_SIZE, paginate_spans, parse_home_layout, serialize_home_layout } from "./home-layout";
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

describe("paginate_spans", () => {
  const widget = (name: string, w: number, h: number): DesktopItem => ({ kind: "widget", name, label: name, app_id: "x", size: { w, h } });
  const cells = (pages: ReturnType<typeof paginate_spans>) =>
    pages.map((page) => page.map(({ item, x, y, size }) => `${item.name}@${x},${y}:${size.w}x${size.h}`));

  it("flows icons row by row and pages by capacity", () => {
    expect(cells(paginate_spans(["a", "b", "c"].map(dir), 2, 1))).toEqual([["a@0,0:1x1", "b@1,0:1x1"], ["c@0,0:1x1"]]);
  });

  it("wraps icons around a widget", () => {
    const pages = paginate_spans([widget("w", 3, 2), dir("a"), dir("b"), dir("c")], 4, 3);
    expect(cells(pages)).toEqual([["w@0,0:3x2", "a@3,0:1x1", "b@3,1:1x1", "c@0,2:1x1"]]);
  });

  it("never backfills a gap before the cursor", () => {
    const pages = paginate_spans([dir("a"), dir("b"), widget("w", 3, 1), dir("c")], 4, 2);
    expect(cells(pages)).toEqual([["a@0,0:1x1", "b@1,0:1x1", "w@0,1:3x1", "c@3,1:1x1"]]);
  });

  it("cuts a widget to the home and starts a page when it doesn't fit", () => {
    const pages = paginate_spans([dir("a"), widget("w", 6, 5)], 4, 3);
    expect(cells(pages)).toEqual([["a@0,0:1x1"], ["w@0,0:4x3"]]);
  });

  it("always has one page", () => {
    expect(paginate_spans([], 4, 4)).toEqual([[]]);
    expect(paginate_spans([dir("a")], 0, 0)).toEqual([[]]);
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
