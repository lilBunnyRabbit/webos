import { describe, expect, test } from "vitest";
import { Section, initial_section, launch_paths } from "./sections";

describe("launch routing", () => {
  test("an explicit section wins", () => {
    expect(initial_section({ section: Section.SPRITES, paths: ["/home/a.png", "/home/b.png"] })).toBe(Section.SPRITES);
  });

  test("several images open Join, one or none opens Remove background", () => {
    expect(initial_section({})).toBe(Section.REMOVE_BACKGROUND);
    expect(initial_section({ path: "/home/a.png" })).toBe(Section.REMOVE_BACKGROUND);
    expect(initial_section({ paths: ["/home/a.png"] })).toBe(Section.REMOVE_BACKGROUND);
    expect(initial_section({ path: "/home/a.png", paths: ["/home/b.png"] })).toBe(Section.JOIN);
  });

  test("path comes first, then paths", () => {
    expect(launch_paths({ path: "/a.png", paths: ["/b.png"] })).toEqual(["/a.png", "/b.png"]);
  });
});
