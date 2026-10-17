import { describe, expect, test } from "vitest";
import type { MatchResult } from "./bracket";
import { schedule, standings, type RoundRobinRound } from "./round-robin";

const ids = (count: number) => Array.from({ length: count }, (_, index) => `p${index + 1}`);
const POINTS = { win: 3, draw: 1, loss: 0 };

function pairs(rounds: RoundRobinRound[]): string[] {
  return rounds.flatMap((round) => round.fixtures.map((fixture) => [fixture.a, fixture.b].sort().join("-")));
}

function find(rounds: RoundRobinRound[], a: string, b: string): string {
  const fixture = rounds.flatMap((round) => round.fixtures).find((f) => (f.a === a && f.b === b) || (f.a === b && f.b === a));
  if (!fixture) throw new Error(`No fixture ${a}-${b}`);
  return fixture.id;
}

describe("circle schedule", () => {
  test.each([2, 3, 4, 5, 6, 7, 8, 11, 16])("%i players meet everyone exactly once", (count) => {
    const rounds = schedule(ids(count));
    expect(rounds).toHaveLength(count % 2 === 0 ? count - 1 : count);
    const all = pairs(rounds);
    expect(all).toHaveLength((count * (count - 1)) / 2);
    expect(new Set(all).size).toBe(all.length);
    for (const round of rounds) {
      const playing = round.fixtures.flatMap((fixture) => [fixture.a, fixture.b]);
      expect(new Set(playing).size).toBe(playing.length);
      expect(playing.length + (round.resting ? 1 : 0)).toBe(count);
    }
  });

  test("odd counts rest each player once", () => {
    const resting = schedule(ids(5)).map((round) => round.resting);
    expect([...resting].sort()).toEqual(ids(5));
  });

  test("4 players, round by round", () => {
    expect(schedule(ids(4)).map((round) => round.fixtures.map((f) => `${f.a}-${f.b}`))).toEqual([
      ["p1-p4", "p2-p3"],
      ["p3-p1", "p4-p2"],
      ["p1-p2", "p3-p4"],
    ]);
  });

  test("two legs swap sides and keep ids unique", () => {
    const rounds = schedule(ids(4), 2);
    expect(rounds).toHaveLength(6);
    expect(rounds[3].fixtures[0]).toMatchObject({ a: rounds[0].fixtures[0].b, b: rounds[0].fixtures[0].a, round: 4 });
    const fixture_ids = rounds.flatMap((round) => round.fixtures.map((fixture) => fixture.id));
    expect(new Set(fixture_ids).size).toBe(12);
  });
});

describe("standings", () => {
  test("wins, draws and losses add up to points", () => {
    const players = ids(3);
    const rounds = schedule(players);
    const results: MatchResult[] = [
      { kind: "match", match: find(rounds, "p1", "p2"), winner: "p1" },
      { kind: "match", match: find(rounds, "p1", "p3"), winner: null },
      { kind: "match", match: find(rounds, "p2", "p3"), winner: "p3" },
    ];
    const table = standings(players, rounds, results, POINTS);
    expect(table.map((row) => [row.player, row.won, row.drawn, row.lost, row.points, row.rank])).toEqual([
      ["p1", 1, 1, 0, 4, 1],
      ["p3", 1, 1, 0, 4, 1],
      ["p2", 0, 0, 2, 0, 3],
    ]);
  });

  test("tied on points: head-to-head first", () => {
    const players = ids(4);
    const rounds = schedule(players);
    const results: MatchResult[] = [
      { kind: "match", match: find(rounds, "p1", "p2"), winner: "p2" },
      { kind: "match", match: find(rounds, "p1", "p3"), winner: "p1" },
      { kind: "match", match: find(rounds, "p1", "p4"), winner: "p1" },
      { kind: "match", match: find(rounds, "p2", "p3"), winner: "p3" },
      { kind: "match", match: find(rounds, "p2", "p4"), winner: "p2" },
      { kind: "match", match: find(rounds, "p3", "p4"), winner: "p4" },
    ];
    const table = standings(players, rounds, results, POINTS);
    expect(table.slice(0, 2).map((row) => [row.player, row.points])).toEqual([
      ["p2", 6],
      ["p1", 6],
    ]);
  });

  test("then score difference, then scored", () => {
    const players = ids(3);
    const rounds = schedule(players);
    const results: MatchResult[] = [
      { kind: "match", match: find(rounds, "p1", "p2"), winner: null, score: [2, 2] },
      { kind: "match", match: find(rounds, "p1", "p3"), winner: "p1", score: [1, 0] },
      { kind: "match", match: find(rounds, "p2", "p3"), winner: "p2", score: [5, 0] },
    ];
    expect(standings(players, rounds, results, POINTS).map((row) => row.player)).toEqual(["p2", "p1", "p3"]);
  });

  test("the last result for a fixture counts, and a stray winner is ignored", () => {
    const players = ids(2);
    const rounds = schedule(players);
    const id = rounds[0].fixtures[0].id;
    const results: MatchResult[] = [
      { kind: "match", match: id, winner: "p1" },
      { kind: "match", match: id, winner: "p2" },
      { kind: "match", match: id, winner: "p9" },
    ];
    const table = standings(players, rounds, results, POINTS);
    expect(table[0]).toMatchObject({ player: "p2", won: 1, played: 1 });
  });

  test("custom points table", () => {
    const players = ids(2);
    const rounds = schedule(players);
    const table = standings(players, rounds, [{ kind: "match", match: rounds[0].fixtures[0].id, winner: "p2" }], { win: 2, draw: 1, loss: 1 });
    expect(table.map((row) => row.points)).toEqual([2, 1]);
  });
});
