import { z } from "zod";
import { define, type Definition } from "../../engine/definition";
import { fields, InputError, InputKind, numbers, random_int, whole, type InputSpec } from "../../engine/inputs";
import { seeded, shuffle_with } from "../../engine/seeded";
import { grid, Tone, type Cell, type Step, type View } from "../../engine/step";

const QUEEN = "♛";

const n_queens = define({
  intro:
    "Place n queens on an n×n board so that none attacks another (no two in a row, column or diagonal). Backtracking puts a queen in the first safe square of the next row; when a row has no safe square left, it takes back the previous queen and tries that one's next square. Whole branches of hopeless boards are never explored.",
  use: "The model for constraint search: scheduling, timetabling, puzzle solvers, register allocation.",
  traits: ["Backtracking", "Prunes dead ends"],
  pseudocode: ["place(row):", "  if row = n: a solution", "  for each column c:", "    if (row, c) is safe: put a queen there, place(row + 1)", "    take the queen back (backtrack)"],
  input: numbers({ sample: [6], min_count: 1, max_count: 1, min: 4, max: 8, hint: "Board size n, from 4 to 8", random_count: 1 }),
  params: [
    {
      id: "mode",
      label: "Stop",
      kind: "choice",
      choices: [
        { value: "first", label: "At the first solution" },
        { value: "all", label: "After counting all" },
      ],
      default: "first",
    },
  ],
  *run([n]: number[], params): Generator<Step, { solutions: number; first: number[] | null }> {
    const queens: number[] = [];
    let placements = 0;
    let backtracks = 0;
    let solutions = 0;
    let first: number[] | null = null;
    const all = params.mode === "all";
    const board = (row: number, column: number, tone: Tone, attackers: number[] = []): View =>
      grid({
        title: "board",
        board: true,
        rows: Array.from({ length: n }, (_, r) =>
          Array.from({ length: n }, (_, c): Cell => {
            if (r === row && c === column) return { text: tone === Tone.BAD ? "×" : QUEEN, tone };
            if (queens[r] === c) return { text: QUEEN, tone: attackers.includes(r) ? Tone.BAD : Tone.MARK };
            return { text: "", tone: (r + c) % 2 ? Tone.MUTED : undefined };
          })
        ),
      });
    const frame = (note: string, line: number, view: View): Step => ({ views: [view], line, note, counters: { placements, backtracks, solutions } });
    const attackers = (row: number, column: number) => queens.map((c, r) => (c === column || Math.abs(c - column) === row - r ? r : -1)).filter((r) => r >= 0);
    function* place(row: number): Generator<Step, boolean> {
      if (row === n) {
        solutions++;
        if (!first) first = [...queens];
        yield frame(`All ${n} queens are placed: solution ${solutions}.`, 1, board(-1, -1, Tone.DONE));
        return !all;
      }
      for (let c = 0; c < n; c++) {
        const hits = attackers(row, c);
        if (hits.length) {
          yield frame(`Row ${row + 1}, column ${c + 1} is attacked by the queen in row ${hits[0] + 1}.`, 3, board(row, c, Tone.BAD, hits));
          continue;
        }
        queens.push(c);
        placements++;
        yield frame(`Row ${row + 1}, column ${c + 1} is safe: place a queen.`, 3, board(row, c, Tone.ACTIVE));
        if (yield* place(row + 1)) return true;
        queens.pop();
        backtracks++;
        yield frame(`Nothing works below: take back the queen in row ${row + 1}, column ${c + 1}.`, 4, board(row, c, Tone.WARN));
      }
      return false;
    }
    yield* place(0);
    yield frame(all ? `${solutions} solutions for ${n} queens.` : solutions ? "Found a solution." : `No solution for ${n} queens.`, -1, board(-1, -1, Tone.DONE));
    return { solutions, first };
  },
});

const SUDOKU = "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79";

export function sudoku_clash(puzzle: string): string | null {
  for (let a = 0; a < 81; a++) {
    if (puzzle[a] === ".") continue;
    for (let b = a + 1; b < 81; b++) {
      if (puzzle[b] !== puzzle[a]) continue;
      const [ra, ca, rb, cb] = [Math.floor(a / 9), a % 9, Math.floor(b / 9), b % 9];
      if (ra === rb || ca === cb || (Math.floor(ra / 3) === Math.floor(rb / 3) && Math.floor(ca / 3) === Math.floor(cb / 3)))
        return `Two ${puzzle[a]}s clash: row ${ra + 1} column ${ca + 1} and row ${rb + 1} column ${cb + 1}.`;
    }
  }
  return null;
}

function sudoku_spec(sample: string): InputSpec<string> {
  const check = (value: string) => {
    const cleaned = value.replace(/\s+/g, "").replace(/0/g, ".");
    if (!/^[1-9.]{81}$/.test(cleaned)) throw new InputError("81 cells: digits 1–9, and . or 0 for blanks.");
    const clash = sudoku_clash(cleaned);
    if (clash) throw new InputError(clash);
    return cleaned;
  };
  return {
    kind: InputKind.TEXT,
    hint: "81 cells row by row: digits, with . or 0 for blanks",
    schema: z.string().transform((value, context) => {
      try {
        return check(value);
      } catch (error) {
        context.addIssue({ code: "custom", message: (error as Error).message });
        return z.NEVER;
      }
    }) as unknown as z.ZodType<string>,
    parse: check,
    format: (value) => value,
    random: () => sample,
    sample,
  };
}

const sudoku = define({
  intro:
    "Fill the grid so every row, column and 3×3 box holds 1–9 once. The solver picks the empty cell with the fewest possible digits, tries each in turn, and backtracks when a cell runs out of options. Choosing the most constrained cell first keeps the search tiny on most puzzles.",
  use: "Any exact-cover or constraint puzzle; the same idea (with smarter propagation) runs inside SAT solvers.",
  traits: ["Backtracking", "Most-constrained first"],
  pseudocode: ["solve():", "  pick the empty cell with the fewest candidates", "  no empty cell: solved", "  for each candidate d:", "    write d, solve()", "  erase it and backtrack"],
  input: sudoku_spec(SUDOKU),
  presets: [
    { label: "Classic", value: SUDOKU },
    { label: "Harder", value: "..9748...7.........2.1.9.....7...24..64.1.59..98...3.....8.3.2.........6...2759.." },
  ],
  *run(puzzle: string): Generator<Step, { solution: string | null }> {
    const cells = [...puzzle].map((char) => (char === "." ? 0 : Number(char)));
    const given = cells.map((value) => value !== 0);
    let tries = 0;
    let backtracks = 0;
    const candidates = (index: number) => {
      const row = Math.floor(index / 9);
      const col = index % 9;
      const used = new Set<number>();
      for (let k = 0; k < 9; k++) {
        used.add(cells[row * 9 + k]);
        used.add(cells[k * 9 + col]);
        used.add(cells[(Math.floor(row / 3) * 3 + Math.floor(k / 3)) * 9 + Math.floor(col / 3) * 3 + (k % 3)]);
      }
      return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => !used.has(d));
    };
    const view = (active = -1, tone: Tone = Tone.ACTIVE): View =>
      grid({
        title: "grid",
        board: true,
        rows: Array.from({ length: 9 }, (_, r) =>
          Array.from({ length: 9 }, (_, c): Cell => {
            const index = r * 9 + c;
            const shade = (Math.floor(r / 3) + Math.floor(c / 3)) % 2 ? Tone.MUTED : undefined;
            return { text: cells[index] ? String(cells[index]) : "", tone: index === active ? tone : given[index] ? shade : cells[index] ? Tone.MARK : shade };
          })
        ),
      });
    const frame = (note: string, line: number, active = -1, tone: Tone = Tone.ACTIVE): Step => ({ views: [view(active, tone)], line, note, counters: { tries, backtracks, blanks: cells.filter((value) => !value).length } });
    yield frame(`${cells.filter((value) => !value).length} blanks to fill.`, -1);
    function* solve(): Generator<Step, boolean> {
      let best = -1;
      let options: number[] = [];
      for (let i = 0; i < 81; i++) {
        if (cells[i]) continue;
        const list = candidates(i);
        if (best === -1 || list.length < options.length) {
          best = i;
          options = list;
          if (list.length <= 1) break;
        }
      }
      if (best === -1) return true;
      const where = `row ${Math.floor(best / 9) + 1}, column ${(best % 9) + 1}`;
      if (options.length === 0) {
        yield frame(`${where} has no digit left: a dead end.`, 5, best, Tone.BAD);
        return false;
      }
      yield frame(`${where} has the fewest options: ${options.join(", ")}.`, 1, best, Tone.COMPARE);
      for (const d of options) {
        cells[best] = d;
        tries++;
        yield frame(`Try ${d} at ${where}.`, 4, best);
        if (yield* solve()) return true;
        cells[best] = 0;
        backtracks++;
        yield frame(`${d} at ${where} led nowhere: erase it.`, 5, best, Tone.WARN);
      }
      return false;
    }
    const solved = yield* solve();
    yield frame(solved ? `Solved with ${tries} tries and ${backtracks} backtracks.` : "This puzzle has no solution.", 2);
    return { solution: solved ? cells.join("") : null };
  },
});

interface MazeInput extends Record<string, unknown> {
  seed: number;
  width: number;
  height: number;
}

const maze_input = fields<MazeInput>({
  sample: { seed: 7, width: 10, height: 8 },
  hint: "seed: 7; width: 10; height: 8",
  schema: z.object({ seed: z.number().int().min(0).max(99999), width: z.number().int().min(3).max(16), height: z.number().int().min(3).max(16) }),
  parse: (entries) => ({ seed: whole(entries.get("seed"), "seed", 0, 99999), width: whole(entries.get("width"), "width", 3, 16), height: whole(entries.get("height"), "height", 3, 16) }),
  format: (value) => `seed: ${value.seed}; width: ${value.width}; height: ${value.height}`,
  random: () => ({ seed: random_int(0, 99999), width: random_int(6, 14), height: random_int(5, 12) }),
});

interface Maze {
  width: number;
  height: number;
  open: Set<string>;
}

const wall_key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

function maze_board(maze: Maze, marks: Map<number, Tone> = new Map(), title = "maze"): View {
  const { width, height, open } = maze;
  return grid({
    title,
    board: true,
    rows: Array.from({ length: height * 2 + 1 }, (_, r) =>
      Array.from({ length: width * 2 + 1 }, (_, c): Cell => {
        if (r % 2 === 1 && c % 2 === 1) {
          const cell = ((r - 1) / 2) * width + (c - 1) / 2;
          return { text: "", tone: marks.get(cell) };
        }
        if (r % 2 === 1 && c % 2 === 0 && c > 0 && c < width * 2) {
          const a = ((r - 1) / 2) * width + c / 2 - 1;
          return open.has(wall_key(a, a + 1)) ? { text: "", tone: marks.get(a) === marks.get(a + 1) ? marks.get(a) : undefined } : { text: "", tone: Tone.WALL };
        }
        if (r % 2 === 0 && c % 2 === 1 && r > 0 && r < height * 2) {
          const a = (r / 2 - 1) * width + (c - 1) / 2;
          return open.has(wall_key(a, a + width)) ? { text: "", tone: marks.get(a) === marks.get(a + width) ? marks.get(a) : undefined } : { text: "", tone: Tone.WALL };
        }
        return { text: "", tone: Tone.WALL };
      })
    ),
  });
}

const neighbours = (cell: number, width: number, height: number) => {
  const x = cell % width;
  const y = Math.floor(cell / width);
  return [y > 0 ? cell - width : -1, x < width - 1 ? cell + 1 : -1, y < height - 1 ? cell + width : -1, x > 0 ? cell - 1 : -1].filter((n) => n >= 0);
};

export function* generate_maze(input: MazeInput, method: string, emit: boolean): Generator<Step, Maze> {
  const { width, height } = input;
  const random = seeded(input.seed);
  const maze: Maze = { width, height, open: new Set() };
  const marks = new Map<number, Tone>();
  const total = width * height;
  let carved = 0;
  const frame = (note: string, line: number): Step => ({ views: [maze_board(maze, marks)], line, note, counters: { carved, cells: total } });
  if (method === "kruskal") {
    const parent = Array.from({ length: total }, (_, i) => i);
    const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    const walls: [number, number][] = [];
    for (let cell = 0; cell < total; cell++) for (const other of neighbours(cell, width, height)) if (other > cell) walls.push([cell, other]);
    for (const [a, b] of shuffle_with(walls, random)) {
      const [ra, rb] = [find(a), find(b)];
      if (ra === rb) continue;
      parent[ra] = rb;
      maze.open.add(wall_key(a, b));
      carved++;
      marks.set(a, Tone.MARK).set(b, Tone.MARK);
      if (emit) yield frame(`The wall between ${a} and ${b} separates two regions: knock it down.`, 2);
    }
  } else if (method === "prim") {
    const inside = new Set([0]);
    const frontier: [number, number][] = neighbours(0, width, height).map((n) => [0, n]);
    marks.set(0, Tone.MARK);
    while (frontier.length) {
      const [from, to] = frontier.splice(Math.floor(random() * frontier.length), 1)[0];
      if (inside.has(to)) continue;
      inside.add(to);
      maze.open.add(wall_key(from, to));
      carved++;
      marks.set(to, Tone.MARK);
      for (const n of neighbours(to, width, height)) if (!inside.has(n)) frontier.push([to, n]);
      if (emit) yield frame(`Pick a random wall on the edge of the maze and carve into ${to}.`, 1);
    }
  } else {
    const visited = new Set([0]);
    const stack = [0];
    marks.set(0, Tone.ACTIVE);
    while (stack.length) {
      const cell = stack.at(-1)!;
      const options = neighbours(cell, width, height).filter((n) => !visited.has(n));
      if (options.length === 0) {
        stack.pop();
        marks.set(cell, Tone.MARK);
        if (stack.length) marks.set(stack.at(-1)!, Tone.ACTIVE);
        if (emit) yield frame("A dead end: back up to the last cell with an unvisited neighbour.", 3);
        continue;
      }
      const next = options[Math.floor(random() * options.length)];
      visited.add(next);
      maze.open.add(wall_key(cell, next));
      carved++;
      marks.set(cell, Tone.COMPARE).set(next, Tone.ACTIVE);
      stack.push(next);
      if (emit) yield frame("Carve into a random unvisited neighbour.", 0);
    }
  }
  marks.clear();
  if (emit) yield frame(`Done: every cell is reachable, and there's exactly one path between any two.`, -1);
  return maze;
}

const maze_generation = define({
  intro:
    "A perfect maze is a spanning tree of the grid: every cell reachable, no loops. The recursive backtracker walks randomly, carving as it goes, and backs up at dead ends (long corridors). Prim's version grows from a random frontier (many short branches). Kruskal's knocks down random walls that join two separate regions (an even texture).",
  use: "Games and puzzles; and a hands-on way to see DFS, Prim and Kruskal produce different random spanning trees.",
  traits: ["Random spanning tree", "Seeded"],
  pseudocode: ["backtracker: carve into a random unvisited neighbour", "Prim: carve through a random wall on the frontier", "Kruskal: remove a random wall if its sides aren't connected yet", "backtracker: no unvisited neighbour: back up"],
  input: maze_input,
  params: [
    {
      id: "method",
      label: "Method",
      kind: "choice",
      choices: [
        { value: "backtracker", label: "Recursive backtracker" },
        { value: "prim", label: "Prim" },
        { value: "kruskal", label: "Kruskal" },
      ],
      default: "backtracker",
    },
  ],
  *run(input: MazeInput, params): Generator<Step, { open: string[] }> {
    const maze = yield* generate_maze(input, String(params.method ?? "backtracker"), true);
    return { open: [...maze.open] };
  },
});

const maze_solving = define({
  intro:
    "Breadth-first search solves a maze by flooding it from the entrance: first every cell one step away, then two steps, and so on. The first time the flood reaches the exit, the path it came along is a shortest one; following each cell's 'came from' back gives the route.",
  use: "Path-finding on grids in games and robotics; the same flood also measures distance to everything at once.",
  traits: ["Breadth-first", "Shortest path"],
  pseudocode: ["queue ← {entrance}; mark it", "while the queue isn't empty:", "  take the front cell", "  for each open neighbour not yet marked: mark it, remember where it came from, queue it", "the exit is marked: follow 'came from' back to the entrance"],
  input: maze_input,
  *run(input: MazeInput): Generator<Step, { length: number }> {
    const maze = yield* generate_maze(input, "backtracker", false);
    const { width, height } = maze;
    const exit = width * height - 1;
    const marks = new Map<number, Tone>([[0, Tone.ACTIVE], [exit, Tone.WARN]]);
    const from = new Map<number, number>([[0, -1]]);
    const queue = [0];
    let visited = 1;
    const frame = (note: string, line: number): Step => ({ views: [maze_board(maze, marks, "maze")], line, note, counters: { visited, "in queue": queue.length } });
    yield frame("Start at the top-left; the exit is bottom-right.", 0);
    while (queue.length) {
      const cell = queue.shift()!;
      if (cell === exit) break;
      marks.set(cell, Tone.MARK);
      for (const n of neighbours(cell, width, height)) {
        if (!maze.open.has(wall_key(cell, n)) || from.has(n)) continue;
        from.set(n, cell);
        visited++;
        queue.push(n);
        marks.set(n, n === exit ? Tone.DONE : Tone.COMPARE);
      }
      yield frame(`Visit a cell, queue its ${queue.length ? "open, unmarked neighbours" : "neighbours"}.`, 3);
    }
    const path: number[] = [];
    for (let cell = exit; cell !== -1 && from.has(cell); cell = from.get(cell)!) path.unshift(cell);
    for (const cell of [...marks.keys()]) if (!path.includes(cell)) marks.set(cell, Tone.MUTED);
    for (const cell of path) marks.set(cell, Tone.DONE);
    yield frame(`The flood reached the exit. The shortest path takes ${path.length - 1} steps.`, 4);
    return { length: path.length - 1 };
  },
});

interface FloodInput extends Record<string, unknown> {
  seed: number;
  size: number;
  x: number;
  y: number;
}

const flood_input = fields<FloodInput>({
  sample: { seed: 3, size: 10, x: 4, y: 4 },
  hint: "seed: 3; size: 10; x: 4; y: 4",
  schema: z.object({ seed: z.number().int().min(0).max(99999), size: z.number().int().min(4).max(16), x: z.number().int().min(0).max(15), y: z.number().int().min(0).max(15) }),
  parse: (entries) => {
    const size = whole(entries.get("size"), "size", 4, 16);
    return { seed: whole(entries.get("seed"), "seed", 0, 99999), size, x: whole(entries.get("x"), "x", 0, size - 1), y: whole(entries.get("y"), "y", 0, size - 1) };
  },
  format: (value) => `seed: ${value.seed}; size: ${value.size}; x: ${value.x}; y: ${value.y}`,
  random: () => {
    const size = random_int(8, 14);
    return { seed: random_int(0, 99999), size, x: random_int(0, size - 1), y: random_int(0, size - 1) };
  },
});

export function flood_board(input: FloodInput): boolean[] {
  const random = seeded(input.seed);
  const blocked = Array.from({ length: input.size * input.size }, () => random() < 0.32);
  blocked[input.y * input.size + input.x] = false;
  return blocked;
}

const flood_fill = define({
  intro:
    "Flood fill colours the whole connected region around a starting cell, like a paint bucket. It's a graph search on the grid: with a queue it spreads in rings (breadth-first), with a stack it snakes along one direction first (depth-first). Both fill exactly the same cells; only the order differs.",
  use: "Paint bucket tools, finding connected regions in images, Minesweeper's empty-area reveal, game map analysis.",
  traits: ["Grid search", "Queue or stack"],
  pseudocode: ["put the start in the container; mark it", "while the container isn't empty:", "  take a cell, fill it", "  for each of its 4 neighbours that's open and unmarked: mark it, add it"],
  input: flood_input,
  params: [
    {
      id: "order",
      label: "Container",
      kind: "choice",
      choices: [
        { value: "queue", label: "Queue (breadth-first)" },
        { value: "stack", label: "Stack (depth-first)" },
      ],
      default: "queue",
    },
  ],
  *run(input: FloodInput, params): Generator<Step, { filled: number[] }> {
    const { size } = input;
    const blocked = flood_board(input);
    const start = input.y * size + input.x;
    const marks = new Map<number, Tone>([[start, Tone.COMPARE]]);
    const container = [start];
    const filled: number[] = [];
    const queue = params.order !== "stack";
    const frame = (note: string, line: number, current = -1): Step => ({
      views: [grid({ title: "grid", board: true, rows: Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c): Cell => ({ text: "", tone: r * size + c === current ? Tone.ACTIVE : blocked[r * size + c] ? Tone.WALL : marks.get(r * size + c) }))) })],
      line,
      note,
      counters: { filled: filled.length, [queue ? "queue" : "stack"]: container.length },
    });
    yield frame(`Start at (${input.x}, ${input.y}).`, 0, start);
    while (container.length) {
      const cell = queue ? container.shift()! : container.pop()!;
      filled.push(cell);
      marks.set(cell, Tone.DONE);
      for (const n of neighbours(cell, size, size)) {
        if (blocked[n] || marks.has(n)) continue;
        marks.set(n, Tone.COMPARE);
        container.push(n);
      }
      yield frame(`Fill (${cell % size}, ${Math.floor(cell / size)}) and add its open neighbours.`, 3, cell);
    }
    yield frame(`Done: ${filled.length} cells filled.`, -1);
    return { filled: filled.sort((a, b) => a - b) };
  },
});

export default {
  "n-queens": n_queens,
  sudoku,
  "maze-generation": maze_generation,
  "maze-solving": maze_solving,
  "flood-fill": flood_fill,
} as unknown as Record<string, Definition>;
