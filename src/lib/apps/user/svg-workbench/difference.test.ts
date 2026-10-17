import { expect, test } from "vitest";
import { difference } from "./difference";

const RED: [number, number, number] = [255, 0, 0];

function pixels(...rgba: number[][]) {
  return { data: new Uint8ClampedArray(rgba.flat()), width: rgba.length, height: 1 };
}

test("identical renders change nothing and fade the original", () => {
  const image = pixels([0, 0, 0, 255], [10, 20, 30, 200]);
  const result = difference(image, image, RED);
  expect(result.changed).toBe(0);
  expect([...result.pixels]).toEqual([0, 0, 0, 64, 10, 20, 30, 50]);
});

test("counts changes against painted pixels only, past the tolerance", () => {
  const before = pixels([0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 255], [100, 100, 100, 255]);
  const after = pixels([0, 0, 0, 0], [0, 0, 0, 0], [255, 255, 255, 255], [110, 100, 100, 255]);
  const result = difference(before, after, RED);
  expect(result.changed).toBe(50);
  expect([...result.pixels.slice(8, 12)]).toEqual([255, 0, 0, 255]);
  expect([...result.pixels.slice(0, 4)]).toEqual([0, 0, 0, 0]);
});

test("a shape that disappears counts", () => {
  expect(difference(pixels([0, 0, 0, 255]), pixels([0, 0, 0, 0]), RED).changed).toBe(100);
});

test("sizes must match", () => {
  expect(() => difference(pixels([0, 0, 0, 0]), pixels([0, 0, 0, 0], [0, 0, 0, 0]), RED)).toThrow();
});
