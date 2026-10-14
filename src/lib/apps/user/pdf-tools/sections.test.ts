import { describe, expect, test } from "vitest";
import { Section, initial_section, launch_paths } from "./sections";

describe("launch routing", () => {
  test("an explicit section wins", () => {
    expect(initial_section({ section: Section.SIGN, path: "/home/a.pdf" })).toBe(Section.SIGN);
  });

  test("one PDF opens Organize, several open Merge, images open Images to PDF", () => {
    expect(initial_section({})).toBe(Section.ORGANIZE);
    expect(initial_section({ path: "/home/a.pdf" })).toBe(Section.ORGANIZE);
    expect(initial_section({ paths: ["/home/a.pdf", "/home/b.pdf"] })).toBe(Section.MERGE);
    expect(initial_section({ paths: ["/home/a.png", "/home/b.JPG"] })).toBe(Section.IMAGES);
  });

  test("a signature opens Sign", () => {
    expect(initial_section({ signature: "Me.svg" })).toBe(Section.SIGN);
  });

  test("path comes first, then paths", () => {
    expect(launch_paths({ path: "/a.pdf", paths: ["/b.pdf"] })).toEqual(["/a.pdf", "/b.pdf"]);
  });
});
