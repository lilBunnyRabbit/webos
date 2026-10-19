import { describe, expect, test } from "vitest";
import { ctc_decode, text_boxes } from "./paddle";

function map(width: number, height: number, areas: { x: number; y: number; width: number; height: number; value: number }[]): Float32Array {
  const probability = new Float32Array(width * height);
  for (const area of areas) {
    for (let y = area.y; y < area.y + area.height; y++) for (let x = area.x; x < area.x + area.width; x++) probability[y * width + x] = area.value;
  }
  return probability;
}

describe("text_boxes", () => {
  test("finds each confident region and grows it by the unclip ratio", () => {
    const probability = map(100, 40, [
      { x: 10, y: 10, width: 20, height: 5, value: 0.9 },
      { x: 60, y: 10, width: 20, height: 5, value: 0.9 },
    ]);
    const boxes = text_boxes(probability, 100, 40);
    expect(boxes).toHaveLength(2);
    const grow = (20 * 5 * 1.5) / (2 * 25);
    expect(boxes[0]).toEqual({ x: 10 - grow, y: 10 - grow, width: 20 + 2 * grow, height: 5 + 2 * grow });
  });

  test("drops faint regions, slivers and pixels at the threshold", () => {
    const probability = map(100, 40, [
      { x: 10, y: 10, width: 20, height: 5, value: 0.5 },
      { x: 50, y: 10, width: 20, height: 2, value: 0.9 },
      { x: 10, y: 25, width: 20, height: 5, value: 0.3 },
    ]);
    expect(text_boxes(probability, 100, 40)).toEqual([]);
  });

  test("doesn't join a region at a row's right edge to the next row's left edge", () => {
    const probability = map(10, 10, [
      { x: 6, y: 2, width: 4, height: 4, value: 0.9 },
      { x: 0, y: 3, width: 4, height: 4, value: 0.9 },
    ]);
    expect(text_boxes(probability, 10, 10, 0.3, 0.6, 0)).toHaveLength(2);
  });
});

test("ctc_decode collapses repeats, skips blanks and averages the kept scores", () => {
  const characters = ["", "a", "b"];
  const steps = [
    [0.1, 0.8, 0.1],
    [0.1, 0.6, 0.3],
    [0.9, 0.05, 0.05],
    [0.1, 0.7, 0.2],
    [0.2, 0.2, 0.6],
  ];
  const { text, confidence } = ctc_decode(new Float32Array(steps.flat()), steps.length, 3, characters);
  expect(text).toBe("aab");
  expect(confidence).toBeCloseTo((0.8 + 0.7 + 0.6) / 3);
});
