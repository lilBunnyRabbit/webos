import { describe, expect, test } from "vitest";
import { with_pin, without_pin } from "./taskbar";

describe("quick launch pins", () => {
  test("pins at the end by default, or at an index", () => {
    expect(with_pin(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(with_pin(["a", "b"], "c", 0)).toEqual(["c", "a", "b"]);
    expect(with_pin(["a", "b"], "c", 1)).toEqual(["a", "c", "b"]);
  });

  test("an already pinned app moves instead of doubling, counting the index without it", () => {
    expect(with_pin(["a", "b", "c"], "a", 2)).toEqual(["b", "c", "a"]);
    expect(with_pin(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
    expect(with_pin(["a", "b"], "a", 99)).toEqual(["b", "a"]);
  });

  test("unpins", () => {
    expect(without_pin(["a", "b"], "a")).toEqual(["b"]);
    expect(without_pin(["a"], "x")).toEqual(["a"]);
  });
});
