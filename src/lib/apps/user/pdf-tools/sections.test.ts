import { describe, expect, test } from "vitest";
import { HOME, Section, initial_view, launch_paths } from "./sections";

describe("launch routing", () => {
  test("an explicit section wins", () => {
    expect(initial_view({ section: Section.SIGN, path: "/home/a.pdf" })).toBe(Section.SIGN);
  });

  test("nothing opens the home, one PDF Organize, several Merge, images Images to PDF", () => {
    expect(initial_view({})).toBe(HOME);
    expect(initial_view({ path: "/home/a.pdf" })).toBe(Section.ORGANIZE);
    expect(initial_view({ paths: ["/home/a.pdf", "/home/b.pdf"] })).toBe(Section.MERGE);
    expect(initial_view({ paths: ["/home/a.png", "/home/b.JPG"] })).toBe(Section.IMAGES);
  });

  test("a signature opens Sign", () => {
    expect(initial_view({ signature: "Me.svg" })).toBe(Section.SIGN);
  });

  test("path comes first, then paths", () => {
    expect(launch_paths({ path: "/a.pdf", paths: ["/b.pdf"] })).toEqual(["/a.pdf", "/b.pdf"]);
  });
});
