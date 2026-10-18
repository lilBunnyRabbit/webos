import { describe, expect, test } from "vitest";
import { default_params, record, type Definition } from "../../engine/definition";
import backtracking, { flood_board, generate_maze, sudoku_clash } from "./index";

const run = <R>(id: string, input: unknown, params: Record<string, number | string> = {}) => {
  const definition = backtracking[id] as Definition<unknown, R>;
  const recording = record(definition, input, { ...default_params(definition.params), ...params });
  expect(recording.truncated).toBe(false);
  for (const step of recording.steps) expect(step.note.length).toBeGreaterThan(0);
  return recording.result as R;
};

describe("n-queens", () => {
  test("the first solution is valid", () => {
    for (const n of [4, 5, 6, 7, 8]) {
      const { first } = run<{ first: number[] }>("n-queens", [n]);
      expect(first).toHaveLength(n);
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
        expect(first[a]).not.toBe(first[b]);
        expect(Math.abs(first[a] - first[b])).not.toBe(b - a);
      }
    }
  });

  test("counts every solution", () => {
    expect(run<{ solutions: number }>("n-queens", [4], { mode: "all" }).solutions).toBe(2);
    expect(run<{ solutions: number }>("n-queens", [6], { mode: "all" }).solutions).toBe(4);
  });
});

describe("sudoku", () => {
  const valid = (grid: string) => {
    const at = (r: number, c: number) => grid[r * 9 + c];
    for (let i = 0; i < 9; i++) {
      expect(new Set(Array.from({ length: 9 }, (_, k) => at(i, k))).size).toBe(9);
      expect(new Set(Array.from({ length: 9 }, (_, k) => at(k, i))).size).toBe(9);
      expect(new Set(Array.from({ length: 9 }, (_, k) => at(Math.floor(i / 3) * 3 + Math.floor(k / 3), (i % 3) * 3 + (k % 3)))).size).toBe(9);
    }
  };

  for (const preset of backtracking.sudoku.presets!) {
    test(`${preset.label}: solved and keeps the givens`, () => {
      const puzzle = preset.value as string;
      const { solution } = run<{ solution: string }>("sudoku", puzzle);
      valid(solution);
      [...puzzle].forEach((char, i) => char !== "." && expect(solution[i]).toBe(char));
    });
  }

  test("clashing givens are refused before solving", () => {
    expect(() => backtracking.sudoku.input.parse("11" + ".".repeat(79))).toThrow("clash");
    expect(sudoku_clash("1" + ".".repeat(9) + "1" + ".".repeat(70))).toContain("clash");
  });
});

describe("mazes", () => {
  for (const method of ["backtracker", "prim", "kruskal"]) {
    test(`${method}: a spanning tree, the same for the same seed`, () => {
      for (const seed of [1, 7, 42, 999]) {
        const input = { seed, width: 9, height: 7 };
        const drain = (generator: Generator<unknown, { open: Set<string> }>) => {
          for (;;) {
            const next = generator.next();
            if (next.done) return next.value;
          }
        };
        const maze = drain(generate_maze(input, method, false) as Generator<unknown, { open: Set<string> }>);
        expect(maze.open.size).toBe(9 * 7 - 1);
        const seen = new Set([0]);
        const stack = [0];
        while (stack.length) {
          const cell = stack.pop()!;
          for (const other of [cell - 9, cell + 9, cell - 1, cell + 1]) {
            const key = cell < other ? `${cell}-${other}` : `${other}-${cell}`;
            if (maze.open.has(key) && !seen.has(other)) seen.add(other), stack.push(other);
          }
        }
        expect(seen.size).toBe(63);
        expect(run<{ open: string[] }>("maze-generation", input, { method }).open.sort()).toEqual([...maze.open].sort());
      }
    });
  }

  test("solving finds a path", () => {
    expect(run<{ length: number }>("maze-solving", { seed: 7, width: 10, height: 8 }).length).toBeGreaterThanOrEqual(16);
  });
});

describe("flood fill", () => {
  test("queue and stack fill the same region, which is closed under neighbours", () => {
    for (const seed of [1, 3, 8, 21]) {
      const input = { seed, size: 10, x: 4, y: 4 };
      const a = run<{ filled: number[] }>("flood-fill", input, { order: "queue" }).filled;
      const b = run<{ filled: number[] }>("flood-fill", input, { order: "stack" }).filled;
      expect(a).toEqual(b);
      const blocked = flood_board(input);
      const region = new Set(a);
      for (const cell of a) {
        const x = cell % 10;
        for (const n of [cell - 10, cell + 10, x > 0 ? cell - 1 : -1, x < 9 ? cell + 1 : -1]) if (n >= 0 && n < 100 && !blocked[n]) expect(region.has(n)).toBe(true);
      }
    }
  });
});

describe("samples run", () => {
  for (const [id, definition] of Object.entries(backtracking)) {
    test(id, () => {
      for (const input of [definition.input.sample, ...Array.from({ length: 3 }, () => definition.input.random())]) {
        expect(() => definition.input.parse(definition.input.format(input))).not.toThrow();
        run(id, input);
      }
    });
  }
});
