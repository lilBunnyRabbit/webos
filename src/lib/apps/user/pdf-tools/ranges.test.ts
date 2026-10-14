import { describe, expect, test } from "vitest";
import { chunks, every_page, flatten_groups, parse_ranges } from "./ranges";

describe("parse_ranges", () => {
  test("single pages and ranges", () => {
    expect(parse_ranges("1-3, 5", 10)).toEqual({ ok: true, groups: [[1, 2, 3], [5]] });
    expect(parse_ranges(" 2 ", 3)).toEqual({ ok: true, groups: [[2]] });
  });

  test("open ends", () => {
    expect(parse_ranges("8-", 10)).toEqual({ ok: true, groups: [[8, 9, 10]] });
    expect(parse_ranges("-2", 10)).toEqual({ ok: true, groups: [[1, 2]] });
  });

  test("descending range counts down", () => {
    expect(parse_ranges("3-1", 5)).toEqual({ ok: true, groups: [[3, 2, 1]] });
  });

  test("errors", () => {
    expect(parse_ranges("", 5).ok).toBe(false);
    expect(parse_ranges("a", 5)).toEqual({ ok: false, error: "“a” isn't a page or a range" });
    expect(parse_ranges("0", 5)).toEqual({ ok: false, error: "Pages go from 1 to 5" });
    expect(parse_ranges("4-9", 5).ok).toBe(false);
    expect(parse_ranges("2", 1)).toEqual({ ok: false, error: "This PDF has 1 page" });
    expect(parse_ranges("-", 5).ok).toBe(false);
  });
});

describe("groups", () => {
  test("flatten keeps first occurrence order", () => {
    expect(flatten_groups([[3, 4], [1], [4, 5]])).toEqual([3, 4, 1, 5]);
  });

  test("every page and chunks", () => {
    expect(every_page(3)).toEqual([[1], [2], [3]]);
    expect(chunks(7, 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
    expect(chunks(2, 0)).toEqual([[1], [2]]);
  });
});
