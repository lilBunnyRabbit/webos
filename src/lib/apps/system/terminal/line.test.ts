import { describe, expect, it } from "vitest";
import { apply, common_prefix, history_hint } from "./line";

describe("common_prefix", () => {
  it("finds the shared start, ignoring case", () => {
    expect(common_prefix(["Pictures/", "Pics/", "pie.txt"])).toBe("Pi");
    expect(common_prefix(["one"])).toBe("one");
    expect(common_prefix([])).toBe("");
  });
});

describe("apply", () => {
  it("replaces the span and adds a space after a final value", () => {
    expect(apply("ls Pic", 3, 6, { value: "Pictures/", final: false })).toEqual({ line: "ls Pictures/", cursor: 12 });
    expect(apply("win c", 4, 5, { value: "close" })).toEqual({ line: "win close ", cursor: 10 });
  });

  it("keeps the rest of the line and doesn't double a space", () => {
    expect(apply("cp a b", 3, 4, { value: "alpha.txt" })).toEqual({ line: "cp alpha.txt b", cursor: 12 });
  });
});

describe("history_hint", () => {
  it("suggests the rest of the newest matching line", () => {
    expect(history_hint("ls", ["ls ~/Music", "ls ~/Pictures"])).toBe(" ~/Pictures");
    expect(history_hint("ls ~/Pictures", ["ls ~/Pictures"])).toBe("");
    expect(history_hint("", ["ls"])).toBe("");
  });
});
