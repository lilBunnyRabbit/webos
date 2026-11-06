import { describe, expect, test } from "vitest";
import { contact_point, inside_convex, overlaps, penetration } from "./collision";
import { oriented_box, rect } from "./geometry";

describe("overlaps", () => {
  test("separate, touching and overlapping boxes", () => {
    expect(overlaps(rect(0, 0, 1, 1), rect(2, 0, 3, 1))).toBe(false);
    expect(overlaps(rect(0, 0, 1, 1), rect(1, 0, 2, 1))).toBe(false);
    expect(overlaps(rect(0, 0, 1, 1), rect(0.9, 0.9, 2, 2))).toBe(true);
  });

  test("a rotated box clears a corner its bounding box would hit", () => {
    const diamond = oriented_box(1.5, 1.5, Math.PI / 4, 1, 1);
    expect(overlaps(diamond, rect(0, 0, 1, 1))).toBe(false);
    expect(overlaps(oriented_box(1.2, 1.2, Math.PI / 4, 1, 1), rect(0, 0, 1, 1))).toBe(true);
  });

  test("a thin wall crossing the middle of a box, no corner inside either", () => {
    expect(overlaps(rect(0, 0, 4, 2), rect(1.9, -1, 2.1, 3))).toBe(true);
  });

  test("winding doesn't matter", () => {
    expect(overlaps([...rect(0, 0, 1, 1)].reverse(), rect(0.5, 0.5, 2, 2))).toBe(true);
  });
});

describe("contact_point", () => {
  test("lands where the shapes meet", () => {
    const at = contact_point(rect(0, 0, 2, 2), rect(1.8, 0.9, 3, 1.1))!;
    expect(at.x).toBeGreaterThan(1.7);
    expect(at.x).toBeLessThan(2.1);
    expect(at.y).toBeCloseTo(1, 1);
  });
});

describe("penetration", () => {
  test("depth and the way out of an overlap", () => {
    const hit = penetration(rect(0, 0, 1, 1), rect(0.8, 0, 2, 1))!;
    expect(hit.depth).toBeCloseTo(0.2);
    expect(hit.normal.x).toBeCloseTo(-1);
    expect(hit.normal.y).toBeCloseTo(0);
    expect(hit.point.x).toBeGreaterThan(0.79);
    expect(hit.point.x).toBeLessThan(1.01);
    expect(penetration(rect(0.8, 0, 2, 1), rect(0, 0, 1, 1))!.normal.x).toBeCloseTo(1);
  });

  test("apart or touching is none", () => {
    expect(penetration(rect(0, 0, 1, 1), rect(1, 0, 2, 1))).toBeNull();
    expect(penetration(oriented_box(1.5, 1.5, Math.PI / 4, 1, 1), rect(0, 0, 1, 1))).toBeNull();
  });

  test("a turned hull is pushed off a wall's face, not round its end", () => {
    const hit = penetration(oriented_box(0, 0.9, 0.2, 4, 2), rect(-10, 1, 10, 3))!;
    expect(hit.normal.x).toBeCloseTo(0);
    expect(hit.normal.y).toBeCloseTo(-1);
    expect(hit.depth).toBeCloseTo(1.277, 2);
  });
});

describe("inside_convex", () => {
  test("with and without a margin", () => {
    const square = rect(0, 0, 2, 2);
    expect(inside_convex({ x: 1, y: 1 }, square)).toBe(true);
    expect(inside_convex({ x: 0.05, y: 1 }, square)).toBe(true);
    expect(inside_convex({ x: 0.05, y: 1 }, square, 0.1)).toBe(false);
    expect(inside_convex({ x: 3, y: 1 }, square)).toBe(false);
  });
});
