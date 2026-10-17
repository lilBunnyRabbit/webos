import { describe, expect, it } from "vitest";
import {
  better,
  daily_game,
  is_solved,
  move,
  move_count,
  new_game,
  push_count,
  record,
  record_best,
  empty_stats,
  redo,
  replay,
  restart,
  restore,
  undo,
  type Game,
} from "./game";
import { Tile, type Level } from "./puzzle";

function level_of(rows: string[]): Level {
  const tiles: Tile[] = [];
  const goals: number[] = [];
  const boxes: number[] = [];
  let player = -1;
  rows.join("").split("").forEach((char, i) => {
    tiles.push(char === "#" ? Tile.WALL : Tile.FLOOR);
    if (char === ".") goals.push(i);
    if (char === "$") boxes.push(i);
    if (char === "@") player = i;
  });
  return { width: rows[0].length, height: rows.length, tiles, goals, boxes, player, solution: "" };
}

function game_of(rows: string[]): Game {
  const level = level_of(rows);
  return { difficulty: "easy", seed: 0, level, player: level.player, boxes: level.boxes, log: "", future: "" };
}

const CORRIDOR = ["########", "#@ $$ .#", "#     .#", "########"];

describe("move", () => {
  it("walks onto floor and logs lowercase", () => {
    const game = move(game_of(CORRIDOR), "right");
    expect(game.player).toBe(10);
    expect(game.log).toBe("r");
    expect(move_count(game)).toBe(1);
    expect(push_count(game)).toBe(0);
  });

  it("stops at walls", () => {
    const game = game_of(CORRIDOR);
    expect(move(game, "up")).toBe(game);
    expect(move(game, "left")).toBe(game);
  });

  it("pushes a box into free floor and logs uppercase", () => {
    const game = move(move(game_of(["######", "#@$ .#", "######"]), "right"), "right");
    expect(game.boxes).toEqual([10]);
    expect(game.player).toBe(9);
    expect(game.log).toBe("RR");
    expect(push_count(game)).toBe(2);
    expect(is_solved(game)).toBe(true);
  });

  it("won't push two boxes or a box into a wall", () => {
    const pushed = move(move(game_of(CORRIDOR), "right"), "right");
    expect(pushed.log).toBe("r");
    const walled = game_of(["#####", "#@$##", "#####"]);
    expect(move(walled, "right")).toBe(walled);
  });

  it("ignores moves once solved", () => {
    const solved = move(game_of(["#####", "#@$.#", "#####"]), "right");
    expect(is_solved(solved)).toBe(true);
    expect(move(solved, "left")).toBe(solved);
  });

  it("keeps each box's identity", () => {
    const game = game_of(["#######", "#@$ $.#", "#    .#", "#######"]);
    const moved = move(game, "right");
    expect(moved.boxes).toEqual([10, 11]);
    expect(move(moved, "right")).toBe(moved);
  });
});

describe("undo and redo", () => {
  it("takes back walks and pushes, then replays them", () => {
    const start = game_of(["#######", "#@ $ .#", "#######"]);
    const played = move(move(move(start, "right"), "right"), "right");
    expect(played.log).toBe("rRR");
    expect(played.boxes).toEqual([12]);

    const once = undo(played);
    expect(once.boxes).toEqual([11]);
    expect(once.player).toBe(10);
    expect(once.future).toBe("R");

    const all = undo(undo(once));
    expect(all.player).toBe(start.player);
    expect(all.boxes).toEqual(start.boxes);
    expect(all.log).toBe("");
    expect(undo(all)).toBe(all);

    const again = redo(redo(redo(all)));
    expect(again.player).toBe(played.player);
    expect(again.boxes).toEqual(played.boxes);
    expect(again.log).toBe("rRR");
    expect(again.future).toBe("");
  });

  it("drops the redo on a fresh move", () => {
    const game = undo(move(game_of(CORRIDOR), "right"));
    expect(game.future).toBe("r");
    expect(move(game, "down").future).toBe("");
  });

  it("restart keeps every move as redo", () => {
    const played = move(move(game_of(CORRIDOR), "right"), "down");
    const fresh = restart(played);
    expect(fresh.player).toBe(played.level.player);
    expect(fresh.log).toBe("");
    expect(fresh.future).toBe("rd");
  });
});

describe("replay and restore", () => {
  it("replays a log and rejects one that doesn't fit", () => {
    const game = game_of(["#######", "#@ $ .#", "#######"]);
    expect(replay(game, "rR")?.boxes).toEqual([11]);
    expect(replay(game, "rr")).toBeNull();
    expect(replay(game, "l")).toBeNull();
  });

  it("restores a generated level from seed and moves", () => {
    const game = new_game("easy", 99);
    const solved = replay(game, game.level.solution);
    expect(solved && is_solved(solved)).toBe(true);

    const half = game.level.solution.slice(0, Math.floor(game.level.solution.length / 2));
    const restored = restore({ difficulty: "easy", seed: 99, log: half, future: "", elapsed: 0 });
    expect(restored?.log).toBe(half);
    expect(restore({ difficulty: "easy", seed: 99, log: "LLLLLLLLLL", future: "", elapsed: 0 })).toBeNull();
  });

  it("gives everyone the same daily level", () => {
    expect(daily_game("2026-10-17").level).toEqual(daily_game("2026-10-17").level);
    expect(daily_game("2026-10-17").seed).not.toBe(daily_game("2026-10-18").seed);
  });
});

describe("records", () => {
  it("ranks fewer moves first, then fewer pushes", () => {
    expect(better({ moves: 10, pushes: 5 }, undefined)).toBe(true);
    expect(better({ moves: 9, pushes: 9 }, { moves: 10, pushes: 1 })).toBe(true);
    expect(better({ moves: 10, pushes: 4 }, { moves: 10, pushes: 5 })).toBe(true);
    expect(better({ moves: 10, pushes: 5 }, { moves: 10, pushes: 5 })).toBe(false);
  });

  it("keeps only improvements and caps the list", () => {
    let bests = record_best({}, "easy:1", { moves: 20, pushes: 5 });
    expect(record_best(bests, "easy:1", { moves: 25, pushes: 1 })).toBe(bests);
    bests = record_best(bests, "easy:1", { moves: 18, pushes: 6 });
    expect(bests["easy:1"]).toEqual({ moves: 18, pushes: 6 });

    for (let i = 0; i < 600; i++) bests = record_best(bests, `easy:${i + 2}`, { moves: 1, pushes: 1 });
    expect(Object.keys(bests)).toHaveLength(500);
    expect(bests["easy:1"]).toBeUndefined();
    expect(bests["easy:601"]).toBeDefined();
  });

  it("counts solves and keeps the fastest", () => {
    const stats = record(record(empty_stats(), "hard", 9000), "hard", 12000);
    expect(stats.hard).toEqual({ solved: 2, best: 9000 });
  });
});
