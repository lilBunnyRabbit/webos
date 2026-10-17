import { describe, expect, it } from "vitest";
import { clamp_top, MAX_SCROLL_HEIGHT, reveal_row, row_window, rows_per_page, scroll_height, scroll_scale } from "./rows";

const ROW = 20;

describe("row_window", () => {
  it("renders the visible rows plus overscan", () => {
    expect(row_window(0, 200, 1000, ROW, 5)).toEqual({ first: 0, end: 15, offset: 0 });
    expect(row_window(400, 200, 1000, ROW, 5)).toEqual({ first: 15, end: 35, offset: -100 });
  });

  it("offsets a partly scrolled row", () => {
    expect(row_window(410, 200, 1000, ROW, 0)).toEqual({ first: 20, end: 31, offset: -10 });
  });

  it("stops at the last row and clamps a top past the end", () => {
    expect(row_window(1_000_000, 200, 1000, ROW, 5)).toEqual({ first: 985, end: 1000, offset: -100 });
    expect(row_window(0, 200, 3, ROW, 5)).toEqual({ first: 0, end: 3, offset: 0 });
  });
});

describe("scroll scaling", () => {
  it("is 1:1 while the content fits under the cap", () => {
    expect(scroll_height(1000, ROW)).toBe(20_000);
    expect(scroll_scale(1000, ROW, 200)).toBe(1);
  });

  it("caps the scroll height and maps the scrollbar's range onto the whole file", () => {
    const rows = 2 ** 30 / 16;
    const viewport = 400;
    expect(scroll_height(rows, ROW)).toBe(MAX_SCROLL_HEIGHT);
    const scale = scroll_scale(rows, ROW, viewport);
    expect(scale).toBeGreaterThan(1);
    const bottom = (MAX_SCROLL_HEIGHT - viewport) * scale;
    expect(bottom).toBeCloseTo(rows * ROW - viewport, 3);
    expect(row_window(bottom, viewport, rows, ROW, 0).end).toBe(rows);
  });
});

describe("clamp_top and reveal_row", () => {
  it("keeps top inside the content", () => {
    expect(clamp_top(-5, 100, ROW, 200)).toBe(0);
    expect(clamp_top(5000, 100, ROW, 200)).toBe(1800);
    expect(clamp_top(50, 5, ROW, 200)).toBe(0);
  });

  it("scrolls the least needed to show a row whole", () => {
    expect(reveal_row(100, 2, ROW, 200)).toBe(40);
    expect(reveal_row(100, 10, ROW, 200)).toBe(100);
    expect(reveal_row(100, 15, ROW, 200)).toBe(120);
  });

  it("pages by whole rows, at least one", () => {
    expect(rows_per_page(210, ROW)).toBe(10);
    expect(rows_per_page(5, ROW)).toBe(1);
  });
});
