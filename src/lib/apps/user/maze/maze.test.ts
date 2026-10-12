import { describe, expect, test } from "vitest";
import {
  CARVERS,
  carve,
  carve_steps,
  cell_count,
  create_maze,
  create_rng,
  Direction,
  exits,
  generate,
  passage_count,
  run,
  step,
  type Maze,
} from "./maze";

function reachable(maze: Maze, from = 0): number {
  const seen = new Uint8Array(cell_count(maze));
  const stack = [from];
  seen[from] = 1;
  let count = 1;
  while (stack.length) {
    for (const next of exits(maze, stack.pop()!)) {
      if (seen[next]) continue;
      seen[next] = 1;
      count++;
      stack.push(next);
    }
  }
  return count;
}

const SHAPES: [number, number][] = [
  [1, 1],
  [1, 7],
  [7, 1],
  [2, 2],
  [10, 10],
  [17, 9],
  [32, 32],
];

describe.each(CARVERS)("%s", (carver) => {
  test.each(SHAPES)("%i×%i is a perfect maze", (width, height) => {
    for (let seed = 0; seed < 8; seed++) {
      const maze = generate(carver, width, height, seed);
      expect(reachable(maze)).toBe(width * height);
      expect(passage_count(maze)).toBe(width * height - 1);
    }
  });

  test("the same seed gives the same maze", () => {
    expect(generate(carver, 12, 12, 42).open).toEqual(generate(carver, 12, 12, 42).open);
  });

  test("different seeds give different mazes", () => {
    expect(generate(carver, 12, 12, 1).open).not.toEqual(generate(carver, 12, 12, 2).open);
  });

  test("never opens a passage through the outer wall", () => {
    const maze = generate(carver, 9, 6, 7);
    for (let x = 0; x < 9; x++) {
      expect(maze.open[x] & 1).toBe(0);
      expect(maze.open[5 * 9 + x] & 4).toBe(0);
    }
    for (let y = 0; y < 6; y++) {
      expect(maze.open[y * 9] & 8).toBe(0);
      expect(maze.open[y * 9 + 8] & 2).toBe(0);
    }
  });

  test("yields steps whose head is a cell", () => {
    const maze = create_maze(6, 6);
    let steps = 0;
    for (const { head } of carve_steps(carver, maze, create_rng(3))) {
      steps++;
      if (head === null) continue;
      expect(head).toBeGreaterThanOrEqual(0);
      expect(head).toBeLessThan(36);
    }
    expect(steps).toBeGreaterThan(0);
  });
});

describe("create_rng", () => {
  test("stays in [0, 1)", () => {
    const rng = create_rng(123);
    for (let i = 0; i < 1000; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("moving on a 3×2 maze: corridor 0-1-2-5, branch 1-4-3", () => {
  const maze = create_maze(3, 2);
  carve(maze, 0, 1);
  carve(maze, 1, 2);
  carve(maze, 2, 5);
  carve(maze, 1, 4);
  carve(maze, 4, 3);

  test("step stops at walls", () => {
    expect(step(maze, 0, Direction.S)).toBe(0);
    expect(step(maze, 0, Direction.E)).toBe(1);
    expect(step(maze, 0, Direction.N)).toBe(0);
  });

  test("run stops at a junction", () => {
    expect(run(maze, 0, Direction.E, 5)).toEqual([1]);
  });

  test("run follows corners until a dead end", () => {
    expect(run(maze, 1, Direction.S, 5)).toEqual([4, 3]);
  });

  test("run stops on the goal", () => {
    expect(run(maze, 1, Direction.E, 2)).toEqual([2]);
    expect(run(maze, 1, Direction.E, 5)).toEqual([2, 5]);
  });

  test("run into a wall goes nowhere", () => {
    expect(run(maze, 0, Direction.W, 5)).toEqual([]);
  });
});
