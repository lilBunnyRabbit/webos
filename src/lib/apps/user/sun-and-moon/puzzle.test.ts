import { across_cells, down_cells } from "$kit/games/grid";
import { create_rng } from "$lib/core/utils/random";
import { describe, expect, it } from "vitest";
import { count_solutions, deduce, Edge, full_grid, generate, line_patterns, lines_of, logic_solves, Mark, next_step, Rule, type Clues } from "./puzzle";

const SIZES = [6, 8];

function valid_grid(grid: readonly Mark[], size: number): boolean {
  return lines_of(empty_clues(size)).every((line) => {
    const marks = line.cells.map((cell) => grid[cell]);
    const suns = marks.filter((mark) => mark === Mark.SUN).length;
    const three = marks.some((mark, i) => i >= 2 && mark === marks[i - 1] && mark === marks[i - 2]);
    return suns === size / 2 && !marks.includes(Mark.EMPTY) && !three;
  });
}

function empty_clues(size: number): Clues {
  return { size, givens: new Array(size * size).fill(Mark.EMPTY), across: new Array(size * (size - 1)).fill(Edge.NONE), down: new Array(size * (size - 1)).fill(Edge.NONE) };
}

describe("line_patterns", () => {
  it("lists every balanced line without three alike", () => {
    expect(line_patterns(6)).toHaveLength(14);
    expect(line_patterns(8)).toHaveLength(34);
  });
});

describe("full_grid", () => {
  it("keeps every rule", () => {
    for (const size of SIZES) {
      for (let seed = 0; seed < 20; seed++) expect(valid_grid(full_grid(size, create_rng(seed)), size)).toBe(true);
    }
  });
});

describe("generate", () => {
  it("is fully determined by size and seed", () => {
    for (const size of SIZES) expect(generate(size, 31337)).toEqual(generate(size, 31337));
    expect(generate(6, 1)).not.toEqual(generate(6, 2));
  });

  it("gives puzzles with exactly one solution, matching the stored one and every clue", () => {
    for (const size of SIZES) {
      for (let seed = 1; seed <= 40; seed++) {
        const puzzle = generate(size, seed * 2654435761);
        expect(valid_grid(puzzle.solution, size)).toBe(true);
        expect(count_solutions(puzzle)).toBe(1);
        expect(logic_solves(puzzle)).toBe(true);
        expect(Array.from(deduce(puzzle)!)).toEqual(puzzle.solution);
        puzzle.givens.forEach((given, index) => given && expect(given).toBe(puzzle.solution[index]));
        const holds = (edge: Edge, [a, b]: [number, number]) => edge === Edge.NONE || (edge === Edge.SAME) === (puzzle.solution[a] === puzzle.solution[b]);
        puzzle.across.forEach((edge, index) => expect(holds(edge, across_cells(size, index))).toBe(true));
        puzzle.down.forEach((edge, index) => expect(holds(edge, down_cells(size, index))).toBe(true));
      }
    }
  });

  it("keeps as many givens as rows, and some signs", () => {
    for (const size of SIZES) {
      for (let seed = 1; seed <= 20; seed++) {
        const puzzle = generate(size, seed);
        expect(puzzle.givens.filter(Boolean).length).toBe(size);
        expect([...puzzle.across, ...puzzle.down].filter(Boolean).length).toBeGreaterThan(0);
      }
    }
  });

  it("drops every sign that deduction doesn't need", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const puzzle = generate(6, seed);
      for (const axis of ["across", "down"] as const) {
        puzzle[axis].forEach((edge, index) => {
          if (!edge) return;
          const edges = [...puzzle[axis]];
          edges[index] = Edge.NONE;
          expect(logic_solves({ ...puzzle, [axis]: edges })).toBe(false);
        });
      }
    }
  });
});

describe("count_solutions", () => {
  it("counts up to the limit on an open board", () => {
    expect(count_solutions(empty_clues(6))).toBe(2);
    expect(count_solutions(empty_clues(6), 5)).toBe(5);
  });

  it("finds none when clues contradict", () => {
    const clues = empty_clues(6);
    const givens = [...clues.givens];
    givens[0] = Mark.SUN;
    givens[1] = Mark.SUN;
    const across = [...clues.across];
    across[0] = Edge.DIFF;
    expect(count_solutions({ ...clues, givens, across })).toBe(0);
  });
});

describe("next_step", () => {
  const with_givens = (size: number, marks: Record<number, Mark>, edges: Partial<Pick<Clues, "across" | "down">> = {}): Clues => {
    const clues = empty_clues(size);
    const givens = [...clues.givens];
    for (const [index, mark] of Object.entries(marks)) givens[Number(index)] = mark;
    return { ...clues, givens, ...edges };
  };

  it("follows a sign first", () => {
    const across = new Array(30).fill(Edge.NONE);
    across[2] = Edge.DIFF;
    const step = next_step(with_givens(6, { 2: Mark.SUN }, { across }), []);
    expect(step).toMatchObject({ index: 3, mark: Mark.MOON, rule: Rule.SIGN, edge: Edge.DIFF });
  });

  it("closes both ends of a pair", () => {
    const step = next_step(with_givens(6, { 1: Mark.MOON, 2: Mark.MOON }), []);
    expect(step).toMatchObject({ index: 0, mark: Mark.SUN, rule: Rule.PAIR });
  });

  it("fills a gap between two alike", () => {
    const step = next_step(with_givens(6, { 7: Mark.SUN, 9: Mark.SUN }), []);
    expect(step).toMatchObject({ index: 8, mark: Mark.MOON, rule: Rule.GAP });
  });

  it("finishes a line that has its half of one mark", () => {
    const step = next_step(with_givens(6, { 0: Mark.SUN, 1: Mark.SUN, 2: Mark.MOON, 3: Mark.SUN }), []);
    expect(step).toMatchObject({ index: 4, mark: Mark.MOON, rule: Rule.COUNT });
  });

  it("reads the player's entries on top of the givens", () => {
    expect(next_step(with_givens(6, { 1: Mark.MOON }), [0, 0, Mark.MOON])).toMatchObject({ index: 0, rule: Rule.PAIR });
  });

  it("solves every generated puzzle step by step, each step right", () => {
    const rules = new Set<Rule>();
    for (const size of SIZES) {
      for (let seed = 1; seed <= 20; seed++) {
        const puzzle = generate(size, seed * 7919);
        const values: Mark[] = [...puzzle.givens];
        for (let step = next_step(puzzle, values); step; step = next_step(puzzle, values)) {
          expect(step.mark).toBe(puzzle.solution[step.index]);
          rules.add(step.rule);
          values[step.index] = step.mark;
        }
        expect(values).toEqual(puzzle.solution);
      }
    }
    expect([...rules].sort()).toEqual(Object.values(Rule).sort());
  });
});
