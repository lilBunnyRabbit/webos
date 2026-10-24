import { describe, expect, test } from "vitest";
import { wcag_ratio } from "./contrast";

const BLACK = [0, 0, 0] as const;
const WHITE = [255, 255, 255] as const;

describe("wcag_ratio", () => {
  test("black on white is 21, same colour is 1, order doesn't matter", () => {
    expect(wcag_ratio(BLACK, WHITE)).toBeCloseTo(21, 5);
    expect(wcag_ratio(WHITE, BLACK)).toBeCloseTo(21, 5);
    expect(wcag_ratio([119, 119, 119], [119, 119, 119])).toBe(1);
  });

  test("#777 on white sits just under AA", () => {
    expect(wcag_ratio([119, 119, 119], WHITE)).toBeCloseTo(4.48, 2);
  });
});
