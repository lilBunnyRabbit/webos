import { describe, expect, test } from "vitest";
import { parse_recent, RECENT_LIMIT, serialize_recent, with_recent } from "./recent";

describe("recent apps", () => {
  test("a launch moves the app to the front, once", () => {
    expect(with_recent(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
    expect(with_recent([], "a")).toEqual(["a"]);
  });

  test("the list keeps the newest 16", () => {
    let ids: string[] = [];
    for (let index = 0; index < 20; index++) ids = with_recent(ids, `app-${index}`);
    expect(ids).toHaveLength(RECENT_LIMIT);
    expect(ids[0]).toBe("app-19");
    expect(ids.at(-1)).toBe("app-4");
  });

  test("round-trips", () => {
    expect(parse_recent(serialize_recent(["b", "a"]))).toEqual(["b", "a"]);
  });

  test("parsing is tolerant: a bad file is empty, bad entries drop out", () => {
    expect(parse_recent(null)).toEqual([]);
    expect(parse_recent("{")).toEqual([]);
    expect(parse_recent(JSON.stringify({ version: 2, ids: ["a"] }))).toEqual([]);
    expect(parse_recent(JSON.stringify({ version: 1, ids: ["a", 3, "", "a", "b"] }))).toEqual(["a", "b"]);
    const long = Array.from({ length: 30 }, (_, index) => `app-${index}`);
    expect(parse_recent(JSON.stringify({ version: 1, ids: long }))).toHaveLength(RECENT_LIMIT);
  });
});
