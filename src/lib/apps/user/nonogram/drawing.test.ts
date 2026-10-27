import { describe, expect, test } from "vitest";
import { compact, type Drawing } from "./file";
import { is_made, resize, sides_for, to_editor } from "./drawing";
import { Ink, INKS } from "./puzzle";

describe("to_editor", () => {
  test("maps a file's colours onto every ink and back", () => {
    const drawing: Drawing = { width: 2, height: 1, palette: [Ink.INFO, Ink.ERROR], cells: [1, 2] };
    const editing = to_editor(drawing);
    expect(editing.palette).toBe(INKS);
    expect(editing.cells).toEqual([INKS.indexOf(Ink.INFO) + 1, INKS.indexOf(Ink.ERROR) + 1]);
    expect(compact(editing)).toEqual({ ...drawing, palette: [Ink.ERROR, Ink.INFO], cells: [2, 1] });
  });
});

describe("resize", () => {
  test("crops and pads from the top-left", () => {
    expect(resize([1, 2, 3, 4], 2, 2, 3, 1)).toEqual([1, 2, 0]);
    expect(resize([1, 2, 3, 4], 2, 2, 1, 3)).toEqual([1, 3, 0]);
  });
});

describe("sides_for", () => {
  test("adds an odd size from a file", () => {
    expect(sides_for(12).map((side) => side.value)).toEqual(["5", "10", "12", "15", "20", "25", "30"]);
  });
});

describe("is_made", () => {
  test("needs a change and a filled cell", () => {
    expect(is_made(true, [0, 2, 0])).toBe(true);
    expect(is_made(false, [0, 2, 0])).toBe(false);
    expect(is_made(true, [0, 0, 0])).toBe(false);
  });
});
