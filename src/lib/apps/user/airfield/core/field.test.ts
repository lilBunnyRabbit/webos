import { expect, test } from "vitest";
import { build_field, home_x, runway_ahead, WRAP } from "./field";

test("the world wraps: a plane flown round meets the home field again from behind", () => {
  const field = build_field();
  expect(home_x(field, 325 + WRAP * 3)).toBeCloseTo(325);
  expect(runway_ahead(field, 3000, 1)).toBeCloseTo(WRAP - 3000);
  expect(runway_ahead(field, 3000 + WRAP, -1)).toBeCloseTo(600);
  expect(runway_ahead(field, 300, 1)).toBeNull();
});
