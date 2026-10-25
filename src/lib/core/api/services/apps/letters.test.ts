import { describe, expect, test } from "vitest";
import { AppCategory, type AppListing } from "./type";
import { group_by_letter, initial, LETTERS } from "./letters";

const app = (name: string) =>
  ({ id: name.toLowerCase(), name, category: AppCategory.UTILITIES, system: false }) as AppListing;

describe("initial", () => {
  test("is the uppercased first letter, ignoring leading space", () => {
    expect(initial("  snake")).toBe("S");
  });

  test("folds accents to the base letter", () => {
    expect(initial("Čebela")).toBe("C");
    expect(initial("Éclair")).toBe("E");
  });

  test("anything that isn't a Latin letter files under #", () => {
    expect(initial("2048")).toBe("#");
    expect(initial("Ωmega")).toBe("#");
    expect(initial("")).toBe("#");
  });

  test("every initial is on the rail", () => {
    for (const name of ["a", "Z", "ž", "9", "?"]) expect(LETTERS).toContain(initial(name));
  });
});

describe("group_by_letter", () => {
  test("groups by initial, sorted by name, leaving empty letters out", () => {
    const groups = group_by_letter([app("Snake"), app("Calculator"), app("Čebela"), app("2048"), app("Sudoku")]);
    expect([...groups.keys()].sort()).toEqual(["#", "C", "S"]);
    expect(groups.get("C")!.map((entry) => entry.name)).toEqual(["Calculator", "Čebela"]);
    expect(groups.get("S")!.map((entry) => entry.name)).toEqual(["Snake", "Sudoku"]);
    expect(groups.has("A")).toBe(false);
  });
});
