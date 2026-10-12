import { describe, expect, test } from "vitest";
import { carve, cell_count, CARVERS, create_maze, create_rng, exits, generate, neighbours, type Maze } from "./maze";
import { solve, SOLVERS } from "./solve";

function distances(maze: Maze, from: number): Int32Array {
  const distance = new Int32Array(cell_count(maze)).fill(-1);
  distance[from] = 0;
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    for (const next of exits(maze, queue[i])) {
      if (distance[next] !== -1) continue;
      distance[next] = distance[queue[i]] + 1;
      queue.push(next);
    }
  }
  return distance;
}

function expect_valid_path(maze: Maze, path: number[], start: number, goal: number) {
  expect(path[0]).toBe(start);
  expect(path.at(-1)).toBe(goal);
  for (let i = 1; i < path.length; i++) expect(exits(maze, path[i - 1])).toContain(path[i]);
}

function open_grid(width: number, height: number): Maze {
  const maze = create_maze(width, height);
  for (let cell = 0; cell < cell_count(maze); cell++) {
    for (const next of neighbours(maze, cell)) if (next > cell) carve(maze, cell, next);
  }
  return maze;
}

function braided(width: number, height: number, seed: number): Maze {
  const maze = generate("backtracker", width, height, seed);
  const rng = create_rng(seed + 1);
  for (let i = 0; i < cell_count(maze) / 4; i++) {
    const cell = Math.floor(rng() * cell_count(maze));
    const options = neighbours(maze, cell);
    carve(maze, cell, options[Math.floor(rng() * options.length)]);
  }
  return maze;
}

describe.each(SOLVERS)("%s", (solver) => {
  test.each(CARVERS)("finds the shortest path through a %s maze", (carver) => {
    for (let seed = 0; seed < 6; seed++) {
      const maze = generate(carver, 15, 11, seed);
      const goal = cell_count(maze) - 1;
      const { path } = solve(solver, maze, 0, goal);
      expect_valid_path(maze, path, 0, goal);
      expect(path.length - 1).toBe(distances(maze, 0)[goal]);
    }
  });

  test("finds the shortest path when the maze has loops", () => {
    for (let seed = 0; seed < 10; seed++) {
      const maze = braided(14, 14, seed);
      const goal = cell_count(maze) - 1;
      const { path } = solve(solver, maze, 0, goal);
      expect_valid_path(maze, path, 0, goal);
      expect(path.length - 1).toBe(distances(maze, 0)[goal]);
    }
  });

  test("crosses an open grid in Manhattan distance", () => {
    const maze = open_grid(8, 5);
    expect(solve(solver, maze, 0, 39).path.length - 1).toBe(7 + 4);
  });

  test("start equal to goal is a one-cell path", () => {
    expect(solve(solver, generate("prim", 5, 5, 1), 12, 12).path).toEqual([12]);
  });

  test("returns no path when the goal is walled off", () => {
    expect(solve(solver, create_maze(3, 3), 0, 8).path).toEqual([]);
  });
});

test("A* expands fewer cells than BFS on an open grid", () => {
  const maze = open_grid(20, 20);
  expect(solve("a-star", maze, 0, 399).expanded).toBeLessThan(solve("bfs", maze, 0, 399).expanded);
});
