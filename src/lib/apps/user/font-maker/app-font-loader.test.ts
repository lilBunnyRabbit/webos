import { describe, expect, test } from "vitest";
import { build_family, build_variable } from "./build";
import { add_stroke, create_project, set_weights, type Stroke } from "./model";
import { file_faces, sfnt_style } from "$lib/core/utils/font-loader";

const line = (x0: number, y0: number, x1: number, y1: number): Stroke => Array.from({ length: 11 }, (_, index) => [x0 + ((x1 - x0) * index) / 10, y0 + ((y1 - y0) * index) / 10, 0.5]);

function project() {
  const drawn = add_stroke(create_project("Loader"), "o", line(100, 0, 100, 480));
  return set_weights(drawn, [
    { weight: 300, scale: 0.6 },
    { weight: 400, scale: 1 },
    { weight: 700, scale: 1.7 },
  ]);
}

describe("sfnt_style", () => {
  test("reads each face of a collection's weight and italic", () => {
    const styles = file_faces(build_family(project())).map((face) => sfnt_style(face.bytes));
    expect(styles).toEqual([
      { weight: 300, weights: null, italic: false },
      { weight: 400, weights: null, italic: false },
      { weight: 700, weights: null, italic: false },
      { weight: 300, weights: null, italic: true },
      { weight: 400, weights: null, italic: true },
      { weight: 700, weights: null, italic: true },
    ]);
  });

  test("a variable font covers its wght axis", () => {
    expect(sfnt_style(build_variable(project(), true))).toEqual({ weight: 400, weights: [300, 700], italic: true });
  });

  test("WOFF and garbage have no style to read", () => {
    expect(sfnt_style(new TextEncoder().encode("wOFF0000000000000000"))).toBeNull();
    expect(sfnt_style(new Uint8Array(4))).toBeNull();
  });
});
