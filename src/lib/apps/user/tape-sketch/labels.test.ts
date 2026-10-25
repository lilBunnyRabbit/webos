import { describe, expect, test } from "vitest";
import { line_hits_rect, place_labels, rects_overlap, text_width, type Line } from "./labels";

describe("line_hits_rect", () => {
  const rect = { x: 0, y: 0, w: 10, h: 10 };
  test("crossing, inside and missing", () => {
    expect(line_hits_rect({ a: { x: -5, y: 5 }, b: { x: 15, y: 5 } }, rect)).toBe(true);
    expect(line_hits_rect({ a: { x: 2, y: 2 }, b: { x: 3, y: 3 } }, rect)).toBe(true);
    expect(line_hits_rect({ a: { x: -5, y: -5 }, b: { x: 15, y: -1 } }, rect)).toBe(false);
    expect(line_hits_rect({ a: { x: 20, y: 0 }, b: { x: 20, y: 10 } }, rect)).toBe(false);
  });
});

describe("place_labels", () => {
  const square: Line[] = [
    { a: { x: 0, y: 0 }, b: { x: 200, y: 0 } },
    { a: { x: 200, y: 0 }, b: { x: 200, y: 200 } },
    { a: { x: 200, y: 200 }, b: { x: 0, y: 200 } },
    { a: { x: 0, y: 200 }, b: { x: 0, y: 0 } },
  ];

  test("puts a label on its preferred side, clear of every line", () => {
    const placed = place_labels(
      [{ id: "top", anchor: { x: 100, y: 0 }, sides: [{ x: 0, y: -1 }], width: 60, height: 20 }],
      square
    );
    const rect = placed.get("top")!;
    expect(rect.y + rect.h).toBeLessThanOrEqual(0);
    for (const line of square) expect(line_hits_rect(line, rect)).toBe(false);
  });

  test("moves out past a line that runs where the label would sit", () => {
    const lines = [...square, { a: { x: 0, y: -12 }, b: { x: 200, y: -12 } }];
    const rect = place_labels(
      [{ id: "top", anchor: { x: 100, y: 0 }, sides: [{ x: 0, y: -1 }], width: 60, height: 20 }],
      lines
    ).get("top")!;
    for (const line of lines) expect(line_hits_rect(line, rect)).toBe(false);
  });

  test("labels never overlap each other", () => {
    const requests = [0, 1, 2].map((i) => ({
      id: `l${i}`,
      anchor: { x: 100, y: 0 },
      sides: [{ x: 0, y: -1 }],
      width: 60,
      height: 20,
    }));
    const placed = [...place_labels(requests, square).values()];
    expect(rects_overlap(placed[0], placed[1])).toBe(false);
    expect(rects_overlap(placed[1], placed[2])).toBe(false);
    expect(rects_overlap(placed[0], placed[2])).toBe(false);
  });

  test("mono text width is 0.6 em per character", () => {
    expect(text_width("245 cm", 10)).toBe(36);
  });
});
