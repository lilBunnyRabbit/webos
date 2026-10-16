import { describe, expect, test } from "vitest";
import { find_saved, renamed_saved, with_saved, without_saved } from "./saved-themes";
import { BRAND_DARK, BRAND_LIGHT } from "./themes";

describe("saved themes", () => {
  test("save adds at the end, and the same name replaces in place", () => {
    let saved = with_saved([], "Sunset", BRAND_DARK);
    saved = with_saved(saved, "Forest", BRAND_DARK);
    saved = with_saved(saved, " sunset ", BRAND_LIGHT);
    expect(saved.map((entry) => entry.name)).toEqual(["sunset", "Forest"]);
    expect(saved[0].theme).toEqual(BRAND_LIGHT);
  });

  test("find and delete ignore case", () => {
    const saved = with_saved([], "Sunset", BRAND_DARK);
    expect(find_saved(saved, "SUNSET")?.name).toBe("Sunset");
    expect(without_saved(saved, "sunset")).toEqual([]);
  });

  test("rename keeps the place and refuses a clash", () => {
    const saved = with_saved(with_saved([], "A", BRAND_DARK), "B", BRAND_LIGHT);
    expect(renamed_saved(saved, "a", "C").map((entry) => entry.name)).toEqual(["C", "B"]);
    expect(renamed_saved(saved, "A", "b")).toBe(saved);
    expect(renamed_saved(saved, "A", "a").map((entry) => entry.name)).toEqual(["a", "B"]);
  });
});
