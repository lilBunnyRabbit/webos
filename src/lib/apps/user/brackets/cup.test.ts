import { describe, expect, test } from "vitest";
import { CupStage, default_advance, type CupFormat, type RaceResult } from "./bracket";
import { cup_standings, cup_state, split_groups } from "./cup";

const ids = (count: number) => Array.from({ length: count }, (_, index) => `p${index + 1}`);
const race = (group: number, index: number, order: string[], stage: CupStage = CupStage.GROUPS): RaceResult => ({
  kind: "race",
  stage,
  group,
  race: index,
  order,
});
const format = (overrides: Partial<CupFormat> = {}): CupFormat => ({
  kind: "cup",
  races: 2,
  points: [15, 12, 10, 9],
  race_size: 4,
  advance: 0,
  ...overrides,
});

describe("cup scoring", () => {
  test("points by place add up, unrun races are null", () => {
    const rows = cup_standings(ids(4), [["p2", "p1", "p3", "p4"]], format());
    expect(rows.map((row) => [row.player, row.total, row.races])).toEqual([
      ["p2", 15, [15, null]],
      ["p1", 12, [12, null]],
      ["p3", 10, [10, null]],
      ["p4", 9, [9, null]],
    ]);
  });

  test("places past the table score nothing", () => {
    const rows = cup_standings(ids(3), [["p1", "p2", "p3"]], format({ points: [3, 1] }));
    expect(rows.map((row) => row.total)).toEqual([3, 1, 0]);
  });

  test("equal totals: more wins first, then seed; identical finishes share a rank", () => {
    const rows = cup_standings(
      ids(3),
      [
        ["p1", "p2", "p3"],
        ["p2", "p1", "p3"],
      ],
      format({ points: [10, 5, 1] })
    );
    expect(rows.map((row) => [row.player, row.total, row.rank])).toEqual([
      ["p1", 15, 1],
      ["p2", 15, 1],
      ["p3", 2, 3],
    ]);
    const decided = cup_standings(
      ids(2),
      [
        ["p2", "p1"],
        ["p1", "p2"],
        ["p1", "p2"],
      ],
      format({ races: 3, points: [3, 2] })
    );
    expect(decided.map((row) => row.player)).toEqual(["p1", "p2"]);
  });
});

describe("cup groups", () => {
  test("snake split balances seeds", () => {
    expect(split_groups(ids(8), 4)).toEqual([
      ["p1", "p4", "p5", "p8"],
      ["p2", "p3", "p6", "p7"],
    ]);
    expect(split_groups(ids(10), 4).map((group) => group.length)).toEqual([3, 3, 4]);
  });

  test("default advance fills one final race", () => {
    expect(default_advance(4, 4)).toBe(0);
    expect(default_advance(8, 4)).toBe(2);
    expect(default_advance(12, 4)).toBe(1);
  });

  test("one group: done after its races", () => {
    const players = ids(4);
    let state = cup_state(players, format(), [race(0, 0, ["p1", "p2", "p3", "p4"])]);
    expect(state.next).toEqual([{ stage: CupStage.GROUPS, group: 0, race: 1 }]);
    expect(state.finished).toBe(false);
    state = cup_state(players, format(), [race(0, 0, ["p1", "p2", "p3", "p4"]), race(0, 1, ["p4", "p1", "p2", "p3"])]);
    expect(state.finished).toBe(true);
    expect(state.final).toBeNull();
    expect(state.overall.map((row) => [row.player, row.total])).toEqual([
      ["p1", 27],
      ["p4", 24],
      ["p2", 22],
      ["p3", 19],
    ]);
  });

  test("groups then a final of the top two each", () => {
    const players = ids(8);
    const cup = format({ races: 1, advance: 2 });
    const groups = [race(0, 0, ["p8", "p5", "p4", "p1"]), race(1, 0, ["p2", "p3", "p6", "p7"])];
    let state = cup_state(players, cup, groups);
    expect(state.final?.players).toEqual(["p8", "p2", "p5", "p3"]);
    expect(state.next).toEqual([{ stage: CupStage.FINAL, group: 0, race: 0 }]);
    state = cup_state(players, cup, [...groups, race(0, 0, ["p3", "p8", "p2", "p5"], CupStage.FINAL)]);
    expect(state.finished).toBe(true);
    expect(state.overall.slice(0, 4).map((row) => [row.player, row.rank])).toEqual([
      ["p3", 1],
      ["p8", 2],
      ["p2", 3],
      ["p5", 4],
    ]);
    expect(state.overall).toHaveLength(8);
    expect(state.overall.slice(4).map((row) => [row.player, row.rank])).toEqual([["p4", 5], ["p6", 5], ["p1", 7], ["p7", 7]]);
  });

  test("results that don't fit are skipped", () => {
    const players = ids(4);
    const state = cup_state(players, format(), [
      race(0, 1, ["p1", "p2", "p3", "p4"]),
      race(0, 0, ["p1", "p2", "p3"]),
      race(0, 0, ["p1", "p1", "p3", "p4"]),
      race(0, 0, ["p1", "p2", "p3", "p4"], CupStage.FINAL),
    ]);
    expect(state.groups[0].races).toHaveLength(0);
  });
});
