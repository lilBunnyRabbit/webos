import { describe, expect, it } from "vitest";
import { DIFFICULTIES, PRESETS } from "./game";
import { CHAR_DIRECTIONS, generate, live_cells, offset, push_bound, solve, Tile, type Level } from "./puzzle";

function play(level: Level, moves: string): { boxes: number[]; player: number } {
  const boxes = [...level.boxes];
  let player = level.player;
  for (const char of moves) {
    const step = offset(level.width, CHAR_DIRECTIONS[char.toLowerCase()]);
    const next = player + step;
    expect(level.tiles[next]).toBe(Tile.FLOOR);
    const box = boxes.indexOf(next);
    expect(box !== -1).toBe(char !== char.toLowerCase());
    if (box !== -1) {
      expect(level.tiles[next + step]).toBe(Tile.FLOOR);
      expect(boxes.includes(next + step)).toBe(false);
      boxes[box] = next + step;
    }
    player = next;
  }
  return { boxes, player };
}

function parse(rows: string[]): Level {
  const width = rows[0].length;
  const tiles: Tile[] = [];
  const goals: number[] = [];
  const boxes: number[] = [];
  let player = -1;
  rows.join("").split("").forEach((char, i) => {
    tiles.push(char === "#" ? Tile.WALL : Tile.FLOOR);
    if (char === "." || char === "*") goals.push(i);
    if (char === "$" || char === "*") boxes.push(i);
    if (char === "@") player = i;
  });
  return { width, height: rows.length, tiles, goals, boxes, player, solution: "" };
}

describe("generate", () => {
  it("is the same level for the same seed", () => {
    for (const difficulty of DIFFICULTIES) {
      expect(generate(PRESETS[difficulty], 42)).toEqual(generate(PRESETS[difficulty], 42));
    }
  });

  it("differs between seeds", () => {
    const a = generate(PRESETS.medium, 1);
    const b = generate(PRESETS.medium, 2);
    expect(a.tiles.join() + a.boxes.join()).not.toBe(b.tiles.join() + b.boxes.join());
  });

  for (const difficulty of DIFFICULTIES) {
    it(`builds solvable ${difficulty} levels with no crate on a goal`, () => {
      const preset = PRESETS[difficulty];
      for (let seed = 1; seed <= 15; seed++) {
        const level = generate(preset, seed * 104729);
        expect(level.boxes).toHaveLength(preset.boxes);
        expect(level.goals).toHaveLength(preset.boxes);
        expect(level.boxes.some((box) => level.goals.includes(box))).toBe(false);
        expect(level.tiles[level.player]).toBe(Tile.FLOOR);
        const end = play(level, level.solution);
        expect([...end.boxes].sort((a, b) => a - b)).toEqual([...level.goals].sort((a, b) => a - b));
      }
    });
  }

  it("rejects trivial levels: easy ones still take the minimum pushes", () => {
    for (let seed = 1; seed <= 15; seed++) {
      const level = generate(PRESETS.easy, seed * 7919);
      const result = solve(level);
      expect(result.pushes).not.toBeNull();
      expect(result.pushes!).toBeGreaterThanOrEqual(PRESETS.easy.min_pushes);
      expect(result.pushes!).toBeLessThanOrEqual(level.solution.replace(/[a-z]/g, "").length);
    }
  });
});

describe("solve", () => {
  it("finds the fewest pushes", () => {
    expect(solve(parse(["#######", "#@ $ .#", "#######"])).pushes).toBe(2);
  });

  it("walks around to push from the other side", () => {
    expect(solve(parse(["######", "#    #", "#.$ @#", "######"])).pushes).toBe(1);
    expect(solve(parse(["######", "#    #", "# $.@#", "#    #", "######"])).pushes).toBe(1);
  });

  it("knows a crate in a corner is lost", () => {
    const result = solve(parse(["#####", "#$  #", "# @.#", "#####"]));
    expect(result.pushes).toBeNull();
    expect(result.aborted).toBe(false);
  });

  it("stops at the depth limit without claiming a solution", () => {
    const result = solve(parse(["#########", "#@$    .#", "#########"]), { max_depth: 3 });
    expect(result.pushes).toBeNull();
    expect(result.depth).toBe(3);
  });
});

describe("push_bound and live_cells", () => {
  it("never exceeds the real answer", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const level = generate(PRESETS.easy, seed);
      expect(push_bound(level)).toBeLessThanOrEqual(solve(level).pushes!);
    }
  });

  it("marks corners dead", () => {
    const level = parse(["#####", "#   #", "#  .#", "#####"]);
    const live = live_cells(level.width, level.tiles, level.goals);
    expect([live[6], live[8], live[11]]).toEqual([0, 0, 0]);
    expect([live[12], live[13]]).toEqual([1, 1]);
  });
});
