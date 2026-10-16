import { describe, expect, test } from "vitest";
import { chunks, default_ranges, every_page, flatten_groups, parse_ranges, split_groups } from "./ranges";

describe("split_groups", () => {
  test("every page by default", () => {
    expect(split_groups(3, {})).toEqual({ ok: true, groups: [[1], [2], [3]] });
  });

  test("ranges or every N", () => {
    expect(split_groups(6, { ranges: "1-3,5" })).toEqual({ ok: true, groups: [[1, 2, 3], [5]] });
    expect(split_groups(5, { every: 2 })).toEqual({ ok: true, groups: [[1, 2], [3, 4], [5]] });
  });

  test("rejects both, zero and bad ranges", () => {
    expect(split_groups(5, { ranges: "1", every: 2 }).ok).toBe(false);
    expect(split_groups(5, { every: 0 }).ok).toBe(false);
    expect(split_groups(5, { ranges: "9" })).toEqual({ ok: false, error: "Pages go from 1 to 5" });
  });
});

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

describe("default_ranges", () => {
  test("parses for any page count", () => {
    for (let count = 1; count <= 8; count++) expect(parse_ranges(default_ranges(count), count).ok).toBe(true);
  });

  test("two files when there are two pages or more", () => {
    expect(default_ranges(1)).toBe("1");
    expect(default_ranges(2)).toBe("1, 2");
    expect(default_ranges(4)).toBe("1-3, 4");
    expect(default_ranges(12)).toBe("1-3, 5");
  });
});
