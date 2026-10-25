import { describe, expect, it } from "vitest";
import { arrange_home, parse_home_layout, serialize_home_layout } from "./home-layout";
import type { DesktopItem } from "./type";

const dir = (name: string): DesktopItem => ({ kind: "directory", name });
const names = (items: DesktopItem[]) => items.map((item) => item.name);

describe("arrange_home", () => {
  const entries = ["a", "b", "c", "d"].map(dir);

  it("keeps the saved order and appends unknown entries in folder order", () => {
    expect(names(arrange_home(entries, { order: ["c", "a"] }))).toEqual(["c", "a", "b", "d"]);
  });

  it("drops stale and duplicate names", () => {
    expect(names(arrange_home(entries, { order: ["gone", "a", "a"] }))).toEqual(["a", "b", "c", "d"]);
  });
});

describe("home layout file", () => {
  it("round-trips", () => {
    const layout = { order: ["a", "b"] };
    expect(parse_home_layout(serialize_home_layout(layout))).toEqual({ layout, migrated: false });
  });

  it("never writes a dock", () => {
    expect(JSON.parse(serialize_home_layout({ order: ["a"] }))).toEqual({ version: 1, order: ["a"] });
  });

  it("appends a saved dock to the end of the order once, without duplicates", () => {
    const text = JSON.stringify({ version: 1, order: ["a", "b"], dock: ["c", "a", "d"] });
    expect(parse_home_layout(text)).toEqual({ layout: { order: ["a", "b", "c", "d"] }, migrated: true });
  });

  it("migrates an empty dock too, so the file loses the key", () => {
    expect(parse_home_layout(JSON.stringify({ version: 1, order: ["a"], dock: [] }))).toEqual({ layout: { order: ["a"] }, migrated: true });
  });

  it("treats corrupt or unknown files as empty", () => {
    expect(parse_home_layout("{")).toEqual({ layout: { order: [] }, migrated: false });
    expect(parse_home_layout(JSON.stringify({ version: 2, order: [] }))).toEqual({ layout: { order: [] }, migrated: false });
  });
});
