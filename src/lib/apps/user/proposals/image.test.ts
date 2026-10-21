import { expect, test } from "vitest";
import { fit_size, MAX_SIDE } from "./image";

test("the long edge is capped at 1200 px and the aspect kept", () => {
  expect(fit_size(4000, 3000)).toEqual({ width: MAX_SIDE, height: 900 });
  expect(fit_size(1000, 5000)).toEqual({ width: 240, height: MAX_SIDE });
});

test("small pictures are never upscaled and nothing goes below 1 px", () => {
  expect(fit_size(640, 480)).toEqual({ width: 640, height: 480 });
  expect(fit_size(20000, 1)).toEqual({ width: MAX_SIDE, height: 1 });
});
