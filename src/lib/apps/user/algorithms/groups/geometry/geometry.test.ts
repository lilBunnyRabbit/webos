import { describe, expect, test } from "vitest";
import { record, type Definition } from "../../engine/definition";
import type { Point } from "../../engine/step";
import geometry, { cross, intersect } from "./index";

const run = <R>(id: string, input: unknown) => {
  const recording = record(geometry[id] as Definition<unknown, R>, input, {});
  expect(recording.truncated).toBe(false);
  for (const step of recording.steps) expect(step.note.length).toBeGreaterThan(0);
  return recording.result as R;
};

const random_points = (count: number) => {
  const seen = new Set<string>();
  const list: Point[] = [];
  while (list.length < count) {
    const p = { x: Math.floor(Math.random() * 101), y: Math.floor(Math.random() * 101) };
    if (seen.has(`${p.x},${p.y}`)) continue;
    seen.add(`${p.x},${p.y}`);
    list.push(p);
  }
  return list;
};

function monotone_chain(list: Point[]): string[] {
  const sorted = [...list].sort((a, b) => a.x - b.x || a.y - b.y);
  const half = (points: Point[]) => {
    const out: Point[] = [];
    for (const p of points) {
      while (out.length >= 2 && cross(out.at(-2)!, out.at(-1)!, p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())].map((p) => `${p.x},${p.y}`).sort();
}

describe("convex hulls", () => {
  for (const id of ["graham-scan", "jarvis-march"]) {
    test(`${id} matches a monotone-chain reference`, () => {
      for (let round = 0; round < 60; round++) {
        const list = random_points(3 + Math.floor(Math.random() * 25));
        const { hull } = run<{ hull: Point[] }>(id, list);
        expect(hull.map((p) => `${p.x},${p.y}`).sort()).toEqual(monotone_chain(list));
      }
    });
  }
});

describe("closest pair", () => {
  test("matches brute force", () => {
    for (let round = 0; round < 60; round++) {
      const list = random_points(3 + Math.floor(Math.random() * 30));
      let best = Infinity;
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) best = Math.min(best, Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y));
      expect(run<{ distance: number }>("closest-pair", list).distance).toBeCloseTo(best);
    }
  });
});

describe("line sweep", () => {
  test("finds the same crossings as testing every pair", () => {
    for (let round = 0; round < 60; round++) {
      const segments = Array.from({ length: 2 + Math.floor(Math.random() * 10) }, () => {
        const [a, b] = random_points(2);
        return { a, b };
      });
      let expected = 0;
      for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) if (intersect(segments[i], segments[j])) expected++;
      expect(run<{ crossings: Point[] }>("line-sweep", segments).crossings).toHaveLength(expected);
    }
  });
});

describe("samples run", () => {
  for (const [id, definition] of Object.entries(geometry)) {
    test(id, () => {
      for (const input of [definition.input.sample, ...Array.from({ length: 5 }, () => definition.input.random())]) {
        expect(() => definition.input.parse(definition.input.format(input))).not.toThrow();
        run(id, input);
      }
    });
  }
});
