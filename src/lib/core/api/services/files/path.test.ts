import { describe, expect, test } from "vitest";
import { join_path, split_path } from "./path";

describe("path", () => {
  test("split drops empty segments", () => {
    expect(split_path("/docs/a.txt")).toEqual(["docs", "a.txt"]);
    expect(split_path("//docs/")).toEqual(["docs"]);
    expect(split_path("/")).toEqual([]);
  });

  test("join builds an absolute path", () => {
    expect(join_path([])).toBe("/");
    expect(join_path(["docs"], "a.txt")).toBe("/docs/a.txt");
  });

  test("split then join normalises", () => {
    expect(join_path(split_path("//home//Desktop/"))).toBe("/home/Desktop");
  });
});
