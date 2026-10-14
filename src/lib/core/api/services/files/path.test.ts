import { describe, expect, test } from "vitest";
import { join_path, resolve_path, split_path, tilde_path } from "./path";

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

  test("resolve_path handles ~, relative, . and ..", () => {
    expect(resolve_path("/home/Pictures", "a.png")).toBe("/home/Pictures/a.png");
    expect(resolve_path("/home/Pictures", "../Music/./x")).toBe("/home/Music/x");
    expect(resolve_path("/etc", "~")).toBe("/home");
    expect(resolve_path("/etc", "~/Desktop/")).toBe("/home/Desktop");
    expect(resolve_path("/home", "/../..")).toBe("/");
    expect(resolve_path("/home", "~x")).toBe("/home/~x");
  });

  test("tilde_path shortens /home", () => {
    expect(tilde_path("/home")).toBe("~");
    expect(tilde_path("/home/Desktop")).toBe("~/Desktop");
    expect(tilde_path("/homeless")).toBe("/homeless");
  });
});
