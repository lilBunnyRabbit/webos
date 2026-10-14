import { describe, expect, test } from "vitest";
import { click_select, intersects, rect_from_points, same_members } from "./selection";

describe("same_members", () => {
  test("ignores order, compares size and membership", () => {
    expect(same_members(new Set(["a", "b"]), new Set(["b", "a"]))).toBe(true);
    expect(same_members(new Set(["a"]), new Set(["a", "b"]))).toBe(false);
    expect(same_members(new Set(["a", "c"]), new Set(["a", "b"]))).toBe(false);
  });
});

const order = ["a", "b", "c", "d", "e"];
const none = { toggle: false, range: false };

describe("click_select", () => {
  test("a plain click selects only that one", () => {
    expect(click_select({ selection: new Set(["a", "b"]), anchor: "a" }, "c", none, order)).toEqual({ selection: new Set(["c"]), anchor: "c" });
  });

  test("toggle adds and removes, moving the anchor", () => {
    const added = click_select({ selection: new Set(["a"]), anchor: "a" }, "c", { toggle: true, range: false }, order);
    expect(added).toEqual({ selection: new Set(["a", "c"]), anchor: "c" });
    expect(click_select(added, "a", { toggle: true, range: false }, order).selection).toEqual(new Set(["c"]));
  });

  test("range selects from the anchor in reading order, either direction, keeping the anchor", () => {
    expect(click_select({ selection: new Set(["d"]), anchor: "d" }, "b", { toggle: false, range: true }, order)).toEqual({
      selection: new Set(["b", "c", "d"]),
      anchor: "d",
    });
  });

  test("toggle + range adds the range to what's selected", () => {
    const state = { selection: new Set(["a"]), anchor: "c" };
    expect(click_select(state, "e", { toggle: true, range: true }, order).selection).toEqual(new Set(["a", "c", "d", "e"]));
  });

  test("range without an anchor behaves like a plain click", () => {
    expect(click_select({ selection: new Set(), anchor: null }, "b", { toggle: false, range: true }, order).selection).toEqual(new Set(["b"]));
  });
});

describe("rectangles", () => {
  test("rect_from_points normalises any drag direction", () => {
    expect(rect_from_points({ x: 50, y: 10 }, { x: 10, y: 40 })).toEqual({ left: 10, top: 10, right: 50, bottom: 40 });
  });

  test("intersects needs real overlap, not a shared edge", () => {
    const a = { left: 0, top: 0, right: 10, bottom: 10 };
    expect(intersects(a, { left: 5, top: 5, right: 20, bottom: 20 })).toBe(true);
    expect(intersects(a, { left: 10, top: 0, right: 20, bottom: 10 })).toBe(false);
  });
});
