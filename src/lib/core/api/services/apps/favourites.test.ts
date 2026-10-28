import { describe, expect, test } from "vitest";
import { moved_favourite, parse_favourites, serialize_favourites, with_favourite, without_favourite } from "./favourites";

describe("favourite apps", () => {
  test("adding appends once; removing drops it", () => {
    expect(with_favourite(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(with_favourite(["a", "b"], "a")).toEqual(["a", "b"]);
    expect(without_favourite(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  test("moving places the app at an index of the shown list", () => {
    const ids = ["a", "b", "c", "d"];
    expect(moved_favourite(ids, ids, "d", 0)).toEqual(["d", "a", "b", "c"]);
    expect(moved_favourite(ids, ids, "a", 2)).toEqual(["b", "c", "a", "d"]);
    expect(moved_favourite(ids, ids, "a", 99)).toEqual(["b", "c", "d", "a"]);
    expect(moved_favourite(ids, ids, "x", 0)).toEqual(ids);
  });

  test("favourites that aren't shown keep their neighbours", () => {
    const ids = ["a", "hidden", "b", "c", "late"];
    const shown = ["a", "b", "c"];
    expect(moved_favourite(ids, shown, "c", 1)).toEqual(["a", "hidden", "c", "b", "late"]);
    expect(moved_favourite(ids, shown, "a", 2)).toEqual(["hidden", "b", "c", "a", "late"]);
  });

  test("round-trips", () => {
    expect(parse_favourites(serialize_favourites(["b", "a"]))).toEqual(["b", "a"]);
  });

  test("parsing is tolerant: a bad file is empty, bad entries drop out", () => {
    expect(parse_favourites(null)).toEqual([]);
    expect(parse_favourites("{")).toEqual([]);
    expect(parse_favourites(JSON.stringify({ version: 2, ids: ["a"] }))).toEqual([]);
    expect(parse_favourites(JSON.stringify({ version: 1, ids: ["a", 3, "", "a", "b"] }))).toEqual(["a", "b"]);
  });
});
