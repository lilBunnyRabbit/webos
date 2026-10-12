import { describe, expect, test } from "vitest";
import { DEFAULT_LIST_SETTINGS, ListMode, check_list, parse_lines, run_list, split_teams } from "./list";

describe("parse_lines", () => {
  test("trims lines and drops blank ones, keeping duplicates", () => {
    expect(parse_lines("  Ana \n\n Bo\r\nAna\n   ")).toEqual(["Ana", "Bo", "Ana"]);
  });
});

describe("split_teams", () => {
  test("deals every entry once, with sizes at most one apart", () => {
    const items = Array.from({ length: 11 }, (_, i) => `p${i}`);
    const teams = split_teams(items, 3);
    expect(teams).toHaveLength(3);
    expect(teams.flat().sort()).toEqual([...items].sort());
    const sizes = teams.map((team) => team.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });
});

describe("check_list", () => {
  const items = ["a", "b", "c"];

  test("needs entries", () => {
    expect(check_list([], DEFAULT_LIST_SETTINGS).ok).toBe(false);
  });

  test("caps picks and teams at the entry count", () => {
    expect(check_list(items, { ...DEFAULT_LIST_SETTINGS, mode: ListMode.PICK_MANY, pick_count: 4 }).ok).toBe(false);
    expect(check_list(items, { ...DEFAULT_LIST_SETTINGS, mode: ListMode.PICK_MANY, pick_count: null }).ok).toBe(false);
    expect(check_list(items, { ...DEFAULT_LIST_SETTINGS, mode: ListMode.PICK_MANY, pick_count: 3 })).toEqual({
      ok: true,
      value: { mode: ListMode.PICK_MANY, count: 3 },
    });
    expect(check_list(items, { ...DEFAULT_LIST_SETTINGS, mode: ListMode.TEAMS, team_count: 4 }).ok).toBe(false);
    expect(check_list(items, { ...DEFAULT_LIST_SETTINGS, mode: ListMode.TEAMS, team_count: 1 }).ok).toBe(false);
  });
});

describe("run_list", () => {
  const items = ["a", "b", "c", "d", "e"];

  test("pick one returns one entry from the list", () => {
    const result = run_list(items, { mode: ListMode.PICK_ONE });
    expect(result.kind).toBe("items");
    if (result.kind === "items") {
      expect(result.items).toHaveLength(1);
      expect(items).toContain(result.items[0]);
    }
  });

  test("shuffle returns a permutation", () => {
    const result = run_list(items, { mode: ListMode.SHUFFLE });
    if (result.kind !== "items") throw new Error("Expected items");
    expect([...result.items].sort()).toEqual(items);
  });
});
