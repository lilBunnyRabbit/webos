import { describe, expect, test } from "vitest";
import { HOME, Section, initial_view, launch_paths } from "./sections";

describe("launch routing", () => {
  test("an explicit section wins", () => {
    expect(initial_view({ section: Section.SPRITES, paths: ["/home/a.png", "/home/b.png"] })).toBe(Section.SPRITES);
  });

  test("no images open the home, one opens Remove background, several Join", () => {
    expect(initial_view({})).toBe(HOME);
    expect(initial_view({ path: "/home/a.png" })).toBe(Section.REMOVE_BACKGROUND);
    expect(initial_view({ paths: ["/home/a.png"] })).toBe(Section.REMOVE_BACKGROUND);
    expect(initial_view({ path: "/home/a.png", paths: ["/home/b.png"] })).toBe(Section.JOIN);
  });

  test("path comes first, then paths", () => {
    expect(launch_paths({ path: "/a.png", paths: ["/b.png"] })).toEqual(["/a.png", "/b.png"]);
  });
});
