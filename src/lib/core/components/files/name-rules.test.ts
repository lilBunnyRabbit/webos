import { describe, expect, test } from "vitest";
import { name_problem } from "./name-rules";

describe("name_problem", () => {
  test("accepts a free name", () => {
    expect(name_problem("notes.txt", ["a.txt"])).toBeNull();
  });

  test("rejects reserved names and slashes", () => {
    expect(name_problem("..", [])).not.toBeNull();
    expect(name_problem(" . ", [])).not.toBeNull();
    expect(name_problem("a/b", [])).not.toBeNull();
  });

  test("rejects a taken name, except the entry being renamed", () => {
    expect(name_problem("a.txt", ["a.txt"])).not.toBeNull();
    expect(name_problem(" a.txt ", ["a.txt"])).not.toBeNull();
    expect(name_problem("a.txt", ["a.txt"], "a.txt")).toBeNull();
  });
});
