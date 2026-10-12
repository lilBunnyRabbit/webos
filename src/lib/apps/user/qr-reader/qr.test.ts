import { describe, expect, test } from "vitest";
import { fit_within } from "./qr";

describe("fit_within", () => {
  test("scales a landscape size down to the max on its long side", () => {
    expect(fit_within(1920, 1080, 1024)).toEqual({ width: 1024, height: 576 });
  });

  test("scales a portrait size down to the max on its long side", () => {
    expect(fit_within(1080, 1920, 200)).toEqual({ width: 113, height: 200 });
  });

  test("never scales up", () => {
    expect(fit_within(120, 80, 1024)).toEqual({ width: 120, height: 80 });
  });

  test("keeps at least one pixel per side", () => {
    expect(fit_within(10000, 1, 200)).toEqual({ width: 200, height: 1 });
  });
});
