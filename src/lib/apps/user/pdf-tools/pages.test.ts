import { describe, expect, test } from "vitest";
import {
  initial_pages,
  insert_blank,
  is_unchanged,
  move_page,
  move_to_slot,
  normalize_rotation,
  remove_page,
  rotate_all,
  rotate_page,
  type PageItem,
} from "./pages";

function ids() {
  let n = 0;
  return () => `p${n++}`;
}

const sources = (pages: PageItem[]) => pages.map((page) => page.source);

describe("page operations", () => {
  test("initial pages are unchanged", () => {
    const pages = initial_pages(3, ids());
    expect(sources(pages)).toEqual([0, 1, 2]);
    expect(is_unchanged(pages, 3)).toBe(true);
  });

  test("move", () => {
    const pages = initial_pages(4, ids());
    expect(sources(move_page(pages, 0, 3))).toEqual([1, 2, 3, 0]);
    expect(sources(move_page(pages, 3, 0))).toEqual([3, 0, 1, 2]);
    expect(move_page(pages, 1, 1)).toBe(pages);
    expect(sources(move_to_slot(pages, 0, 2))).toEqual([1, 0, 2, 3]);
    expect(sources(move_to_slot(pages, 3, 1))).toEqual([0, 3, 1, 2]);
    expect(sources(move_to_slot(pages, 1, 4))).toEqual([0, 2, 3, 1]);
    expect(is_unchanged(move_page(pages, 0, 1), 4)).toBe(false);
  });

  test("rotate wraps", () => {
    expect(normalize_rotation(-90)).toBe(270);
    expect(normalize_rotation(450)).toBe(90);
    const pages = initial_pages(2, ids());
    const rotated = rotate_page(pages, "p1", -90);
    expect(rotated.map((page) => page.rotation)).toEqual([0, 270]);
    expect(rotate_all(rotated, 90).map((page) => page.rotation)).toEqual([90, 0]);
    expect(is_unchanged(rotate_page(rotate_page(pages, "p0", 90), "p0", 270), 2)).toBe(true);
  });

  test("remove and insert blank", () => {
    const make = ids();
    const pages = initial_pages(3, make);
    expect(sources(remove_page(pages, "p1"))).toEqual([0, 2]);
    expect(sources(insert_blank(pages, 1, make))).toEqual([0, null, 1, 2]);
    expect(sources(insert_blank(pages, 99, make))).toEqual([0, 1, 2, null]);
    expect(is_unchanged(remove_page(pages, "p2"), 3)).toBe(false);
  });
});
